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
    "title": "titulo claro y descriptivo extraido del mensaje",
    "description": "resumen del contexto y detalles clave del mensaje",
    "responsible": "nombre de la persona responsable o null",
    "priority": 1-5 o null (solo actividad),
    "due_date": "fecha en formato YYYY-MM-DD o null (solo actividad)",
    "severity": "baja" | "media" | "alta" | "critica" o null (solo error)
  },
  "reply": "respuesta breve en espanol confirmando lo que se hizo"
}

REGLAS PARA EL TITULO:
- Extrae la accion principal y el contexto clave del mensaje
- El titulo debe ser descriptivo pero conciso, entre 5 y 15 palabras
- Incluye nombres de personas, sistemas o lugares mencionados si son relevantes
- Ejemplos: "Revisar utilizacion del frigorifico Rosario con Emilio Ruiz", "Ajustar capacidad de congelado para manana", "Crear reporte de seguimiento SAP PM mantenimiento"
- NO cortes el titulo abruptamente. Si el mensaje tiene contexto importante, incluyelo.

REGLAS PARA LA DESCRIPCION:
- Incluye todos los detalles adicionales del mensaje que no estan en el titulo
- Si el mensaje menciona personas especificas, sistemas, KPIs, o fechas, incluyelos

REGLAS PARA ERROR vs ACTIVIDAD:
- ERROR: el mensaje describe claramente una falla, bug, mal funcionamiento, o problema tecnico. Palabras clave: "error", "falla", "no funciona", "bug", "roto", "caido", "no carga", "no responde", "se cayo", "duplicado", "no se visualiza", "no se actualiza"
- ACTIVIDAD: tareas, solicitudes, pedidos, reportes, ajustes, revisiones, creaciones, modificaciones
- Si el mensaje empieza con "Error" o "error", es ERROR
- Si el mensaje menciona "no se actualiza", "no se visualiza", "duplicado", es ERROR
- Si no estas seguro, clasifica como ACTIVIDAD

PRIORIDAD por defecto: si no se menciona urgencia, usa 2 (media).

Reglas de prioridad (escala: 1 = alta, 3 = baja):
- 1 = urgente, critico, "ya", "ahora", "inmediato", "prioridad alta", "alta prioridad"
- 2 = media (default cuando no se especifica)
- 3 = baja, "cuando puedas", "sin prisa"

Reglas de fechas:
- Usa la fecha actual proporcionada en el mensaje del usuario para calcular fechas relativas
- "proximo jueves" = el jueves de esta semana si aun no paso, o de la proxima
- "el viernes" = el viernes mas cercano (esta semana o proxima)
- "manana" = dia siguiente a la fecha actual
- "la proxima semana" = misma fecha + 7 dias
- "esta semana" = mismo dia + 7 dias desde hoy
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
    const { content, todayISO: clientISO, today: clientToday } = await req.json()

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
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
