import { useState } from 'react'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import {
  useActivities,
  getDaysRemaining,
  getDaysColor,
  statusLabels,
} from '@features/activities/hooks/useActivities'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { exportToCSV } from '@shared/utils/export'
import type { Activity, ActivityStatus } from '@shared/types'
import type { BadgeVariant } from '@shared/components/ui/Badge'

const statusFilters: { value: ActivityStatus | 'todas'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'bloqueado', label: 'Bloqueadas' },
  { value: 'completado', label: 'Completadas' },
]

const priorityColors: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-emerald-500',
}

const statusColors: Record<ActivityStatus, BadgeVariant> = {
  pendiente: 'warning',
  en_proceso: 'info',
  bloqueado: 'danger',
  falta_informacion: 'warning',
  esperando_aprobacion: 'warning',
  completado: 'success',
}

export function ActivitiesPage() {
  const {
    activities,
    members,
    loading,
    filterStatus,
    setFilterStatus,
    changeStatus,
    counts,
    isColaborador,
    filterMember,
    setFilterMember,
    reload,
  } = useActivities()
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [observation, setObservation] = useState('')
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [editingPriority, setEditingPriority] = useState(false)
  const { profile } = useAuth()
  const isAdminOrJefe = profile?.role === 'admin' || profile?.role === 'jefatura'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Actividades</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToCSV(
                activities.map((a) => ({
                  Titulo: a.title,
                  Descripcion: a.description,
                  Prioridad: a.priority,
                  Estado: statusLabels[a.status],
                  Entrega: new Date(a.due_date).toLocaleDateString('es-CL'),
                  Creado: new Date(a.created_at).toLocaleDateString('es-CL'),
                  Cerrado: a.completed_at
                    ? new Date(a.completed_at).toLocaleDateString('es-CL')
                    : '-',
                  'Dias para cerrar': a.completed_at
                    ? Math.ceil(
                        (new Date(a.completed_at).getTime() - new Date(a.created_at).getTime()) /
                          86400000,
                      )
                    : '-',
                  Observaciones: a.observations,
                })),
                'actividades',
              )
            }
            className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
            title="Exportar a Excel"
          >
            <svg
              className="w-3.5 h-3.5 inline mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Excel
          </button>
          <span className="text-xs text-slate-500">{counts.todas} total</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-2 sm:px-4 py-2 border-b border-slate-800 bg-slate-900/50 overflow-x-auto flex-shrink-0 flex-nowrap">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filterStatus === f.value
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-slate-600">
              {f.value === 'todas' ? counts.todas : counts[f.value]}
            </span>
          </button>
        ))}
        {!isColaborador && (
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
        )}
        <div className="flex-1" />
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-12 h-12 text-slate-700 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-sm text-slate-400">No hay actividades</p>
            <p className="text-xs text-slate-600 mt-1">Escribe en el chat para crear una</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-500">
                  <th className="text-left py-2 px-3 font-medium">Actividad</th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">
                    Responsable
                  </th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">
                    Prioridad
                  </th>
                  <th className="text-left py-2 px-3 font-medium">Entrega</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Creado</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Cerrado</th>
                  <th className="text-left py-2 px-3 font-medium">Estado</th>
                  <th className="text-right py-2 px-3 font-medium">Accion</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => {
                  const days = getDaysRemaining(activity.due_date)
                  return (
                    <tr
                      key={activity.id}
                      onClick={() => {
                        setSelectedActivity(activity)
                        setObservation(activity.observations || '')
                      }}
                      className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {activity.observations && (
                            <span
                              title={activity.observations}
                              className="text-amber-400 flex-shrink-0"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </span>
                          )}
                          <span className="text-slate-200 truncate max-w-[200px]">
                            {activity.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell">
                        <span className="text-xs text-slate-400 truncate max-w-[100px] block">
                          {members.find((m) => m.id === activity.responsible_id)?.full_name ||
                            'Sin asignar'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell">
                        <div className="flex gap-0.5">
                          {[1, 2, 3].map((p) => (
                            <div
                              key={p}
                              className={`w-1.5 h-3 rounded-sm ${p >= activity.priority ? priorityColors[p] : 'bg-slate-700'}`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={getDaysColor(days)}>
                          {new Date(activity.due_date).toLocaleDateString('es-CL', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                        {new Date(activity.created_at).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                        {activity.completed_at
                          ? new Date(activity.completed_at).toLocaleDateString('es-CL', {
                              day: '2-digit',
                              month: 'short',
                            })
                          : '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={statusColors[activity.status]}>
                          {statusLabels[activity.status]}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {activity.status === 'pendiente' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => changeStatus(activity.id, 'en_proceso')}
                            >
                              Iniciar
                            </Button>
                          )}
                          {activity.status === 'en_proceso' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => changeStatus(activity.id, 'completado')}
                              >
                                ✓
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => changeStatus(activity.id, 'bloqueado')}
                              >
                                ⏸
                              </Button>
                            </>
                          )}
                          {activity.status === 'bloqueado' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => changeStatus(activity.id, 'en_proceso')}
                            >
                              ▶
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
        title={selectedActivity?.title}
        size="md"
      >
        {selectedActivity && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <p className="text-xs text-slate-500 mb-1">Descripcion</p>
              {isAdminOrJefe || selectedActivity.responsible_id === profile?.id ? (
                <textarea
                  defaultValue={selectedActivity.description || ''}
                  onBlur={async (e) => {
                    if (e.target.value !== (selectedActivity.description || '')) {
                      await activitiesService.update(selectedActivity.id, {
                        description: e.target.value,
                      })
                      setSelectedActivity({ ...selectedActivity, description: e.target.value })
                      reload()
                    }
                  }}
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                  placeholder="Sin descripcion"
                />
              ) : (
                <p className="text-sm text-slate-300">
                  {selectedActivity.description || 'Sin descripcion'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Estado</p>
                <Badge variant={statusColors[selectedActivity.status]}>
                  {statusLabels[selectedActivity.status]}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Prioridad</p>
                {(isAdminOrJefe || selectedActivity.responsible_id === profile?.id) &&
                editingPriority ? (
                  <div className="flex gap-1">
                    {[1, 2, 3].map((p) => (
                      <button
                        key={p}
                        onClick={async () => {
                          await activitiesService.update(selectedActivity.id, { priority: p })
                          setSelectedActivity({ ...selectedActivity, priority: p })
                          reload()
                          setEditingPriority(false)
                        }}
                        className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                          p === 1
                            ? 'bg-red-700 hover:bg-red-600'
                            : p === 2
                              ? 'bg-amber-700 hover:bg-amber-600'
                              : 'bg-emerald-700 hover:bg-emerald-600'
                        } text-white`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1"
                    onClick={() =>
                      (isAdminOrJefe || selectedActivity.responsible_id === profile?.id) &&
                      setEditingPriority(true)
                    }
                  >
                    {[1, 2, 3].map((p) => (
                      <div
                        key={p}
                        className={`w-2 h-4 rounded-sm ${p >= selectedActivity.priority ? priorityColors[p] : 'bg-slate-700'} ${isAdminOrJefe || selectedActivity.responsible_id === profile?.id ? 'cursor-pointer' : ''}`}
                      />
                    ))}
                    <span className="text-xs text-slate-400 ml-1">
                      {selectedActivity.priority}/3
                    </span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Fecha creacion</p>
                <p className="text-sm text-slate-300">
                  {new Date(selectedActivity.created_at).toLocaleDateString('es-CL')}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Fecha entrega</p>
                {isAdminOrJefe || selectedActivity.responsible_id === profile?.id ? (
                  <input
                    type="date"
                    defaultValue={selectedActivity.due_date.split('T')[0]}
                    onChange={async (e) => {
                      const newDate = new Date(e.target.value).toISOString()
                      await activitiesService.update(selectedActivity.id, { due_date: newDate })
                      setSelectedActivity({ ...selectedActivity, due_date: newDate })
                      reload()
                    }}
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                ) : (
                  <p
                    className={`text-sm ${getDaysColor(getDaysRemaining(selectedActivity.due_date))}`}
                  >
                    {new Date(selectedActivity.due_date).toLocaleDateString('es-CL')}
                  </p>
                )}
              </div>
            </div>

            {selectedActivity.observations || observation ? (
              <div>
                <p className="text-xs text-slate-500 mb-1">Observaciones</p>
                <textarea
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  onBlur={async () => {
                    if (observation !== (selectedActivity.observations || '')) {
                      await activitiesService.update(selectedActivity.id, {
                        observations: observation,
                      })
                      reload()
                    }
                  }}
                  placeholder="Agregar observacion..."
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
              </div>
            ) : (
              <button
                onClick={() => setObservation(' ')}
                className="text-xs text-slate-500 hover:text-slate-400"
              >
                + Agregar observacion
              </button>
            )}

            {/* Status actions in modal */}
            <div className="flex gap-2 pt-2 border-t border-slate-700">
              {selectedActivity.status === 'pendiente' && (
                <Button
                  size="sm"
                  onClick={() => {
                    changeStatus(selectedActivity.id, 'en_proceso')
                    reload()
                    setSelectedActivity(null)
                  }}
                >
                  Iniciar actividad
                </Button>
              )}
              {selectedActivity.status === 'en_proceso' && (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      changeStatus(selectedActivity.id, 'completado')
                      reload()
                      setSelectedActivity(null)
                    }}
                  >
                    Marcar como completada
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setShowBlockModal(true)
                    }}
                  >
                    Bloquear
                  </Button>
                </>
              )}
              {showBlockModal && selectedActivity && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                  <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-sm w-full mx-4">
                    <h3 className="text-sm font-semibold text-slate-200 mb-2">
                      Motivo del bloqueo
                    </h3>
                    <textarea
                      value={observation}
                      onChange={(e) => setObservation(e.target.value)}
                      placeholder="Ej: Falta informacion del cliente..."
                      rows={3}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none mb-3"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          if (observation.trim()) {
                            await activitiesService.update(selectedActivity.id, {
                              observations: observation.trim(),
                            })
                          }
                          await changeStatus(selectedActivity.id, 'bloqueado')
                          setShowBlockModal(false)
                          reload()
                          setSelectedActivity(null)
                        }}
                      >
                        Bloquear
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowBlockModal(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {selectedActivity.status === 'bloqueado' && (
                <Button
                  size="sm"
                  onClick={() => {
                    changeStatus(selectedActivity.id, 'en_proceso')
                    reload()
                    setSelectedActivity(null)
                  }}
                >
                  Desbloquear
                </Button>
              )}
              {selectedActivity.status === 'completado' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    changeStatus(selectedActivity.id, 'pendiente')
                    reload()
                    setSelectedActivity(null)
                  }}
                >
                  Reabrir
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
