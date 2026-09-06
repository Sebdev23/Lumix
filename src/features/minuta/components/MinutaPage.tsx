import { useState } from 'react'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { DatePicker } from '@shared/components/ui/DatePicker'
import { MemberMultiSelect } from '@shared/components/ui/MemberMultiSelect'
import { EditableText } from '@shared/components/ui/EditableText'
import { useMinuta, estadoLabels, type DecoratedItem } from '@features/minuta/hooks/useMinuta'
import { plazoEfectivo } from '@features/minuta/utils/subtareas'
import { AsignarActividadModal } from '@features/minuta/components/AsignarActividadModal'
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
  // Expandido por defecto: colapsar es una accion explicita de "ya lo arme, ahora achica
  // la pantalla", no algo que deba esconder subtareas recien creadas.
  const [expanded, setExpanded] = useState(true)
  const subtemas = allItems.filter((d) => d.parent_item_id === parentId)
  const puedeAgregarAca = canAddSubtareas && (maxDepth === undefined || depth < maxDepth)
  const puedeAnidar = maxDepth === undefined || depth + 1 < maxDepth

  const confirmarNuevo = () => {
    if (nuevo.trim()) onAdd(nuevo.trim(), parentId)
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
                if (e.key === 'Escape') setAdding(false)
              }}
              placeholder="Nueva subtarea…"
              className="flex-1 rounded border border-border-strong bg-surface px-2 py-1 text-[11px] text-fg-body"
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
export function GanttModal({
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
              <div key={item.id} className="flex items-start gap-2 text-[11px]">
                <span
                  className="text-fg-muted flex-shrink-0 whitespace-normal break-words leading-tight"
                  style={{ width: 140, paddingLeft: depth * 12 }}
                >
                  {depth > 0 && '↳ '}
                  {item.tema}
                </span>
                <div className="flex-1 relative h-3 bg-surface/60 rounded mt-0.5">
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
                  className={`w-16 text-right flex-shrink-0 mt-0.5 ${vencida ? 'text-red-400' : 'text-slate-500'}`}
                >
                  {fecha ? formatDateLocal(fecha) : 'sin fecha'}
                </span>
              </div>
            )
          })}
          {/* Eje: hoy */}
          <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-border-strong/60">
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
  // Minuta es un tema puntual de la reunion semanal, no un reparto de tareas -eso es
  // Proyectos-: un solo responsable por tema/subtarea, para que no se acumulen varias
  // actividades detras de un mismo tema (caso real reportado).
  const esMinuta = tipo === 'minuta'
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
  // El filtro de grupo de trabajo (alias "foco") es solo para jefatura -es una herramienta
  // de supervision, no algo que un colaborador necesite para ver su propia minuta.
  const { role, isGlobalAdmin } = useCapabilities()
  const esJefe = isGlobalAdmin || role === 'jefatura' || role === 'admin'

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
          <span className="text-xs text-slate-500">{counts.pendientes} por asignar</span>
        </div>
      </div>

      {/* Toolbar de filtros (fondo solido y anclado) */}
      <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-2 border-b border-border bg-panel flex-shrink-0">
        {/* Control segmentado de estado */}
        <div className="inline-flex rounded-lg bg-surface p-0.5">
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
            className="w-full rounded-lg bg-surface border border-border-strong pl-8 pr-7 py-1.5 text-xs text-fg-body placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
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

        {/* Navegador de semana */}
        {weekMode ? (
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

                  <div className="grid grid-cols-2 gap-3">
                    {/* Responsable */}
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Responsable(s)</p>
                      {canManage ? (
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
                    Tema
                  </th>
                  <th className="text-left py-2 px-2 font-medium min-w-[150px]">Responsable(s)</th>
                  <th className="text-left py-2 px-2 font-medium min-w-[130px]">Estado</th>
                  <th className="text-left py-2 px-2 font-medium min-w-[110px]">Plazo</th>
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

                    {/* Responsable(s): selector multiple */}
                    <td className="py-2 px-2">
                      {canManage ? (
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

                    {/* Plazo + trazabilidad */}
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
                    : `¿Seguro que quieres eliminar este tema de ${esIngesta ? 'la hoja de ingesta' : 'la minuta'}?`}
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
        <GanttModal root={ganttItem} allItems={allItems} onClose={() => setGanttForId(null)} />
      )}
    </div>
  )
}
