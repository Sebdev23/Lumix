import { useState, useEffect } from 'react'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { Activity, Profile } from '@shared/types'

interface DayCell {
  date: string
  label: string
  activities: Activity[]
  count: number
}

export interface GanttRow {
  member: Profile
  days: DayCell[]
  totalActivities: number
  loadPercentage: number
}

function getWeekDays(referenceDate: Date): { date: string; label: string }[] {
  const monday = new Date(referenceDate)
  const day = monday.getDay()
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(monday.getDate() + diff)
  monday.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    const month = d.toLocaleDateString('es-CL', { month: 'short' })
    const date = d.toISOString().split('T')[0]
    const label = `${d.getDate()} ${month}`
    return { date, label }
  })
}

function getWeekLabel(days: { date: string; label: string }[]): string {
  const first = days[0].label
  const last = days[6].label
  return `${first} - ${last}`
}

export function useGantt() {
  const [rows, setRows] = useState<GanttRow[]>([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''

  const referenceDate = new Date()
  referenceDate.setDate(referenceDate.getDate() + weekOffset * 7)

  const days = getWeekDays(referenceDate)
  const weekLabel = getWeekLabel(days)

  useEffect(() => {
    if (!user || !teamId) return

    let cancelled = false

    async function load() {
      setLoading(true)
      const [activities, members] = await Promise.all([
        activitiesService.getByTeam(teamId),
        profilesService.getByTeam(teamId),
      ])

      if (cancelled) return

      const ganttRows: GanttRow[] = members.map((member) => {
        const memberActivities = activities.filter((a) => a.responsible_id === member.id)
        const activeActivities = memberActivities.filter((a) => a.status !== 'completado')

        const dayCells: DayCell[] = days.map((day) => {
          const dayActivities = memberActivities.filter((a) => {
            if (!a.due_date) return false
            return a.due_date.startsWith(day.date)
          })
          return {
            date: day.date,
            label: day.label,
            activities: dayActivities,
            count: dayActivities.length,
          }
        })

        const total = activeActivities.length
        const maxTasks = 10
        const loadPercentage = Math.min(Math.round((total / maxTasks) * 100), 150)

        return {
          member,
          days: dayCells,
          totalActivities: total,
          loadPercentage,
        }
      })

      setRows(ganttRows)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [weekOffset, teamId, user, refreshKey])

  const prevWeek = () => setWeekOffset((w) => w - 1)
  const nextWeek = () => setWeekOffset((w) => w + 1)
  const currentWeek = () => setWeekOffset(0)
  const reload = () => setRefreshKey((k) => k + 1)

  return { rows, loading, days, weekLabel, prevWeek, nextWeek, currentWeek, weekOffset, reload }
}

export function getLoadColor(percentage: number): string {
  if (percentage > 100) return 'bg-red-600'
  if (percentage >= 90) return 'bg-red-500'
  if (percentage >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function getLoadBgColor(percentage: number): string {
  if (percentage > 100) return 'bg-red-600/60 border-red-500/30'
  if (percentage >= 90) return 'bg-red-500/40 border-red-400/20'
  if (percentage >= 70) return 'bg-amber-500/40 border-amber-400/20'
  return 'bg-indigo-600/40 border-indigo-500/20'
}

export function getLoadTextColor(percentage: number): string {
  if (percentage > 100) return 'text-red-400'
  if (percentage >= 90) return 'text-red-400'
  if (percentage >= 70) return 'text-amber-400'
  return 'text-slate-400'
}
