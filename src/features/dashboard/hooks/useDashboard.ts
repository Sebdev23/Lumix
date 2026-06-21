import { useState, useEffect } from 'react'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { Activity, Profile } from '@shared/types'

interface MemberWorkload {
  name: string
  total: number
  completed: number
  percentage: number
}

interface DashboardData {
  pendingActivities: number
  criticalActivities: number
  openErrors: number
  criticalErrors: number
  completedThisWeek: number
  memberWorkloads: MemberWorkload[]
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData>({
    pendingActivities: 0,
    criticalActivities: 0,
    openErrors: 0,
    criticalErrors: 0,
    completedThisWeek: 0,
    memberWorkloads: [],
  })
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''

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

      const notCompleted = activities.filter((a) => a.status !== 'completado')
      const completed = activities.filter((a) => a.status === 'completado')
      const notResolved = errors.filter((e) => e.status !== 'cerrado' && e.status !== 'resuelto')

      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const completedThisWeek = completed.filter((a) =>
        new Date(a.created_at) >= weekAgo,
      ).length

      const memberWorkloads = buildWorkloads(activities, members)

      setData({
        pendingActivities: notCompleted.length,
        criticalActivities: notCompleted.filter((a) => a.priority >= 4).length,
        openErrors: notResolved.length,
        criticalErrors: notResolved.filter((e) => e.severity === 'critica' || e.severity === 'alta').length,
        completedThisWeek,
        memberWorkloads,
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

    const maxTasks = 10
    const percentage = Math.round((total / maxTasks) * 100)

    return {
      name: member.full_name,
      total,
      completed,
      percentage: Math.min(percentage, 100),
    }
  })
}
