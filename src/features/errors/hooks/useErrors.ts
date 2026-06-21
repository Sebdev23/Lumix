import { useState, useEffect } from 'react'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { AppError, ErrorSeverity, ErrorStatus } from '@shared/types'

export function useErrors() {
  const [errors, setErrors] = useState<AppError[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSeverity, setFilterSeverity] = useState<ErrorSeverity | 'todas'>('todas')
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''
  const isInvitado = profile?.role === 'invitado'

  useEffect(() => {
    if (!user) return
    if (!isInvitado && !teamId) return

    let cancelled = false

    async function load() {
      const data = filterSeverity === 'todas'
        ? isInvitado
          ? await errorsService.getAll()
          : await errorsService.getByTeam(teamId)
        : isInvitado
          ? await errorsService.getAllBySeverity(filterSeverity)
          : await errorsService.getBySeverity(teamId, filterSeverity)

      if (cancelled) return
      setErrors(data)
      setLoading(false)
    }

    load()

    if (!isInvitado && teamId) {
      let channel: Awaited<ReturnType<typeof errorsService.subscribeToTeam>>
      errorsService.subscribeToTeam(teamId, () => {
        if (!cancelled) load()
      }).then((ch) => { channel = ch })

      return () => {
        cancelled = true
        channel?.unsubscribe()
      }
    }

    return () => { cancelled = true }
  }, [filterSeverity, user, teamId, isInvitado])

  const changeStatus = async (id: string, newStatus: ErrorStatus) => {
    await errorsService.update(id, { status: newStatus })

    if (newStatus === 'abierto') {
      const error = errors.find((e) => e.id === id)
      if (error) {
        await notificationsService.sendToTeam(teamId, {
          title: 'Error reabierto',
          body: error.title,
          type: 'critical_error',
          metadata: { error_id: id },
        })
      }
    }

    const data = filterSeverity === 'todas'
      ? isInvitado
        ? await errorsService.getAll()
        : await errorsService.getByTeam(teamId)
      : isInvitado
        ? await errorsService.getAllBySeverity(filterSeverity)
        : await errorsService.getBySeverity(teamId, filterSeverity)
    setErrors(data)
  }

  const counts: Record<ErrorSeverity | 'todas', number> = {
    todas: 0, baja: 0, media: 0, alta: 0, critica: 0,
  }

  errors.forEach((e) => {
    counts.todas++
    if (counts[e.severity] !== undefined) counts[e.severity]++
  })

  return { errors, loading, filterSeverity, setFilterSeverity, changeStatus, counts, isInvitado, reload: async () => {
    const data = filterSeverity === 'todas'
      ? isInvitado
        ? await errorsService.getAll()
        : await errorsService.getByTeam(teamId)
      : isInvitado
        ? await errorsService.getAllBySeverity(filterSeverity)
        : await errorsService.getBySeverity(teamId, filterSeverity)
    setErrors(data)
  }}
}

export const severityLabels: Record<ErrorSeverity, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Critica',
}

export const errorStatusLabels: Record<ErrorStatus, string> = {
  abierto: 'Abierto', en_revision: 'En revision', resuelto: 'Resuelto', cerrado: 'Cerrado',
}
