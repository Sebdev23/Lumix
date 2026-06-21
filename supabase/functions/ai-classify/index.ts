import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

const SYSTEM_PROMPT = `Eres OPERA AI, un asistente que clasifica mensajes de trabajo en lenguaje natural.

Tu tarea es analizar el mensaje y devolver un JSON con esta estructura exacta:
{
  "category": "actividad" | "error",
  "confidence": 0.0 a 1.0,
  "entities": {
    "title": "titulo extraido del mensaje",
    "description": "descripcion extraida",
    "responsible": "nombre de la persona responsable o null",
    "priority": 1-5 o null (solo actividad),
    "due_date": "fecha en formato YYYY-MM-DD o null (solo actividad)",
    "severity": "baja" | "media" | "alta" | "critica" o null (solo error)
  },
  "reply": "respuesta breve en espanol confirmando lo que se hizo"
}

Reglas de clasificacion (SOLO 2 CATEGORIAS):

ERROR: bug, falla, no funciona, problema, incidencia, error, roto, caido, crash, 500, exception, no carga, no responde, se cayo, no anda, fallo, defecto, mal funcionamiento.

ACTIVIDAD: TODO lo demas. Cualquier tarea, solicitud, pedido, entregable, documento, reporte, ajuste, creacion, modificacion. Si no es claramente un error, es ACTIVIDAD.

PRIORIDAD por defecto: si no se menciona urgencia, usa 3 (media).

Reglas de prioridad (escala chilena: 1 = maximo):
- 1 = urgente, critico, "ya", "ahora", "inmediato"
- 2 = alta
- 3 = media (default)
- 4 = baja
- 5 = "cuando puedas", "sin prisa"

Reglas de fechas:
- Usa la fecha actual proporcionada en el mensaje del usuario para calcular fechas relativas
- "proximo jueves" = el jueves de esta semana si aun no paso, o de la proxima
- "el viernes" = el viernes mas cercano (esta semana o proxima)
- "manana" = dia siguiente a la fecha actual
- "la proxima semana" = misma fecha + 7 dias
- Si no se menciona fecha, usa null para due_date (el sistema asignara +7 dias habiles)
- IMPORTANTE: nunca inventes fechas. Si el usuario dice "proximo jueves", calcula la fecha real usando la fecha actual

Responde SOLO con el JSON, sin texto adicional.`

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { content } = await req.json()

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const todayStr = new Date().toLocaleDateString('es-CL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Hoy es ${todayStr} (${today}). El mensaje a clasificar es: "${content}"`,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('OpenAI API error:', error)
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()
    const aiText = data.choices?.[0]?.message?.content

    if (!aiText) {
      return new Response(JSON.stringify({ error: 'No response from AI' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const parsed = JSON.parse(aiText)

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Function error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
