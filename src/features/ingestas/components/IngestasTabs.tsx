// Ingestas tenia dos vistas que convivian a proposito: la HOJA (modelo actual, reformulado
// en la Fase 13 del plan) y ACTIVIDADES, una vista vieja para las ingestas que se habian
// creado como actividades con el prefijo "[Ingesta]" en el titulo, antes de que existiera la
// Hoja. Esa pestaña se saco (confirmado por Sebastian, dueño de esas 12 actividades: eran
// reales pero el equipo no habia empezado a usar la Hoja todavia, se podian borrar) una vez
// que ya no quedo ninguna abierta -exactamente la condicion que ya estaba documentada aca
// para sacarla sin tocar nada mas.

import { MinutaPage } from '@features/minuta/components/MinutaPage'

export function IngestasTabs() {
  return <MinutaPage tipo="ingesta" />
}
