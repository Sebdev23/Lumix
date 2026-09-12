import { useState, useRef } from 'react'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { DatePicker } from '@shared/components/ui/DatePicker'
import { MemberMultiSelect } from '@shared/components/ui/MemberMultiSelect'
import { EditableText } from '@shared/components/ui/EditableText'
import {
  useMinuta,
  estadoLabels,
  estadoIngestaLabels,
  type DecoratedItem,
} from '@features/minuta/hooks/useMinuta'
import { plazoEfectivo, avanceDe } from '@features/minuta/utils/subtareas'
import { AsignarActividadModal } from '@features/minuta/components/AsignarActividadModal'
import { exportToCSV } from '@shared/utils/export'
import { CargaMasivaModal } from '@features/minuta/components/CargaMasivaModal'
import { useToast } from '@shared/components/ui/Toast'
import { SkeletonRows } from '@shared/components/ui/Skeleton'
import { formatDateLocal, parseDateLocal } from '@shared/utils/date'
import type { BadgeVariant } from '@shared/components/ui/Badge'
import type { EstadoIngesta, HojaTipo, MinuteEstado, Profile } from '@shared/types'

const estadoColors: Record<MinuteEstado, BadgeVariant> = {
  pendiente: 'warning',
  en_desarrollo: 'info',
  resuelto: 'success',
  definir: 'default',
}

const estadoIngestaColors: Record<EstadoIngesta, BadgeVariant> = {
  no_iniciado: 'default',
  en_proceso: 'info',
  completado: 'success',
  no_resuelto: 'warning',
  cancelado: 'danger',
}

/**
 * Sub-temas de un tema (ej. "Ver faena" bajo "Revisar capacidad").
 *
 * Reusa las mismas funciones que ya gobiernan un tema de nivel superior (guardar,
 * openCreate) en vez de reimplementar la logica de asignacion: un sub-tema sigue el
 * MISMO camino para transformarse en actividad. Se muestra achicado porque conviven varios
 * dentro de la fila de su padre.
 */
export function SubtareasPanel({
  parentId,
  allItems,
  members,
  canManage,
  canAssign,
  singleResponsable,
  canAddSubtareas = true,
  maxDepth,
  depth = 0,
  canDelete = false,
  onRemove,
  memberName,
  onGuardar,
  onGuardarTema,
  onGuardarPlazo,
  onOpenCreate,
  onAdd,
}: {
  parentId: string
  allItems: DecoratedItem[]
  members: Profile[]
  canManage: boolean
  canAssign: boolean
  // Minuta: una subtarea sigue siendo un tema puntual, un solo responsable. Proyectos: no
  // aplica, puede repartirse entre varios.
  singleResponsable?: boolean
  // Compuerta general de "se puede agregar subtareas aca" (aparte de la profundidad). Default
  // true: Proyectos no tiene mas restriccion que esta.
  canAddSubtareas?: boolean
  // Minuta: un tema admite subtareas, pero de UN solo nivel -no sub-subtareas, eso ya es
  // armar un proyecto de a poco, y para eso esta Proyectos, que no pasa este limite
  // (maxDepth=undefined). depth se incrementa en cada llamada recursiva.
  maxDepth?: number
  depth?: number
  canDelete?: boolean
  onRemove?: (id: string, tema: string) => void
  memberName: (id: string) => string
  onGuardar: (id: string, patch: { responsables: string[]; para_todos: boolean }) => void
  onGuardarTema: (id: string, tema: string) => void
  onGuardarPlazo: (item: DecoratedItem, v: string | null) => void
  onOpenCreate: (it: DecoratedItem) => void
  onAdd: (tema: string, parentItemId: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const cancelandoRef = useRef(false)
  // Colapsado por defecto (antes arrancaba expandido): con profundidad ilimitada en Proyectos,
  // esta misma fila densa (texto, responsable, fecha, estado, borrar) se repetia en CADA nivel
  // a la vez, mostrando todo de entrada -exactamente el patron que Todoist/Asana evitan
  // (revelar bajo demanda, no todo junto) y que la investigacion de NN/G mide como una mejora
  // real de tiempo de escaneo. Sigue siendo un click expandir, no se perdio ninguna funcion.
  const [expanded, setExpanded] = useState(false)
  const subtemas = allItems.filter((d) => d.parent_item_id === parentId)
  const puedeAgregarAca = canAddSubtareas && (maxDepth === undefined || depth < maxDepth)
  const puedeAnidar = maxDepth === undefined || depth + 1 < maxDepth

  const confirmarNuevo = () => {
    // Al cancelar con Escape, quitar el input (setAdding(false)) dispara un blur nativo antes
    // de desmontar -sin esta bandera, ese blur llama a confirmarNuevo con el texto que ya
    // habiamos descartado y termina creando la subtarea igual que si nunca se hubiera
    // cancelado.
    if (cancelandoRef.current) {
      cancelandoRef.current = false
      return
    }
    if (nuevo.trim()) onAdd(nuevo.trim(), parentId)
    setNuevo('')
    setAdding(false)
  }
  const cancelarNuevo = () => {
    cancelandoRef.current = true
    setNuevo('')
    setAdding(false)
  }

  return (
    <div className="mt-2 pl-3 border-l-2 border-border-strong space-y-1.5">
      {subtemas.length > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] text-slate-500 hover:text-fg-muted font-medium flex items-center gap-1"
        >
          <span className="inline-block w-2.5">{expanded ? '▾' : '▸'}</span>
          Subtareas ({subtemas.length})
        </button>
      )}
      {expanded &&
        subtemas.map((s) => (
          <div key={s.id} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] bg-surface-soft/40 rounded-lg px-2 py-1.5">
              <div className="flex-1 min-w-[100px]">
                <EditableText
                  value={s.tema}
                  canEdit={canManage}
                  onSave={(next) => onGuardarTema(s.id, next)}
                  textClassName="text-fg-muted"
                  preventEmpty
                />
              </div>
              {canManage ? (
                <div className="w-36">
                  <MemberMultiSelect
                    members={members}
                    selected={s.responsables}
                    paraTodos={false}
                    single={singleResponsable}
                    onChange={(next) => onGuardar(s.id, next)}
                  />
                </div>
              ) : (
                <span className="text-slate-500">
                  {s.responsables.map(memberName).join(', ') || 'Sin asignar'}
                </span>
              )}
              <div>
                {canManage ? (
                  <div className="w-28">
                    <DatePicker
                      value={s.plazo}
                      onChange={(v) => onGuardarPlazo(s, v)}
                      placeholder="+ fecha"
                    />
                  </div>
                ) : (
                  <span className="text-slate-500">
                    {s.plazo ? formatDateLocal(s.plazo) : 'Sin fecha'}
                  </span>
                )}
                {s.plazo_change_count > 0 && (
                  <span className="block text-[10px] text-amber-400 mt-0.5">
                    cambiada {s.plazo_change_count} {s.plazo_change_count === 1 ? 'vez' : 'veces'}
                  </span>
                )}
              </div>
              {s.linkedActivities.length > 0 ? (
                <Badge variant={estadoColors[s.effectiveEstado]}>
                  {estadoLabels[s.effectiveEstado]}
                </Badge>
              ) : (
                canAssign &&
                s.responsables.length > 0 && (
                  <button
                    onClick={() => onOpenCreate(s)}
                    className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium"
                  >
                    Asignar
                  </button>
                )
              )}
              {canDelete && onRemove && (
                <button
                  onClick={() => onRemove(s.id, s.tema)}
                  title="Eliminar subtarea"
                  className="text-slate-500 hover:text-red-400 text-[11px] px-0.5"
                >
                  🗑
                </button>
              )}
            </div>

            {/* Recursivo: una subtarea puede tener las suyas. En Proyectos sin limite de
              profundidad (maxDepth=undefined); en Minuta se corta a un solo nivel (maxDepth=1,
              puedeAnidar da false apenas depth+1 llega a ese tope) -un tema puntual admite un
              paso mas, no un arbol entero, eso ya es Proyectos. */}
            {puedeAnidar && (
              <SubtareasPanel
                parentId={s.id}
                allItems={allItems}
                members={members}
                canManage={canManage}
                canAssign={canAssign}
                singleResponsable={singleResponsable}
                canAddSubtareas={canAddSubtareas}
                maxDepth={maxDepth}
                depth={depth + 1}
                canDelete={canDelete}
                onRemove={onRemove}
                memberName={memberName}
                onGuardar={onGuardar}
                onGuardarTema={onGuardarTema}
                onGuardarPlazo={onGuardarPlazo}
                onOpenCreate={onOpenCreate}
                onAdd={onAdd}
              />
            )}
          </div>
        ))}
      {canManage &&
        puedeAgregarAca &&
        expanded &&
        (adding ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onBlur={confirmarNuevo}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmarNuevo()
                if (e.key === 'Escape') cancelarNuevo()
              }}
              placeholder="Nueva subtarea…"
              className="flex-1 rounded border border-border-strong bg-surface px-2 py-1 text-base sm:text-[11px] text-fg-body"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-[11px] text-slate-500 hover:text-indigo-400"
          >
            + Subtarea
          </button>
        ))}
    </div>
  )
}

// Colores del Cronograma por estado -mismo criterio que el Tablero de Proyectos
// (COLUMNA_ESTILO en ProyectoDetailPage.tsx): pendiente=amber, en_desarrollo=blue,
// resuelto=emerald, definir=slate. Antes solo distinguia raiz/subtarea/resuelto; ahora
// coincide con el color que esa misma tarea ya tiene en el Tablero.
const GANTT_COLOR: Record<MinuteEstado, string> = {
  pendiente: 'bg-amber-500',
  en_desarrollo: 'bg-blue-500',
  resuelto: 'bg-emerald-500',
  definir: 'bg-slate-500',
}
// Version tenue (25%) del mismo color, para el fondo de la barra -el color solido de arriba
// pasa a ser el RELLENO de avance (`avanceDe`), no toda la barra. Sin esto, una tarea al 20%
// se veia identica a una al 90%.
const GANTT_COLOR_TENUE: Record<MinuteEstado, string> = {
  pendiente: 'bg-amber-500/25',
  en_desarrollo: 'bg-blue-500/25',
  resuelto: 'bg-emerald-500/25',
  definir: 'bg-slate-500/25',
}

type ZoomGantt = 'dia' | 'semana' | 'mes'

/**
 * Contenido del Cronograma (Gantt), sin el `Modal` que lo envolvia -Proyectos lo usa como
 * pestaña de pantalla completa; `GanttModal` (mas abajo) lo envuelve para el uso puntual de
 * Minuta. Barras reales (inicio-fin) cuando la tarea tiene `fecha_inicio` (migracion 047); si
 * no la tiene, se muestra un punto en la entrega, honesto sobre el dato que existe. Cada barra
 * ademas rellena su propio color segun el avance real (subtareas resueltas), y un zoom
 * Dia/Semana/Mes cambia el tamaño de los tramos del eje.
 */
export function GanttChart({
  root,
  allItems,
  memberName,
  onOpen,
}: {
  root: DecoratedItem
  allItems: DecoratedItem[]
  memberName?: (id: string) => string
  // Click en una barra/fila abre el mismo panel de detalle que Lista/Tablero (Proyectos). En
  // Minuta (GanttModal) no se pasa: las barras quedan de solo lectura, como antes.
  onOpen?: (itemId: string) => void
}) {
  const [zoom, setZoom] = useState<ZoomGantt>('semana')

  const nodes: { item: DecoratedItem; depth: number }[] = []
  const walk = (id: string, depth: number) => {
    const item = allItems.find((d) => d.id === id)
    if (!item) return
    nodes.push({ item, depth })
    allItems.filter((d) => d.parent_item_id === id).forEach((c) => walk(c.id, depth + 1))
  }
  walk(root.id, 0)

  const toTime = (f: string) => parseDateLocal(f).getTime()
  const fechas = nodes
    .flatMap((n) => [plazoEfectivo(n.item, allItems), n.item.fecha_inicio])
    .filter((f): f is string => !!f)
    .map(toTime)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const min = fechas.length ? Math.min(...fechas, hoy.getTime()) : hoy.getTime()
  const maxRaw = fechas.length ? Math.max(...fechas, hoy.getTime()) : hoy.getTime() + 7 * 86_400_000
  // Al menos 1 dia de rango: si todo vence el mismo dia, evita dividir por cero.
  const span = Math.max(maxRaw - min, 86_400_000)
  const pctDeHoy = ((hoy.getTime() - min) / span) * 100

  const pct = (f: string) => Math.min(100, Math.max(0, ((toTime(f) - min) / span) * 100))

  // Cabecera del eje: tramos reales desde `min`, en columnas de ancho IGUAL (flex, como el
  // mockup) -sin eso, una etiqueta cerca del borde derecho no tenia espacio propio y se
  // salia/superponia (bug real reportado). El tamaño del tramo lo decide el zoom.
  const tramoMs = zoom === 'dia' ? 86_400_000 : zoom === 'mes' ? 30 * 86_400_000 : 7 * 86_400_000
  const tramos: { etiqueta: string }[] = []
  for (let cursor = min; cursor < maxRaw; cursor += tramoMs) {
    const ini = new Date(cursor)
    const fin = new Date(Math.min(cursor + tramoMs - 86_400_000, maxRaw))
    const mesIni = ini.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
    const etiqueta =
      zoom === 'dia'
        ? `${ini.getDate()} ${mesIni}`
        : zoom === 'mes'
          ? ini.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }).replace('.', '')
          : `${ini.getDate()}–${fin.getDate()} ${fin.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')}`
    tramos.push({ etiqueta })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] text-slate-500">
          Con fecha de inicio, la barra va de inicio a entrega y se rellena segun el avance. Sin
          fecha de inicio, se muestra un punto en la entrega. La linea roja marca hoy.
        </p>
        <div className="inline-flex rounded-lg bg-surface p-0.5 flex-shrink-0">
          {(['dia', 'semana', 'mes'] as ZoomGantt[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-medium capitalize transition-colors ${
                zoom === z ? 'bg-indigo-600 text-white' : 'text-fg-faint'
              }`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>
      {/* Dos columnas independientes con alto FIJO (34px) -seguro porque cada etiqueta mide
          maximo 2 lineas (tema + responsable): la fecha de inicio se edita desde el panel de
          detalle, no aca, para no romper esta alineacion (bug real reportado antes). */}
      <div className="overflow-x-auto">
        <div
          className="rounded-xl border border-border bg-panel p-4"
          style={{ display: 'grid', gridTemplateColumns: '160px 1fr', minWidth: 600 }}
        >
          {/* Columna de nombres */}
          <div className="flex flex-col gap-1.5 border-r border-border pr-3.5">
            <div className="h-5" />
            {nodes.map(({ item, depth }) => (
              <div
                key={item.id}
                className={`h-[34px] flex flex-col justify-center min-w-0 ${onOpen ? 'cursor-pointer' : ''}`}
                style={{ paddingLeft: depth * 10 }}
                onClick={() => onOpen?.(item.id)}
              >
                <span className="text-[11.5px] font-medium text-fg-muted truncate">
                  {depth > 0 && '↳ '}
                  {item.tema}
                </span>
                {memberName && item.responsables.length > 0 && (
                  <span className="text-[10px] text-fg-faint truncate">
                    {item.responsables.map(memberName).join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Columna de linea de tiempo */}
          <div className="relative pl-3.5 min-w-0">
            <div className="grid grid-flow-col auto-cols-fr pb-2 border-b border-border mb-1.5">
              {tramos.map((t, i) => (
                <span
                  key={i}
                  className="text-[10px] uppercase tracking-wide text-fg-faint truncate"
                >
                  {t.etiqueta}
                </span>
              ))}
            </div>
            <div className="relative flex flex-col gap-1.5">
              {/* Una sola linea de "Hoy", como el mockup: se estira por arriba del bloque de
                  filas (hacia la cabecera del eje) con top negativo, no una por fila. */}
              <div
                className="absolute w-0.5 bg-red-500 z-[3]"
                style={{ left: `${pctDeHoy}%`, top: -30, bottom: -6 }}
              >
                <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 text-[9.5px] font-bold text-red-500 whitespace-nowrap">
                  Hoy
                </span>
              </div>
              {nodes.map(({ item }) => {
                const fin = plazoEfectivo(item, allItems)
                const inicio = item.fecha_inicio
                const hayBarra = !!inicio && !!fin && toTime(inicio) <= toTime(fin)
                const color = GANTT_COLOR[item.effectiveEstado]
                const colorTenue = GANTT_COLOR_TENUE[item.effectiveEstado]
                const anchoBarra = hayBarra
                  ? Math.min(Math.max(pct(fin!) - pct(inicio!), 6), 100 - pct(inicio!))
                  : 0
                const avance = avanceDe(item, allItems)
                return (
                  <div key={item.id} className="h-[34px] relative">
                    {hayBarra ? (
                      <div
                        className={`absolute top-[5px] h-6 rounded-md overflow-hidden shadow ${colorTenue} ${onOpen ? 'cursor-pointer' : ''}`}
                        style={{ left: `${pct(inicio!)}%`, width: `${anchoBarra}%` }}
                        title={`${formatDateLocal(inicio!)} → ${formatDateLocal(fin!)} · ${avance}%`}
                        onClick={() => onOpen?.(item.id)}
                      >
                        <div
                          className={`absolute inset-y-0 left-0 ${color}`}
                          style={{ width: `${avance}%` }}
                        />
                        <span className="relative flex items-center h-full px-2.5 text-[10.5px] font-semibold text-white whitespace-nowrap">
                          {item.tema}
                        </span>
                      </div>
                    ) : (
                      fin && (
                        <div
                          className={`absolute top-[13px] h-2.5 w-2.5 rounded-full ${color} ${onOpen ? 'cursor-pointer' : ''}`}
                          style={{ left: `calc(${pct(fin)}% - 5px)` }}
                          title={formatDateLocal(fin)}
                          onClick={() => onOpen?.(item.id)}
                        />
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-fg-faint">
        {(Object.keys(GANTT_COLOR) as MinuteEstado[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${GANTT_COLOR[s]}`} />
            {estadoLabels[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Hoy
        </span>
      </div>
    </div>
  )
}

/** Envoltorio en `Modal` de `GanttChart`, para el "Ver Gantt" puntual de una subtarea (Minuta) —
 * ahi si tiene sentido un popup chico, a diferencia del Cronograma de Proyectos, que ahora es
 * una pestaña de pantalla completa (ver `ProyectoDetailPage.tsx`). */
export function GanttModal({
  root,
  allItems,
  onClose,
  memberName,
}: {
  root: DecoratedItem
  allItems: DecoratedItem[]
  onClose: () => void
  memberName?: (id: string) => string
}) {
  return (
    <Modal open onClose={onClose} title={`Cronograma: ${root.tema}`} size="lg">
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        <GanttChart root={root} allItems={allItems} memberName={memberName} />
      </div>
    </Modal>
  )
}

/**
 * Hoja de temas: sirve para la minuta semanal y para la de ingesta.
 *
 * Es la misma tabla, el mismo hook y la misma UI; lo unico que cambia son las etiquetas y
 * el permiso que se exige para escribir (lo resuelve useMinuta). Ver migracion 033.
 */
export function MinutaPage({ tipo = 'minuta' }: { tipo?: HojaTipo } = {}) {
  const esIngesta = tipo === 'ingesta'
  // Minuta es un tema puntual de la reunion semanal, no un reparto de tareas -eso es
  // Proyectos-: un solo responsable por tema/subtarea, para que no se acumulen varias
  // actividades detras de un mismo tema (caso real reportado).
  const esMinuta = tipo === 'minuta'
  // "Solicitudes de Ingesta", no "Hoja de Ingesta": "hoja" es jerga de planilla de calculo,
  // no dice que hay adentro. Mismo patron que ya usa el resto de la app para pantallas de
  // seguimiento (Bitacora de Errores, Minuta Semanal, Planificacion Semanal) -sustantivo que
  // nombra lo que se sigue, sin la palabra "hoja".
  const titulo = esIngesta ? 'Solicitudes de Ingesta' : 'Minuta Semanal'
  const {
    items,
    allItems,
    counts,
    members,
    loading,
    view,
    setView,
    filterMember,
    setFilterMember,
    filterGrupo,
    setFilterGrupo,
    gruposDisponibles,
    search,
    setSearch,
    weekMode,
    setWeekMode,
    weekOffset,
    setWeekOffset,
    weekLabel,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    canManage,
    canDelete,
    canAssign,
    addItem,
    bulkAdd,
    updateItem,
    changePlazo,
    removeItem,
    createActivitiesFromItem,
  } = useMinuta(tipo)
  // El filtro de grupo de trabajo (alias "foco"): mismo permiso que ya gobierna gestionar la
  // hoja (canManage), no un chequeo de rol aparte -si no, alguien con el permiso concedido
  // puntualmente (sin ser jefatura/admin de rol) no veia el filtro aunque si puede gestionar
  // todo lo demas de la pantalla. Bug real reportado por Sebastian, corregido.
  const esJefe = canManage

  const [cargaMasiva, setCargaMasiva] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [ganttForId, setGanttForId] = useState<string | null>(null)
  const [createForId, setCreateForId] = useState<string | null>(null)
  // Cuando se abre desde "Falta la actividad de X", acota a esa persona sola (no duplicarle
  // la actividad a quien ya la tiene). undefined = todos los responsables del tema.
  const [createSoloResp, setCreateSoloResp] = useState<string[] | undefined>(undefined)
  const toast = useToast()

  // El cambio se pinta al instante y se guarda despues (ver updateItem). Si el guardado
  // falla, el hook revierte: sin este aviso, el valor volveria solo y sin explicacion.
  const guardar = (id: string, patch: Parameters<typeof updateItem>[1]) =>
    updateItem(id, patch).catch(() => toast.error('No se pudo guardar el cambio'))

  const guardarPlazo = (item: DecoratedItem, v: string | null) =>
    changePlazo(item, v).catch(() => toast.error('No se pudo guardar la fecha'))

  const guardarTema = (id: string, tema: string) => guardar(id, { tema })
  const guardarComentarios = (id: string, comentarios: string) => guardar(id, { comentarios })

  // Que decir cuando no hay nada. "Por asignar" vacio es una BUENA noticia -no queda nada
  // que conversar-, no un error, y el mensaje tiene que reflejarlo.
  const textoVacio = () => {
    if (weekMode) return 'No hubo temas con actividad en esa semana'
    if (dateFrom && dateTo) return 'No hay solicitudes en ese rango de fechas'
    if (search || filterMember !== 'todas') return 'No hay temas que coincidan con el filtro'
    if (esIngesta) {
      if (view === 'resueltos') return 'No hay solicitudes resueltas'
      if (view === 'todos') return 'No hay solicitudes registradas todavía'
      return 'No hay solicitudes activas. Todo al día.'
    }
    if (view === 'resueltos') return 'No hay temas resueltos'
    if (view === 'asignados') return 'No hay temas asignados todavia'
    if (view === 'todos') return 'No hay temas en la minuta'
    return 'Todo asignado. No queda nada por conversar.'
  }

  // Personas que figuran como responsables del tema pero NO tienen actividad creada.
  //
  // Pasa cuando alguien agrega gente DESPUES de haber generado las actividades: el tema dice
  // que son responsables, pero para el sistema no existen -sin notificacion, sin carga, sin
  // aparecer en Compromisos-. Habia 4 casos asi cuando se reviso. No se crea nada solo: se
  // muestra y se ofrece el boton.
  const sinActividad = (it: DecoratedItem) =>
    it.responsables.filter((rid) => !it.linkedActivities.some((a) => a.responsible_id === rid))

  // Actividades vivas de gente que YA NO figura como responsable del tema.
  //
  // Es el reverso de "Falta la actividad de X": alguien saca a una persona del desplegable y
  // su actividad sigue existiendo a su nombre, con su fecha y su carga. Nadie se entera. No
  // se toca sola -borrar trabajo asignado en silencio seria peor que el problema-, se avisa
  // y quien corresponda decide si la reasigna, la cierra o la deja.
  const huerfanas = (it: DecoratedItem) =>
    it.linkedActivities.filter(
      (a) =>
        a.status !== 'completado' &&
        a.responsible_id &&
        !it.responsables.includes(a.responsible_id),
    )

  // Un tema que volvio desde Compromisos queda "Definir en reunion" para que se converse.
  // Como al tener actividad vinculada el selector de estado se reemplaza por una etiqueta de
  // solo lectura, sin este boton no habia forma de sacarlo: quedaba dando vueltas en la
  // reunion para siempre, justamente el tema que estaba trancado.
  const esEscalado = (it: DecoratedItem) =>
    it.estado === 'definir' && it.linkedActivities.length > 0

  const yaConversado = (it: DecoratedItem) =>
    guardar(it.id, { estado: 'en_desarrollo' }).then(() =>
      toast.success('Listo, sale de la lista de conversación'),
    )

  const memberName = (id: string) => members.find((m) => m.id === id)?.full_name || 'Desconocido'

  const responsablesLabel = (it: DecoratedItem) => {
    if (it.para_todos) return 'Todos'
    const names = it.responsables.map(memberName)
    if (it.responsables_text) names.push(it.responsables_text)
    return names.length ? names.join(', ') : 'Sin asignar'
  }

  // OJO: se busca en allItems, no en items -este ultimo son solo los temas raiz visibles en
  // la lista principal (ver useMinuta). Un sub-tema nunca aparece ahi, asi que buscarlo en
  // items dejaba el modal de "Asignar" sin nada que mostrar y parecia que el boton no hacia nada.
  const createItem = createForId ? (allItems.find((i) => i.id === createForId) ?? null) : null
  const deleteItem = confirmDeleteId
    ? (allItems.find((i) => i.id === confirmDeleteId) ?? null)
    : null
  const ganttItem = ganttForId ? (allItems.find((i) => i.id === ganttForId) ?? null) : null

  const openCreate = (it: DecoratedItem, soloEstos?: string[]) => {
    setCreateSoloResp(soloEstos)
    setCreateForId(it.id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-border bg-panel flex-shrink-0">
        <h2 className="text-sm font-semibold text-fg-body">{titulo}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToCSV(
                items.map((it) =>
                  esIngesta
                    ? {
                        Solicitud: it.tema,
                        Responsable: it.responsables_text || 'Sin asignar',
                        'Fecha de solicitud': formatDateLocal(it.created_at),
                        'Fecha de compromiso': it.plazo ? formatDateLocal(it.plazo) : '-',
                        Estado: estadoIngestaLabels[it.estado_ingesta ?? 'no_iniciado'],
                        Comentarios: it.comentarios,
                      }
                    : {
                        Tema: it.tema,
                        Responsables: responsablesLabel(it),
                        Estado: estadoLabels[it.effectiveEstado],
                        Plazo: it.plazo ? formatDateLocal(it.plazo) : '-',
                        'Cambios de plazo': it.plazo_change_count,
                        Comentarios: it.comentarios,
                      },
                ),
                esIngesta ? 'ingesta' : 'minuta',
              )
            }
            className="px-2 py-1 rounded text-[10px] text-fg-faint hover:text-emerald-400 hover:bg-surface transition-colors"
            title="Exportar a Excel"
          >
            Excel
          </button>
          {canManage && (
            <button
              onClick={() => setCargaMasiva(true)}
              className="px-2 py-1 rounded text-[10px] text-fg-faint hover:text-indigo-400 hover:bg-surface transition-colors"
              title="Cargar varios temas desde una planilla"
            >
              Carga masiva
            </button>
          )}
          <span className="text-xs text-slate-500">
            {counts.pendientes} {esIngesta ? 'activas' : 'por asignar'}
          </span>
        </div>
      </div>

      {/* Toolbar de filtros (fondo solido y anclado) */}
      <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-2 border-b border-border bg-panel flex-shrink-0">
        {/* Control segmentado de estado */}
        <div className="inline-flex rounded-lg bg-surface p-0.5">
          {(esIngesta
            ? ([
                { v: 'pendientes', label: 'Activas', n: counts.pendientes },
                { v: 'resueltos', label: 'Resueltas', n: counts.resueltos },
                { v: 'todos', label: 'Todas', n: counts.todos },
              ] as const)
            : ([
                { v: 'pendientes', label: 'Por asignar', n: counts.pendientes },
                { v: 'asignados', label: 'Asignados', n: counts.asignados },
                { v: 'resueltos', label: 'Resueltos', n: counts.resueltos },
                { v: 'todos', label: 'Todos', n: counts.todos },
              ] as const)
          ).map((f) => (
            <button
              key={f.v}
              onClick={() => setView(f.v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === f.v
                  ? 'bg-surface-2 text-indigo-300 shadow-sm'
                  : 'text-fg-faint hover:text-slate-200'
              }`}
            >
              {f.label}
              <span
                className={`ml-1.5 ${view === f.v ? 'text-fg-faint' : 'text-slate-600 light:text-slate-500'}`}
              >
                {f.n}
              </span>
            </button>
          ))}
        </div>

        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-surface border border-border-strong text-fg-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        >
          <option value="todas">Todo el equipo</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>

        {esJefe && gruposDisponibles.length > 0 && (
          <select
            value={filterGrupo}
            onChange={(e) => setFilterGrupo(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs bg-surface border border-border-strong text-fg-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            <option value="todas">Cualquier grupo</option>
            {gruposDisponibles.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        )}

        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tema..."
            className="w-full rounded-lg bg-surface border border-border-strong pl-8 pr-7 py-1.5 text-base sm:text-xs text-fg-body placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-fg-muted text-sm"
            >
              ×
            </button>
          )}
        </div>

        {/* Filtro de fechas: Ingesta tiene dos fechas propias (solicitud/compromiso) y un
            rango elegido a mano tiene mas sentido que "actividad esta semana" -eso es un
            concepto de Minuta (se conversa/avanza en la reunion), no de un log de
            solicitudes-. Minuta sigue con el navegador de semana de siempre. */}
        {esIngesta ? (
          <>
            <select
              value={dateType}
              onChange={(e) => setDateType(e.target.value as typeof dateType)}
              className="px-2 py-1.5 rounded-lg text-xs bg-surface border border-border-strong text-fg-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            >
              <option value="compromiso">Fecha de compromiso</option>
              <option value="solicitud">Fecha de solicitud</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs bg-surface border border-border-strong text-fg-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-[130px]"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs bg-surface border border-border-strong text-fg-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-[130px]"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom('')
                  setDateTo('')
                }}
                className="px-2 py-1.5 rounded-lg text-xs text-fg-faint hover:text-fg-body hover:bg-surface"
              >
                Limpiar
              </button>
            )}
          </>
        ) : weekMode ? (
          <div className="flex items-center gap-1 rounded-lg bg-surface px-1 py-0.5">
            <button
              onClick={() => setWeekOffset(weekOffset - 1)}
              aria-label="Semana anterior"
              className="w-6 h-6 rounded text-fg-faint hover:bg-surface-2"
            >
              ‹
            </button>
            <span className="text-[11px] text-fg-body px-1 whitespace-nowrap">
              {weekOffset === 0 ? `Esta semana · ${weekLabel}` : weekLabel}
            </span>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              aria-label="Semana siguiente"
              className="w-6 h-6 rounded text-fg-faint hover:bg-surface-2"
            >
              ›
            </button>
            <button
              onClick={() => {
                setWeekMode(false)
                setWeekOffset(0)
              }}
              className="text-[11px] text-slate-500 hover:text-fg-muted px-1"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setWeekMode(true)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg-faint hover:text-fg-body hover:bg-surface border border-border-strong"
          >
            📅 Por semana
          </button>
        )}

        <div className="flex-1" />
        {canManage && (
          <Button size="sm" onClick={() => addItem('')}>
            + Nuevo tema
          </Button>
        )}
      </div>

      {/* Tabla editable inline (scroll con encabezado fijo) */}
      <div className="flex-1 overflow-auto px-3 sm:px-4 pb-3">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-fg-faint">{textoVacio()}</p>
            {canManage && view !== 'pendientes' && (
              <p className="text-xs text-slate-600 mt-1">Toca "+ Nuevo tema" para empezar</p>
            )}
          </div>
        ) : (
          <>
            {/* Movil: tarjetas apiladas */}
            <div className="space-y-3 lg:hidden">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="rounded-xl border border-border-strong bg-surface/60 p-3 space-y-3"
                >
                  {/* Tema */}
                  <EditableText
                    as="p"
                    value={it.tema}
                    canEdit={canManage}
                    onSave={(next) => guardarTema(it.id, next)}
                    textClassName="text-sm font-medium text-fg px-1"
                    preventEmpty
                  />
                  {it.linkedActivities.length > 0 && (
                    <span className="block text-[10px] text-indigo-400 px-1 -mt-1">
                      {it.linkedActivities.filter((a) => a.status === 'completado').length}/
                      {it.linkedActivities.length} actividades
                    </span>
                  )}
                  {esIngesta && (
                    <span className="block text-[10px] text-slate-500 px-1 -mt-1">
                      Solicitado: {formatDateLocal(it.created_at)}
                    </span>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {/* Responsable: en Ingesta puede ser de OTRO equipo, texto libre
                        (responsables_text) en vez del selector de miembros del equipo activo. */}
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Responsable</p>
                      {esIngesta ? (
                        canManage ? (
                          <input
                            defaultValue={it.responsables_text}
                            onBlur={(e) => {
                              if (e.target.value !== it.responsables_text)
                                guardar(it.id, { responsables_text: e.target.value })
                            }}
                            placeholder="Nombre (y equipo)"
                            className="w-full rounded border border-border-strong bg-field px-1.5 py-1 text-base sm:text-[11px] text-fg-body placeholder:text-slate-500"
                          />
                        ) : (
                          <span className="text-xs text-fg-faint">
                            {it.responsables_text || 'Sin asignar'}
                          </span>
                        )
                      ) : canManage ? (
                        <MemberMultiSelect
                          members={members}
                          selected={it.responsables}
                          paraTodos={it.para_todos}
                          single={esMinuta}
                          onChange={(next) => guardar(it.id, next)}
                        />
                      ) : (
                        <span className="text-xs text-fg-faint">{responsablesLabel(it)}</span>
                      )}
                    </div>
                    {/* Estado: Ingesta tiene su propio vocabulario (estado_ingesta), no el de
                        Minuta/Proyecto -no aplica el sincronizado con actividades vinculadas. */}
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Estado</p>
                      {esIngesta ? (
                        canManage ? (
                          <select
                            value={it.estado_ingesta ?? 'no_iniciado'}
                            onChange={(e) =>
                              guardar(it.id, {
                                estado_ingesta: e.target.value as EstadoIngesta,
                              })
                            }
                            className="w-full rounded border border-border-strong bg-surface px-1.5 py-1 text-[11px] text-fg-body"
                          >
                            {(Object.keys(estadoIngestaLabels) as EstadoIngesta[]).map((s) => (
                              <option key={s} value={s}>
                                {estadoIngestaLabels[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge variant={estadoIngestaColors[it.estado_ingesta ?? 'no_iniciado']}>
                            {estadoIngestaLabels[it.estado_ingesta ?? 'no_iniciado']}
                          </Badge>
                        )
                      ) : it.linkedActivities.length > 0 ? (
                        <Badge variant={estadoColors[it.effectiveEstado]}>
                          {estadoLabels[it.effectiveEstado]}
                        </Badge>
                      ) : canManage ? (
                        <select
                          value={it.estado}
                          onChange={(e) =>
                            guardar(it.id, { estado: e.target.value as MinuteEstado })
                          }
                          className="w-full rounded border border-border-strong bg-surface px-1.5 py-1 text-[11px] text-fg-body"
                        >
                          {(Object.keys(estadoLabels) as MinuteEstado[]).map((s) => (
                            <option key={s} value={s}>
                              {estadoLabels[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant={estadoColors[it.effectiveEstado]}>
                          {estadoLabels[it.effectiveEstado]}
                        </Badge>
                      )}
                    </div>
                    {/* Plazo (Ingesta: "Fecha de compromiso") */}
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">
                        {esIngesta ? 'Fecha de compromiso' : 'Plazo'}
                      </p>
                      {canManage ? (
                        <DatePicker
                          value={it.plazo}
                          onChange={(v) => guardarPlazo(it, v)}
                          placeholder="+ fecha"
                        />
                      ) : (
                        <span className="text-xs text-fg-muted">
                          {it.plazo ? formatDateLocal(it.plazo) : '-'}
                        </span>
                      )}
                      {!it.plazo &&
                        (() => {
                          const derivado = plazoEfectivo(it, allItems)
                          return (
                            derivado && (
                              <span
                                className="block text-[10px] text-slate-500 mt-0.5"
                                title="La subtarea con el plazo mas lejano"
                              >
                                ≈ {formatDateLocal(derivado)} (por subtareas)
                              </span>
                            )
                          )
                        })()}
                      {it.plazo_change_count > 0 && (
                        <span className="block text-[10px] text-amber-400 mt-0.5">
                          cambiada {it.plazo_change_count}{' '}
                          {it.plazo_change_count === 1 ? 'vez' : 'veces'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comentarios */}
                  <div>
                    <p className="text-[10px] text-slate-500 mb-1">Comentarios</p>
                    <EditableText
                      as="p"
                      value={it.comentarios}
                      canEdit={canManage}
                      onSave={(next) => guardarComentarios(it.id, next)}
                      placeholder="Notas..."
                      emptyLabel="-"
                      textClassName="text-xs text-fg-muted"
                    />
                  </div>

                  {/* Subtareas: descompone este tema en un proyecto de varios pasos. */}
                  <SubtareasPanel
                    parentId={it.id}
                    allItems={allItems}
                    members={members}
                    canManage={canManage}
                    canAssign={canAssign}
                    singleResponsable={esMinuta}
                    maxDepth={esMinuta ? 1 : undefined}
                    canDelete={canDelete}
                    onRemove={(id) => setConfirmDeleteId(id)}
                    memberName={memberName}
                    onGuardar={guardar}
                    onGuardarTema={guardarTema}
                    onGuardarPlazo={guardarPlazo}
                    onOpenCreate={openCreate}
                    onAdd={addItem}
                  />

                  {/* Acciones */}
                  {(canAssign || canDelete || allItems.some((d) => d.parent_item_id === it.id)) && (
                    <div className="flex items-center gap-3 pt-1 border-t border-border-strong/60">
                      {allItems.some((d) => d.parent_item_id === it.id) && (
                        <button
                          onClick={() => setGanttForId(it.id)}
                          className="px-2 py-1 rounded-lg bg-surface-2 text-fg-muted text-[11px] font-medium hover:bg-slate-600"
                        >
                          Ver Gantt
                        </button>
                      )}
                      {canAssign &&
                        !it.para_todos &&
                        it.responsables.length > 0 &&
                        (it.linkedActivities.length > 0 ? (
                          sinActividad(it).length > 0 ? (
                            <button
                              onClick={() => openCreate(it, sinActividad(it))}
                              className="px-2 py-1 rounded-lg bg-amber-600/20 text-amber-400 border border-amber-500/30 text-[11px] font-medium hover:bg-amber-600/30"
                            >
                              Falta la actividad de {sinActividad(it).map(memberName).join(', ')}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500">Actividad asignada</span>
                          )
                        ) : (
                          <button
                            onClick={() => openCreate(it)}
                            className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
                          >
                            Asignar actividad
                          </button>
                        ))}
                      {canManage && esEscalado(it) && (
                        <button
                          onClick={() => yaConversado(it)}
                          title="Cierra la conversación: el tema sale de aquí y su actividad sigue su curso"
                          className="px-2 py-1 rounded-lg bg-surface-2 text-fg-muted text-[11px] font-medium hover:bg-slate-600"
                        >
                          Ya lo conversamos
                        </button>
                      )}
                      {huerfanas(it).length > 0 && (
                        <span
                          className="text-[11px] text-amber-400"
                          title="Sacaste a esa persona del tema, pero su actividad sigue abierta. Ciérrala o reasígnala desde Actividades."
                        >
                          ⚠{' '}
                          {huerfanas(it)
                            .map((a) => memberName(a.responsible_id))
                            .join(', ')}{' '}
                          ya no figura y su actividad sigue abierta
                        </span>
                      )}
                      <div className="flex-1" />
                      {canDelete && (
                        <button
                          onClick={() => setConfirmDeleteId(it.id)}
                          className="text-[11px] text-slate-500 hover:text-red-400"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Escritorio: tabla */}
            <table className="hidden lg:table w-full text-xs border-collapse">
              <thead>
                <tr className="text-fg-faint align-bottom [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-panel [&>th]:border-b [&>th]:border-border-strong [&>th]:shadow-[0_2px_4px_-2px_rgba(0,0,0,0.5)]">
                  <th className="text-left py-2 px-2 font-medium min-w-[220px] sm:w-[38%] sm:min-w-[340px]">
                    {esIngesta ? 'Solicitud' : 'Tema'}
                  </th>
                  <th className="text-left py-2 px-2 font-medium min-w-[150px]">
                    {esIngesta ? 'Responsable' : 'Responsable(s)'}
                  </th>
                  <th className="text-left py-2 px-2 font-medium min-w-[130px]">Estado</th>
                  <th className="text-left py-2 px-2 font-medium min-w-[110px]">
                    {esIngesta ? 'Fecha de compromiso' : 'Plazo'}
                  </th>
                  <th className="text-left py-2 px-2 font-medium min-w-[140px] sm:min-w-[180px]">
                    Comentarios
                  </th>
                  <th className="text-right py-2 px-2 font-medium">Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-border align-top">
                    {/* Tema (texto completo, editable inline) */}
                    <td className="py-2 px-2">
                      <EditableText
                        value={it.tema}
                        canEdit={canManage}
                        onSave={(next) => guardarTema(it.id, next)}
                        textClassName="text-fg font-medium"
                        preventEmpty
                      />
                      {it.linkedActivities.length > 0 && (
                        <span className="block text-[10px] text-indigo-400 mt-0.5">
                          {it.linkedActivities.filter((a) => a.status === 'completado').length}/
                          {it.linkedActivities.length} actividades
                        </span>
                      )}
                      <SubtareasPanel
                        parentId={it.id}
                        allItems={allItems}
                        members={members}
                        canManage={canManage}
                        canAssign={canAssign}
                        singleResponsable={esMinuta}
                        maxDepth={esMinuta ? 1 : undefined}
                        canDelete={canDelete}
                        onRemove={(id) => setConfirmDeleteId(id)}
                        memberName={memberName}
                        onGuardar={guardar}
                        onGuardarTema={guardarTema}
                        onGuardarPlazo={guardarPlazo}
                        onOpenCreate={openCreate}
                        onAdd={addItem}
                      />
                    </td>

                    {/* Responsable: en Ingesta puede ser de OTRO equipo, texto libre. */}
                    <td className="py-2 px-2">
                      {esIngesta ? (
                        canManage ? (
                          <input
                            defaultValue={it.responsables_text}
                            onBlur={(e) => {
                              if (e.target.value !== it.responsables_text)
                                guardar(it.id, { responsables_text: e.target.value })
                            }}
                            placeholder="Nombre (y equipo)"
                            className="w-full rounded border border-border-strong bg-field px-1.5 py-1 text-base sm:text-xs text-fg-body placeholder:text-slate-500"
                          />
                        ) : (
                          <span className="text-fg-faint">
                            {it.responsables_text || 'Sin asignar'}
                          </span>
                        )
                      ) : canManage ? (
                        <MemberMultiSelect
                          members={members}
                          selected={it.responsables}
                          paraTodos={it.para_todos}
                          single={esMinuta}
                          onChange={(next) => guardar(it.id, next)}
                        />
                      ) : (
                        <span className="text-fg-faint">{responsablesLabel(it)}</span>
                      )}
                      {esIngesta && (
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Solicitado: {formatDateLocal(it.created_at)}
                        </span>
                      )}
                    </td>

                    {/* Estado: Ingesta usa su propio vocabulario (estado_ingesta). */}
                    <td className="py-2 px-2">
                      {esIngesta ? (
                        canManage ? (
                          <select
                            value={it.estado_ingesta ?? 'no_iniciado'}
                            onChange={(e) =>
                              guardar(it.id, {
                                estado_ingesta: e.target.value as EstadoIngesta,
                              })
                            }
                            className="rounded border border-border-strong bg-surface px-1.5 py-1 text-[11px] text-fg-body"
                          >
                            {(Object.keys(estadoIngestaLabels) as EstadoIngesta[]).map((s) => (
                              <option key={s} value={s}>
                                {estadoIngestaLabels[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge variant={estadoIngestaColors[it.estado_ingesta ?? 'no_iniciado']}>
                            {estadoIngestaLabels[it.estado_ingesta ?? 'no_iniciado']}
                          </Badge>
                        )
                      ) : it.linkedActivities.length > 0 ? (
                        <span title="Sincronizado con actividades">
                          <Badge variant={estadoColors[it.effectiveEstado]}>
                            {estadoLabels[it.effectiveEstado]}
                          </Badge>
                        </span>
                      ) : canManage ? (
                        <select
                          value={it.estado}
                          onChange={(e) =>
                            guardar(it.id, { estado: e.target.value as MinuteEstado })
                          }
                          className="rounded border border-border-strong bg-surface px-1.5 py-1 text-[11px] text-fg-body"
                        >
                          {(Object.keys(estadoLabels) as MinuteEstado[]).map((s) => (
                            <option key={s} value={s}>
                              {estadoLabels[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant={estadoColors[it.effectiveEstado]}>
                          {estadoLabels[it.effectiveEstado]}
                        </Badge>
                      )}
                    </td>

                    {/* Plazo + trazabilidad (Ingesta: "Fecha de compromiso") */}
                    <td className="py-2 px-2">
                      {canManage ? (
                        <DatePicker
                          value={it.plazo}
                          onChange={(v) => guardarPlazo(it, v)}
                          placeholder="+ fecha"
                        />
                      ) : (
                        <span className="text-fg-muted">
                          {it.plazo ? formatDateLocal(it.plazo) : '-'}
                        </span>
                      )}
                      {!it.plazo &&
                        (() => {
                          const derivado = plazoEfectivo(it, allItems)
                          return (
                            derivado && (
                              <span
                                className="block text-[10px] text-slate-500 mt-0.5"
                                title="La subtarea con el plazo mas lejano"
                              >
                                ≈ {formatDateLocal(derivado)} (por subtareas)
                              </span>
                            )
                          )
                        })()}
                      {it.plazo_change_count > 0 && (
                        <span
                          className="block text-[10px] text-amber-400 mt-0.5"
                          title={it.plazo_history.map((h) => formatDateLocal(h.date)).join(' → ')}
                        >
                          cambiada {it.plazo_change_count}{' '}
                          {it.plazo_change_count === 1 ? 'vez' : 'veces'}
                        </span>
                      )}
                    </td>

                    {/* Comentarios (texto completo, editable inline) */}
                    <td className="py-2 px-2">
                      <EditableText
                        value={it.comentarios}
                        canEdit={canManage}
                        onSave={(next) => guardarComentarios(it.id, next)}
                        placeholder="Notas..."
                        emptyLabel="-"
                        textClassName="text-fg-muted"
                      />
                    </td>

                    {/* Acciones */}
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      {(canAssign ||
                        canDelete ||
                        allItems.some((d) => d.parent_item_id === it.id)) && (
                        <div className="flex flex-col items-end gap-1.5">
                          {allItems.some((d) => d.parent_item_id === it.id) && (
                            <button
                              onClick={() => setGanttForId(it.id)}
                              className="px-2 py-1 rounded-lg bg-surface-2 text-fg-muted text-[11px] font-medium hover:bg-slate-600 transition-colors"
                            >
                              Ver Gantt
                            </button>
                          )}
                          {canAssign &&
                            !it.para_todos &&
                            it.responsables.length > 0 &&
                            (it.linkedActivities.length > 0 ? (
                              sinActividad(it).length > 0 ? (
                                <button
                                  onClick={() => openCreate(it, sinActividad(it))}
                                  className="px-2 py-1 rounded-lg bg-amber-600/20 text-amber-400 border border-amber-500/30 text-[11px] font-medium hover:bg-amber-600/30 transition-colors text-right"
                                >
                                  Falta la actividad de{' '}
                                  {sinActividad(it).map(memberName).join(', ')}
                                </button>
                              ) : (
                                <span
                                  title="Este tema ya tiene actividad(es) asignada(s)"
                                  className="px-2 py-1 rounded-lg bg-surface text-slate-500 text-[11px] font-medium cursor-not-allowed"
                                >
                                  Actividad asignada
                                </span>
                              )
                            ) : (
                              <button
                                onClick={() => openCreate(it)}
                                className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors"
                              >
                                Asignar actividad
                              </button>
                            ))}
                          {canManage && esEscalado(it) && (
                            <button
                              onClick={() => yaConversado(it)}
                              title="Cierra la conversación: el tema sale de aquí y su actividad sigue su curso"
                              className="px-2 py-1 rounded-lg bg-surface-2 text-fg-muted text-[11px] font-medium hover:bg-slate-600 transition-colors"
                            >
                              Ya lo conversamos
                            </button>
                          )}
                          {huerfanas(it).length > 0 && (
                            <span
                              className="text-[11px] text-amber-400 text-right"
                              title="Sacaste a esa persona del tema, pero su actividad sigue abierta. Ciérrala o reasígnala desde Actividades."
                            >
                              ⚠ actividad abierta de{' '}
                              {huerfanas(it)
                                .map((a) => memberName(a.responsible_id))
                                .join(', ')}
                            </span>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setConfirmDeleteId(it.id)}
                              className="text-[11px] text-slate-500 hover:text-red-400"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Modal chico para crear actividad(es) desde un tema/subtarea (compartido con Proyectos) */}
      <AsignarActividadModal
        key={createItem?.id ?? 'closed'}
        item={createItem}
        soloResponsables={createSoloResp}
        memberName={memberName}
        onClose={() => setCreateForId(null)}
        onCreate={createActivitiesFromItem}
      />

      {/* Popout de confirmacion de borrado */}
      <Modal
        open={!!deleteItem}
        onClose={() => setConfirmDeleteId(null)}
        title="Eliminar tema"
        size="sm"
      >
        {deleteItem && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <span className="text-xl leading-none">⚠️</span>
              <div className="space-y-1">
                <p className="text-sm text-fg-body">
                  {deleteItem.parent_item_id
                    ? '¿Seguro que quieres eliminar esta subtarea?'
                    : esIngesta
                      ? '¿Seguro que quieres eliminar esta solicitud de Solicitudes de Ingesta?'
                      : '¿Seguro que quieres eliminar este tema de la minuta?'}
                </p>
                <p className="text-sm text-fg-faint leading-snug">"{deleteItem.tema}"</p>
                <p className="text-[11px] text-slate-500">
                  Esta accion no se puede deshacer.
                  {deleteItem.linkedActivities.length > 0 &&
                    ' Las actividades ya creadas NO se eliminan.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const id = deleteItem.id
                  setConfirmDeleteId(null)
                  try {
                    await removeItem(id)
                    toast.success('Tema eliminado')
                  } catch {
                    toast.error('No se pudo eliminar')
                  }
                }}
              >
                Eliminar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <CargaMasivaModal
        open={cargaMasiva}
        onClose={() => setCargaMasiva(false)}
        members={members}
        // allItems y no items: items esta filtrado por vista y busqueda, asi que un tema
        // resuelto u oculto no se veria como repetido y entraria igual.
        temasExistentes={allItems.map((i) => i.tema)}
        onConfirm={bulkAdd}
      />

      {ganttItem && (
        <GanttModal
          root={ganttItem}
          allItems={allItems}
          onClose={() => setGanttForId(null)}
          memberName={memberName}
        />
      )}
    </div>
  )
}
