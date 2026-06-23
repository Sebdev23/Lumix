import { useState, useEffect } from 'react'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { useIngestas, statusLabels } from '@features/ingestas/hooks/useIngestas'
import { getDaysRemaining, getDaysColor } from '@features/activities/hooks/useActivities'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { exportToCSV } from '@shared/utils/export'
import type { Activity, ActivityStatus } from '@shared/types'
import type { BadgeVariant } from '@shared/components/ui/Badge'
import type { Profile } from '@shared/types'

const statusColors: Record<ActivityStatus, BadgeVariant> = {
  pendiente: 'warning',
  en_proceso: 'info',
  bloqueado: 'danger',
  falta_informacion: 'warning',
  esperando_aprobacion: 'warning',
  completado: 'success',
}

const priorityColors: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-emerald-500',
}

export function IngestasPage() {
  const { activities, loading, changeStatus } = useIngestas()
  const [selected, setSelected] = useState<Activity | null>(null)
  const [members, setMembers] = useState<Profile[]>([])
  const { profile } = useAuth()

  useEffect(() => {
    if (profile?.team_id) {
      profilesService.getByTeam(profile.team_id).then(setMembers)
    }
  }, [profile?.team_id])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Ingestas de Datos</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToCSV(
                activities.map((a) => ({
                  Titulo: a.title.replace('[Ingesta] ', ''),
                  Descripcion: a.description,
                  Estado: statusLabels[a.status],
                  Prioridad: a.priority,
                  Entrega: new Date(a.due_date).toLocaleDateString('es-CL'),
                  Creado: new Date(a.created_at).toLocaleDateString('es-CL'),
                  Observaciones: a.observations,
                })),
                'ingestas',
              )
            }
            className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
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
          <span className="text-xs text-slate-500">{activities.length} total</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-500">
                <th className="text-left py-2 px-3 font-medium">Ingesta</th>
                <th className="text-left py-2 px-3 font-medium hidden md:table-cell">
                  Responsable
                </th>
                <th className="text-left py-2 px-3 font-medium hidden md:table-cell">Prioridad</th>
                <th className="text-left py-2 px-3 font-medium">Entrega</th>
                <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Creado</th>
                <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Cerrado</th>
                <th className="text-left py-2 px-3 font-medium">Estado</th>
                <th className="text-right py-2 px-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                    Sin ingestas registradas
                  </td>
                </tr>
              ) : (
                activities.map((a) => {
                  const days = getDaysRemaining(a.due_date)
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer"
                    >
                      <td className="py-2.5 px-3">
                        <span className="text-slate-200 truncate max-w-[220px] block">
                          {a.title.replace('[Ingesta] ', '')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell">
                        <span className="text-xs text-slate-400 truncate max-w-[100px] block">
                          {members.find((m) => m.id === a.responsible_id)?.full_name ||
                            'Sin asignar'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell">
                        <div className="flex gap-0.5">
                          {[1, 2, 3].map((p) => (
                            <div
                              key={p}
                              className={`w-1.5 h-3 rounded-sm ${p >= a.priority ? priorityColors[p] : 'bg-slate-700'}`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className={`py-2.5 px-3 ${getDaysColor(days)}`}>
                        {new Date(a.due_date).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                        {new Date(a.created_at).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                        {a.completed_at
                          ? new Date(a.completed_at).toLocaleDateString('es-CL', {
                              day: '2-digit',
                              month: 'short',
                            })
                          : '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={statusColors[a.status]}>{statusLabels[a.status]}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {a.status === 'pendiente' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => changeStatus(a.id, 'en_proceso')}
                          >
                            Iniciar
                          </Button>
                        )}
                        {a.status === 'en_proceso' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => changeStatus(a.id, 'completado')}
                          >
                            ✓
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title.replace('[Ingesta] ', '')}
        size="md"
      >
        {selected && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <p className="text-xs text-slate-500 mb-1">Descripcion</p>
              <p className="text-sm text-slate-300">{selected.description}</p>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50">
              <p className="text-xs text-slate-500">Creado por:</p>
              <p className="text-xs text-slate-300 font-medium">
                {members.find((m) => m.id === selected.created_by)?.full_name || 'Desconocido'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Tipo de ingesta</p>
              <select
                defaultValue={
                  selected.observations?.includes('Tipo:')
                    ? selected.observations.split('Tipo:')[1]?.split('.')[0]?.trim() || 'datos'
                    : 'datos'
                }
                onChange={async (e) => {
                  const newObs = `Tipo: ${e.target.value}. ${selected.observations?.replace(/Tipo:.*?\.\s*/, '') || ''}`
                  await activitiesService.update(selected.id, { observations: newObs })
                }}
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
              >
                <option value="datos">Carga de datos</option>
                <option value="transformacion">Transformacion</option>
                <option value="validacion">Validacion</option>
                <option value="limpieza">Limpieza</option>
                <option value="migracion">Migracion</option>
                <option value="pipeline">Pipeline ETL</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Comentarios</p>
              <textarea
                defaultValue={selected.observations?.replace(/Tipo:.*?\.\s*/, '') || ''}
                onBlur={async (e) => {
                  const tipo = selected.observations?.includes('Tipo:')
                    ? selected.observations.split('Tipo:')[1]?.split('.')[0]?.trim() || 'datos'
                    : 'datos'
                  const newObs = `Tipo: ${tipo}. ${e.target.value}`
                  await activitiesService.update(selected.id, { observations: newObs })
                }}
                rows={2}
                placeholder="Agregar comentario..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Estado</p>
                <Badge variant={statusColors[selected.status]}>
                  {statusLabels[selected.status]}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Prioridad</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((p) => (
                    <button
                      key={p}
                      onClick={async () => {
                        await activitiesService.update(selected.id, { priority: p })
                        setSelected({ ...selected, priority: p })
                      }}
                      className={`w-6 h-6 rounded text-xs font-bold text-white ${p === 1 ? 'bg-red-700' : p === 2 ? 'bg-amber-700' : 'bg-emerald-700'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Entrega</p>
                <input
                  type="date"
                  defaultValue={selected.due_date.split('T')[0]}
                  onChange={async (e) => {
                    const d = new Date(e.target.value).toISOString()
                    await activitiesService.update(selected.id, { due_date: d })
                    setSelected({ ...selected, due_date: d })
                  }}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Creado</p>
                <p className="text-sm text-slate-300">
                  {new Date(selected.created_at).toLocaleDateString('es-CL')}
                </p>
              </div>
            </div>
            {/* Timeline */}
            <div>
              <p className="text-xs text-slate-500 mb-3">Progreso</p>
              <div className="space-y-3">
                {[
                  { label: 'Pendiente', active: true },
                  { label: 'En proceso', active: selected.status !== 'pendiente' },
                  { label: 'Completado', active: selected.status === 'completado' },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${step.active ? 'bg-purple-500 border-purple-500' : 'bg-slate-800 border-slate-600'}`}
                      />
                      {i < 2 && (
                        <div
                          className={`w-0.5 h-6 ${step.active ? 'bg-purple-500' : 'bg-slate-700'}`}
                        />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className={`text-sm ${step.active ? 'text-slate-200' : 'text-slate-500'}`}>
                        {step.label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-700">
              {selected.status === 'pendiente' && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await activitiesService.update(selected.id, { status: 'en_proceso' })
                    setSelected({ ...selected, status: 'en_proceso' })
                  }}
                >
                  Iniciar ingesta
                </Button>
              )}
              {selected.status === 'en_proceso' && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await activitiesService.update(selected.id, { status: 'completado' })
                    setSelected({ ...selected, status: 'completado' })
                  }}
                >
                  Marcar completada
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
