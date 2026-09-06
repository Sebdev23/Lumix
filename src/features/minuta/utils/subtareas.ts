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
