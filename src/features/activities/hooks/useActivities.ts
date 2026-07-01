import { useState, useEffect } from 'react'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { parseDateLocal } from '@shared/utils/date'
import type { Activity, ActivityStatus, Profile } from '@shared/types'

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | 'todas' | 'activas'>('todas')
  const [showMine, setShowMine] = useState(false)
  const [filterMember, setFilterMember] = useState<string>('todas')
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''

  const isColaborador = profile?.role === 'colaborador'

  useEffect(() => {
    if (!user || !teamId) return

    let cancelled = false

    async function load() {
      const [data, membersData] = await Promise.all([
        activitiesService.getByTeam(teamId),
        profilesService.getByTeam(teamId),
      ])
      if (cancelled) return
      setActivities(data.filter((a) => !a.title.startsWith('[Ingesta]')))
      setMembers(membersData)
      setLoading(false)
    }

    load()

    let channel: Awaited<ReturnType<typeof activitiesService.subscribeToTeam>>

    activitiesService
      .subscribeToTeam(teamId, () => {
        if (!cancelled) load()
      })
      .then((ch) => {
        channel = ch
      })

    return () => {
      cancelled = true
      channel?.unsubscribe()
    }
  }, [user])

  let filtered = activities

  if (filterStatus === 'activas') {
    filtered = filtered.filter((a) => a.status !== 'completado')
  } else if (filterStatus !== 'todas') {
    filtered = filtered.filter((a) => a.status === filterStatus)
  }

  if (showMine || isColaborador) {
    filtered = filtered.filter((a) => a.responsible_id === user?.id)
  }

  if (filterMember !== 'todas') {
    filtered = filtered.filter((a) => a.responsible_id === filterMember)
  }

  const changeStatus = async (id: string, newStatus: ActivityStatus) => {
    await activitiesService.update(id, { status: newStatus })

    if (newStatus === 'bloqueado') {
      const activity = activities.find((a) => a.id === id)
      if (activity) {
        await notificationsService.sendToTeam(teamId, {
          title: 'Actividad bloqueada',
          body: `"${activity.title}" ha sido bloqueada`,
          type: 'activity_blocked',
          metadata: { activity_id: id },
        })
      }
    }

    const data = await activitiesService.getByTeam(teamId)
    setActivities(data.filter((a) => !a.title.startsWith('[Ingesta]')))
  }

  filtered.sort((a, b) => {
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
      counts[s] = activities.filter((a) => a.status !== 'completado').length
    } else {
      counts[s] =
        s === 'todas' ? activities.length : activities.filter((a) => a.status === s).length
    }
  }

  return {
    activities: filtered,
    allActivities: activities,
    members,
    loading,
    filterStatus,
    setFilterStatus,
    changeStatus,
    counts,
    showMine,
    setShowMine,
    isColaborador,
    filterMember,
    setFilterMember,
    reload: async () => {
      const data = await activitiesService.getByTeam(teamId)
      setActivities(data.filter((a) => !a.title.startsWith('[Ingesta]')))
    },
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
