import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { question, teamData } = await req.json()

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

    const today = new Date().toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
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
          {
            role: 'system',
            content: `Eres OPERA AI, asistente de equipos. Responde con los datos proporcionados. Hoy es ${today}. Espanol, claro, directo. Max 300 caracteres.`,
          },
          {
            role: 'user',
            content: `DATOS:\n\nMIEMBROS:\n${membersStr}\n\nACTIVIDADES:\n${activitiesStr}\n\nERRORES:\n${errorsStr}\n\nPREGUNTA: ${question}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
    })

    if (!response.ok) throw new Error('OpenAI error')
    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content ?? 'No pude responder.'

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
