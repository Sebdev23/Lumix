import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { DatePicker } from '@shared/components/ui/DatePicker'
import { MemberMultiSelect } from '@shared/components/ui/MemberMultiSelect'
import { useMinuta, estadoLabels, type DecoratedItem } from '@features/minuta/hooks/useMinuta'
import { statusLabels } from '@features/activities/hooks/useActivities'
import { exportToCSV } from '@shared/utils/export'
import { CargaMasivaModal } from '@features/minuta/components/CargaMasivaModal'
import { useToast } from '@shared/components/ui/Toast'
import { SkeletonRows } from '@shared/components/ui/Skeleton'
import { formatDateLocal, parseDateLocal } from '@shared/utils/date'
import type { BadgeVariant } from '@shared/components/ui/Badge'
import type { HojaTipo, MinuteEstado, Profile } from '@shared/types'

const estadoColors: Record<MinuteEstado, BadgeVariant> = {
  pendiente: 'warning',
  en_desarrollo: 'info',
  resuelto: 'success',
  definir: 'default',
}

/**
 * Plazo de un tema, o -si no tiene uno propio- el mas lejano entre sus subtareas
 * (recursivo: baja hasta encontrar fechas reales). No se persiste: un proyecto grande
 * suele no tener fecha propia porque la fecha real ES la de su ultima subtarea, y
 * guardar una copia aparte es la misma trampa de desincronizacion que ya se corrigio
 * entre Minuta y Compromisos -aca ni siquiera hace falta, se calcula al vuelo-.
 */
function plazoEfectivo(it: DecoratedItem, allItems: DecoratedItem[]): string | null {
  if (it.plazo) return it.plazo
  const fechas = allItems
    .filter((d) => d.parent_item_id === it.id)
    .map((h) => plazoEfectivo(h, allItems))
    .filter((f): f is string => !!f)
  return fechas.length ? fechas.sort().at(-1)! : null
}

/**
 * Sub-temas de un tema (ej. "Ver faena" bajo "Revisar capacidad").
 *
 * Reusa las mismas funciones que ya gobiernan un tema de nivel superior (guardar,
 * openCreate) en vez de reimplementar la logica de asignacion: un sub-tema sigue el
 * MISMO camino para transformarse en actividad. Se muestra achicado porque conviven varios
 * dentro de la fila de su padre.
 */
function SubtareasPanel({
  parentId,
  allItems,
  members,
  canManage,
  canAssign,
  memberName,
  onGuardar,
  onGuardarPlazo,
  onOpenCreate,
  onAdd,
}: {
  parentId: string
  allItems: DecoratedItem[]
  members: Profile[]
  canManage: boolean
  canAssign: boolean
  memberName: (id: string) => string
  onGuardar: (id: string, patch: { responsables: string[]; para_todos: boolean }) => void
  onGuardarPlazo: (item: DecoratedItem, v: string | null) => void
  onOpenCreate: (it: DecoratedItem) => void
  onAdd: (tema: string, parentItemId: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [nuevo, setNuevo] = useState('')
  // Expandido por defecto: colapsar es una accion explicita de "ya lo arme, ahora achica
  // la pantalla", no algo que deba esconder subtareas recien creadas.
  const [expanded, setExpanded] = useState(true)
  const subtemas = allItems.filter((d) => d.parent_item_id === parentId)

  const confirmarNuevo = () => {
    if (nuevo.trim()) onAdd(nuevo.trim(), parentId)
    setNuevo('')
    setAdding(false)
  }

  return (
    <div className="mt-2 pl-3 border-l-2 border-slate-700 space-y-1.5">
      {subtemas.length > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] text-slate-500 hover:text-slate-300 font-medium flex items-center gap-1"
        >
          <span className="inline-block w-2.5">{expanded ? '▾' : '▸'}</span>
          Subtareas ({subtemas.length})
        </button>
      )}
      {expanded &&
        subtemas.map((s) => (
          <div key={s.id} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] bg-slate-900/40 rounded-lg px-2 py-1.5">
              <span className="text-slate-300 flex-1 min-w-[100px]">{s.tema}</span>
              {canManage ? (
                <div className="w-36">
                  <MemberMultiSelect
                    members={members}
                    selected={s.responsables}
                    paraTodos={false}
                    onChange={(next) => onGuardar(s.id, next)}
                  />
                </div>
              ) : (
                <span className="text-slate-500">
                  {s.responsables.map(memberName).join(', ') || 'Sin asignar'}
                </span>
              )}
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
            </div>

            {/* Recursivo: una subtarea puede tener las suyas (3er nivel, 4to, ...).
              parent_item_id no tiene tope de profundidad, asi que tampoco lo tiene esto. */}
            <SubtareasPanel
              parentId={s.id}
              allItems={allItems}
              members={members}
              canManage={canManage}
              canAssign={canAssign}
              memberName={memberName}
              onGuardar={onGuardar}
              onGuardarPlazo={onGuardarPlazo}
              onOpenCreate={onOpenCreate}
              onAdd={onAdd}
            />
          </div>
        ))}
      {canManage &&
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
                if (e.key === 'Escape') setAdding(false)
              }}
              placeholder="Nueva subtarea…"
              className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200"
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

/**
 * Linea de tiempo de un tema y todo su arbol de subtareas.
 *
 * No es un Gantt de barras con duracion -minute_items solo guarda UNA fecha (el plazo), no
 * un rango-, asi que se muestra honestamente como lo que es: un marcador por tarea sobre un
 * eje de fechas comun. Estirar esto a barras inventaria una fecha de inicio que no existe.
 */
function GanttModal({
  root,
  allItems,
  onClose,
}: {
  root: DecoratedItem
  allItems: DecoratedItem[]
  onClose: () => void
}) {
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
    .map((n) => plazoEfectivo(n.item, allItems))
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

  return (
    <Modal open onClose={onClose} title={`Linea de tiempo: ${root.tema}`} size="lg">
      <div className="space-y-3">
        <p className="text-[11px] text-slate-500">
          Cada punto es el plazo de esa tarea (o el mas lejano entre sus subtareas, si no tiene uno
          propio). La linea vertical marca hoy.
        </p>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {nodes.map(({ item, depth }) => {
            const fecha = plazoEfectivo(item, allItems)
            const vencida =
              !!fecha && item.effectiveEstado !== 'resuelto' && toTime(fecha) < hoy.getTime()
            return (
              <div key={item.id} className="flex items-center gap-2 text-[11px]">
                <span
                  className="text-slate-300 truncate flex-shrink-0"
                  style={{ width: 140, paddingLeft: depth * 12 }}
                  title={item.tema}
                >
                  {depth > 0 && '↳ '}
                  {item.tema}
                </span>
                <div className="flex-1 relative h-3 bg-slate-800/60 rounded">
                  {fecha && (
                    <div
                      className={`absolute top-0 h-3 w-3 -mt-0 rounded-full ${
                        item.effectiveEstado === 'resuelto'
                          ? 'bg-emerald-500'
                          : depth === 0
                            ? 'bg-indigo-500'
                            : 'bg-amber-500'
                      }`}
                      style={{ left: `calc(${pct(fecha)}% - 6px)` }}
                      title={formatDateLocal(fecha)}
                    />
                  )}
                </div>
                <span
                  className={`w-16 text-right flex-shrink-0 ${vencida ? 'text-red-400' : 'text-slate-500'}`}
                >
                  {fecha ? formatDateLocal(fecha) : 'sin fecha'}
                </span>
              </div>
            )
          })}
          {/* Eje: hoy */}
          <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-slate-700/60">
            <span className="w-[140px] flex-shrink-0" />
            <div className="flex-1 relative h-0">
              <div
                className="absolute -top-2 bottom-0 w-px bg-red-500/60"
                style={{ left: `${pctDeHoy}%` }}
              />
            </div>
            <span className="w-16 text-right flex-shrink-0 text-red-400">hoy</span>
          </div>
        </div>
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
  const titulo = esIngesta ? 'Hoja de Ingesta' : 'Minuta Semanal'
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
    search,
    setSearch,
    weekMode,
    setWeekMode,
    weekOffset,
    setWeekOffset,
    weekLabel,
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

  const [cargaMasiva, setCargaMasiva] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [ganttForId, setGanttForId] = useState<string | null>(null)
  const [createForId, setCreateForId] = useState<string | null>(null)
  const [createResp, setCreateResp] = useState<string[]>([])
  const [createPriority, setCreatePriority] = useState(2)
  const [createDue, setCreateDue] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  // El cambio se pinta al instante y se guarda despues (ver updateItem). Si el guardado
  // falla, el hook revierte: sin este aviso, el valor volveria solo y sin explicacion.
  const guardar = (id: string, patch: Parameters<typeof updateItem>[1]) =>
    updateItem(id, patch).catch(() => toast.error('No se pudo guardar el cambio'))

  const guardarPlazo = (item: DecoratedItem, v: string | null) =>
    changePlazo(item, v).catch(() => toast.error('No se pudo guardar la fecha'))

  // Que decir cuando no hay nada. "Por asignar" vacio es una BUENA noticia -no queda nada
  // que conversar-, no un error, y el mensaje tiene que reflejarlo.
  const hoja = esIngesta ? 'la hoja de ingesta' : 'la minuta'
  const textoVacio = () => {
    if (weekMode) return 'No hubo temas con actividad en esa semana'
    if (search || filterMember !== 'todas') return 'No hay temas que coincidan con el filtro'
    if (view === 'resueltos') return 'No hay temas resueltos'
    if (view === 'asignados') return 'No hay temas asignados todavia'
    if (view === 'todos') return `No hay temas en ${hoja}`
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
    // soloEstos: al completar los que faltan, se preselecciona SOLO a esa gente para no
    // duplicarle la actividad a quien ya la tiene.
    setCreateResp(soloEstos ?? (it.responsables.length ? it.responsables : []))
    setCreatePriority(2)
    setCreateDue(it.plazo ?? '')
    setCreateForId(it.id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">{titulo}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToCSV(
                items.map((it) => ({
                  Tema: it.tema,
                  Responsables: responsablesLabel(it),
                  Estado: estadoLabels[it.effectiveEstado],
                  Plazo: it.plazo ? formatDateLocal(it.plazo) : '-',
                  'Cambios de plazo': it.plazo_change_count,
                  Comentarios: it.comentarios,
                })),
                esIngesta ? 'ingesta' : 'minuta',
              )
            }
            className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
            title="Exportar a Excel"
          >
            Excel
          </button>
          {canManage && (
            <button
              onClick={() => setCargaMasiva(true)}
              className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
              title="Cargar varios temas desde una planilla"
            >
              Carga masiva
            </button>
          )}
          <span className="text-xs text-slate-500">{counts.pendientes} por asignar</span>
        </div>
      </div>

      {/* Toolbar de filtros (fondo solido y anclado) */}
      <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-2 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        {/* Control segmentado de estado */}
        <div className="inline-flex rounded-lg bg-slate-800 p-0.5">
          {(
            [
              { v: 'pendientes', label: 'Por asignar', n: counts.pendientes },
              { v: 'asignados', label: 'Asignados', n: counts.asignados },
              { v: 'resueltos', label: 'Resueltos', n: counts.resueltos },
              { v: 'todos', label: 'Todos', n: counts.todos },
            ] as const
          ).map((f) => (
            <button
              key={f.v}
              onClick={() => setView(f.v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === f.v
                  ? 'bg-slate-700 text-indigo-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 ${view === f.v ? 'text-slate-400' : 'text-slate-600'}`}>
                {f.n}
              </span>
            </button>
          ))}
        </div>

        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        >
          <option value="todas">Todo el equipo</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>

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
            className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm"
            >
              ×
            </button>
          )}
        </div>

        {/* Navegador de semana */}
        {weekMode ? (
          <div className="flex items-center gap-1 rounded-lg bg-slate-800 px-1 py-0.5">
            <button
              onClick={() => setWeekOffset(weekOffset - 1)}
              aria-label="Semana anterior"
              className="w-6 h-6 rounded text-slate-400 hover:bg-slate-700"
            >
              ‹
            </button>
            <span className="text-[11px] text-slate-200 px-1 whitespace-nowrap">
              {weekOffset === 0 ? `Esta semana · ${weekLabel}` : weekLabel}
            </span>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              aria-label="Semana siguiente"
              className="w-6 h-6 rounded text-slate-400 hover:bg-slate-700"
            >
              ›
            </button>
            <button
              onClick={() => {
                setWeekMode(false)
                setWeekOffset(0)
              }}
              className="text-[11px] text-slate-500 hover:text-slate-300 px-1"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setWeekMode(true)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700"
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
            <p className="text-sm text-slate-400">{textoVacio()}</p>
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
                  className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 space-y-3"
                >
                  {/* Tema */}
                  {canManage ? (
                    <textarea
                      defaultValue={it.tema}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== it.tema)
                          guardar(it.id, { tema: e.target.value })
                      }}
                      rows={2}
                      spellCheck={false}
                      className="w-full resize-none rounded bg-transparent px-1 py-0.5 text-sm text-slate-100 font-medium leading-snug focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-indigo-500/40"
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-100 whitespace-pre-wrap px-1">
                      {it.tema}
                    </p>
                  )}
                  {it.linkedActivities.length > 0 && (
                    <span className="block text-[10px] text-indigo-400 px-1 -mt-1">
                      {it.linkedActivities.filter((a) => a.status === 'completado').length}/
                      {it.linkedActivities.length} actividades
                    </span>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {/* Responsable */}
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Responsable(s)</p>
                      {canManage ? (
                        <MemberMultiSelect
                          members={members}
                          selected={it.responsables}
                          paraTodos={it.para_todos}
                          onChange={(next) => guardar(it.id, next)}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">{responsablesLabel(it)}</span>
                      )}
                    </div>
                    {/* Estado */}
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Estado</p>
                      {it.linkedActivities.length > 0 ? (
                        <Badge variant={estadoColors[it.effectiveEstado]}>
                          {estadoLabels[it.effectiveEstado]}
                        </Badge>
                      ) : canManage ? (
                        <select
                          value={it.estado}
                          onChange={(e) =>
                            guardar(it.id, { estado: e.target.value as MinuteEstado })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-200"
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
                    {/* Plazo */}
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Plazo</p>
                      {canManage ? (
                        <DatePicker
                          value={it.plazo}
                          onChange={(v) => guardarPlazo(it, v)}
                          placeholder="+ fecha"
                        />
                      ) : (
                        <span className="text-xs text-slate-300">
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
                    {canManage ? (
                      <textarea
                        defaultValue={it.comentarios}
                        onBlur={(e) => {
                          if (e.target.value !== it.comentarios)
                            guardar(it.id, { comentarios: e.target.value })
                        }}
                        rows={2}
                        spellCheck={false}
                        placeholder="Notas..."
                        className="w-full resize-none rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                      />
                    ) : (
                      <p className="text-xs text-slate-300 whitespace-pre-wrap">
                        {it.comentarios || '-'}
                      </p>
                    )}
                  </div>

                  {/* Subtareas: descompone este tema en un proyecto de varios pasos. */}
                  <SubtareasPanel
                    parentId={it.id}
                    allItems={allItems}
                    members={members}
                    canManage={canManage}
                    canAssign={canAssign}
                    memberName={memberName}
                    onGuardar={guardar}
                    onGuardarPlazo={guardarPlazo}
                    onOpenCreate={openCreate}
                    onAdd={addItem}
                  />

                  {/* Acciones */}
                  {(canAssign || canDelete || allItems.some((d) => d.parent_item_id === it.id)) && (
                    <div className="flex items-center gap-3 pt-1 border-t border-slate-700/60">
                      {allItems.some((d) => d.parent_item_id === it.id) && (
                        <button
                          onClick={() => setGanttForId(it.id)}
                          className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[11px] font-medium hover:bg-slate-600"
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
                          className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[11px] font-medium hover:bg-slate-600"
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
                <tr className="text-slate-400 align-bottom [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-slate-900 [&>th]:border-b [&>th]:border-slate-700 [&>th]:shadow-[0_2px_4px_-2px_rgba(0,0,0,0.5)]">
                  <th className="text-left py-2 px-2 font-medium min-w-[220px] sm:w-[38%] sm:min-w-[340px]">
                    Tema
                  </th>
                  <th className="text-left py-2 px-2 font-medium min-w-[150px]">Responsable(s)</th>
                  <th className="text-left py-2 px-2 font-medium">Estado</th>
                  <th className="text-left py-2 px-2 font-medium">Plazo</th>
                  <th className="text-left py-2 px-2 font-medium min-w-[140px] sm:min-w-[180px]">
                    Comentarios
                  </th>
                  <th className="text-right py-2 px-2 font-medium">Accion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-800 align-top">
                    {/* Tema (texto completo, editable inline) */}
                    <td className="py-2 px-2">
                      {canManage ? (
                        <textarea
                          defaultValue={it.tema}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value !== it.tema)
                              guardar(it.id, { tema: e.target.value })
                          }}
                          rows={Math.max(1, Math.ceil(it.tema.length / 48))}
                          spellCheck={false}
                          className="w-full resize-none rounded bg-transparent px-1 py-0.5 text-sm text-slate-100 font-medium leading-snug focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-indigo-500/40"
                        />
                      ) : (
                        <span className="text-slate-100 font-medium whitespace-pre-wrap">
                          {it.tema}
                        </span>
                      )}
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
                        memberName={memberName}
                        onGuardar={guardar}
                        onGuardarPlazo={guardarPlazo}
                        onOpenCreate={openCreate}
                        onAdd={addItem}
                      />
                    </td>

                    {/* Responsable(s): selector multiple */}
                    <td className="py-2 px-2">
                      {canManage ? (
                        <MemberMultiSelect
                          members={members}
                          selected={it.responsables}
                          paraTodos={it.para_todos}
                          onChange={(next) => guardar(it.id, next)}
                        />
                      ) : (
                        <span className="text-slate-400">{responsablesLabel(it)}</span>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="py-2 px-2">
                      {it.linkedActivities.length > 0 ? (
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
                          className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-200"
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

                    {/* Plazo + trazabilidad */}
                    <td className="py-2 px-2">
                      {canManage ? (
                        <DatePicker
                          value={it.plazo}
                          onChange={(v) => guardarPlazo(it, v)}
                          placeholder="+ fecha"
                        />
                      ) : (
                        <span className="text-slate-300">
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
                      {canManage ? (
                        <textarea
                          defaultValue={it.comentarios}
                          onBlur={(e) => {
                            if (e.target.value !== it.comentarios)
                              guardar(it.id, { comentarios: e.target.value })
                          }}
                          rows={Math.max(1, Math.ceil((it.comentarios.length || 1) / 34))}
                          placeholder="Notas..."
                          spellCheck={false}
                          className="w-full resize-none rounded bg-transparent px-1 py-0.5 text-slate-300 leading-snug focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-indigo-500/40 placeholder:text-slate-600"
                        />
                      ) : (
                        <span className="text-slate-300 whitespace-pre-wrap">
                          {it.comentarios || '-'}
                        </span>
                      )}
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
                              className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[11px] font-medium hover:bg-slate-600 transition-colors"
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
                                  className="px-2 py-1 rounded-lg bg-slate-800 text-slate-500 text-[11px] font-medium cursor-not-allowed"
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
                              className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[11px] font-medium hover:bg-slate-600 transition-colors"
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

      {/* Modal chico solo para crear actividad(es) desde un tema */}
      <Modal
        open={!!createItem}
        onClose={() => setCreateForId(null)}
        title="Crear actividad"
        size="sm"
      >
        {createItem && (
          <div className="space-y-3">
            <p className="text-sm text-slate-200 leading-snug">"{createItem.tema}"</p>
            <div>
              <p className="text-[11px] text-slate-500 mb-1">
                Se asignara a (definido en Responsable(s))
              </p>
              <div className="flex flex-wrap gap-1.5">
                {createResp.map((rid) => (
                  <span
                    key={rid}
                    className="px-2 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 text-[11px] font-medium"
                  >
                    {memberName(rid)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <div>
                <p className="text-[11px] text-slate-500 mb-1">Prioridad</p>
                <div className="flex gap-1">
                  {[1, 2, 3].map((p) => (
                    <button
                      key={p}
                      onClick={() => setCreatePriority(p)}
                      className={`w-7 h-7 rounded text-xs font-bold text-white ${
                        createPriority === p
                          ? p === 1
                            ? 'bg-red-600'
                            : p === 2
                              ? 'bg-amber-600'
                              : 'bg-emerald-600'
                          : 'bg-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-slate-500 mb-1">Fecha entrega</p>
                <DatePicker value={createDue || null} onChange={(v) => setCreateDue(v ?? '')} />
              </div>
            </div>
            {createItem.linkedActivities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {createItem.linkedActivities.map((a) => (
                  // Abre el detalle en Actividades: es donde vive "Subtareas" para
                  // descomponer este compromiso en un proyecto de varios niveles.
                  <button
                    key={a.id}
                    onClick={() => navigate('/activities', { state: { activityId: a.id } })}
                    title="Abrir actividad (agregar subtareas)"
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-[11px]"
                  >
                    <span className="text-slate-300">{memberName(a.responsible_id)}</span>
                    <Badge variant={a.status === 'completado' ? 'success' : 'info'}>
                      {statusLabels[a.status]}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                disabled={busy || createResp.length === 0}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await createActivitiesFromItem(createItem, {
                      responsibleIds: createResp,
                      priority: createPriority,
                      dueDate: createDue || null,
                    })
                    setCreateForId(null)
                    toast.success(
                      `${createResp.length} actividad${createResp.length === 1 ? '' : 'es'} creada${createResp.length === 1 ? '' : 's'}`,
                    )
                  } catch {
                    toast.error('No se pudo crear la actividad')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy
                  ? 'Creando...'
                  : `Crear ${createResp.length || ''} actividad${createResp.length === 1 ? '' : 'es'}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreateForId(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
                <p className="text-sm text-slate-200">
                  ¿Seguro que quieres eliminar este tema de{' '}
                  {esIngesta ? 'la hoja de ingesta' : 'la minuta'}?
                </p>
                <p className="text-sm text-slate-400 leading-snug">"{deleteItem.tema}"</p>
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
        <GanttModal root={ganttItem} allItems={allItems} onClose={() => setGanttForId(null)} />
      )}
    </div>
  )
}
