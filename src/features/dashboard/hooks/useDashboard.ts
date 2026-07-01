import { useState, useEffect } from 'react'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { parseDateLocal } from '@shared/utils/date'
import type { Activity, Profile } from '@shared/types'

interface MemberWorkload {
  name: string
  total: number
  completed: number
  percentage: number
  totalHours: number
}

interface StatusCount {
  pendiente: number
  en_proceso: number
  bloqueado: number
  completado: number
}

interface PriorityCount {
  alta: number
  media: number
  baja: number
}

interface DashboardData {
  pendingActivities: number
  criticalActivities: number
  openErrors: number
  criticalErrors: number
  completedThisWeek: number
  overdue: number
  upcomingDeadlines: Activity[]
  memberWorkloads: MemberWorkload[]
  statusCounts: StatusCount
  priorityCounts: PriorityCount
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData>({
    pendingActivities: 0,
    criticalActivities: 0,
    openErrors: 0,
    criticalErrors: 0,
    completedThisWeek: 0,
    overdue: 0,
    upcomingDeadlines: [],
    memberWorkloads: [],
    statusCounts: { pendiente: 0, en_proceso: 0, bloqueado: 0, completado: 0 },
    priorityCounts: { alta: 0, media: 0, baja: 0 },
  })
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''
  const isColaborador = profile?.role === 'colaborador'

  useEffect(() => {
    if (!user || !teamId) return

    let cancelled = false

    async function load() {
      const [activities, errors, members] = await Promise.all([
        activitiesService.getByTeam(teamId),
        errorsService.getByTeam(teamId),
        profilesService.getByTeam(teamId),
      ])

      if (cancelled) return

      const filteredActivities = isColaborador
        ? activities.filter((a) => a.responsible_id === user?.id)
        : activities
      const filteredErrors = isColaborador
        ? errors.filter((e) => e.responsible_id === user?.id)
        : errors

      const notCompleted = filteredActivities.filter((a) => a.status !== 'completado')
      const completed = filteredActivities.filter((a) => a.status === 'completado')
      const notResolved = filteredErrors.filter(
        (e) => e.status !== 'cerrado' && e.status !== 'resuelto',
      )

      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const completedThisWeek = completed.filter((a) => new Date(a.created_at) >= weekAgo).length

      const memberWorkloads = isColaborador
        ? buildWorkloads(
            filteredActivities,
            members.filter((m) => m.id === user?.id),
          )
        : buildWorkloads(filteredActivities, members)

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const overdue = notCompleted.filter((a) => parseDateLocal(a.due_date) < today).length

      const threeDaysFromNow = new Date(today.getTime() + 3 * 86400000)
      const upcomingDeadlines = notCompleted
        .filter((a) => {
          const d = parseDateLocal(a.due_date)
          return d >= today && d <= threeDaysFromNow
        })
        .sort((a, b) => parseDateLocal(a.due_date).getTime() - parseDateLocal(b.due_date).getTime())
        .slice(0, 5)

      setData({
        pendingActivities: notCompleted.length,
        criticalActivities: notCompleted.filter((a) => a.priority <= 2).length,
        openErrors: notResolved.length,
        criticalErrors: notResolved.filter((e) => e.severity === 'critica' || e.severity === 'alta')
          .length,
        completedThisWeek,
        overdue,
        upcomingDeadlines,
        memberWorkloads,
        statusCounts: {
          pendiente: filteredActivities.filter((a) => a.status === 'pendiente').length,
          en_proceso: filteredActivities.filter((a) => a.status === 'en_proceso').length,
          bloqueado: filteredActivities.filter((a) => a.status === 'bloqueado').length,
          completado: filteredActivities.filter((a) => a.status === 'completado').length,
        },
        priorityCounts: {
          alta: notCompleted.filter((a) => a.priority === 1).length,
          media: notCompleted.filter((a) => a.priority === 2).length,
          baja: notCompleted.filter((a) => a.priority === 3).length,
        },
      })

      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [user, teamId])

  return { ...data, loading }
}

function buildWorkloads(activities: Activity[], members: Profile[]): MemberWorkload[] {
  if (members.length === 0) return []

  return members.map((member) => {
    const memberActivities = activities.filter(
      (a) => a.responsible_id === member.id && a.status !== 'completado',
    )
    const total = memberActivities.length
    const completed = activities.filter(
      (a) => a.responsible_id === member.id && a.status === 'completado',
    ).length

    const totalHours = memberActivities.reduce((sum, a) => sum + (a.estimated_hours ?? 3), 0)
    const weeklyHours = 42
    const percentage = Math.round((totalHours / weeklyHours) * 100)

    return {
      name: member.full_name,
      total,
      completed,
      percentage: Math.min(percentage, 100),
      totalHours,
    }
  })
}
