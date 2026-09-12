import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Badge } from '@shared/components/ui/Badge'
import { Modal } from '@shared/components/ui/Modal'
import { useGantt, getLoadColor, getLoadTextColor } from '@features/gantt/hooks/useGantt'
import { getDaysRemaining, getDaysColor } from '@features/activities/hooks/useActivities'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { formatDateLocal } from '@shared/utils/date'
import { DatePicker } from '@shared/components/ui/DatePicker'
import type { Activity } from '@shared/types'

const priorityColors: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-emerald-500',
}

function getLoadBadgeVariant(pct: number) {
  if (pct > 100) return 'danger' as const
  if (pct >= 90) return 'danger' as const
  if (pct >= 70) return 'warning' as const
  return 'success' as const
}

function getLoadLabel(pct: number): string {
  if (pct > 100) return 'Critico'
  if (pct >= 90) return 'Saturado'
  if (pct >= 70) return 'Advertencia'
  return 'Normal'
}

const dayNames = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

export function GanttPage() {
  const {
    rows,
    loading,
    error,
    days,
    weekLabel,
    prevWeek,
    nextWeek,
    currentWeek,
    weekOffset,
    reload,
  } = useGantt()
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const { profile } = useAuth()
  const { canEditAllActivities } = useCapabilities()
  const canEdit = canEditAllActivities || selectedActivity?.responsible_id === profile?.id
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const arrastrandoActividad = rows
    .flatMap((r) => r.days.flatMap((d) => d.activities))
    .find((a) => a.id === arrastrandoId)

  const alSoltar = async (e: DragEndEvent) => {
    setArrastrandoId(null)
    const activityId = e.active.id as string
    const date = e.over?.id as string | undefined
    if (!date || dropping) return

    const activity = rows
      .flatMap((r) => r.days.flatMap((d) => d.activities))
      .find((a) => a.id === activityId)
    if (!activity) return

    const newDueDate = new Date(date)
    const oldDueDate = new Date(activity.due_date)
    if (newDueDate.toDateString() === oldDueDate.toDateString()) return

    setDropping(true)
    try {
      await activitiesService.update(activity.id, { due_date: newDueDate.toISOString() })
      reload()
    } catch {
      /* ignore */
    } finally {
      setDropping(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-border bg-panel flex-shrink-0">
        <h2 className="text-sm font-semibold text-fg-body hidden sm:block">
          Planificacion Semanal
        </h2>
        <h2 className="text-xs font-semibold text-fg-body sm:hidden">Planificacion</h2>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={prevWeek}
            className="p-1 rounded hover:bg-surface text-fg-faint hover:text-fg-body transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={currentWeek}
            className={`text-xs px-2 py-1 rounded ${weekOffset === 0 ? 'bg-indigo-600/20 text-indigo-400' : 'text-fg-faint hover:text-slate-200'}`}
          >
            Hoy
          </button>
          <button
            onClick={nextWeek}
            className="p-1 rounded hover:bg-surface text-fg-faint hover:text-fg-body transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span className="text-[10px] sm:text-xs text-fg-faint ml-1 sm:ml-2 truncate max-w-[80px] sm:max-w-none">
            {weekLabel}
          </span>
        </div>
      </div>

      {/* Gantt content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
            <p className="text-sm text-fg-faint">No se pudo cargar la planificacion</p>
            <button
              onClick={reload}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 rounded-lg border border-border-strong px-3 py-1.5"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="min-w-[600px] p-4">
            {/* Day headers */}
            <div className="flex mb-2 sticky top-0 bg-shell z-10 pb-2 border-b border-border">
              <div className="w-32 flex-shrink-0" />
              {days.map((day, i) => {
                const isToday = day.date === new Date().toISOString().split('T')[0]
                const isWeekend = i >= 5
                return (
                  <div key={day.date} className="flex-1 text-center px-1">
                    <div className="text-[10px] text-slate-500">{dayNames[i]}</div>
                    <div
                      className={`text-xs font-medium mt-0.5 ${
                        isToday
                          ? 'text-indigo-400'
                          : isWeekend
                            ? 'text-slate-600 light:text-slate-500'
                            : 'text-fg-muted'
                      }`}
                    >
                      {day.label.split(' ')[0]}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Member rows */}
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-fg-faint">Sin miembros en el equipo</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={(e: DragStartEvent) => setArrastrandoId(e.active.id as string)}
                onDragEnd={alSoltar}
                onDragCancel={() => setArrastrandoId(null)}
              >
                {rows.map((row) => (
                  <div key={row.member.id} className="flex items-stretch mb-3">
                    {/* Member info */}
                    <div className="w-32 flex-shrink-0 flex flex-col justify-center pr-2 py-1">
                      <p className="text-xs text-fg-muted truncate font-medium">
                        {row.member.full_name}
                      </p>
                      <div className="mt-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${getLoadColor(row.loadPercentage)}`}
                          />
                          <span className={`text-[10px] ${getLoadTextColor(row.loadPercentage)}`}>
                            {row.loadPercentage}%
                          </span>
                          <Badge
                            variant={getLoadBadgeVariant(row.loadPercentage)}
                            className="text-[9px] px-1"
                          >
                            {getLoadLabel(row.loadPercentage)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getLoadColor(row.loadPercentage)}`}
                              style={{ width: `${Math.min(row.loadPercentage, 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-500 flex-shrink-0">
                            {row.totalHours}/42h
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Day cells */}
                    <div className="flex-1 flex gap-1 min-w-0">
                      {row.days.map((cell, j) => (
                        <CeldaDia
                          key={cell.date}
                          date={cell.date}
                          isWeekend={j >= 5}
                          activities={cell.activities}
                          onSelect={setSelectedActivity}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <DragOverlay>
                  {arrastrandoActividad && <ChipActividadVisual activity={arrastrandoActividad} />}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex-shrink-0 border-t border-border bg-panel px-3 sm:px-4 py-2">
        <div className="flex items-center gap-2 sm:gap-4 text-[9px] sm:text-[10px] text-slate-500 flex-wrap">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> 0-70% Normal
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> 70-90% Advertencia
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" /> 90-100% Saturado
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-600" /> +100% Critico
          </span>
        </div>
      </div>

      <Modal
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        title={selectedActivity?.title}
        size="md"
      >
        {selectedActivity && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Descripcion</p>
              <p className="text-sm text-fg-muted">
                {selectedActivity.description || 'Sin descripcion'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Prioridad</p>
                {canEdit ? (
                  <div className="flex gap-1">
                    {[1, 2, 3].map((p) => (
                      <button
                        key={p}
                        onClick={async () => {
                          await activitiesService.update(selectedActivity.id, { priority: p })
                          setSelectedActivity({ ...selectedActivity, priority: p })
                        }}
                        className={`w-10 h-10 rounded text-sm font-bold text-white ${
                          p === 1 ? 'bg-red-700' : p === 2 ? 'bg-amber-700' : 'bg-emerald-700'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((p) => (
                      <div
                        key={p}
                        className={`w-2 h-4 rounded-sm ${p >= selectedActivity.priority ? priorityColors[p] : 'bg-surface-2'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Entrega</p>
                {canEdit ? (
                  <DatePicker
                    value={selectedActivity.due_date.split('T')[0]}
                    onChange={async (v) => {
                      if (!v) return
                      const newDate = new Date(v).toISOString()
                      await activitiesService.update(selectedActivity.id, { due_date: newDate })
                      setSelectedActivity({ ...selectedActivity, due_date: newDate })
                    }}
                  />
                ) : (
                  <p
                    className={`text-sm ${getDaysColor(getDaysRemaining(selectedActivity.due_date))}`}
                  >
                    {formatDateLocal(selectedActivity.due_date)}
                  </p>
                )}
                {(selectedActivity.plazo_change_count ?? 0) > 0 && (
                  <span className="block text-[10px] text-amber-400 mt-0.5">
                    cambiada {selectedActivity.plazo_change_count}{' '}
                    {selectedActivity.plazo_change_count === 1 ? 'vez' : 'veces'}
                  </span>
                )}
              </div>
            </div>
            {canEdit && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Horas estimadas</p>
                <div className="flex gap-1 flex-wrap">
                  {[1, 2, 3, 4, 5, 8, 12].map((h) => (
                    <button
                      key={h}
                      onClick={async () => {
                        await activitiesService.update(selectedActivity.id, { estimated_hours: h })
                        setSelectedActivity({ ...selectedActivity, estimated_hours: h })
                        reload()
                      }}
                      className={`w-10 h-10 rounded text-xs font-medium transition-colors ${
                        (selectedActivity.estimated_hours ?? 3) === h
                          ? 'bg-indigo-600 text-white'
                          : 'bg-surface-2 text-fg-muted hover:bg-slate-600'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function chipClases(activity: Activity): string {
  const isCompleted = activity.status === 'completado'
  if (isCompleted)
    return 'bg-emerald-600/30 border-emerald-500/20 text-emerald-400 light:text-emerald-700'
  if (activity.priority === 1)
    return 'bg-red-500/40 border-red-400/20 text-red-300 light:text-red-700'
  if (activity.priority === 2)
    return 'bg-amber-500/40 border-amber-400/20 text-amber-300 light:text-amber-700'
  return 'bg-indigo-600/40 border-indigo-500/20 text-indigo-300 light:text-indigo-700'
}

/** Celda de un dia para un miembro: area donde soltar una actividad (useDroppable, dnd-kit). */
function CeldaDia({
  date,
  isWeekend,
  activities,
  onSelect,
}: {
  date: string
  isWeekend: boolean
  activities: Activity[]
  onSelect: (a: Activity) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date })
  const isToday = date === new Date().toISOString().split('T')[0]

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 min-h-[40px] max-h-[80px] overflow-hidden rounded-lg border p-1 transition-colors ${
        isOver
          ? 'border-indigo-400 bg-indigo-500/10'
          : isToday
            ? 'border-indigo-500/30 bg-indigo-500/5'
            : isWeekend
              ? 'border-border/50 bg-surface-soft/30'
              : 'border-border bg-surface-soft/50'
      }`}
    >
      {activities.length > 0 ? (
        <div className="space-y-0.5 overflow-y-auto max-h-full">
          {activities.map((activity) => (
            <ChipActividad key={activity.id} activity={activity} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <span className="text-[10px] text-slate-700">-</span>
        </div>
      )}
    </div>
  )
}

/** Chip de actividad dentro de una celda: arrastrable con dnd-kit (Pointer Events, funciona
 * igual con mouse que con touch -antes era HTML5 drag nativo, invisible en celular-). */
function ChipActividad({
  activity,
  onSelect,
}: {
  activity: Activity
  onSelect: (a: Activity) => void
}) {
  const isCompleted = activity.status === 'completado'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: activity.id,
    disabled: isCompleted,
  })

  return (
    <div
      ref={setNodeRef}
      {...(isCompleted ? {} : attributes)}
      {...(isCompleted ? {} : listeners)}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(activity)
      }}
      className={`text-[9px] px-1 py-0.5 rounded border truncate transition-opacity touch-none ${
        isDragging
          ? 'opacity-40'
          : isCompleted
            ? ''
            : 'cursor-grab active:cursor-grabbing hover:brightness-110'
      } ${chipClases(activity)}`}
      title={
        isCompleted
          ? `${activity.title} (completado)`
          : `Arrastrar para cambiar fecha - ${activity.title}`
      }
    >
      {activity.title}
    </div>
  )
}

/** Version de solo lectura del chip, para el DragOverlay (la que sigue al dedo/cursor). */
function ChipActividadVisual({ activity }: { activity: Activity }) {
  return (
    <div
      className={`text-[9px] px-1 py-0.5 rounded border truncate shadow-lg ${chipClases(activity)}`}
    >
      {activity.title}
    </div>
  )
}
