import { useState, useCallback } from 'react'
import { Badge } from '@shared/components/ui/Badge'
import { Modal } from '@shared/components/ui/Modal'
import { useGantt, getLoadColor, getLoadTextColor } from '@features/gantt/hooks/useGantt'
import { getDaysRemaining, getDaysColor } from '@features/activities/hooks/useActivities'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { formatDateLocal } from '@shared/utils/date'
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
  const { rows, loading, days, weekLabel, prevWeek, nextWeek, currentWeek, weekOffset, reload } =
    useGantt()
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [dragActivity, setDragActivity] = useState<Activity | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const { profile } = useAuth()
  const canEdit =
    profile?.role === 'admin' ||
    profile?.role === 'jefatura' ||
    selectedActivity?.responsible_id === profile?.id

  const handleDragStart = useCallback((e: React.DragEvent, activity: Activity) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', activity.id)
    setDragActivity(activity)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragActivity(null)
    setDragOverDate(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, date: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(date)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setDragOverDate(null)
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent, date: string) => {
      e.preventDefault()
      setDragOverDate(null)
      if (!dragActivity || dropping) return

      const newDueDate = new Date(date)
      const oldDueDate = new Date(dragActivity.due_date)
      if (newDueDate.toDateString() === oldDueDate.toDateString()) {
        setDragActivity(null)
        return
      }

      setDropping(true)
      try {
        await activitiesService.update(dragActivity.id, { due_date: newDueDate.toISOString() })
        setDragActivity(null)
        reload()
      } catch {
        /* ignore */
      } finally {
        setDropping(false)
      }
    },
    [dragActivity, dropping, reload],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200 hidden sm:block">
          Planificacion Semanal
        </h2>
        <h2 className="text-xs font-semibold text-slate-200 sm:hidden">Planificacion</h2>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={prevWeek}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
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
            className={`text-xs px-2 py-1 rounded ${weekOffset === 0 ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Hoy
          </button>
          <button
            onClick={nextWeek}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span className="text-[10px] sm:text-xs text-slate-400 ml-1 sm:ml-2 truncate max-w-[80px] sm:max-w-none">
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
        ) : (
          <div className="min-w-[600px] p-4">
            {/* Day headers */}
            <div className="flex mb-2 sticky top-0 bg-slate-950 z-10 pb-2 border-b border-slate-800">
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
                            ? 'text-slate-600'
                            : 'text-slate-300'
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
                <p className="text-sm text-slate-400">Sin miembros en el equipo</p>
              </div>
            ) : (
              rows.map((row) => (
                <div key={row.member.id} className="flex items-stretch mb-3">
                  {/* Member info */}
                  <div className="w-32 flex-shrink-0 flex flex-col justify-center pr-2 py-1">
                    <p className="text-xs text-slate-300 truncate font-medium">
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
                        <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
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
                    {row.days.map((cell, j) => {
                      const isToday = cell.date === new Date().toISOString().split('T')[0]
                      const isWeekend = j >= 5
                      const hasActivities = cell.count > 0

                      return (
                        <div
                          key={cell.date}
                          onDragOver={(e) => handleDragOver(e, cell.date)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, cell.date)}
                          className={`flex-1 min-w-0 min-h-[40px] max-h-[80px] overflow-hidden rounded-lg border p-1 transition-colors ${
                            dragOverDate === cell.date
                              ? 'border-indigo-400 bg-indigo-500/10'
                              : isToday
                                ? 'border-indigo-500/30 bg-indigo-500/5'
                                : isWeekend
                                  ? 'border-slate-800/50 bg-slate-900/30'
                                  : 'border-slate-800 bg-slate-900/50'
                          }`}
                        >
                          {hasActivities ? (
                            <div className="space-y-0.5 overflow-y-auto max-h-full">
                              {cell.activities.map((activity) => {
                                const isCompleted = activity.status === 'completado'
                                return (
                                  <div
                                    key={activity.id}
                                    draggable={!isCompleted}
                                    onDragStart={(e) => {
                                      if (isCompleted) return
                                      e.stopPropagation()
                                      handleDragStart(e, activity)
                                    }}
                                    onDragEnd={handleDragEnd}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedActivity(activity)
                                    }}
                                    className={`text-[9px] px-1 py-0.5 rounded border truncate transition-opacity ${
                                      dragActivity?.id === activity.id
                                        ? 'opacity-40'
                                        : 'cursor-pointer hover:brightness-110'
                                    } ${
                                      isCompleted
                                        ? 'bg-emerald-600/30 border-emerald-500/20 text-emerald-400'
                                        : activity.priority === 1
                                          ? 'bg-red-500/40 border-red-400/20 text-red-300'
                                          : activity.priority === 2
                                            ? 'bg-amber-500/40 border-amber-400/20 text-amber-300'
                                            : 'bg-indigo-600/40 border-indigo-500/20 text-indigo-300'
                                    }`}
                                    title={
                                      isCompleted
                                        ? `${activity.title} (completado)`
                                        : `Arrastrar para cambiar fecha - ${activity.title}`
                                    }
                                  >
                                    {activity.title}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <span className="text-[10px] text-slate-700">-</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-3 sm:px-4 py-2">
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
              <p className="text-sm text-slate-300">
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
                        className={`w-6 h-6 rounded text-xs font-bold text-white ${
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
                        className={`w-2 h-4 rounded-sm ${p >= selectedActivity.priority ? priorityColors[p] : 'bg-slate-700'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Entrega</p>
                {canEdit ? (
                  <input
                    type="date"
                    defaultValue={selectedActivity.due_date.split('T')[0]}
                    onChange={async (e) => {
                      const newDate = new Date(e.target.value).toISOString()
                      await activitiesService.update(selectedActivity.id, { due_date: newDate })
                      setSelectedActivity({ ...selectedActivity, due_date: newDate })
                    }}
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                  />
                ) : (
                  <p
                    className={`text-sm ${getDaysColor(getDaysRemaining(selectedActivity.due_date))}`}
                  >
                    {formatDateLocal(selectedActivity.due_date)}
                  </p>
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
                      className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                        (selectedActivity.estimated_hours ?? 3) === h
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
