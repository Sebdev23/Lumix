import { useState, useEffect } from 'react'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { parseDateLocal } from '@shared/utils/date'
import { useToast } from '@shared/components/ui/Toast'
import type { AppError, ErrorSeverity, ErrorStatus, Profile } from '@shared/types'

const SEVERITY_ORDER: Record<ErrorSeverity, number> = { critica: 0, alta: 1, media: 2, baja: 3 }

export function useErrors() {
  const [errors, setErrors] = useState<AppError[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<ErrorStatus | 'todas' | 'activos'>('todas')
  const [filterSeverity, setFilterSeverity] = useState<ErrorSeverity | 'todas'>('todas')
  const [filterMember, setFilterMember] = useState<string>('todas')
  const [dateType, setDateType] = useState<'reportadas' | 'cerradas'>('reportadas')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''
  const isInvitado = profile?.role === 'invitado'
  const toast = useToast()

  useEffect(() => {
    if (!user) return
    if (!isInvitado && !teamId) return

    let cancelled = false

    async function load() {
      const data = isInvitado ? await errorsService.getAll() : await errorsService.getByTeam(teamId)
      if (cancelled) return
      setErrors(data)
      setLoading(false)
    }

    load()

    if (teamId) {
      profilesService.getByTeam(teamId).then((m) => {
        if (!cancelled) setMembers(m)
      })
    }

    if (!isInvitado && teamId) {
      let channel: Awaited<ReturnType<typeof errorsService.subscribeToTeam>>
      errorsService
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
    }

    return () => {
      cancelled = true
    }
  }, [user, teamId, isInvitado])

  // Filtrado client-side (igual que Actividades)
  let filtered = errors
  if (filterStatus === 'activos') {
    filtered = filtered.filter((e) => e.status !== 'cerrado')
  } else if (filterStatus !== 'todas') {
    filtered = filtered.filter((e) => e.status === filterStatus)
  }

  // Base de contadores: aplica severidad/responsable/fecha, pero NO el filtro de estado
  let countBase = errors

  if (filterSeverity !== 'todas') {
    filtered = filtered.filter((e) => e.severity === filterSeverity)
    countBase = countBase.filter((e) => e.severity === filterSeverity)
  }

  if (filterMember !== 'todas') {
    filtered = filtered.filter((e) => e.responsible_id === filterMember)
    countBase = countBase.filter((e) => e.responsible_id === filterMember)
  }

  if (dateFrom && dateTo) {
    const datePredicate = (e: AppError) => {
      const field = dateType === 'cerradas' ? e.resolved_at : e.date
      if (!field) return false
      const d = parseDateLocal(field)
      const from = parseDateLocal(dateFrom + 'T00:00:00')
      const to = parseDateLocal(dateTo + 'T23:59:59')
      return d >= from && d <= to
    }
    filtered = filtered.filter(datePredicate)
    countBase = countBase.filter(datePredicate)
  }

  // Orden: mas recientes primero; a igualdad de fecha, mayor severidad primero
  filtered = [...filtered].sort((a, b) => {
    const byDate = parseDateLocal(b.date).getTime() - parseDateLocal(a.date).getTime()
    if (byDate !== 0) return byDate
    return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  })

  const allStatuses: (ErrorStatus | 'todas' | 'activos')[] = [
    'todas',
    'activos',
    'abierto',
    'en_revision',
    'resuelto',
    'cerrado',
  ]
  const counts = {} as Record<ErrorStatus | 'todas' | 'activos', number>
  for (const s of allStatuses) {
    counts[s] =
      s === 'todas'
        ? countBase.length
        : s === 'activos'
          ? countBase.filter((e) => e.status !== 'cerrado').length
          : countBase.filter((e) => e.status === s).length
  }

  async function reloadErrors() {
    const data = isInvitado ? await errorsService.getAll() : await errorsService.getByTeam(teamId)
    setErrors(data)
  }

  const changeStatus = async (id: string, newStatus: ErrorStatus) => {
    try {
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

      await reloadErrors()
      toast.success('Estado actualizado')
    } catch {
      toast.error('No se pudo actualizar el estado')
    }
  }

  return {
    errors: filtered,
    members,
    loading,
    filterStatus,
    setFilterStatus,
    filterSeverity,
    setFilterSeverity,
    filterMember,
    setFilterMember,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    changeStatus,
    counts,
    isInvitado,
    reload: reloadErrors,
  }
}

export const severityLabels: Record<ErrorSeverity, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica',
}

export const errorStatusLabels: Record<ErrorStatus, string> = {
  abierto: 'Abierto',
  en_revision: 'En revision',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}
