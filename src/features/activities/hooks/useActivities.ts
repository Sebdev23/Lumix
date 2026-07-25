import { useState, useEffect, useCallback } from 'react'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { teamsService } from '@infrastructure/supabase/teams.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { parseDateLocal } from '@shared/utils/date'
import { useToast } from '@shared/components/ui/Toast'
import type { Activity, ActivityStatus, Profile } from '@shared/types'

// Actividades PERSONALES + de los equipos que lidero (cross-equipo). Privacidad:
// veo TODAS las mias (en cualquier equipo) y, de terceros, solo en equipos donde soy jefe.
export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  const [managedIds, setManagedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | 'todas' | 'activas'>('activas')
  const [dateType, setDateType] = useState<'creadas' | 'cerradas' | 'entrega'>('entrega')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterTeam, setFilterTeam] = useState<string>('todas')
  const [filterMember, setFilterMember] = useState<string>('todas')
  const [search, setSearch] = useState('')
  const { user, profile } = useAuth()
  const toast = useToast()

  const load = useCallback(async () => {
    if (!user) return
    const [myTeams, managed] = await Promise.all([
      teamsService.getMyTeams(user.id),
      teamsService.getManagedTeams(user.id),
    ])
    const mIds = managed.map((t) => t.id)
    setManagedIds(mIds)
    const names: Record<string, string> = {}
    ;[...myTeams, ...managed].forEach((t) => (names[t.id] = t.name))
    setTeamNames(names)

    // Mis actividades (todos los equipos) + todas las de los equipos que lidero. Deduplicado.
    const [mine, managedActs] = await Promise.all([
      activitiesService.getByResponsibleAll(user.id),
      activitiesService.getByTeams(mIds),
    ])
    const map = new Map<string, Activity>()
    ;[...mine, ...managedActs].forEach((a) => map.set(a.id, a))
    setActivities([...map.values()].filter((a) => !a.title.startsWith('[Ingesta]')))

    // Miembros (para nombres/filtro): de los equipos que lidero + yo mismo.
    const memberLists = await Promise.all(mIds.map((id) => profilesService.getByTeam(id)))
    const memberMap = new Map<string, Profile>()
    memberLists.flat().forEach((m) => memberMap.set(m.id, m))
    if (profile && !memberMap.has(profile.id)) memberMap.set(profile.id, profile as Profile)
    setMembers([...memberMap.values()])
    setLoading(false)
  }, [user, profile])

  useEffect(() => {
    if (!user) return
    // load() es async: los setState ocurren tras el await, no sincronicamente en el effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [user, load])

  const isManager = managedIds.length > 0

  let filtered = activities

  if (filterStatus === 'activas') {
    filtered = filtered.filter((a) => a.status !== 'completado')
  } else if (filterStatus !== 'todas') {
    filtered = filtered.filter((a) => a.status === filterStatus)
  }

  // Base para contadores: aplica equipo/miembro/fecha/busqueda, pero NO el filtro de estado.
  let countBase = activities

  if (filterTeam !== 'todas') {
    filtered = filtered.filter((a) => a.team_id === filterTeam)
    countBase = countBase.filter((a) => a.team_id === filterTeam)
  }

  if (filterMember !== 'todas') {
    filtered = filtered.filter((a) => a.responsible_id === filterMember)
    countBase = countBase.filter((a) => a.responsible_id === filterMember)
  }

  if (dateFrom && dateTo) {
    const datePredicate = (a: Activity) => {
      const field =
        dateType === 'creadas'
          ? a.created_at
          : dateType === 'cerradas'
            ? a.completed_at
            : a.due_date
      if (!field) return false
      const d = parseDateLocal(field)
      const from = parseDateLocal(dateFrom + 'T00:00:00')
      const to = parseDateLocal(dateTo + 'T23:59:59')
      return d >= from && d <= to
    }
    filtered = filtered.filter(datePredicate)
    countBase = countBase.filter(datePredicate)
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase()
    const matches = (a: Activity) =>
      `${a.title} ${a.description ?? ''} ${a.observations ?? ''}`.toLowerCase().includes(q)
    filtered = filtered.filter(matches)
    countBase = countBase.filter(matches)
  }

  const changeStatus = async (id: string, newStatus: ActivityStatus) => {
    try {
      await activitiesService.update(id, { status: newStatus })
      if (newStatus === 'bloqueado') {
        const activity = activities.find((a) => a.id === id)
        if (activity) {
          await notificationsService.sendToTeam(activity.team_id, {
            title: 'Actividad bloqueada',
            body: `"${activity.title}" ha sido bloqueada`,
            type: 'activity_blocked',
            metadata: { activity_id: id },
          })
        }
      }
      await load()
      toast.success('Estado actualizado')
    } catch {
      toast.error('No se pudo actualizar el estado')
    }
  }

  filtered = [...filtered].sort((a, b) => {
    const dateA = parseDateLocal(a.due_date).getTime()
    const dateB = parseDateLocal(b.due_date).getTime()
    if (dateA !== dateB) return dateA - dateB
    return a.priority - b.priority
  })

  const allStatuses: (ActivityStatus | 'todas' | 'activas')[] = [
    'todas',
    'activas',
    'pendiente',
    'en_proceso',
    'bloqueado',
    'falta_informacion',
    'esperando_aprobacion',
    'completado',
  ]

  const counts: Record<ActivityStatus | 'todas' | 'activas', number> = {} as Record<
    ActivityStatus | 'todas' | 'activas',
    number
  >
  for (const s of allStatuses) {
    if (s === 'activas') {
      counts[s] = countBase.filter((a) => a.status !== 'completado').length
    } else {
      counts[s] = s === 'todas' ? countBase.length : countBase.filter((a) => a.status === s).length
    }
  }

  return {
    activities: filtered,
    allActivities: activities,
    members,
    teamNames,
    managedIds,
    isManager,
    loading,
    filterStatus,
    setFilterStatus,
    changeStatus,
    counts,
    filterTeam,
    setFilterTeam,
    filterMember,
    setFilterMember,
    search,
    setSearch,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    reload: load,
  }
}

export function getDaysRemaining(dueDate: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = parseDateLocal(dueDate)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function getDaysColor(days: number): string {
  if (days < 0) return 'text-red-400'
  if (days === 0) return 'text-amber-400'
  if (days <= 2) return 'text-amber-300'
  return 'text-slate-400'
}

export const statusLabels: Record<ActivityStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  bloqueado: 'Bloqueado',
  falta_informacion: 'Falta info',
  esperando_aprobacion: 'Esperando aprobacion',
  completado: 'Completado',
}
