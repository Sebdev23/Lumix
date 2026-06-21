import { useState } from 'react'
import { Badge } from '@shared/components/ui/Badge'
import { Modal } from '@shared/components/ui/Modal'
import { useGantt, getLoadColor, getLoadBgColor, getLoadTextColor } from '@features/gantt/hooks/useGantt'
import { getDaysRemaining, getDaysColor } from '@features/activities/hooks/useActivities'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { Activity } from '@shared/types'

const priorityColors: Record<number, string> = {
  1: 'bg-red-500', 2: 'bg-amber-500', 3: 'bg-indigo-500', 4: 'bg-blue-500', 5: 'bg-slate-600',
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
  const { rows, loading, days, weekLabel, prevWeek, nextWeek, currentWeek, weekOffset } = useGantt()
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'jefatura' || selectedActivity?.responsible_id === profile?.id

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Planificacion Semanal</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
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
          <span className="text-xs text-slate-400 ml-2">{weekLabel}</span>
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
              <div className="w-28 flex-shrink-0" />
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
                  <div className="w-28 flex-shrink-0 flex flex-col justify-center pr-3 py-1">
                    <p className="text-xs text-slate-300 truncate font-medium">{row.member.full_name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={`w-2 h-2 rounded-full ${getLoadColor(row.loadPercentage)}`} />
                      <span className={`text-[10px] ${getLoadTextColor(row.loadPercentage)}`}>
                        {row.loadPercentage}%
                      </span>
                      <Badge variant={getLoadBadgeVariant(row.loadPercentage)} className="text-[9px] px-1.5">
                        {getLoadLabel(row.loadPercentage)}
                      </Badge>
                    </div>
                  </div>

                  {/* Day cells */}
                  <div className="flex-1 flex gap-1">
                    {row.days.map((cell, j) => {
                      const isToday = cell.date === new Date().toISOString().split('T')[0]
                      const isWeekend = j >= 5
                      const hasActivities = cell.count > 0

                      return (
                        <div
                          key={cell.date}
                          className={`flex-1 min-h-[36px] rounded-lg border p-1.5 transition-colors ${
                            isToday
                              ? 'border-indigo-500/30 bg-indigo-500/5'
                              : isWeekend
                                ? 'border-slate-800/50 bg-slate-900/30'
                                : 'border-slate-800 bg-slate-900/50'
                          }`}
                        >
                          {hasActivities ? (
                            <div className="space-y-1">
                              {cell.activities.map((activity) => {
                                const isCompleted = activity.status === 'completado'
                                return (
                                  <div
                                    key={activity.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedActivity(activity) }}
                                    className={`text-[10px] px-1.5 py-1 rounded border truncate cursor-pointer hover:brightness-110 ${
                                      isCompleted
                                        ? 'bg-emerald-600/30 border-emerald-500/20 text-emerald-400'
                                        : getLoadBgColor(
                                            activity.priority >= 4 ? 95 : activity.priority >= 3 ? 75 : 50,
                                          )
                                    }`}
                                    title={`${activity.title}${isCompleted ? ' (completado)' : ''} - Click para ver detalles`}
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
      <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> 0-70% Normal
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> 70-90% Advertencia
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" /> 90-100% Saturado
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-600" /> +100% Critico
          </span>
        </div>
      </div>

      <Modal open={!!selectedActivity} onClose={() => setSelectedActivity(null)} title={selectedActivity?.title} size="md">
        {selectedActivity && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Descripcion</p>
              <p className="text-sm text-slate-300">{selectedActivity.description || 'Sin descripcion'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Prioridad</p>
                {canEdit ? (
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map((p) => (
                      <button
                        key={p}
                        onClick={async () => {
                          await activitiesService.update(selectedActivity.id, { priority: p })
                          setSelectedActivity({ ...selectedActivity, priority: p })
                        }}
                        className={`w-6 h-6 rounded text-xs font-bold text-white ${
                          p <= 2 ? 'bg-red-700' : p === 3 ? 'bg-indigo-700' : 'bg-slate-700'
                        }`}
                      >{p}</button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map((p) => (
                      <div key={p} className={`w-2 h-4 rounded-sm ${p <= selectedActivity.priority ? priorityColors[p] : 'bg-slate-700'}`} />
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
                  <p className={`text-sm ${getDaysColor(getDaysRemaining(selectedActivity.due_date))}`}>
                    {new Date(selectedActivity.due_date).toLocaleDateString('es-CL')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
