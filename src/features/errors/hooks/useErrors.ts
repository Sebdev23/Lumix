import { useState, useEffect } from 'react'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { parseDateLocal } from '@shared/utils/date'
import { useToast } from '@shared/components/ui/Toast'
import type { AppError, ErrorSeverity, ErrorStatus, Profile } from '@shared/types'

const SEVERITY_ORDER: Record<ErrorSeverity, number> = { critica: 0, alta: 1, media: 2, baja: 3 }

export function useErrors() {
  const [errors, setErrors] = useState<AppError[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<ErrorStatus | 'todas' | 'activos'>('todas')
  const [dateType, setDateType] = useState<'reportadas' | 'cerradas'>('reportadas')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const { user, profile } = useAuth()
  const { isInvitado } = useCapabilities()
  const teamId = profile?.team_id ?? ''
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

  // Base de contadores: aplica fecha, pero NO el filtro de estado
  let countBase = errors

  if (dateFrom && dateTo) {
    const datePredicate = (e: AppError) => {
      const field = dateType === 'cerradas' ? e.closed_at : e.date
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
    const matches = (e: AppError) => `${e.title} ${e.description ?? ''}`.toLowerCase().includes(q)
    filtered = filtered.filter(matches)
    countBase = countBase.filter(matches)
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
    // "Reabrir" ya no vuelve a 'abierto' (ese estado no se usa mas al crear, ver
    // createError/createErrorFromMessage): vuelve a 'en_revision' ("En proceso"), el mismo
    // estado inicial real. Se detecta el reabrir por el estado ANTERIOR (resuelto/cerrado),
    // no por el nuevo, para poder avisar al equipo igual que antes.
    const previo = errors.find((e) => e.id === id)
    const esReabrir =
      previo &&
      (previo.status === 'resuelto' || previo.status === 'cerrado') &&
      (newStatus === 'en_revision' || newStatus === 'abierto')
    try {
      await errorsService.update(id, { status: newStatus })

      if (esReabrir && previo) {
        await notificationsService.sendToTeam(
          teamId,
          {
            title: 'Error reabierto',
            body: previo.title,
            type: 'critical_error',
            metadata: { error_id: id },
          },
          { exceptUserId: user?.id },
        )
      }

      await reloadErrors()
      toast.success('Estado actualizado')
    } catch {
      toast.error('No se pudo actualizar el estado')
    }
  }

  /** Crea un error directo desde la Bitacora (antes solo se podia por chat), en pantalla y sin
   * modal: fila en blanco que se completa inline, mismo patron que addItem('') en Ingesta.
   * Arranca directo en 'en_revision' ("En proceso"), sin pasar por 'abierto' -a pedido de
   * Sebastian. Severidad/responsable-por-area quedan sin usar en esta pantalla (columnas
   * simplificadas a pedido: Transaccion o query, Comentario, Quien lo levanto, Fecha de
   * creacion, Estado, Fecha de cierre); las columnas siguen existiendo en la base. */
  const createError = async (title = ''): Promise<string | null> => {
    if (!user || !teamId) return null
    const now = new Date()
    const created = await errorsService.create({
      title: title || 'Nuevo error',
      description: '',
      severity: 'media',
      responsible_id: user.id,
      status: 'en_revision',
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().slice(0, 8),
      team_id: teamId,
      created_by: user.id,
    })
    setErrors((cur) => [created, ...cur])
    return created.id
  }

  /** Edicion inline generica (titulo/comentario): actualiza la base y el estado local sin
   * recargar todo, mismo criterio que guardar() en useMinuta. */
  const updateField = async (id: string, updates: Partial<AppError>) => {
    try {
      const updated = await errorsService.update(id, updates)
      setErrors((cur) => cur.map((e) => (e.id === id ? updated : e)))
    } catch {
      toast.error('No se pudo guardar')
    }
  }

  return {
    errors: filtered,
    members,
    loading,
    filterStatus,
    setFilterStatus,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    search,
    setSearch,
    changeStatus,
    createError,
    updateField,
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

// 'en_revision' se muestra como "En proceso": desde que se crea directo en ese estado
// (createError/createErrorFromMessage ya no pasan por 'abierto'), es el nombre que
// corresponde. 'abierto' se deja en el tipo/enum por datos viejos, pero ya no se usa al
// crear ni al reabrir.
export const errorStatusLabels: Record<ErrorStatus, string> = {
  abierto: 'Abierto',
  en_revision: 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}
