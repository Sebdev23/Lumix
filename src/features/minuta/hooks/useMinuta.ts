import { useState, useEffect, useCallback } from 'react'
import { minutesService } from '@infrastructure/supabase/minutes.service'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { formatDateLocal } from '@shared/utils/date'
import type { Activity, MinuteEstado, MinuteItem, Profile } from '@shared/types'

export const estadoLabels: Record<MinuteEstado, string> = {
  pendiente: 'Pendiente',
  en_desarrollo: 'En desarrollo',
  resuelto: 'Resuelto',
  definir: 'Definir en reunion',
}

// Estado efectivo: si el tema tiene actividades vinculadas, se deriva de ellas (sincronizado).
function deriveEstado(item: MinuteItem, byId: Record<string, Activity>): MinuteEstado {
  const acts = item.linked_activity_ids.map((id) => byId[id]).filter(Boolean)
  if (acts.length === 0) return item.estado
  if (acts.every((a) => a.status === 'completado')) return 'resuelto'
  if (acts.some((a) => a.status !== 'pendiente')) return 'en_desarrollo'
  return 'pendiente'
}

export interface DecoratedItem extends MinuteItem {
  effectiveEstado: MinuteEstado
  linkedActivities: Activity[]
}

function addBusinessDays(date: Date, days: number): Date {
  const r = new Date(date)
  let added = 0
  while (added < days) {
    r.setDate(r.getDate() + 1)
    if (r.getDay() !== 0 && r.getDay() !== 6) added++
  }
  return r
}

export function useMinuta() {
  const [items, setItems] = useState<MinuteItem[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [activitiesById, setActivitiesById] = useState<Record<string, Activity>>({})
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'pendientes' | 'resueltos' | 'todos'>('pendientes')
  const [filterMember, setFilterMember] = useState<string>('todas')
  const [search, setSearch] = useState('')
  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''
  const canManage = profile?.role === 'admin' || profile?.role === 'jefatura'

  const load = useCallback(async () => {
    if (!teamId) return
    const [data, membersData, acts] = await Promise.all([
      minutesService.getByTeam(teamId),
      profilesService.getByTeam(teamId),
      activitiesService.getByTeam(teamId),
    ])
    setItems(data)
    setMembers(membersData)
    setActivitiesById(Object.fromEntries(acts.map((a) => [a.id, a])))
    setLoading(false)
  }, [teamId])

  useEffect(() => {
    if (!user || !teamId) return
    let cancelled = false
    // load() es async: los setState ocurren tras el await (no sincronicamente en el effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    let channel: Awaited<ReturnType<typeof minutesService.subscribeToTeam>>
    minutesService
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
  }, [user, teamId, load])

  // Decorar con estado efectivo (sincronizado) y actividades vinculadas
  const decorated: DecoratedItem[] = items.map((it) => ({
    ...it,
    effectiveEstado: deriveEstado(it, activitiesById),
    linkedActivities: it.linked_activity_ids.map((id) => activitiesById[id]).filter(Boolean),
  }))

  // Filtro base: responsable + busqueda de texto (aplica a los contadores)
  const q = search.trim().toLowerCase()
  const base = decorated.filter((it) => {
    if (filterMember !== 'todas' && !it.responsables.includes(filterMember)) return false
    if (q && !`${it.tema} ${it.comentarios}`.toLowerCase().includes(q)) return false
    return true
  })

  // Vista por estado
  const visible = base.filter((it) =>
    view === 'todos'
      ? true
      : view === 'resueltos'
        ? it.effectiveEstado === 'resuelto'
        : it.effectiveEstado !== 'resuelto',
  )

  const counts = {
    pendientes: base.filter((it) => it.effectiveEstado !== 'resuelto').length,
    resueltos: base.filter((it) => it.effectiveEstado === 'resuelto').length,
    todos: base.length,
  }

  const addItem = async (tema: string): Promise<string | null> => {
    if (!user || !teamId) return null
    const created = await minutesService.create({
      team_id: teamId,
      orden: items.length,
      tema: tema || 'Nuevo tema',
      para_todos: false,
      responsables: [],
      responsables_text: '',
      estado: 'pendiente',
      plazo: null,
      comentarios: '',
      linked_activity_ids: [],
      created_by: user.id,
    })
    await load()
    return created.id
  }

  const updateItem = async (id: string, patch: Partial<MinuteItem>) => {
    await minutesService.update(id, patch)
    await load()
  }

  // Cambio de plazo con trazabilidad. La PRIMERA asignacion no cuenta como cambio;
  // el contador solo sube cuando ya habia una fecha previa.
  const changePlazo = async (item: MinuteItem, newPlazo: string | null) => {
    if ((item.plazo ?? null) === (newPlazo ?? null)) return
    const hadPlazo = !!item.plazo
    const history = [...(item.plazo_history ?? [])]
    if (newPlazo) history.push({ date: newPlazo, at: new Date().toISOString() })
    await minutesService.update(item.id, {
      plazo: newPlazo,
      plazo_change_count: (item.plazo_change_count ?? 0) + (hadPlazo ? 1 : 0),
      plazo_history: history,
    })
    await load()
  }

  const removeItem = async (id: string) => {
    await minutesService.remove(id)
    await load()
  }

  // Crea una actividad por cada responsable elegido y las vincula al tema (estado sincronizado)
  const createActivitiesFromItem = async (
    item: MinuteItem,
    opts: { responsibleIds: string[]; priority: number; dueDate: string | null },
  ) => {
    if (!user || !teamId) return
    const due = opts.dueDate
      ? new Date(opts.dueDate + 'T00:00:00').toISOString()
      : addBusinessDays(new Date(), 6).toISOString()
    const newIds: string[] = []

    for (const rid of opts.responsibleIds) {
      const activity = await activitiesService.create({
        title: item.tema,
        description: item.comentarios || `Foco de reunion: ${item.tema}`,
        responsible_id: rid,
        priority: opts.priority,
        status: 'pendiente',
        due_date: due,
        dependencies: [],
        observations: 'Origen: Minuta semanal',
        team_id: teamId,
        created_by: user.id,
      })
      newIds.push(activity.id)
      if (rid !== user.id) {
        try {
          await notificationsService.send(rid, {
            title: 'Nueva actividad (Minuta)',
            body: `"${item.tema}" - Entrega: ${formatDateLocal(due)}`,
            type: 'deadline_soon',
            metadata: { activity_id: activity.id },
          })
        } catch (err) {
          console.error('Notify failed:', err)
        }
      }
    }

    const mergedResp = Array.from(new Set([...item.responsables, ...opts.responsibleIds]))
    await minutesService.update(item.id, {
      linked_activity_ids: [...item.linked_activity_ids, ...newIds],
      responsables: mergedResp,
      estado: 'en_desarrollo',
    })
    await load()
    return newIds.length
  }

  return {
    items: visible,
    allItems: decorated,
    counts,
    members,
    loading,
    view,
    setView,
    filterMember,
    setFilterMember,
    search,
    setSearch,
    canManage,
    addItem,
    updateItem,
    changePlazo,
    removeItem,
    createActivitiesFromItem,
    reload: load,
  }
}
