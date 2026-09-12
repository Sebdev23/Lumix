// Detalle de un proyecto: Lista (arbol de actividades/subtareas) / Tablero (columnas por
// estado) / Cronograma (Gantt). Las tres vistas muestran el MISMO objeto (un minute_item
// tipo='proyecto') sin duplicar logica: click en cualquiera de las tres abre el mismo panel
// lateral de detalle (`DetalleDrawer`), y los datos (estado, fechas, avance) se calculan una
// sola vez y se leen igual en las tres.
import { useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Avatar } from '@shared/components/ui/Avatar'
import { Drawer } from '@shared/components/ui/Drawer'
import { MemberMultiSelect } from '@shared/components/ui/MemberMultiSelect'
import { DatePicker } from '@shared/components/ui/DatePicker'
import { useToast } from '@shared/components/ui/Toast'
import { EditableText } from '@shared/components/ui/EditableText'
import { ComentarioLibre } from '@shared/components/ui/ComentarioLibre'
import { useMinuta, estadoLabels, type DecoratedItem } from '@features/minuta/hooks/useMinuta'
import { GanttChart } from '@features/minuta/components/MinutaPage'
import { AsignarActividadModal } from '@features/minuta/components/AsignarActividadModal'
import {
  plazoEfectivo,
  fechaInicioEfectiva,
  resumenProyecto,
  alertasProyecto,
  avanceDe,
} from '@features/minuta/utils/subtareas'
import { minutesService } from '@infrastructure/supabase/minutes.service'
import { formatDateLocal } from '@shared/utils/date'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { MinuteEstado, Profile } from '@shared/types'

const ESTADOS: MinuteEstado[] = ['pendiente', 'en_desarrollo', 'resuelto', 'definir']

// Colores por columna del Tablero -mismo significado que ya usan los Badge de estado en
// Lista (warning/info/success/default), pero en formato borde/punto para la tarjeta.
const COLUMNA_ESTILO: Record<MinuteEstado, { borde: string; punto: string }> = {
  pendiente: { borde: 'border-l-amber-500', punto: 'bg-amber-500' },
  en_desarrollo: { borde: 'border-l-blue-500', punto: 'bg-blue-500' },
  resuelto: { borde: 'border-l-emerald-500', punto: 'bg-emerald-500' },
  definir: { borde: 'border-l-slate-500', punto: 'bg-slate-500' },
}

// Pastilla de estado: fondo del color al 15% de opacidad, texto del color solido.
const PILL_ESTILO: Record<MinuteEstado, string> = {
  pendiente: 'bg-amber-500/15 text-amber-500',
  en_desarrollo: 'bg-blue-500/15 text-blue-500',
  resuelto: 'bg-emerald-500/15 text-emerald-500',
  definir: 'bg-slate-500/15 text-slate-400',
}

// Prioridad 1-3, mismo criterio y colores que ya usa `activities.priority` en la hoja de
// Actividades (1=alta/roja, 2=media/ambar, 3=baja/esmeralda) — no se reinventa una escala
// nueva para Proyectos.
const PRIORIDAD_COLOR: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-emerald-500',
}
const PRIORIDAD_LABEL: Record<number, string> = { 1: 'Alta', 2: 'Media', 3: 'Baja' }

export function ProyectoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const {
    allItems,
    members,
    canManage,
    canAssign,
    canDelete,
    updateItem,
    changePlazo,
    createActivitiesFromItem,
    addItem,
    removeItem,
    loading,
    reload,
  } = useMinuta('proyecto')

  const [vista, setVista] = useState<'lista' | 'tablero' | 'cronograma'>('lista')
  const [createForId, setCreateForId] = useState<string | null>(null)
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)

  const proyecto = allItems.find((it) => it.id === id)
  const memberName = (mid: string) => members.find((m) => m.id === mid)?.full_name || 'Desconocido'
  const createItem = createForId ? (allItems.find((i) => i.id === createForId) ?? null) : null
  const detalleItem = detalleId ? (allItems.find((i) => i.id === detalleId) ?? null) : null

  // Touch + mouse con el mismo sensor (Pointer Events unifica los dos). activationConstraint
  // evita que un simple toque (para abrir el detalle) se confunda con un arrastre -hace falta
  // moverse 8px antes de que empiece a arrastrar de verdad.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Solo se puede arrastrar una tarjeta que NO tiene actividad vinculada: si la tiene, su
  // columna la calcula el estado de esa actividad (deriveEstado), no el campo `estado` propio
  // -arrastrarla no tendria un significado claro (¿marcar la actividad completada? ¿volverla a
  // pendiente aunque este en curso?). Decision tomada con Sebastian: esas quedan fijas.
  const puedeArrastrar = (it: DecoratedItem) => it.linkedActivities.length === 0

  const alSoltar = async (e: DragEndEvent) => {
    setArrastrandoId(null)
    const { active, over } = e
    if (!over) return
    const nuevoEstado = over.id as MinuteEstado
    const item = allItems.find((it) => it.id === active.id)
    if (!item || item.effectiveEstado === nuevoEstado) return
    try {
      await updateItem(item.id, { estado: nuevoEstado })
    } catch {
      toast.error('No se pudo mover la tarjeta')
    }
  }

  // Todos los descendientes (cualquier nivel), aplanados, para el Tablero.
  const descendientes = (raizId: string): DecoratedItem[] => {
    const hijos = allItems.filter((d) => d.parent_item_id === raizId)
    return hijos.flatMap((h) => [h, ...descendientes(h.id)])
  }

  // Escala una subtarea trabada a Minuta para conversarla en la reunion semanal -mismo
  // patron que useCompromisos.llevarAMinuta, aplicado desde el lado de Proyectos-.
  const escalarAMinuta = async (item: DecoratedItem) => {
    if (!profile) return
    try {
      const existentes = await minutesService.getByTeam(profile.team_id, 'minuta')
      await minutesService.create({
        team_id: profile.team_id,
        tipo: 'minuta',
        orden: existentes.length,
        tema: item.tema,
        para_todos: false,
        responsables: item.responsables,
        responsables_text: '',
        estado: 'definir',
        plazo: item.plazo,
        comentarios: '',
        linked_activity_ids: item.linked_activity_ids,
        created_by: profile.id,
      })
      toast.success('Llevado a la minuta para discutir')
    } catch {
      toast.error('No se pudo escalar a la minuta')
    }
  }

  // "+ Nueva actividad": crea un hijo directo del proyecto y abre su detalle de una, para
  // nombrarla ahi mismo -sin esto, quedaba una fila en blanco perdida en la Lista hasta que
  // alguien la encontraba y le ponia nombre.
  const crearActividad = async () => {
    if (!proyecto) return
    const nuevoId = await addItem('', proyecto.id)
    if (nuevoId) setDetalleId(nuevoId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!proyecto) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-sm text-fg-faint">Ese proyecto ya no existe</p>
        <Button size="sm" variant="ghost" onClick={() => navigate('/proyectos')}>
          ← Volver a Proyectos
        </Button>
      </div>
    )
  }

  const resumen = resumenProyecto(proyecto.id, allItems)
  const alertas = alertasProyecto(proyecto.id, allItems)
  const inicioProyecto = fechaInicioEfectiva(proyecto.id, allItems)
  const finProyecto = plazoEfectivo(proyecto, allItems)

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 sm:px-4 py-3 border-b border-border bg-panel flex-shrink-0 space-y-3">
        {/* Volver: antes era un link de 11px, facil de pasar por alto (reportado). Ahora es un
            boton real, con area de toque comoda. */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate('/proyectos')}
          className="!px-2 -ml-2"
        >
          ← Volver a proyectos
        </Button>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <EditableText
              as="p"
              value={proyecto.tema}
              canEdit={canManage}
              onSave={(next) => updateItem(proyecto.id, { tema: next })}
              textClassName="text-lg font-semibold text-fg"
              preventEmpty
            />
            {(inicioProyecto || finProyecto) && (
              <p className="text-[11px] text-fg-faint mt-1">
                {inicioProyecto ? formatDateLocal(inicioProyecto, 'short') : '¿?'}
                {' → '}
                {finProyecto ? formatDateLocal(finProyecto, 'short') : '¿?'}
              </p>
            )}
          </div>
          {canManage && (
            <Button size="sm" onClick={crearActividad}>
              + Nueva actividad
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <AnilloProgreso resueltas={resumen.subtareasResueltas} total={resumen.subtareas} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-faint">
            <span>
              <strong className="text-fg-muted font-semibold">{resumen.actividades}</strong>{' '}
              actividad{resumen.actividades === 1 ? '' : 'es'}
            </span>
            {resumen.subtareas > 0 && (
              <>
                <span>
                  <strong className="text-fg-muted font-semibold">{resumen.subtareas}</strong>{' '}
                  subtareas
                </span>
                <span>
                  <strong className="text-emerald-500 font-semibold">
                    {resumen.subtareasResueltas}
                  </strong>{' '}
                  completadas
                </span>
                <span>
                  <strong className="text-amber-500 font-semibold">
                    {resumen.subtareas - resumen.subtareasResueltas}
                  </strong>{' '}
                  pendientes
                </span>
              </>
            )}
          </div>
        </div>

        {(alertas.vencidas > 0 || alertas.proximas > 0 || alertas.bloqueadas > 0) && (
          <div className="flex flex-wrap gap-2">
            {alertas.vencidas > 0 && (
              <span className="text-[10px] font-medium text-red-500 bg-red-500/10 rounded-full px-2.5 py-1">
                ⚠ {alertas.vencidas} vencida{alertas.vencidas === 1 ? '' : 's'}
              </span>
            )}
            {alertas.proximas > 0 && (
              <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 rounded-full px-2.5 py-1">
                ⏱ {alertas.proximas} por vencer
              </span>
            )}
            {alertas.bloqueadas > 0 && (
              <span className="text-[10px] font-medium text-fg-faint bg-surface-2 rounded-full px-2.5 py-1">
                🚧 {alertas.bloqueadas} bloqueada{alertas.bloqueadas === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}

        <div className="inline-flex rounded-lg bg-surface p-0.5">
          <button
            onClick={() => setVista('lista')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              vista === 'lista' ? 'bg-indigo-600 text-white' : 'text-fg-faint'
            }`}
          >
            Lista
          </button>
          <button
            onClick={() => setVista('tablero')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              vista === 'tablero' ? 'bg-indigo-600 text-white' : 'text-fg-faint'
            }`}
          >
            Tablero
          </button>
          <button
            onClick={() => setVista('cronograma')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              vista === 'cronograma' ? 'bg-indigo-600 text-white' : 'text-fg-faint'
            }`}
          >
            Cronograma
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {vista === 'lista' ? (
          proyecto && descendientes(proyecto.id).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-fg-faint">Todavía no hay actividades</p>
              {canManage && (
                <p className="text-xs text-slate-600 mt-1">
                  Tocá "+ Nueva actividad" arriba para agregar la primera.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-panel p-1">
              <ArbolProyecto
                parentId={proyecto.id}
                allItems={allItems}
                depth={0}
                memberName={memberName}
                onOpen={(itemId) => setDetalleId(itemId)}
              />
            </div>
          )
        ) : vista === 'tablero' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e: DragStartEvent) => setArrastrandoId(e.active.id as string)}
            onDragEnd={alSoltar}
            onDragCancel={() => setArrastrandoId(null)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ESTADOS.map((estado) => {
                const items = descendientes(proyecto.id).filter(
                  (it) => it.effectiveEstado === estado,
                )
                return (
                  <ColumnaTablero key={estado} estado={estado} cantidad={items.length}>
                    {items.map((it) => (
                      <TarjetaTablero
                        key={it.id}
                        item={it}
                        allItems={allItems}
                        estado={estado}
                        canAssign={canAssign}
                        canManage={canManage}
                        memberName={memberName}
                        puedeArrastrar={puedeArrastrar(it)}
                        onOpen={() => setDetalleId(it.id)}
                        onAsignar={() => setCreateForId(it.id)}
                        onDiscutir={() => escalarAMinuta(it)}
                      />
                    ))}
                    {items.length === 0 && (
                      <p className="text-[11px] text-slate-600 text-center py-4">—</p>
                    )}
                  </ColumnaTablero>
                )
              })}
            </div>
            <DragOverlay>
              {arrastrandoId &&
                (() => {
                  const it = allItems.find((i) => i.id === arrastrandoId)
                  if (!it) return null
                  return (
                    <TarjetaTableroVisual
                      item={it}
                      estado={it.effectiveEstado}
                      memberName={memberName}
                    />
                  )
                })()}
            </DragOverlay>
          </DndContext>
        ) : (
          <GanttChart
            root={proyecto}
            allItems={allItems}
            memberName={memberName}
            onOpen={(itemId) => setDetalleId(itemId)}
          />
        )}
      </div>

      <AsignarActividadModal
        key={createItem?.id ?? 'closed'}
        item={createItem}
        memberName={memberName}
        onClose={() => {
          setCreateForId(null)
          reload()
        }}
        onCreate={createActivitiesFromItem}
      />

      {detalleItem && (
        <DetalleDrawer
          item={detalleItem}
          allItems={allItems}
          members={members}
          canManage={canManage}
          canAssign={canAssign}
          canDelete={canDelete}
          onClose={() => setDetalleId(null)}
          onGuardarTema={(next) => updateItem(detalleItem.id, { tema: next })}
          onGuardarComentario={(next) => updateItem(detalleItem.id, { comentarios: next })}
          onGuardarResponsables={(patch) => updateItem(detalleItem.id, patch)}
          onGuardarEstado={(estado) => updateItem(detalleItem.id, { estado })}
          onGuardarPrioridad={(prioridad) => updateItem(detalleItem.id, { prioridad })}
          onGuardarPlazo={(v) =>
            changePlazo(detalleItem, v).catch(() => toast.error('No se pudo guardar la fecha'))
          }
          onGuardarFechaInicio={(v) => updateItem(detalleItem.id, { fecha_inicio: v })}
          onAdd={(tema) => addItem(tema, detalleItem.id)}
          onAsignar={() => {
            setDetalleId(null)
            setCreateForId(detalleItem.id)
          }}
          onDiscutir={() => escalarAMinuta(detalleItem)}
          onEliminar={async () => {
            await removeItem(detalleItem.id)
            setDetalleId(null)
          }}
          onAbrirSubtarea={(itemId) => setDetalleId(itemId)}
        />
      )}
    </div>
  )
}

/** Columna del Tablero: es el area donde se puede soltar una tarjeta (useDroppable). */
function ColumnaTablero({
  estado,
  cantidad,
  children,
}: {
  estado: MinuteEstado
  cantidad: number
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-2.5 transition-colors ${
        isOver ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-border bg-surface-soft/60'
      }`}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-fg-faint mb-2">
        <span className={`w-2 h-2 rounded-full ${COLUMNA_ESTILO[estado].punto}`} />
        {estadoLabels[estado]}
        <span className="ml-auto text-[10px] bg-surface-2 text-fg-muted rounded-full px-1.5">
          {cantidad}
        </span>
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

/**
 * Tarjeta del Tablero: resumen compacto de solo lectura (nombre, avatar, fechas, prioridad,
 * subtareas) — editar cualquier cosa se hace desde el mismo panel de detalle que Lista y
 * Cronograma (tocar la tarjeta lo abre), no inline. Antes esta tarjeta tenia un titulo
 * editable y un comentario siempre abierto propios: se saco para que las tres vistas compartan
 * exactamente el mismo camino de edicion, en vez de que el Tablero fuera "otra aplicacion".
 */
function TarjetaTablero({
  item,
  allItems,
  estado,
  canAssign,
  canManage,
  memberName,
  puedeArrastrar,
  onOpen,
  onAsignar,
  onDiscutir,
}: {
  item: DecoratedItem
  allItems: DecoratedItem[]
  estado: MinuteEstado
  canAssign: boolean
  canManage: boolean
  memberName: (id: string) => string
  puedeArrastrar: boolean
  onOpen: () => void
  onAsignar: () => void
  onDiscutir: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !puedeArrastrar,
  })
  const hijos = allItems.filter((d) => d.parent_item_id === item.id)
  const fin = plazoEfectivo(item, allItems)

  return (
    <div
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20 }
          : undefined
      }
      onClick={onOpen}
      className={`relative rounded-[10px] bg-panel border border-border p-2.5 pr-6 text-[11px] space-y-1.5 shadow-sm cursor-pointer hover:border-indigo-500/40 transition-colors ${COLUMNA_ESTILO[estado].borde} border-l-[3px] ${
        isDragging ? 'opacity-30' : ''
      } ${!puedeArrastrar ? 'opacity-80' : ''}`}
    >
      {puedeArrastrar ? (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="Arrastrar para cambiar de columna"
          className="absolute top-2 right-2 cursor-grab active:cursor-grabbing text-fg-faint hover:text-fg-muted tracking-[1px] text-[10px] leading-none touch-none opacity-60"
        >
          ⠿⠿
        </button>
      ) : (
        <span
          title="Su columna la decide la actividad vinculada, no se puede arrastrar"
          className="absolute top-2 right-2 text-fg-faint text-[10px] leading-none"
        >
          🔒
        </span>
      )}

      <div className="flex items-start gap-1.5 min-w-0 pr-1">
        {item.prioridad && (
          <span
            className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${PRIORIDAD_COLOR[item.prioridad]}`}
            title={`Prioridad ${PRIORIDAD_LABEL[item.prioridad]}`}
          />
        )}
        <p className="text-fg-body font-medium leading-snug truncate">{item.tema}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-fg-faint">
        {item.responsables.map((rid) => (
          <Avatar
            key={rid}
            name={memberName(rid)}
            size="sm"
            className="!w-[18px] !h-[18px] !text-[8px]"
          />
        ))}
        {fin && <span>📅 {formatDateLocal(fin, 'short')}</span>}
        {hijos.length > 0 && (
          <span className="bg-surface-2 rounded-full px-1.5">{hijos.length} sub.</span>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5 pt-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        {item.linkedActivities.length === 0 && canAssign && item.responsables.length > 0 && (
          <button
            onClick={onAsignar}
            className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium"
          >
            Asignar
          </button>
        )}
        {item.linkedActivities.length > 0 && estado !== 'resuelto' && canManage && (
          <button
            onClick={onDiscutir}
            title="Si hay un bloqueo de fondo, se conversa en la reunion semanal"
            className="px-1.5 py-0.5 rounded bg-surface-2 hover:bg-slate-600 text-fg-muted text-[10px] font-medium"
          >
            ↑ Discutir
          </button>
        )}
        {item.linkedActivities.length > 0 && (
          <Badge variant={estado === 'resuelto' ? 'success' : 'info'}>
            {item.linkedActivities.filter((a) => a.status === 'completado').length}/
            {item.linkedActivities.length} activ.
          </Badge>
        )}
      </div>
    </div>
  )
}

/** Version de solo lectura de la tarjeta, para el DragOverlay (la que sigue al dedo/cursor
 * mientras se arrastra) -sin inputs ni botones, es una foto de como se ve. */
function TarjetaTableroVisual({
  item,
  estado,
  memberName,
}: {
  item: DecoratedItem
  estado: MinuteEstado
  memberName: (id: string) => string
}) {
  return (
    <div
      className={`rounded-[10px] bg-panel border border-border p-2.5 text-[11px] space-y-1.5 shadow-xl ${COLUMNA_ESTILO[estado].borde} border-l-[3px] rotate-2`}
    >
      <p className="text-fg-body font-medium leading-snug">{item.tema}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-fg-faint">
        {item.responsables.map((rid) => (
          <Avatar
            key={rid}
            name={memberName(rid)}
            size="sm"
            className="!w-[18px] !h-[18px] !text-[8px]"
          />
        ))}
        {item.plazo && <span>📅 {formatDateLocal(item.plazo, 'short')}</span>}
      </div>
    </div>
  )
}

const RADIO_ANILLO = 18
const CIRCUNFERENCIA = 2 * Math.PI * RADIO_ANILLO

/** Anillo de progreso circular del encabezado. */
function AnilloProgreso({ resueltas, total }: { resueltas: number; total: number }) {
  const pct = total > 0 ? Math.round((resueltas / total) * 100) : 0
  const offset = CIRCUNFERENCIA * (1 - pct / 100)
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative w-11 h-11 flex-shrink-0">
        <svg width="44" height="44" className="-rotate-90">
          <circle
            cx="22"
            cy="22"
            r={RADIO_ANILLO}
            fill="none"
            strokeWidth="4"
            className="stroke-surface-2"
          />
          <circle
            cx="22"
            cy="22"
            r={RADIO_ANILLO}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRCUNFERENCIA}
            strokeDashoffset={offset}
            className="stroke-emerald-500 transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-fg">
          {pct}%
        </span>
      </span>
      <span className="text-[11px] text-fg-faint">completado</span>
    </span>
  )
}

/**
 * Arbol de la Lista: fila jerarquica -caret, titulo, cantidad de subtareas, pastilla de
 * estado- con una segunda linea compacta de metadatos (prioridad, responsable, fecha, avance).
 * Tocar la fila abre el detalle; el caret SOLO expande/colapsa, no abre nada.
 */
function ArbolProyecto({
  parentId,
  allItems,
  depth,
  memberName,
  onOpen,
}: {
  parentId: string
  allItems: DecoratedItem[]
  depth: number
  memberName: (id: string) => string
  onOpen: (itemId: string) => void
}) {
  const hijos = allItems.filter((d) => d.parent_item_id === parentId)
  if (hijos.length === 0) return null
  return (
    <>
      {hijos.map((it) => (
        <FilaArbol
          key={it.id}
          item={it}
          allItems={allItems}
          depth={depth}
          memberName={memberName}
          onOpen={onOpen}
        />
      ))}
    </>
  )
}

function FilaArbol({
  item,
  allItems,
  depth,
  memberName,
  onOpen,
}: {
  item: DecoratedItem
  allItems: DecoratedItem[]
  depth: number
  memberName: (id: string) => string
  onOpen: (itemId: string) => void
}) {
  // Colapsado por defecto: revelar bajo demanda en vez de mostrar todo el arbol de una.
  const [expandido, setExpandido] = useState(false)
  const hijos = allItems.filter((d) => d.parent_item_id === item.id)
  const tieneHijos = hijos.length > 0
  const fin = plazoEfectivo(item, allItems)
  const avance = tieneHijos ? avanceDe(item, allItems) : null

  return (
    <>
      <div
        onClick={() => onOpen(item.id)}
        className={`flex items-start gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-surface-soft/60 ${
          depth > 0 ? 'ml-[26px] bg-surface-soft/30' : ''
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpandido((v) => !v)
          }}
          className={`w-4 h-4 rounded flex items-center justify-center text-[9px] flex-shrink-0 mt-0.5 ${
            !tieneHijos
              ? 'invisible'
              : expandido
                ? 'bg-indigo-600 text-white'
                : 'bg-surface-2 text-fg-muted'
          }`}
        >
          {expandido ? '▾' : '▸'}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {item.prioridad && (
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORIDAD_COLOR[item.prioridad]}`}
                title={`Prioridad ${PRIORIDAD_LABEL[item.prioridad]}`}
              />
            )}
            <span
              className={`flex-1 min-w-0 truncate text-xs ${
                item.effectiveEstado === 'resuelto'
                  ? 'line-through opacity-60 text-fg-faint'
                  : depth > 0
                    ? 'text-fg-muted'
                    : 'text-fg-body font-medium'
              }`}
            >
              {item.tema}
            </span>
            {tieneHijos && (
              <span className="flex-shrink-0 text-[10px] text-fg-faint bg-surface-2 rounded-full px-2 py-0.5">
                {hijos.length} subtarea{hijos.length === 1 ? '' : 's'}
              </span>
            )}
            <span
              className={`flex-shrink-0 text-[10px] font-medium rounded-full px-2.5 py-0.5 ${PILL_ESTILO[item.effectiveEstado]}`}
            >
              {estadoLabels[item.effectiveEstado]}
            </span>
          </div>
          {(item.responsables.length > 0 || fin || avance !== null) && (
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-fg-faint">
              {item.responsables.length > 0 && (
                <span>{item.responsables.map(memberName).join(', ')}</span>
              )}
              {fin && <span>📅 {formatDateLocal(fin, 'short')}</span>}
              {avance !== null && <span>{avance}% avance</span>}
            </div>
          )}
        </div>
      </div>
      {expandido && (
        <ArbolProyecto
          parentId={item.id}
          allItems={allItems}
          depth={depth + 1}
          memberName={memberName}
          onOpen={onOpen}
        />
      )}
    </>
  )
}

/**
 * Panel lateral de detalle (drawer): se abre al tocar una fila/tarjeta/barra en cualquiera de
 * las tres vistas -es el MISMO panel, un solo camino de edicion para el mismo objeto. Permite
 * editar tema, responsable, fechas, estado, prioridad, comentarios, agregar/abrir subtareas, y
 * asignar/discutir/eliminar.
 */
function DetalleDrawer({
  item,
  allItems,
  members,
  canManage,
  canAssign,
  canDelete,
  onClose,
  onGuardarTema,
  onGuardarComentario,
  onGuardarResponsables,
  onGuardarEstado,
  onGuardarPrioridad,
  onGuardarPlazo,
  onGuardarFechaInicio,
  onAdd,
  onAsignar,
  onDiscutir,
  onEliminar,
  onAbrirSubtarea,
}: {
  item: DecoratedItem
  allItems: DecoratedItem[]
  members: Profile[]
  canManage: boolean
  canAssign: boolean
  canDelete: boolean
  onClose: () => void
  onGuardarTema: (next: string) => void
  onGuardarComentario: (next: string) => void
  onGuardarResponsables: (patch: { responsables: string[]; para_todos: boolean }) => void
  onGuardarEstado: (estado: MinuteEstado) => void
  onGuardarPrioridad: (p: number | null) => void
  onGuardarPlazo: (v: string | null) => void
  onGuardarFechaInicio: (v: string | null) => void
  onAdd: (tema: string) => void
  onAsignar: () => void
  onDiscutir: () => void
  onEliminar: () => void
  onAbrirSubtarea: (itemId: string) => void
}) {
  const [nuevaSubtarea, setNuevaSubtarea] = useState('')
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const hijos = allItems.filter((d) => d.parent_item_id === item.id)

  // El boton hace explicito lo que antes solo se podia con Enter. Deja el campo listo para la
  // siguiente subtarea en vez de cerrar el panel: agregar varias seguidas es el caso comun.
  const confirmarAgregar = () => {
    if (!nuevaSubtarea.trim()) return
    onAdd(nuevaSubtarea.trim())
    setNuevaSubtarea('')
  }

  return (
    <Drawer open onClose={onClose} title="Actividad">
      <div className="space-y-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Nombre</p>
          <EditableText
            as="p"
            value={item.tema}
            canEdit={canManage}
            onSave={onGuardarTema}
            textClassName="text-sm font-medium text-fg-body"
            preventEmpty
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Estado</p>
            {item.linkedActivities.length > 0 ? (
              <Badge variant={item.effectiveEstado === 'resuelto' ? 'success' : 'info'}>
                {estadoLabels[item.effectiveEstado]}
              </Badge>
            ) : canManage ? (
              <select
                value={item.estado}
                onChange={(e) => onGuardarEstado(e.target.value as MinuteEstado)}
                className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-xs text-fg-body"
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {estadoLabels[s]}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className={`text-[10px] font-medium rounded-full px-2.5 py-0.5 ${PILL_ESTILO[item.effectiveEstado]}`}
              >
                {estadoLabels[item.effectiveEstado]}
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Prioridad</p>
            {canManage ? (
              <select
                value={item.prioridad ?? ''}
                onChange={(e) => onGuardarPrioridad(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-xs text-fg-body"
              >
                <option value="">Sin prioridad</option>
                <option value="1">Alta</option>
                <option value="2">Media</option>
                <option value="3">Baja</option>
              </select>
            ) : item.prioridad ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                <span className={`w-2 h-2 rounded-full ${PRIORIDAD_COLOR[item.prioridad]}`} />
                {PRIORIDAD_LABEL[item.prioridad]}
              </span>
            ) : (
              <p className="text-sm text-fg-muted">Sin prioridad</p>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-1">Responsable</p>
          {canManage ? (
            <MemberMultiSelect
              members={members}
              selected={item.responsables}
              paraTodos={item.para_todos}
              onChange={onGuardarResponsables}
            />
          ) : (
            <p className="text-sm text-fg-muted">
              {item.responsables.length
                ? item.responsables
                    .map((r) => members.find((m) => m.id === r)?.full_name)
                    .join(', ')
                : 'Sin asignar'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Inicio</p>
            {canManage ? (
              <DatePicker
                value={item.fecha_inicio ?? null}
                onChange={onGuardarFechaInicio}
                placeholder="+ fecha"
              />
            ) : (
              <p className="text-sm text-fg-muted">
                {item.fecha_inicio ? formatDateLocal(item.fecha_inicio) : 'Sin fecha'}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Término</p>
            {canManage ? (
              <DatePicker value={item.plazo} onChange={onGuardarPlazo} placeholder="+ fecha" />
            ) : (
              <p className="text-sm text-fg-muted">
                {item.plazo ? formatDateLocal(item.plazo) : 'Sin fecha'}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-1">Descripción / comentarios</p>
          <ComentarioLibre
            value={item.comentarios}
            canEdit={canManage}
            onSave={onGuardarComentario}
          />
        </div>

        <div className="pt-2 border-t border-border-strong">
          <p className="text-xs text-slate-500 mb-2">
            Subtareas {hijos.length > 0 && `(${hijos.length})`}
          </p>
          {hijos.length > 0 && (
            <div className="space-y-1 mb-2">
              {hijos.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onAbrirSubtarea(h.id)}
                  className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-surface-soft/60"
                >
                  <span
                    className={
                      h.effectiveEstado === 'resuelto' ? 'text-emerald-500' : 'text-fg-faint'
                    }
                  >
                    {h.effectiveEstado === 'resuelto' ? '☑' : '☐'}
                  </span>
                  <span
                    className={`flex-1 min-w-0 truncate text-xs ${h.effectiveEstado === 'resuelto' ? 'line-through opacity-60 text-fg-faint' : 'text-fg-muted'}`}
                  >
                    {h.tema}
                  </span>
                </button>
              ))}
            </div>
          )}
          {canManage && (
            <div className="flex gap-1.5">
              <input
                value={nuevaSubtarea}
                onChange={(e) => setNuevaSubtarea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmarAgregar()
                }}
                placeholder="Nueva subtarea…"
                className="flex-1 rounded border border-border-strong bg-surface px-2 py-1.5 text-base sm:text-xs text-fg-body"
              />
              <Button size="sm" disabled={!nuevaSubtarea.trim()} onClick={confirmarAgregar}>
                + Agregar
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-strong">
          {item.linkedActivities.length === 0 && canAssign && item.responsables.length > 0 && (
            <Button size="sm" onClick={onAsignar}>
              Asignar actividad
            </Button>
          )}
          {item.linkedActivities.length > 0 && item.effectiveEstado !== 'resuelto' && canManage && (
            <Button size="sm" variant="secondary" onClick={onDiscutir}>
              ↑ Discutir en reunión
            </Button>
          )}
          {canDelete &&
            (confirmarEliminar ? (
              <>
                <span className="text-xs text-fg-faint">¿Seguro?</span>
                <Button size="sm" variant="danger" onClick={onEliminar}>
                  Sí, eliminar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmarEliminar(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmarEliminar(true)}>
                🗑 Eliminar
              </Button>
            ))}
        </div>
      </div>
    </Drawer>
  )
}
