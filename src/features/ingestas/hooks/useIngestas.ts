import { useState, useEffect } from 'react'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { Activity, ActivityStatus } from '@shared/types'

export function useIngestas() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''

  useEffect(() => {
    if (!user || !teamId) return

    let cancelled = false

    async function load() {
      const data = await activitiesService.getByTeam(teamId)
      if (cancelled) return
      setActivities(data.filter((a) => a.title.startsWith('[Ingesta]') || a.observations?.includes('Ingesta')))
      setLoading(false)
    }

    load()

    return () => { cancelled = true }
  }, [user, teamId])

  const changeStatus = async (id: string, status: ActivityStatus) => {
    await activitiesService.update(id, { status })
    const data = await activitiesService.getByTeam(teamId)
    setActivities(data.filter((a) => a.title.startsWith('[Ingesta]') || a.observations?.includes('Ingesta')))
  }

  return { activities, loading, changeStatus }
}

export const statusLabels: Record<ActivityStatus, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', bloqueado: 'Bloqueado',
  falta_informacion: 'Falta info', esperando_aprobacion: 'Esperando aprobacion', completado: 'Completado',
}
