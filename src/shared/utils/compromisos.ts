import type { Activity, MinuteEstado, MinuteItem } from '@shared/types'

/**
 * Estado efectivo de un tema de minuta: si tiene actividades vinculadas, se deriva de ellas
 * (sincronizado con lo que pasa en Actividades) en vez de confiar en el campo `estado` crudo,
 * que puede quedar desactualizado.
 *
 * Antes vivia solo en useMinuta.ts; se extrajo aca porque el chat (buildTeamData) necesita el
 * MISMO calculo para responder preguntas sobre la minuta sin reimplementarlo aparte.
 */
export function deriveEstado(item: MinuteItem, byId: Record<string, Activity>): MinuteEstado {
  const acts = item.linked_activity_ids.map((id) => byId[id]).filter(Boolean)
  if (acts.length === 0) return item.estado
  if (acts.every((a) => a.status === 'completado')) return 'resuelto'
  if (acts.some((a) => a.status !== 'pendiente')) return 'en_desarrollo'
  return 'pendiente'
}

/**
 * Actividades que cuentan como "compromiso": nacieron de un tema de minuta (aparecen en
 * `linked_activity_ids` de algun item) y su entrega cae dentro de la ventana [desde, hasta].
 *
 * No filtra por visibilidad de rol: cada consumidor (la pagina Compromisos, el chat) aplica
 * su propia regla de "que puede ver quien" por separado, igual que ya hacia useCompromisos.ts.
 */
export function compromisosEnVentana(
  activities: Activity[],
  minuteItems: Pick<MinuteItem, 'linked_activity_ids'>[],
  desde: Date,
  hasta: Date,
): Activity[] {
  const deMinuta = new Set(minuteItems.flatMap((t) => t.linked_activity_ids))
  return activities.filter((a) => {
    if (!deMinuta.has(a.id)) return false
    const d = new Date(a.due_date)
    return d >= desde && d <= hasta
  })
}

export interface CompromisoStats {
  total: number
  cumplidos: number
  vencidos: number
  porcentaje: number | null
  /** El 90% es la referencia de EOS para un equipo sano, no un invento. */
  meta: number
}

/** Resumen numerico sobre una lista de compromisos YA filtrada (ver compromisosEnVentana). */
export function compromisoStats(compromisos: Activity[]): CompromisoStats {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const total = compromisos.length
  const cumplidos = compromisos.filter((a) => a.status === 'completado').length
  const vencidos = compromisos.filter((a) => {
    if (a.status === 'completado') return false
    const vence = new Date(a.due_date)
    vence.setHours(0, 0, 0, 0)
    return vence < hoy
  }).length
  return {
    total,
    cumplidos,
    vencidos,
    porcentaje: total ? Math.round((cumplidos / total) * 100) : null,
    meta: 90,
  }
}
