import { supabase } from '@infrastructure/supabase/client'

export interface ClassifyResult {
  category: string
  confidence: number
  entities: {
    title: string
    description: string
    responsible: string | null
    priority: number | null
    due_date: string | null
    severity: string | null
    scheduled_at: string | null
  }
  reply: string
}

export async function classifyMessage(content: string): Promise<ClassifyResult> {
  const { data, error } = await supabase.functions.invoke('ai-classify', {
    body: {
      content,
      today: new Date().toLocaleDateString('es-CL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      todayISO: new Date().toISOString().split('T')[0],
    },
  })

  if (error) throw new Error(error.message)
  return data as ClassifyResult
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-transcribe', {
    body: { audioUrl },
  })

  if (error) throw new Error(error.message)
  return (data as { transcript: string }).transcript
}

export async function generateMinutes(transcript: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente que genera minutas de reunion en espanol. Incluye: resumen, asistentes, temas tratados, acuerdos y tareas pendientes con responsables. Formato markdown.',
        },
        { role: 'user', content: `Genera la minuta de esta transcripcion:\n\n${transcript}` },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  })

  if (!response.ok) throw new Error('Minutes generation failed')
  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

interface TeamData {
  today: string
  activities: {
    title: string
    status: string
    priority: number
    due_date: string
    responsible: string
  }[]
  errors: { title: string; severity: string; status: string }[]
  members: { name: string; activeTasks: number; load: number }[]
}

export async function askQuestion(question: string, teamData: TeamData): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-ask', {
    body: { question, teamData },
  })

  if (error) throw new Error(error.message)
  return (data as { answer: string }).answer
}
