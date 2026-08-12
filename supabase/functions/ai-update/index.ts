import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildCors, jsonResponse } from '../_shared/cors.ts'
import { getUser } from '../_shared/auth.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { pickModel, tuningParams, jsonSchemaFormat } from '../_shared/model.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const AI_MODEL = pickModel('update')

const RATE_LIMIT_MAX = 30

// El bloque de JSON y las reglas de contenido son identicos en los dos modos; lo unico que
// cambia es si hay que elegir la actividad o si ya viene dada.
const JSON_SHAPE = `Devuelve SOLO este JSON:
{
  "isUpdate": true | false,
  "targetIndex": number,
  "action": "complete" | "reschedule" | "reassign" | "status" | "priority" | "describe" | "retitle" | "unknown",
  "changes": {
    "status": "pendiente" | "en_proceso" | "bloqueado" | "falta_informacion" | "esperando_aprobacion" | "completado" | null,
    "due_date": "YYYY-MM-DD" | null,
    "responsible": "nombre del nuevo responsable (exacto de la lista si calza) o null",
    "priority": 1 | 2 | 3 | null,
    "description": "nueva descripcion completa o null",
    "title": "nuevo objetivo/titulo o null"
  },
  "reply": "confirmacion breve en espanol de lo que se hizo"
}`

const SYSTEM_PROMPT = `Eres OPERA AI. El usuario escribe en lenguaje natural para MODIFICAR una actividad que YA EXISTE (completarla, moverle la fecha, reasignarla, cambiar su estado, su prioridad, su descripcion o su objetivo).

Se te entrega una lista NUMERADA de actividades abiertas del equipo. Debes decidir:
1. Si el mensaje realmente modifica una de esas actividades (isUpdate).
2. A cual actividad se refiere (targetIndex = numero de la lista, empezando en 0). Si el mensaje no permite identificar con seguridad UNA sola actividad, devuelve targetIndex = -1.
3. Que cambios aplicar.

${JSON_SHAPE}

REGLAS:
- isUpdate=false si el mensaje describe una tarea NUEVA, un error nuevo, o no hace referencia a ninguna actividad existente. En ese caso targetIndex=-1, action="unknown", todos los changes en null.
- "listo", "ya termine", "completado", "hecho", "finalizado" => action="complete", changes.status="completado".
- "bloquea", "esta bloqueada", "no puedo avanzar" => action="status", changes.status="bloqueado".
- "falta info", "falta informacion" => changes.status="falta_informacion".
- "en proceso", "empece", "trabajando en" => changes.status="en_proceso".
- "esperando aprobacion", "para aprobar" => changes.status="esperando_aprobacion".
- "muevela", "pasala", "para el ...", "reprograma", "posterga", "adelanta" => action="reschedule", changes.due_date con la fecha calculada.
- "reasigna a X", "pasale a X", "que lo haga X" => action="reassign", changes.responsible=nombre exacto de X.
- IMPORTANTE: si X NO esta en la lista de miembros, sigue siendo una reasignacion. Devuelve
  isUpdate=true, action="reassign" y changes.responsible con el nombre TAL COMO lo escribio el
  usuario. NO devuelvas isUpdate=false por esto: la app le pregunta al usuario a quien asignar.
  Marcarlo como "no es un update" hace que la app cree una actividad nueva titulada con la
  propia instruccion ("Reasignar informe a Pedro"), que es justo lo que hay que evitar.
- "prioridad alta/urgente" => changes.priority=1; "prioridad media" => 2; "prioridad baja" => 3. action="priority".
- "la descripcion es...", "agrega que...", "el detalle es...", "anota que..." => action="describe",
  changes.description con el texto completo que debe quedar (no un fragmento suelto).
- "el objetivo es...", "cambiale el titulo a...", "en realidad se trata de..." => action="retitle",
  changes.title con el objetivo nuevo, corto y en una linea.
- CUIDADO con el titulo: cambialo SOLO si el usuario lo pide explicitamente. Un mensaje que
  agrega contexto o detalle va en description, no en title. Reescribir el objetivo por cuenta
  propia le cambia el nombre a la actividad de otra persona sin que nadie lo haya pedido.
- Solo llena los campos de "changes" que el mensaje pide cambiar; el resto en null.

FECHAS (usa la fecha actual entregada): "hoy"=fecha actual, "manana"=+1, "pasado manana"=+2, dia de semana = el mas cercano que no ha pasado, "proxima semana"=+7. Nunca inventes fechas.

Responde SOLO con el objeto JSON, sin texto adicional ni bloques de codigo.`

// Modo dirigido: el usuario respondio a un mensaje, asi que la actividad ya se sabe. No hay
// lista que recorrer ni targetIndex que adivinar, y por lo mismo tampoco hay ambiguedad.
const TARGETED_PROMPT = `Eres OPERA AI. El usuario RESPONDIO a un mensaje sobre UNA actividad concreta, que se te entrega abajo. No tienes que adivinar cual es: es esa.

Tu unico trabajo es extraer que cambios pide el mensaje sobre esa actividad.

Reglas:
- targetIndex es SIEMPRE 0. isUpdate es true salvo que el mensaje no pida ningun cambio
  (por ejemplo un comentario suelto como "gracias" o "ok"): en ese caso isUpdate=false.
- El mensaje puede ser corto y depender del contexto ("para el viernes", "prioridad alta",
  "ya esta lista"). Eso es normal al responder: interpretalo contra la actividad entregada.

${JSON_SHAPE}

${SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('REGLAS:'))}`

// Forma exacta que debe devolver el modelo (modo strict, ver _shared/model.ts).
const UPDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isUpdate', 'targetIndex', 'action', 'changes', 'reply'],
  properties: {
    isUpdate: { type: 'boolean' },
    targetIndex: { type: 'number' },
    action: {
      type: 'string',
      enum: [
        'complete',
        'reschedule',
        'reassign',
        'status',
        'priority',
        'describe',
        'retitle',
        'unknown',
      ],
    },
    changes: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'due_date', 'responsible', 'priority', 'description', 'title'],
      properties: {
        status: {
          type: ['string', 'null'],
          enum: [
            'pendiente',
            'en_proceso',
            'bloqueado',
            'falta_informacion',
            'esperando_aprobacion',
            'completado',
            null,
          ],
        },
        due_date: { type: ['string', 'null'] },
        responsible: { type: ['string', 'null'] },
        priority: { type: ['number', 'null'] },
        description: { type: ['string', 'null'] },
        title: { type: ['string', 'null'] },
      },
    },
    reply: { type: 'string' },
  },
}

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
      targeted,
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

    const describe = (a: ActivityLite, i: number) =>
      `${i}. "${a.title}" | responsable: ${a.responsible} | estado: ${a.status} | entrega: ${a.due_date} | prioridad: ${a.priority}`

    // En dirigido llega una sola actividad y no hay lista que numerar.
    const isTargeted = targeted === true && list.length === 1
    const numbered = list.map(describe).join('\n')

    const userPrompt = isTargeted
      ? `Hoy es ${todayStr} (${today}). ${roster}\n\nActividad a la que el usuario respondio:\n${describe(list[0], 0)}\n\nMensaje del usuario: "${content}"`
      : `Hoy es ${todayStr} (${today}). ${roster}\n\nActividades abiertas:\n${numbered || '(ninguna)'}\n\nMensaje del usuario: "${content}"`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        response_format: jsonSchemaFormat('actualizacion', UPDATE_SCHEMA),
        messages: [
          { role: 'system', content: isTargeted ? TARGETED_PROMPT : SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        ...tuningParams(AI_MODEL, 400, 0.1),
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
    const mensaje = data.choices?.[0]?.message
    // Con json_schema aparece un caso que con json_object no existia: el modelo puede
    // responder `refusal` en vez de `content`. Sin esto se leeria como respuesta vacia y
    // no quedaria rastro de por que.
    if (mensaje?.refusal) {
      console.error('El modelo rechazo la peticion:', mensaje.refusal)
    }
    const aiText = mensaje?.content

    const fallback = {
      isUpdate: false,
      targetIndex: -1,
      action: 'unknown',
      changes: {
        status: null,
        due_date: null,
        responsible: null,
        priority: null,
        description: null,
        title: null,
      },
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
