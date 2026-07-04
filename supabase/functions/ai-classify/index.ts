import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const AI_MODEL = Deno.env.get('AI_MODEL') || 'gpt-4o'

const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW = 60000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(ip) || []
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW)
  if (recent.length >= RATE_LIMIT_MAX) return false
  recent.push(now)
  rateLimitMap.set(ip, recent)
  return true
}

const SYSTEM_PROMPT = `Eres OPERA AI, un asistente que clasifica mensajes de trabajo en lenguaje natural.

Tu tarea es analizar el mensaje y devolver un JSON con esta estructura exacta:
{
  "category": "actividad" | "error" | "ingesta",
  "confidence": 0.0 a 1.0,
  "entities": {
    "title": "titulo claro y descriptivo extraido del mensaje",
    "description": "resumen del contexto y detalles clave del mensaje",
    "responsible": "nombre exacto de la persona responsable (de la lista del equipo) o null",
    "priority": 1-3 o null,
    "due_date": "fecha en formato YYYY-MM-DD o null",
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

REGLAS PARA CLASIFICAR LA CATEGORIA:
- ERROR: el mensaje describe una falla, bug, mal funcionamiento o problema tecnico. Palabras clave: "error", "falla", "no funciona", "bug", "roto", "caido", "no carga", "no responde", "se cayo", "duplicado", "no se visualiza", "no se actualiza". Si el mensaje empieza con "Error"/"error" es ERROR.
- INGESTA: el mensaje pide cargar, procesar, mover o transformar DATOS. Palabras clave: "ingesta", "ingestar", "ingerir", "cargar datos", "subir datos", "descargar datos", "importar datos", "exportar datos", "migrar datos", "ETL", "pipeline de datos", "poblar tabla", "actualizar base de datos".
- ACTIVIDAD: todo lo demas: tareas, solicitudes, pedidos, reportes, ajustes, revisiones, creaciones, modificaciones.
- Si no estas seguro entre actividad e ingesta, usa ACTIVIDAD. Si no estas seguro entre actividad y error, usa ACTIVIDAD.

REGLAS PARA EL RESPONSABLE:
- Se te entrega la lista de miembros del equipo. Si el mensaje menciona a una persona, devuelve en "responsible" su NOMBRE EXACTO tal como aparece en la lista (respetando mayusculas y tildes).
- Si el nombre mencionado no calza claramente con ningun miembro de la lista, devuelve el nombre tal como lo escribio el usuario (el sistema pedira confirmacion).
- Si el mensaje no menciona a nadie, devuelve null.

PRIORIDAD (escala: 1 = alta, 2 = media, 3 = baja):
- 1 = urgente, critico, "ya", "ahora", "inmediato", "prioridad alta", "alta prioridad"
- 2 = media (default cuando no se especifica)
- 3 = baja, "cuando puedas", "sin prisa"

REGLAS DE FECHAS (usa la fecha actual que se te entrega en el mensaje del usuario):
- "hoy" = la fecha actual exacta
- "manana" = fecha actual + 1 dia
- "pasado manana" = fecha actual + 2 dias
- "el viernes" / "proximo jueves" = ese dia de la semana mas cercano que aun no pasa (esta semana o la proxima)
- "la proxima semana" / "esta semana" = fecha actual + 7 dias
- Si NO se menciona ninguna fecha, devuelve null en due_date (el sistema asignara 6 dias habiles por defecto)
- IMPORTANTE: nunca inventes fechas. Calcula siempre a partir de la fecha actual entregada.

Responde SOLO con el objeto JSON, sin texto adicional ni bloques de codigo.`

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

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

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests. Try again in a minute.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { content, todayISO: clientISO, today: clientToday, members } = await req.json()

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
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Hoy es ${todayStr} (${today}). ${roster}\nEl mensaje a clasificar es: "${content}"`,
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

    let parsed
    try {
      parsed = JSON.parse(aiText)
    } catch {
      // Defensa: intentar sin fences por si el modelo los agrego
      try {
        parsed = JSON.parse(stripFences(aiText))
      } catch {
        // Ultimo recurso: nunca dejar el chat mudo. Devolver una actividad basica.
        console.error('Failed to parse AI JSON:', aiText)
        parsed = {
          category: 'actividad',
          confidence: 0,
          entities: {
            title: content.slice(0, 100),
            description: content,
            responsible: null,
            priority: 2,
            due_date: null,
            severity: null,
          },
          reply: 'Actividad creada.',
        }
      }
    }

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
