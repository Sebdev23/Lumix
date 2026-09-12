import { parseDateLocal } from '@shared/utils/date'
import type { DecoratedItem } from '@features/minuta/hooks/useMinuta'

/**
 * Plazo de un tema, o -si no tiene uno propio- el mas lejano entre sus subtareas
 * (recursivo: baja hasta encontrar fechas reales). No se persiste: un tema grande suele no
 * tener fecha propia porque la fecha real ES la de su ultima subtarea, y guardar una copia
 * aparte es la misma trampa de desincronizacion que ya se corrigio entre Minuta y
 * Compromisos -aca ni siquiera hace falta, se calcula al vuelo-.
 */
export function plazoEfectivo(it: DecoratedItem, allItems: DecoratedItem[]): string | null {
  if (it.plazo) return it.plazo
  const fechas = allItems
    .filter((d) => d.parent_item_id === it.id)
    .map((h) => plazoEfectivo(h, allItems))
    .filter((f): f is string => !!f)
  return fechas.length ? fechas.sort().at(-1)! : null
}

/** Cuenta subtareas de TODOS los niveles bajo `raizId` y cuantas estan resueltas. */
export function contarSubtareas(
  raizId: string,
  allItems: DecoratedItem[],
): { total: number; resueltas: number } {
  const hijos = allItems.filter((d) => d.parent_item_id === raizId)
  let total = hijos.length
  let resueltas = hijos.filter((h) => h.effectiveEstado === 'resuelto').length
  for (const h of hijos) {
    const sub = contarSubtareas(h.id, allItems)
    total += sub.total
    resueltas += sub.resueltas
  }
  return { total, resueltas }
}

/**
 * % de avance de un item: si tiene subtareas (cualquier nivel), es la proporcion resuelta;
 * si es una hoja sin subtareas, es 0 o 100 segun su propio estado. Se calcula en vivo -no se
 * guarda un numero aparte- para que nunca pueda desincronizarse de la realidad (mismo criterio
 * que `plazoEfectivo`: mejor calcular de nuevo que arrastrar una copia vieja).
 */
export function avanceDe(it: DecoratedItem, allItems: DecoratedItem[]): number {
  const { total, resueltas } = contarSubtareas(it.id, allItems)
  if (total > 0) return Math.round((resueltas / total) * 100)
  return it.effectiveEstado === 'resuelto' ? 100 : 0
}

/**
 * Distingue "actividades" (hijos directos del proyecto) de "subtareas" (todo lo que cuelga de
 * esas actividades, cualquier nivel) — la tarjeta de Proyectos y el encabezado del detalle
 * separan estos dos conteos (Sebastian: "24 actividades · 68 subtareas").
 */
export function resumenProyecto(
  proyectoId: string,
  allItems: DecoratedItem[],
): { actividades: number; subtareas: number; subtareasResueltas: number } {
  const actividades = allItems.filter((d) => d.parent_item_id === proyectoId)
  let subtareas = 0
  let subtareasResueltas = 0
  for (const act of actividades) {
    const sub = contarSubtareas(act.id, allItems)
    subtareas += sub.total
    subtareasResueltas += sub.resueltas
  }
  return { actividades: actividades.length, subtareas, subtareasResueltas }
}

/** Fecha de inicio "efectiva": la propia, o -si no tiene- la mas temprana entre sus
 * descendientes (mismo criterio que `plazoEfectivo`, pero tomando la minima en vez de la
 * maxima). Sirve para el rango "01/09 → 30/09" de la tarjeta de Proyectos. */
export function fechaInicioEfectiva(raizId: string, allItems: DecoratedItem[]): string | null {
  const item = allItems.find((d) => d.id === raizId)
  const fechas: string[] = []
  if (item?.fecha_inicio) fechas.push(item.fecha_inicio)
  allItems
    .filter((d) => d.parent_item_id === raizId)
    .forEach((h) => {
      const f = fechaInicioEfectiva(h.id, allItems)
      if (f) fechas.push(f)
    })
  return fechas.length ? fechas.sort()[0] : null
}

/**
 * Alertas de un proyecto: cuantos descendientes (cualquier nivel) estan vencidos, proximos a
 * vencer (3 dias), o tienen una actividad vinculada bloqueada. `bloqueadas` mira las
 * actividades reales (`activities.status==='bloqueado'`) porque minute_items no tiene ese
 * estado propio -viene siempre de una actividad ya asignada.
 */
export function alertasProyecto(
  proyectoId: string,
  allItems: DecoratedItem[],
): { vencidas: number; proximas: number; bloqueadas: number } {
  const nodos: DecoratedItem[] = []
  const walk = (id: string) => {
    allItems
      .filter((d) => d.parent_item_id === id)
      .forEach((h) => {
        nodos.push(h)
        walk(h.id)
      })
  }
  walk(proyectoId)

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const limiteProximas = new Date(hoy.getTime() + 3 * 86_400_000)

  let vencidas = 0
  let proximas = 0
  let bloqueadas = 0
  for (const it of nodos) {
    if (it.linkedActivities.some((a) => a.status === 'bloqueado')) bloqueadas++
    if (it.effectiveEstado === 'resuelto') continue
    const f = plazoEfectivo(it, allItems)
    if (!f) continue
    const fecha = parseDateLocal(f)
    if (fecha < hoy) vencidas++
    else if (fecha <= limiteProximas) proximas++
  }
  return { vencidas, proximas, bloqueadas }
}
