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
  /** Version de changelog (src/shared/changelog.ts) que esta persona ya vio. Migracion 044. */
  changelog_visto?: number
}

export interface Activity {
  // Trazabilidad del plazo (migracion 035). La mantiene un trigger, no la app: la fecha se
  // cambia desde cinco lugares distintos y contarlo en cada uno seria olvidarlo en alguno.
  plazo_change_count?: number
  plazo_history?: PlazoHistoryEntry[]
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
  parent_activity_id?: string | null
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
  // Area responsable en texto libre (Planta/TI/Otro), migracion 046. Reemplaza a
  // responsible_id como "Responsable" visible; responsible_id se deja intacta (sin uso en UI).
  responsable_area?: string | null
  // Fecha real de cierre (entra a 'cerrado'), distinta de resolved_at (fecha de 'resuelto').
  closed_at?: string | null
}

export type MinuteEstado = 'pendiente' | 'en_desarrollo' | 'resuelto' | 'definir'

export interface PlazoHistoryEntry {
  date: string // YYYY-MM-DD
  at: string // ISO timestamp del cambio
}

// 'proyecto': tema raiz con subtareas que se sigue como iniciativa, no como tema de la
// reunion semanal (migracion 042). No comparte cadencia con 'minuta', asi que es su propio
// tipo -mismo patron que ya separaba 'ingesta'-, no un flag dentro de minuta.
export type HojaTipo = 'minuta' | 'ingesta' | 'proyecto'

export interface MinuteItem {
  id: string
  team_id: string
  // Que hoja es. Misma estructura, listados separados. Migracion 033.
  tipo: HojaTipo
  orden: number
  tema: string
  para_todos: boolean // tema colectivo/seguimiento: sin responsable individual, no genera actividad
  responsables: string[] // ids de miembros asignados (uno o varios)
  responsables_text: string // fallback libre (externos, etc.)
  estado: MinuteEstado
  plazo: string | null // YYYY-MM-DD
  plazo_change_count: number
  plazo_history: PlazoHistoryEntry[]
  // Fecha de inicio opcional (migracion 047): habilita barras reales (inicio-fin) en el
  // Cronograma de Proyectos. Sin ella, se dibuja un punto en `plazo`, igual que antes.
  fecha_inicio?: string | null
  comentarios: string
  linked_activity_ids: string[]
  created_by: string
  created_at: string
  updated_at: string
  // Sub-tema de otro tema (ej. "Ver faena" bajo "Revisar capacidad"). Migracion 039. Null
  // en un tema raiz. Sigue el mismo ciclo de vida que cualquier tema: se asigna y se
  // transforma en actividad igual que uno de nivel superior.
  parent_item_id: string | null
  // Estado propio de la Hoja de Ingesta (migracion 045) — Minuta/Proyecto NO lo usan, siguen
  // con `estado` de siempre. Null salvo en items con tipo='ingesta'.
  estado_ingesta?: EstadoIngesta | null
  // Prioridad 1-3 (migracion 048), mismo criterio que Activity.priority. Solo Proyectos la usa.
  prioridad?: number | null
}

export type EstadoIngesta =
  | 'no_iniciado'
  | 'en_proceso'
  | 'completado'
  | 'no_resuelto'
  | 'cancelado'

export interface Message {
  id: string
  content: string
  sender_id: string
  category: MessageCategory | null
  created_at: string
  team_id: string
  // Payload de los mensajes interactivos de Lumix (sobrecarga, confirmaciones). Migracion 031.
  metadata?: Record<string, unknown> | null
  // Mensaje al que responde, si es una respuesta citada. Migracion 032.
  reply_to?: string | null
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
