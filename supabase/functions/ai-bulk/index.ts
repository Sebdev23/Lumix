import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildCors, jsonResponse } from '../_shared/cors.ts'
import { getUser } from '../_shared/auth.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { pickModel, tuningParams, jsonSchemaFormat } from '../_shared/model.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const AI_MODEL = pickModel('bulk')

const RATE_LIMIT_MAX = 15

const SYSTEM_PROMPT = `Eres OPERA AI. Recibes un texto que contiene VARIAS actividades de trabajo (una por linea, vineta, numero u oracion) y debes extraerlas TODAS.

Devuelve un JSON con esta estructura exacta:
{
  "activities": [
    {
      "title": "titulo claro y descriptivo (5 a 15 palabras)",
      "description": "detalles adicionales del item o el texto original del item",
      "responsible": "nombre exacto de la persona (de la lista del equipo) o null",
      "priority": 1 | 2 | 3,
      "due_date": "YYYY-MM-DD o null"
    }
  ]
}

REGLAS:
- Crea un item del array por cada actividad distinta detectada en el texto. No fusiones actividades distintas ni inventes actividades que no estan.
- RESPONSABLE: si un item menciona a una persona, devuelve su nombre EXACTO tal como aparece en la lista de miembros entregada. Si no calza con nadie, devuelve el nombre tal como lo escribio el usuario. Si no menciona a nadie, null.
- PRIORIDAD (1=alta/urgente, 2=media default, 3=baja). Si no se especifica, usa 2.
- FECHAS a partir de la fecha actual entregada: "hoy"=fecha actual, "manana"=+1, "pasado manana"=+2, dia de semana = el mas cercano que no ha pasado, "proxima semana"=+7. Si el item no menciona fecha, devuelve null (el sistema asignara 6 dias habiles).
- Nunca inventes fechas.

Responde SOLO con el objeto JSON, sin texto adicional ni bloques de codigo.`

// Forma exacta que debe devolver el modelo (modo strict, ver _shared/model.ts).
const BULK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['activities'],
  properties: {
    activities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'responsible', 'priority', 'due_date'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          responsible: { type: ['string', 'null'] },
          priority: { type: 'number' },
          due_date: { type: ['string', 'null'] },
        },
      },
    },
  },
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
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
    const { content, todayISO: clientISO, today: clientToday, members } = await req.json()

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

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
        ? `Miembros del equipo (usa estos nombres exactos para "responsible"): ${members.join(', ')}.`
        : 'No hay lista de miembros disponible.'

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        response_format: jsonSchemaFormat('carga_masiva', BULK_SCHEMA),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Hoy es ${todayStr} (${today}). ${roster}\nTexto con las actividades:\n"""\n${content}\n"""`,
          },
        ],
        ...tuningParams(AI_MODEL, 2000, 0.2),
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

    if (!aiText) {
      return new Response(JSON.stringify({ error: 'No response from AI' }), {
        status: 502,
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
        parsed = { activities: [] }
      }
    }

    if (!parsed || !Array.isArray(parsed.activities)) {
      parsed = { activities: [] }
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
