import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildCors, jsonResponse } from '../_shared/cors.ts'
import { getUser } from '../_shared/auth.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const AI_MODEL = Deno.env.get('AI_MODEL') || 'gpt-4o'

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

    const activitiesStr = teamData.activities
      .map(
        (a: {
          title: string
          status: string
          priority: number
          due_date: string
          responsible: string
        }) => `- ${a.title} | ${a.status} | P${a.priority} | ${a.due_date} | ${a.responsible}`,
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
            content: `Eres Lumix, el asistente de OPERA AI. Hoy es ${today}. Responde con los datos proporcionados en espanol, claro y directo. Si te preguntan por "esta semana" filtra solo actividades con fecha de entrega entre lunes y domingo de la semana actual. Si te preguntan por total general NO filtres. Siempre menciona la cantidad exacta y da ejemplos relevantes.

MUY IMPORTANTE - el usuario gestiona TODO hablandote a TI en este mismo chat, no en herramientas externas. NUNCA menciones Asana, Trello, Jira, Monday ni "el sistema de gestion". Si te preguntan COMO hacer algo (mover, completar, cambiar prioridad, reasignar, crear), explicales que solo tienen que escribirtelo en lenguaje natural, con ejemplos concretos:
- Crear: "Juan revisar el reporte para el viernes, prioridad alta"
- Completar: "listo el reporte de ventas"
- Mover fecha: "mueve el dashboard para manana"
- Cambiar prioridad: "sube la prioridad de la revision a alta"
- Reasignar: "pasale la revision a Manuel" (solo jefatura/admin)
- Bloquear: "bloquea la integracion, falta info"
Manten los ejemplos cortos y usa nombres o tareas reales de los datos cuando puedas.`,
          },
          {
            role: 'user',
            content: `DATOS:\n\nMIEMBROS:\n${membersStr}\n\nACTIVIDADES:\n${activitiesStr}\n\nERRORES:\n${errorsStr}\n\nPREGUNTA: ${question}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 600,
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
