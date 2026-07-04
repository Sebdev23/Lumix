import { supabase } from '@infrastructure/supabase/client'

export type ClassifyCategory = 'actividad' | 'error' | 'ingesta'

export interface ClassifyResult {
  category: ClassifyCategory
  confidence: number
  entities: {
    title: string
    description: string
    responsible: string | null
    priority: number | null
    due_date: string | null
    severity: string | null
    scheduled_at?: string | null
  }
  reply: string
}

export interface BulkActivity {
  title: string
  description: string
  responsible: string | null
  priority: number | null
  due_date: string | null
}

export interface BulkResult {
  activities: BulkActivity[]
}

function todayContext() {
  return {
    today: new Date().toLocaleDateString('es-CL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    todayISO: new Date().toISOString().split('T')[0],
  }
}

export async function classifyMessage(
  content: string,
  members: string[] = [],
): Promise<ClassifyResult> {
  const { data, error } = await supabase.functions.invoke('ai-classify', {
    body: { content, members, ...todayContext() },
  })

  if (error) throw new Error(error.message)
  return data as ClassifyResult
}

export interface UpdateActivityLite {
  title: string
  responsible: string
  status: string
  due_date: string
  priority: number
}

export type UpdateAction =
  | 'complete'
  | 'reschedule'
  | 'reassign'
  | 'status'
  | 'priority'
  | 'unknown'

export interface UpdateResult {
  isUpdate: boolean
  targetIndex: number
  action: UpdateAction
  changes: {
    status: string | null
    due_date: string | null
    responsible: string | null
    priority: number | null
  }
  reply: string
}

export async function resolveUpdate(
  content: string,
  activities: UpdateActivityLite[],
  members: string[] = [],
): Promise<UpdateResult> {
  const { data, error } = await supabase.functions.invoke('ai-update', {
    body: { content, activities, members, ...todayContext() },
  })

  if (error) throw new Error(error.message)
  return data as UpdateResult
}

export async function classifyBulk(content: string, members: string[] = []): Promise<BulkResult> {
  const { data, error } = await supabase.functions.invoke('ai-bulk', {
    body: { content, members, ...todayContext() },
  })

  if (error) throw new Error(error.message)
  const result = data as BulkResult
  return { activities: Array.isArray(result?.activities) ? result.activities : [] }
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-transcribe', {
    body: { audioUrl },
  })

  if (error) throw new Error(error.message)
  return (data as { transcript: string }).transcript
}

export async function generateMinutes(transcript: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-minutes', {
    body: { transcript },
  })

  if (error) throw new Error(error.message)
  return (data as { minutes: string }).minutes
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
