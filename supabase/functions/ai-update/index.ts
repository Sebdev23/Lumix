import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildCors, jsonResponse } from '../_shared/cors.ts'
import { getUser } from '../_shared/auth.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const AI_MODEL = Deno.env.get('AI_MODEL') || 'gpt-4o'

const RATE_LIMIT_MAX = 30

const SYSTEM_PROMPT = `Eres OPERA AI. El usuario escribe en lenguaje natural para MODIFICAR una actividad que YA EXISTE (completarla, moverle la fecha, reasignarla, cambiar su estado o su prioridad).

Se te entrega una lista NUMERADA de actividades abiertas del equipo. Debes decidir:
1. Si el mensaje realmente modifica una de esas actividades (isUpdate).
2. A cual actividad se refiere (targetIndex = numero de la lista, empezando en 0). Si el mensaje no permite identificar con seguridad UNA sola actividad, devuelve targetIndex = -1.
3. Que cambios aplicar.

Devuelve SOLO este JSON:
{
  "isUpdate": true | false,
  "targetIndex": number,
  "action": "complete" | "reschedule" | "reassign" | "status" | "priority" | "unknown",
  "changes": {
    "status": "pendiente" | "en_proceso" | "bloqueado" | "falta_informacion" | "esperando_aprobacion" | "completado" | null,
    "due_date": "YYYY-MM-DD" | null,
    "responsible": "nombre exacto del miembro (de la lista de miembros) o null",
    "priority": 1 | 2 | 3 | null
  },
  "reply": "confirmacion breve en espanol de lo que se hizo"
}

REGLAS:
- isUpdate=false si el mensaje describe una tarea NUEVA, un error nuevo, o no hace referencia a ninguna actividad existente. En ese caso targetIndex=-1, action="unknown", todos los changes en null.
- "listo", "ya termine", "completado", "hecho", "finalizado" => action="complete", changes.status="completado".
- "bloquea", "esta bloqueada", "no puedo avanzar" => action="status", changes.status="bloqueado".
- "falta info", "falta informacion" => changes.status="falta_informacion".
- "en proceso", "empece", "trabajando en" => changes.status="en_proceso".
- "esperando aprobacion", "para aprobar" => changes.status="esperando_aprobacion".
- "muevela", "pasala", "para el ...", "reprograma", "posterga", "adelanta" => action="reschedule", changes.due_date con la fecha calculada.
- "reasigna a X", "pasale a X", "que lo haga X" => action="reassign", changes.responsible=nombre exacto de X.
- "prioridad alta/urgente" => changes.priority=1; "prioridad media" => 2; "prioridad baja" => 3. action="priority".
- Solo llena los campos de "changes" que el mensaje pide cambiar; el resto en null.

FECHAS (usa la fecha actual entregada): "hoy"=fecha actual, "manana"=+1, "pasado manana"=+2, dia de semana = el mas cercano que no ha pasado, "proxima semana"=+7. Nunca inventes fechas.

Responde SOLO con el objeto JSON, sin texto adicional ni bloques de codigo.`

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

interface ActivityLite {
  title: string
  responsible: string
  status: string
  due_date: string
  priority: number
}

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
    const {
      content,
      activities,
      members,
      todayISO: clientISO,
      today: clientToday,
    } = await req.json()

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const list: ActivityLite[] = Array.isArray(activities) ? activities : []
    const today = clientISO || new Date().toISOString().split('T')[0]
    const todayStr =
      clientToday ||
      new Date().toLocaleDateString('es-CL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

    const roster =
      Array.isArray(members) && members.length > 0
        ? `Miembros del equipo (para "responsible" usa estos nombres exactos): ${members.join(', ')}.`
        : 'No hay lista de miembros disponible.'

    const numbered = list
      .map(
        (a, i) =>
          `${i}. "${a.title}" | responsable: ${a.responsible} | estado: ${a.status} | entrega: ${a.due_date} | prioridad: ${a.priority}`,
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
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Hoy es ${todayStr} (${today}). ${roster}\n\nActividades abiertas:\n${numbered || '(ninguna)'}\n\nMensaje del usuario: "${content}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 400,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('OpenAI API error:', error)
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()
    const aiText = data.choices?.[0]?.message?.content

    const fallback = {
      isUpdate: false,
      targetIndex: -1,
      action: 'unknown',
      changes: { status: null, due_date: null, responsible: null, priority: null },
      reply: '',
    }

    if (!aiText) {
      return new Response(JSON.stringify(fallback), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    let parsed
    try {
      parsed = JSON.parse(aiText)
    } catch {
      try {
        parsed = JSON.parse(stripFences(aiText))
      } catch {
        console.error('Failed to parse AI JSON:', aiText)
        parsed = fallback
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Function error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
