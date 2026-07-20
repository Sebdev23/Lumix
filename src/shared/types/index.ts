export type Role = 'admin' | 'jefatura' | 'colaborador' | 'invitado'

export type ActivityStatus =
  | 'pendiente'
  | 'en_proceso'
  | 'bloqueado'
  | 'falta_informacion'
  | 'esperando_aprobacion'
  | 'completado'

export type ErrorSeverity = 'baja' | 'media' | 'alta' | 'critica'

export type ErrorStatus = 'abierto' | 'en_revision' | 'resuelto' | 'cerrado'

export type MessageCategory = 'actividad' | 'error'

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: Role
  team_id: string
  created_at: string
}

export interface Activity {
  id: string
  title: string
  description: string
  responsible_id: string
  priority: number
  status: ActivityStatus
  created_at: string
  due_date: string
  dependencies: string[]
  observations: string
  team_id: string
  created_by: string
  completed_at: string | null
  estimated_hours?: number
  updated_at?: string
}

export interface AppError {
  id: string
  title: string
  description: string
  severity: ErrorSeverity
  responsible_id: string
  status: ErrorStatus
  date: string
  time: string
  team_id: string
  created_by: string
  resolved_at: string | null
  error_type: string
  observations: string
}

export type MinuteEstado = 'pendiente' | 'en_desarrollo' | 'resuelto' | 'definir'

export interface PlazoHistoryEntry {
  date: string // YYYY-MM-DD
  at: string // ISO timestamp del cambio
}

export interface MinuteItem {
  id: string
  team_id: string
  orden: number
  tema: string
  para_todos: boolean // tema colectivo/seguimiento: sin responsable individual, no genera actividad
  responsables: string[] // ids de miembros asignados (uno o varios)
  responsables_text: string // fallback libre (externos, etc.)
  estado: MinuteEstado
  plazo: string | null // YYYY-MM-DD
  plazo_change_count: number
  plazo_history: PlazoHistoryEntry[]
  comentarios: string
  linked_activity_ids: string[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface Meeting {
  id: string
  title: string
  scheduled_at: string
  audio_url: string | null
  transcript: string | null
  minutes: string | null
  created_by: string
  team_id: string
  created_at: string
}

export interface Message {
  id: string
  content: string
  sender_id: string
  category: MessageCategory | null
  created_at: string
  team_id: string
}

export type NotificationType =
  | 'activity_blocked'
  | 'missing_info'
  | 'critical_error'
  | 'deadline_soon'
  | 'overload'

export interface AppNotification {
  id: string
  user_id: string
  title: string
  body: string
  type: NotificationType
  read: boolean
  metadata: Record<string, unknown>
  created_at: string
}
