import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildCors, jsonResponse } from '../_shared/cors.ts'
import { getUser } from '../_shared/auth.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { pickModel, tuningParams } from '../_shared/model.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const AI_MODEL = pickModel('ask')

const RATE_LIMIT_MAX = 10

serve(async (req: Request) => {
  const cors = buildCors(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // La anon key es publica (viaja en el bundle). Sin esto, cualquiera puede
  // gastar la OPENAI_API_KEY del proyecto.
  const user = await getUser(req)
  if (!user) {
    return jsonResponse({ error: 'No autorizado' }, 401, cors)
  }

  if (!checkRateLimit(user.id, RATE_LIMIT_MAX)) {
    return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, 429, cors)
  }
  try {
    const { question, teamData } = await req.json()

    const today =
      teamData?.today ||
      new Date().toLocaleDateString('es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })

    const membersStr = teamData.members
      .map(
        (m: { name: string; activeTasks: number; load: number }) =>
          `${m.name}: ${m.activeTasks} tareas activas, ${m.load}% carga`,
      )
      .join('\n')

    const sinAsignarStr =
      (teamData.sinAsignar ?? [])
        .map(
          (t: { tema: string; responsables: string; plazo: string | null }) =>
            `- ${t.tema} | responsable escrito: ${t.responsables}${t.plazo ? ` | plazo: ${t.plazo}` : ''}`,
        )
        .join('\n') || '(ninguno)'

    const activitiesStr = teamData.activities
      .map(
        (a: {
          title: string
          status: string
          priority: number
          due_date: string
          responsible: string
          origen?: string
        }) =>
          `- ${a.title} | ${a.status} | P${a.priority} | ${a.due_date} | ${a.responsible} | ${
            a.origen === 'compromiso' ? 'COMPROMISO' : 'propia'
          }`,
      )
      .join('\n')

    const errorsStr = teamData.errors
      .map(
        (e: { title: string; severity: string; status: string }) =>
          `- ${e.title} | ${e.severity} | ${e.status}`,
      )
      .join('\n')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: `Eres Lumix, el asistente de OPERA AI. Hoy es ${today}. Responde con los datos proporcionados en espanol, claro y directo. Si te preguntan por "esta semana" filtra solo actividades con fecha de entrega entre lunes y domingo de la semana actual. Si la pregunta NO menciona ningun periodo, NO filtres por fecha y no expliques que no filtraste: responde derecho con todo lo pendiente. Siempre menciona la cantidad exacta y da ejemplos relevantes.

MUY IMPORTANTE - el usuario gestiona TODO hablandote a TI en este mismo chat, no en herramientas externas. NUNCA menciones Asana, Trello, Jira, Monday ni "el sistema de gestion". Si te preguntan COMO hacer algo (mover, completar, cambiar prioridad, reasignar, crear), explicales que solo tienen que escribirtelo en lenguaje natural, con ejemplos concretos:
- Crear: "Juan revisar el reporte para el viernes, prioridad alta"
- Completar: "listo el reporte de ventas"
- Mover fecha: "mueve el dashboard para manana"
- Cambiar prioridad: "sube la prioridad de la revision a alta"
- Reasignar: "pasale la revision a Manuel" (solo jefatura/admin)
- Bloquear: "bloquea la integracion, falta info"
Manten los ejemplos cortos y usa nombres o tareas reales de los datos cuando puedas.

COMPROMISOS vs TRABAJO PROPIO. Cada actividad viene marcada al final como COMPROMISO o propia:
- COMPROMISO: se asigno desde la minuta, o sea alguien lo tomo delante del equipo en la reunion.
- propia: la creo la persona por el chat. Es trabajo suyo, no un compromiso con el equipo.
Cuando pregunten por lo que tiene PENDIENTE EL EQUIPO, separa las dos cosas y parte por los
compromisos, que son los que se revisan en la reunion. Da el total de cada grupo. Si preguntan
por una persona en particular, o por "lo mio", no hace falta separar: ahi todo cuenta igual.

TEMAS SIN ASIGNAR. Puede venir una lista de temas de minuta que tienen responsable escrito pero
que NUNCA se convirtieron en actividad. Esos no le suman carga a nadie ni aparecen en ninguna
otra parte del sistema. Si la lista trae algo y la pregunta es sobre pendientes del equipo,
mencionalo al final en una linea, diciendo cuantos son y que falta apretar "Asignar actividad"
en la minuta para que existan de verdad. Si la lista viene vacia, no digas nada al respecto.`,
          },
          {
            role: 'user',
            content: `DATOS:\n\nMIEMBROS:\n${membersStr}\n\nACTIVIDADES:\n${activitiesStr}\n\nERRORES:\n${errorsStr}\n\nTEMAS SIN ASIGNAR:\n${sinAsignarStr}\n\nPREGUNTA: ${question}`,
          },
        ],
        ...tuningParams(AI_MODEL, 600, 0.3),
      }),
    })

    if (!response.ok) throw new Error('OpenAI error')
    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content ?? 'No pude responder.'

    return new Response(JSON.stringify({ answer }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
