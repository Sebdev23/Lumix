import { useState, useEffect } from 'react'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { parseDateLocal } from '@shared/utils/date'
import { useToast } from '@shared/components/ui/Toast'
import type { Activity, ActivityStatus, Profile } from '@shared/types'

const isIngesta = (a: Activity) =>
  a.title.startsWith('[Ingesta]') || (a.observations?.includes('Ingesta') ?? false)

export function useIngestas() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | 'todas' | 'activas'>('todas')
  const [filterMember, setFilterMember] = useState<string>('todas')
  const [dateType, setDateType] = useState<'entrega' | 'creadas' | 'cerradas'>('entrega')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''
  const toast = useToast()

  useEffect(() => {
    if (!user || !teamId) return

    let cancelled = false

    async function load() {
      const [data, membersData] = await Promise.all([
        activitiesService.getByTeam(teamId),
        profilesService.getByTeam(teamId),
      ])
      if (cancelled) return
      setActivities(data.filter(isIngesta))
      setMembers(membersData)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [user, teamId])

  // Filtrado client-side (igual que Actividades)
  let filtered = activities
  if (filterStatus === 'activas') {
    filtered = filtered.filter((a) => a.status !== 'completado')
  } else if (filterStatus !== 'todas') {
    filtered = filtered.filter((a) => a.status === filterStatus)
  }

  let countBase = activities

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

  // Orden: por fecha de entrega ascendente; a igualdad, mayor prioridad primero
  filtered = [...filtered].sort((a, b) => {
    const byDate = parseDateLocal(a.due_date).getTime() - parseDateLocal(b.due_date).getTime()
    if (byDate !== 0) return byDate
    return a.priority - b.priority
  })

  const allStatuses: (ActivityStatus | 'todas' | 'activas')[] = [
    'todas',
    'activas',
    'pendiente',
    'en_proceso',
    'completado',
  ]
  const counts = {} as Record<ActivityStatus | 'todas' | 'activas', number>
  for (const s of allStatuses) {
    counts[s] =
      s === 'todas'
        ? countBase.length
        : s === 'activas'
          ? countBase.filter((a) => a.status !== 'completado').length
          : countBase.filter((a) => a.status === s).length
  }

  async function reloadIngestas() {
    const data = await activitiesService.getByTeam(teamId)
    setActivities(data.filter(isIngesta))
  }

  const changeStatus = async (id: string, status: ActivityStatus) => {
    try {
      await activitiesService.update(id, { status })
      await reloadIngestas()
      toast.success('Estado actualizado')
    } catch {
      toast.error('No se pudo actualizar el estado')
    }
  }

  return {
    activities: filtered,
    members,
    loading,
    filterStatus,
    setFilterStatus,
    filterMember,
    setFilterMember,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    counts,
    changeStatus,
    reload: reloadIngestas,
  }
}

export const statusLabels: Record<ActivityStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  bloqueado: 'Bloqueado',
  falta_informacion: 'Falta info',
  esperando_aprobacion: 'Esperando aprobacion',
  completado: 'Completado',
}
