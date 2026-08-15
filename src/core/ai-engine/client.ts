import { supabase } from '@infrastructure/supabase/client'

// 'consulta' = el mensaje no crea nada: es continuacion de una pregunta anterior ("y para la
// proxima") o un acuse ("ok", "gracias"). Solo aparece cuando se manda el hilo de contexto.
export type ClassifyCategory = 'actividad' | 'error' | 'ingesta' | 'consulta'
export type ClassifyDepth = 'profunda' | 'superficial'

export interface ClassifyResult {
  category: ClassifyCategory
  // Trabajo profundo vs superficial (Newport). Opcional: si el modelo no lo
  // devuelve, el resto del flujo funciona igual.
  depth?: ClassifyDepth
  // Modelo que produjo esta clasificacion (lo devuelve la Edge Function).
  model?: string
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

/** Un turno del hilo, para que el clasificador entienda los mensajes que dependen del anterior. */
export interface HistoryTurn {
  role: 'usuario' | 'lumix'
  text: string
}

export async function classifyMessage(
  content: string,
  members: string[] = [],
  history: HistoryTurn[] = [],
): Promise<ClassifyResult> {
  const { data, error } = await supabase.functions.invoke('ai-classify', {
    body: { content, members, history, ...todayContext() },
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
  | 'describe'
  | 'retitle'
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
    description: string | null
    title: string | null
  }
  reply: string
}

/**
 * Resuelve que actividad cambiar y como.
 *
 * Dos modos:
 *  - abierto: se manda la lista de actividades y el modelo elige (targetIndex). Es lo que
 *    pasa cuando el usuario escribe suelto en el chat.
 *  - dirigido: el usuario respondio a un mensaje, asi que la actividad YA se sabe. Se manda
 *    solo esa, no hay nada que adivinar y el prompt es mucho mas corto.
 */
export async function resolveUpdate(
  content: string,
  activities: UpdateActivityLite[],
  members: string[] = [],
  targeted = false,
  history: HistoryTurn[] = [],
): Promise<UpdateResult> {
  const { data, error } = await supabase.functions.invoke('ai-update', {
    body: { content, activities, members, targeted, history, ...todayContext() },
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

interface TeamData {
  today: string
  activities: {
    title: string
    status: string
    priority: number
    due_date: string
    responsible: string
    origen?: string
  }[]
  errors: { title: string; severity: string; status: string }[]
  members: { name: string; activeTasks: number; load: number }[]
  sinAsignar?: { tema: string; responsables: string; plazo: string | null }[]
  temasParaConversar?: { tema: string; responsable: string | null; plazo: string | null }[]
  compromisosSemana?: {
    total: number
    cumplidos: number
    vencidos: number
    porcentaje: number | null
    meta: number
  }
}

export async function askQuestion(
  question: string,
  teamData: TeamData,
  history: HistoryTurn[] = [],
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-ask', {
    body: { question, teamData, history },
  })

  if (error) throw new Error(error.message)
  return (data as { answer: string }).answer
}
