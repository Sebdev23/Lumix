import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { teamsService } from '@infrastructure/supabase/teams.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { minutesService } from '@infrastructure/supabase/minutes.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { useToast } from '@shared/components/ui/Toast'
import { exportToCSV } from '@shared/utils/export'
import { formatDateLocal, parseDateLocal } from '@shared/utils/date'
import { DatePicker } from '@shared/components/ui/DatePicker'
import type { Activity, ActivityStatus, Profile } from '@shared/types'
import type { BadgeVariant } from '@shared/components/ui/Badge'

const statusFilters: { value: ActivityStatus | 'todas' | 'activas'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'activas', label: 'Activas' },
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
    allActivities,
    teamNames,
    managedIds,
    isManager,
    filterTeam,
    setFilterTeam,
    filterMember,
    setFilterMember,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    search,
    setSearch,
    reload,
  } = useActivities()
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [observation, setObservation] = useState('')
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [editingPriority, setEditingPriority] = useState(false)
  const { profile, user } = useAuth()
  const { canAssignOthers } = useCapabilities()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  // Delegacion: equipos que el usuario lidera (distintos del activo) + estado del formulario.
  const [managedTeams, setManagedTeams] = useState<{ id: string; name: string }[]>([])
  const [showDelegate, setShowDelegate] = useState(false)
  const [delTeam, setDelTeam] = useState('')
  const [delMembers, setDelMembers] = useState<Profile[]>([])
  const [delMember, setDelMember] = useState('')
  const [delPriority, setDelPriority] = useState(2)
  const [delDue, setDelDue] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delToMinuta, setDelToMinuta] = useState(false)
  const [children, setChildren] = useState<Activity[]>([])
  const [childNames, setChildNames] = useState<Record<string, string>>({})

  // Asignacion normal (crear una actividad nueva en el equipo activo, opcionalmente a la minuta)
  const [showAssign, setShowAssign] = useState(false)
  const [asgTitle, setAsgTitle] = useState('')
  const [asgDesc, setAsgDesc] = useState('')
  const [asgMember, setAsgMember] = useState('')
  const [asgPriority, setAsgPriority] = useState(2)
  const [asgDue, setAsgDue] = useState('')
  const [asgToMinuta, setAsgToMinuta] = useState(false)
  const [asgBusy, setAsgBusy] = useState(false)

  // Editable si NO esta cerrada y sos el responsable o lideras el equipo de esa actividad.
  const canEdit =
    !!selectedActivity &&
    selectedActivity.status !== 'completado' &&
    (selectedActivity.responsible_id === profile?.id ||
      managedIds.includes(selectedActivity.team_id))

  // Equipos que lidera (para delegar), excluyendo el equipo activo.
  useEffect(() => {
    if (!user) return
    teamsService
      .getManagedTeams(user.id)
      .then((ts) => setManagedTeams(ts.filter((t) => t.id !== profile?.team_id)))
      .catch(() => {})
  }, [user, profile?.team_id])

  // Al cambiar la actividad seleccionada: cargar sus delegaciones (hijos). El reset del
  // formulario se hace en openActivity (handler), para no llamar setState sincronico en el effect.
  useEffect(() => {
    if (!selectedActivity) return
    let cancelled = false
    activitiesService
      .getByParent(selectedActivity.id)
      .then(async (kids) => {
        if (cancelled) return
        setChildren(kids)
        const teamIds = [...new Set(kids.map((k) => k.team_id))]
        const names: Record<string, string> = {}
        for (const tid of teamIds) {
          const ms = await profilesService.getByTeam(tid)
          ms.forEach((m) => (names[m.id] = m.full_name))
        }
        if (!cancelled) setChildNames(names)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedActivity])

  // Abrir el detalle de una actividad (resetea el estado del panel de delegar).
  const openActivity = (a: Activity) => {
    setSelectedActivity(a)
    setObservation(a.observations || '')
    setShowDelegate(false)
    setDelTeam('')
    setDelMembers([])
    setDelMember('')
    setChildren([])
  }

  // Llegada desde una notificacion: abre esa actividad concreta.
  // Se busca en la base y no en el listado ya cargado, porque puede estar filtrada fuera
  // de la vista actual (completada, de otro equipo) y aun asi hay que poder verla.
  // Sin bandera de cancelacion a proposito: abrir el detalle es idempotente, y con
  // StrictMode (doble montaje en desarrollo) tanto un `cancelled` como un ref de "ya lo
  // hice" se comen la unica ejecucion util. El state se limpia recien DESPUES de abrir:
  // limpiarlo antes reejecuta este effect y aborta la apertura.
  useEffect(() => {
    const activityId = (location.state as { activityId?: string } | null)?.activityId
    if (!activityId) return
    activitiesService
      .getById(activityId)
      .then((a) => {
        if (a) openActivity(a)
        else toast.info('Esa actividad ya no existe')
        navigate(location.pathname, { replace: true, state: null })
      })
      .catch(() => toast.error('No pude abrir la actividad'))
    // openActivity/toast se recrean en cada render; solo importa el state de la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.pathname, navigate])

  const loadDelMembers = async (teamId: string) => {
    setDelTeam(teamId)
    setDelMember('')
    if (!teamId) return setDelMembers([])
    try {
      setDelMembers(await profilesService.getByTeam(teamId))
    } catch {
      setDelMembers([])
    }
  }

  // Crea una actividad asignada a un miembro y, opcionalmente, un tema vinculado en la
  // minuta de ese equipo (estado sincronizado). Notifica al responsable.
  const createWithMinuta = async (o: {
    teamId: string
    memberId: string
    title: string
    description: string
    priority: number
    dueISO: string
    addToMinuta: boolean
    parentId?: string
  }): Promise<Activity> => {
    const act = await activitiesService.create({
      title: o.title,
      description: o.description,
      responsible_id: o.memberId,
      priority: o.priority,
      status: 'pendiente',
      due_date: o.dueISO,
      dependencies: [],
      observations: o.parentId ? 'Delegada desde otro equipo' : '',
      team_id: o.teamId,
      created_by: user!.id,
      parent_activity_id: o.parentId ?? null,
    })
    try {
      await notificationsService.send(o.memberId, {
        title: o.parentId ? 'Actividad delegada' : 'Nueva actividad asignada',
        body: `"${o.title}" - Entrega: ${formatDateLocal(o.dueISO)}`,
        type: 'deadline_soon',
        metadata: { activity_id: act.id },
      })
    } catch {
      /* ignore */
    }
    if (o.addToMinuta) {
      try {
        await minutesService.create({
          team_id: o.teamId,
          tipo: 'minuta',
          orden: 0,
          tema: o.title,
          para_todos: false,
          responsables: [o.memberId],
          responsables_text: '',
          estado: 'en_desarrollo',
          plazo: o.dueISO.split('T')[0],
          comentarios: '',
          linked_activity_ids: [act.id],
          created_by: user!.id,
        })
      } catch {
        /* ignore */
      }
    }
    return act
  }

  const delegate = async () => {
    if (!user || !selectedActivity || !delTeam || !delMember) return
    setDelBusy(true)
    try {
      const due = delDue ? new Date(delDue).toISOString() : selectedActivity.due_date
      const child = await createWithMinuta({
        teamId: delTeam,
        memberId: delMember,
        title: selectedActivity.title,
        description: selectedActivity.description,
        priority: delPriority,
        dueISO: due,
        addToMinuta: delToMinuta,
        parentId: selectedActivity.id,
      })
      setChildren((prev) => [...prev, child])
      const nm = delMembers.find((m) => m.id === delMember)?.full_name
      if (nm) setChildNames((prev) => ({ ...prev, [delMember]: nm }))
      setShowDelegate(false)
      toast.success(delToMinuta ? 'Delegada y agregada a la minuta' : 'Actividad delegada')
    } catch {
      toast.error('No se pudo delegar')
    } finally {
      setDelBusy(false)
    }
  }

  const openAssign = () => {
    setAsgTitle('')
    setAsgDesc('')
    setAsgMember('')
    setAsgPriority(2)
    setAsgDue('')
    setAsgToMinuta(false)
    setShowAssign(true)
  }

  const assignActivity = async () => {
    if (!user || !profile?.team_id || !asgTitle.trim() || !asgMember) return
    setAsgBusy(true)
    try {
      await createWithMinuta({
        teamId: profile.team_id,
        memberId: asgMember,
        title: asgTitle.trim(),
        description: asgDesc.trim(),
        priority: asgPriority,
        dueISO: asgDue ? new Date(asgDue).toISOString() : new Date().toISOString(),
        addToMinuta: asgToMinuta,
      })
      setShowAssign(false)
      reload()
      toast.success(asgToMinuta ? 'Asignada y agregada a la minuta' : 'Actividad asignada')
    } catch {
      toast.error('No se pudo asignar')
    } finally {
      setAsgBusy(false)
    }
  }

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
                  Entrega: formatDateLocal(a.due_date),
                  Creado: formatDateLocal(a.created_at),
                  Cerrado: a.completed_at ? formatDateLocal(a.completed_at) : '-',
                  'Dias para cerrar': a.completed_at
                    ? Math.ceil(
                        (parseDateLocal(a.completed_at).getTime() -
                          parseDateLocal(a.created_at).getTime()) /
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
          {canAssignOthers && (
            <Button size="sm" onClick={openAssign}>
              + Asignar
            </Button>
          )}
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
        {Object.keys(teamNames).length > 1 && (
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            <option value="todas">Todos los equipos</option>
            {Object.entries(teamNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        {isManager && (
          <select
            value={filterMember}
            onChange={(e) => setFilterMember(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            <option value="todas">Cualquier responsable</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        )}
        <div className="w-px bg-slate-700 mx-1" />
        <select
          value={dateType}
          onChange={(e) => setDateType(e.target.value as typeof dateType)}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        >
          <option value="entrega">Entrega</option>
          <option value="creadas">Creadas</option>
          <option value="cerradas">Cerradas</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-[120px]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-[120px]"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom('')
              setDateTo('')
            }}
            className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            Limpiar
          </button>
        )}
        <div className="flex-1" />
        <div className="relative min-w-[160px] max-w-xs w-full sm:w-auto">
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
            placeholder="Buscar actividad..."
            className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Limpiar busqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm"
            >
              ×
            </button>
          )}
        </div>
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
            {/* El listado ahora parte filtrado por el equipo activo. Si el filtro deja la
                lista vacia pero SI hay actividades en otros equipos, decirlo: "escribe en el
                chat para crear una" mandaria a crear algo que ya existe al lado. */}
            {allActivities.length > 0 && filterTeam !== 'todas' ? (
              <>
                <p className="text-sm text-slate-400">
                  No hay actividades en {teamNames[filterTeam] ?? 'este equipo'}
                </p>
                <button
                  onClick={() => setFilterTeam('todas')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline mt-1"
                >
                  Ver las de todos los equipos ({allActivities.length})
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400">No hay actividades</p>
                <p className="text-xs text-slate-600 mt-1">Escribe en el chat para crear una</p>
              </>
            )}
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
                      onClick={() => openActivity(activity)}
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
                          <div className="min-w-0">
                            <span className="text-slate-200 truncate max-w-[200px] block">
                              {activity.title}
                            </span>
                            {teamNames[activity.team_id] && (
                              <span className="text-[10px] text-slate-500">
                                {teamNames[activity.team_id]}
                              </span>
                            )}
                          </div>
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
                          {formatDateLocal(activity.due_date, 'short')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                        {formatDateLocal(activity.created_at, 'short')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                        {activity.completed_at
                          ? formatDateLocal(activity.completed_at, 'short')
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
        onClose={() => {
          setSelectedActivity(null)
          setEditingPriority(false)
        }}
        title={selectedActivity?.title}
        size="md"
      >
        {selectedActivity && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <p className="text-xs text-slate-500 mb-1">Descripcion</p>
              {canEdit ? (
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
                {canEdit && editingPriority ? (
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
                    onClick={() => canEdit && setEditingPriority(true)}
                  >
                    {[1, 2, 3].map((p) => (
                      <div
                        key={p}
                        className={`w-2 h-4 rounded-sm ${p >= selectedActivity.priority ? priorityColors[p] : 'bg-slate-700'} ${canEdit ? 'cursor-pointer' : ''}`}
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
                  {formatDateLocal(selectedActivity.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Fecha entrega</p>
                {canEdit ? (
                  <DatePicker
                    value={selectedActivity.due_date.split('T')[0]}
                    onChange={async (v) => {
                      if (!v) return
                      const newDate = new Date(v).toISOString()
                      await activitiesService.update(selectedActivity.id, { due_date: newDate })
                      setSelectedActivity({ ...selectedActivity, due_date: newDate })
                      reload()
                    }}
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
                <div className="flex gap-1">
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

            {/* Delegar a mi equipo */}
            {managedTeams.length > 0 && (
              <div className="pt-2 border-t border-slate-700">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Delegar a mi equipo</p>
                  {!showDelegate && (
                    <button
                      onClick={() => {
                        setShowDelegate(true)
                        setDelPriority(selectedActivity.priority)
                        setDelDue(selectedActivity.due_date.split('T')[0])
                      }}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      → Delegar
                    </button>
                  )}
                </div>

                {/* Delegaciones existentes */}
                {children.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {children.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded-lg bg-slate-800/60"
                      >
                        <span className="text-slate-300">
                          {childNames[c.responsible_id] || 'Miembro'}
                          <span className="text-slate-500">
                            {' · '}
                            {managedTeams.find((t) => t.id === c.team_id)?.name || 'equipo'}
                          </span>
                        </span>
                        <Badge variant={c.status === 'completado' ? 'success' : 'info'}>
                          {statusLabels[c.status]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {showDelegate && (
                  <div className="mt-2 space-y-2 rounded-lg bg-slate-900/60 border border-indigo-500/20 p-3">
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">Equipo</p>
                      <select
                        value={delTeam}
                        onChange={(e) => loadDelMembers(e.target.value)}
                        className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="">Elegir equipo…</option>
                        {managedTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {delTeam && (
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1">Asignar a</p>
                        <select
                          value={delMember}
                          onChange={(e) => setDelMember(e.target.value)}
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="">Elegir persona…</option>
                          {delMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1">Prioridad</p>
                        <div className="flex gap-1">
                          {[1, 2, 3].map((p) => (
                            <button
                              key={p}
                              onClick={() => setDelPriority(p)}
                              className={`w-7 h-7 rounded text-xs font-bold text-white ${
                                delPriority === p
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
                        <DatePicker value={delDue || null} onChange={(v) => setDelDue(v ?? '')} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={delToMinuta}
                        onChange={(e) => setDelToMinuta(e.target.checked)}
                        className="accent-indigo-500"
                      />
                      Tambien llevar a la minuta del equipo
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={delBusy || !delMember} onClick={delegate}>
                        {delBusy ? 'Delegando...' : 'Delegar'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowDelegate(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
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

      {/* Asignar actividad (nueva) al equipo actual */}
      <Modal
        open={showAssign}
        onClose={() => setShowAssign(false)}
        title="Asignar actividad"
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-1">Titulo</p>
            <input
              value={asgTitle}
              onChange={(e) => setAsgTitle(e.target.value)}
              placeholder="Que hay que hacer..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">Descripcion (opcional)</p>
            <textarea
              value={asgDesc}
              onChange={(e) => setAsgDesc(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">Asignar a</p>
            <select
              value={asgMember}
              onChange={(e) => setAsgMember(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="">Elegir persona…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div>
              <p className="text-[11px] text-slate-500 mb-1">Prioridad</p>
              <div className="flex gap-1">
                {[1, 2, 3].map((p) => (
                  <button
                    key={p}
                    onClick={() => setAsgPriority(p)}
                    className={`w-7 h-7 rounded text-xs font-bold text-white ${
                      asgPriority === p
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
              <DatePicker value={asgDue || null} onChange={(v) => setAsgDue(v ?? '')} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={asgToMinuta}
              onChange={(e) => setAsgToMinuta(e.target.checked)}
              className="accent-indigo-500"
            />
            Tambien llevar a la minuta del equipo
          </label>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={asgBusy || !asgTitle.trim() || !asgMember}
              onClick={assignActivity}
            >
              {asgBusy ? 'Asignando...' : 'Asignar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAssign(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
