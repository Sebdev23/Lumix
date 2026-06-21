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
