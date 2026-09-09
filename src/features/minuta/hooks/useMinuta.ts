import { useState, useEffect, useCallback } from 'react'
import { minutesService } from '@infrastructure/supabase/minutes.service'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { teamsService, type GrupoTrabajo } from '@infrastructure/supabase/teams.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { formatDateLocal, parseDateLocal } from '@shared/utils/date'
import { deriveEstado } from '@shared/utils/compromisos'
import type {
  Activity,
  EstadoIngesta,
  HojaTipo,
  MinuteEstado,
  MinuteItem,
  Profile,
} from '@shared/types'

const MESES_ABBR = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

export const estadoLabels: Record<MinuteEstado, string> = {
  pendiente: 'Pendiente',
  en_desarrollo: 'En desarrollo',
  resuelto: 'Resuelto',
  definir: 'Definir en reunion',
}

// Estado propio de Ingesta (migracion 045, reformulacion pedida por Sebastian): una solicitud
// a otro equipo no se "conversa en la reunion" ni se "asigna" como un tema de minuta, se
// resuelve o no. Se descarto un sexto valor "cerrado" -Sebastian lo considero redundante con
// "completado"-.
export const estadoIngestaLabels: Record<EstadoIngesta, string> = {
  no_iniciado: 'No iniciado',
  en_proceso: 'En proceso',
  completado: 'Completado',
  no_resuelto: 'No resuelto',
  cancelado: 'Cancelado',
}

// "Activa" = todavia hay algo que hacer/seguir; el resto queda trazable pero fuera de los
// pendientes activos (mismo criterio que pidio Sebastian: completado/no resuelto/cancelado
// no cuentan como pendiente, pero no se borran).
export const esActivaIngesta = (estado?: EstadoIngesta | null): boolean =>
  estado === 'en_proceso' || !estado || estado === 'no_iniciado'

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

/**
 * Hoja de temas de un equipo: la minuta semanal o la de ingesta.
 *
 * Las dos son la misma estructura (tema, responsables, estado, plazo con historial,
 * comentarios, actividades vinculadas), asi que comparten hook, servicio y tabla; solo
 * cambia el filtro por tipo y que permiso se exige para escribir. Ver migracion 033.
 */
export function useMinuta(tipo: HojaTipo = 'minuta') {
  const [items, setItems] = useState<MinuteItem[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [activitiesById, setActivitiesById] = useState<Record<string, Activity>>({})
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'pendientes' | 'asignados' | 'resueltos' | 'todos'>('pendientes')
  const [filterMember, setFilterMember] = useState<string>('todas')
  const [filterGrupo, setFilterGrupo] = useState<string>('todas')
  const [gruposDisponibles, setGruposDisponibles] = useState<GrupoTrabajo[]>([])
  const [grupoPorUsuario, setGrupoPorUsuario] = useState<Record<string, string | null>>({})
  const [search, setSearch] = useState('')
  const [weekMode, setWeekMode] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0) // 0 = semana actual, -1 = anterior, etc.
  // Filtro de rango de fechas: solo lo usa Ingesta (dos fechas propias, ver Fase 13 del
  // plan) -Minuta sigue con weekMode/"Por semana", que es otro concepto (actividad esa
  // semana, no un rango elegido a mano). 'solicitud' = created_at, 'compromiso' = plazo.
  const [dateType, setDateType] = useState<'solicitud' | 'compromiso'>('compromiso')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { user, profile } = useAuth()
  const { canManageMinuta, canDeleteMinuta, canAssignMinuta, canManageIngestas } = useCapabilities()
  const teamId = profile?.team_id ?? ''
  const esIngesta = tipo === 'ingesta'
  // Cada hoja se gobierna con su propio permiso: administrar ingestas no deberia exigir
  // permiso de minuta. Coincide con lo que exige la RLS (funcion puede_escribir_hoja).
  const puedeGestionar = esIngesta ? canManageIngestas : canManageMinuta
  const puedeEliminar = esIngesta ? canManageIngestas : canDeleteMinuta

  const load = useCallback(async () => {
    if (!teamId) return
    const [data, membersData, acts] = await Promise.all([
      minutesService.getByTeam(teamId, tipo),
      profilesService.getByTeam(teamId),
      activitiesService.getByTeam(teamId),
    ])
    setItems(data)
    setMembers(membersData)
    setActivitiesById(Object.fromEntries(acts.map((a) => [a.id, a])))
    setLoading(false)
  }, [teamId, tipo])

  // Grupos de trabajo (alias "foco", migracion 043): filtro por equipo, solo lo usa jefatura
  // -la UI decide si mostrar el selector, aca solo se resuelven los datos-.
  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    Promise.all([teamsService.getGrupos(teamId), teamsService.getMembers(teamId)]).then(
      ([grupos, miembros]) => {
        if (cancelled) return
        setGruposDisponibles(grupos)
        const map: Record<string, string | null> = {}
        miembros.forEach((m) => {
          map[m.user_id] = m.grupo_id ?? null
        })
        setGrupoPorUsuario(map)
      },
    )
    return () => {
      cancelled = true
    }
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
    // Tambien escuchamos cambios en actividades: si una actividad vinculada cambia de estado
    // (ej. "en proceso" / "completado") en otro modulo, el estado del tema se re-sincroniza.
    let actChannel: Awaited<ReturnType<typeof activitiesService.subscribeToTeam>>
    activitiesService
      .subscribeToTeam(teamId, () => {
        if (!cancelled) load()
      })
      .then((ch) => {
        actChannel = ch
      })
    return () => {
      cancelled = true
      channel?.unsubscribe()
      actChannel?.unsubscribe()
    }
  }, [user, teamId, load])

  // Decorar con estado efectivo (sincronizado) y actividades vinculadas
  const decorated: DecoratedItem[] = items.map((it) => ({
    ...it,
    effectiveEstado: deriveEstado(it, activitiesById),
    linkedActivities: it.linked_activity_ids.map((id) => activitiesById[id]).filter(Boolean),
  }))

  // Rango de la semana seleccionada (modo semana)
  let weekFrom: Date | null = null
  let weekTo: Date | null = null
  let weekLabel = ''
  if (weekMode) {
    const d = new Date()
    d.setDate(d.getDate() + weekOffset * 7)
    const diffToMon = (d.getDay() + 6) % 7
    weekFrom = new Date(d)
    weekFrom.setDate(d.getDate() - diffToMon)
    weekFrom.setHours(0, 0, 0, 0)
    weekTo = new Date(weekFrom)
    weekTo.setDate(weekFrom.getDate() + 6)
    weekTo.setHours(23, 59, 59, 999)
    weekLabel = `${weekFrom.getDate()} ${MESES_ABBR[weekFrom.getMonth()]} – ${weekTo.getDate()} ${MESES_ABBR[weekTo.getMonth()]}`
  }
  const inWeek = (ts?: string | null) => {
    if (!ts || !weekFrom || !weekTo) return false
    const t = new Date(ts).getTime()
    return t >= weekFrom.getTime() && t <= weekTo.getTime()
  }
  // Un tema tuvo "actividad esa semana" si se creo/edito, o una actividad vinculada cambio/completo.
  const hadActivityInWeek = (it: DecoratedItem) =>
    inWeek(it.created_at) ||
    inWeek(it.updated_at) ||
    it.linkedActivities.some(
      (a) => inWeek(a.created_at) || inWeek(a.updated_at) || inWeek(a.completed_at),
    )

  // Un tema "contenedor" puede no tener responsable propio y dejar todo el trabajo real en
  // sus subtareas (ej. "Seguimiento de X" con responsables: [], y el trabajo de verdad
  // colgado como subtareas de una persona). El filtro de grupo tiene que mirar tambien ahi
  // -si no, ese tema desaparece del filtro aunque su gente si pertenezca al grupo elegido
  // (bug real reportado por Sebastian: el filtro "no funcionaba" para temas asi).
  const perteneceAlGrupo = (it: DecoratedItem): boolean => {
    if (it.responsables.some((r) => grupoPorUsuario[r] === filterGrupo)) return true
    return decorated
      .filter((d) => d.parent_item_id === it.id)
      .some((hijo) => perteneceAlGrupo(hijo))
  }

  // Filtro base: responsable + busqueda + (semana si esta activo). Aplica a los contadores.
  // Los sub-temas (parent_item_id no nulo) no entran aca: viven anidados bajo su tema padre
  // -ver SubtareasPanel en MinutaPage-, si no la lista principal se duplica con cada
  // descomposicion en sub-tareas, que es justo el ruido que esta pantalla evita.
  const q = search.trim().toLowerCase()
  // Rango de fechas (Ingesta): 'solicitud' mira created_at, 'compromiso' mira plazo. Un item
  // sin plazo no matchea un filtro por compromiso -no tiene sentido "incluirlo igual", si no
  // hay fecha no hay como saber si cae en el rango.
  const enRangoFecha = (it: MinuteItem) => {
    if (!dateFrom || !dateTo) return true
    const campo = dateType === 'solicitud' ? it.created_at : it.plazo
    if (!campo) return false
    const d = parseDateLocal(campo)
    const from = parseDateLocal(dateFrom + 'T00:00:00')
    const to = parseDateLocal(dateTo + 'T23:59:59')
    return d >= from && d <= to
  }
  const base = decorated.filter((it) => {
    if (it.parent_item_id) return false
    if (filterMember !== 'todas' && !it.responsables.includes(filterMember)) return false
    if (filterGrupo !== 'todas' && !perteneceAlGrupo(it)) return false
    if (q && !`${it.tema} ${it.comentarios}`.toLowerCase().includes(q)) return false
    if (weekMode && !hadActivityInWeek(it)) return false
    if (esIngesta && !enRangoFecha(it)) return false
    return true
  })

  // VISTAS
  //
  // "Pendientes" es lo que se conversa en la reunion: temas que TODAVIA no se asignaron.
  // Un tema que ya genero actividades sale de ahi -su seguimiento pasa a Compromisos- pero
  // no se borra: queda en "Asignados" y en "Todos", con el vinculo intacto.
  //
  // Elegir a una persona en el desplegable NO cuenta como asignar: mientras no se apriete
  // "Asignar actividad" el tema sigue en Pendientes. Es a proposito, y ademas se corrige
  // solo: el tema queda a la vista incomodando hasta que alguien complete el paso.
  const resuelto = (it: DecoratedItem) => it.effectiveEstado === 'resuelto'

  // "Definir en reunion" es literalmente el estado de lo que hay que conversar, asi que un
  // tema marcado asi va a la lista de discusion AUNQUE tenga actividad vinculada. Es el caso
  // de lo que vuelve desde la hoja de compromisos: no se cumplio, hay un bloqueo de fondo, y
  // moverlo de semana otra vez no resuelve nada. Sin esta excepcion caia en "Asignados", que
  // es justo la pestaña donde nadie lo iba a discutir.
  //
  // Se mira el estado CRUDO y no el efectivo: el efectivo lo pisan las actividades vinculadas.
  const paraConversar = (it: DecoratedItem) =>
    it.linked_activity_ids.length === 0 || it.estado === 'definir'

  // Ingesta tiene su propio criterio de vistas (estado_ingesta), nada que ver con
  // paraConversar/resuelto -esos son conceptos de Minuta/Proyecto (se conversa en la
  // reunion, se asigna una actividad). Se reusan los mismos NOMBRES de vista
  // ('pendientes'/'resueltos'/'todos') para no duplicar el tipo de `view`, pero el
  // significado para Ingesta es "Activas"/"Resueltas"/"Todas" (MinutaPage decide las
  // etiquetas y oculta la pestaña "asignados", que no aplica aca).
  const visible = base.filter((it) => {
    if (esIngesta) {
      if (view === 'todos') return true
      if (view === 'resueltos') return !esActivaIngesta(it.estado_ingesta)
      return esActivaIngesta(it.estado_ingesta)
    }
    if (view === 'todos') return true
    if (view === 'resueltos') return resuelto(it)
    if (view === 'asignados') return !paraConversar(it) && !resuelto(it)
    return paraConversar(it) && !resuelto(it)
  })

  const counts = esIngesta
    ? {
        pendientes: base.filter((it) => esActivaIngesta(it.estado_ingesta)).length,
        asignados: 0,
        resueltos: base.filter((it) => !esActivaIngesta(it.estado_ingesta)).length,
        todos: base.length,
      }
    : {
        pendientes: base.filter((it) => paraConversar(it) && !resuelto(it)).length,
        asignados: base.filter((it) => !paraConversar(it) && !resuelto(it)).length,
        resueltos: base.filter(resuelto).length,
        todos: base.length,
      }

  const addItem = async (
    tema: string,
    parentItemId: string | null = null,
  ): Promise<string | null> => {
    if (!user || !teamId) return null
    const created = await minutesService.create({
      team_id: teamId,
      tipo,
      orden: items.length,
      tema: tema || 'Nuevo tema',
      para_todos: false,
      responsables: [],
      responsables_text: '',
      // `estado` no se usa para Ingesta (columna NOT NULL, se llena igual); estado_ingesta
      // es el que de verdad importa para esa hoja.
      estado: 'pendiente',
      estado_ingesta: esIngesta ? 'no_iniciado' : null,
      plazo: null,
      comentarios: '',
      linked_activity_ids: [],
      created_by: user.id,
      parent_item_id: parentItemId,
    })
    // La fila creada ya viene completa desde la base: se agrega y listo, sin recargar.
    setItems((cur) => [...cur, created])
    return created.id
  }

  /**
   * Inserta varios temas de una planilla ya validada.
   *
   * Se insertan uno por uno y no en lote a proposito: si una fila falla en la base (por
   * ejemplo el CHECK del estado), las demas igual entran y se informa cual quedo fuera.
   * Un insert en lote falla entero y deja al usuario sin saber cual de las cincuenta filas
   * fue el problema.
   */
  const bulkAdd = async (
    filas: {
      tema: string
      responsables: string[]
      responsablesText: string
      estado: MinuteEstado
      plazo: string | null
      comentarios: string
      paraTodos: boolean
      linea: number
    }[],
  ): Promise<{ creados: number; fallidos: { linea: number; motivo: string }[] }> => {
    if (!user || !teamId) return { creados: 0, fallidos: [] }

    let orden = items.length
    let creados = 0
    const fallidos: { linea: number; motivo: string }[] = []

    for (const f of filas) {
      try {
        await minutesService.create({
          team_id: teamId,
          tipo,
          orden: orden++,
          tema: f.tema,
          para_todos: f.paraTodos,
          responsables: f.responsables,
          responsables_text: f.responsablesText,
          estado: f.estado,
          plazo: f.plazo,
          comentarios: f.comentarios,
          linked_activity_ids: [],
          created_by: user.id,
        })
        creados++
      } catch (err) {
        fallidos.push({
          linea: f.linea,
          motivo: err instanceof Error ? err.message : 'Error desconocido',
        })
      }
    }

    await load()
    return { creados, fallidos }
  }

  /**
   * Aplica el cambio en pantalla al instante y despues lo persiste.
   *
   * Antes cada click esperaba DOS viajes antes de mostrar nada: el update y un load()
   * completo, que ademas pide las tres consultas (temas, miembros y TODAS las actividades
   * del equipo: 166 en Analitica y BI) aunque solo hubieras cambiado un responsable. De ahi
   * el retraso entre tocar y ver.
   *
   * Recargar no aportaba nada: el unico cambio es el que acabamos de hacer. Si el guardado
   * falla, se revierte al estado anterior y se avisa; asi la pantalla nunca miente.
   *
   * Esto es seguro porque el realtime esta apagado (publicacion vacia, decision del equipo):
   * no hay eventos llegando por detras que puedan pisar el estado local.
   */
  const updateItem = async (id: string, patch: Partial<MinuteItem>) => {
    let anterior: MinuteItem | undefined
    setItems((cur) => {
      anterior = cur.find((i) => i.id === id)
      return cur.map((i) => (i.id === id ? { ...i, ...patch } : i))
    })
    try {
      await minutesService.update(id, patch)
    } catch (err) {
      if (anterior) setItems((cur) => cur.map((i) => (i.id === id ? anterior! : i)))
      throw err
    }
  }

  // Cambio de plazo con trazabilidad. La PRIMERA asignacion no cuenta como cambio;
  // el contador solo sube cuando ya habia una fecha previa.
  const changePlazo = async (item: MinuteItem, newPlazo: string | null) => {
    if ((item.plazo ?? null) === (newPlazo ?? null)) return
    const hadPlazo = !!item.plazo
    const history = [...(item.plazo_history ?? [])]
    if (newPlazo) history.push({ date: newPlazo, at: new Date().toISOString() })
    // Mismo criterio que updateItem: se pinta primero y se guarda despues.
    await updateItem(item.id, {
      plazo: newPlazo,
      plazo_change_count: (item.plazo_change_count ?? 0) + (hadPlazo ? 1 : 0),
      plazo_history: history,
    })

    // El plazo tambien es la entrega de los compromisos que nacieron de este tema (ver
    // createActivitiesFromItem). Sin este paso, Compromisos seguia mostrando la fecha vieja
    // aunque el equipo ya la hubiera renegociado en la Minuta -y la marcaba vencida sin
    // estarlo-. Las actividades ya completadas no se tocan: su cierre es historia, no algo
    // que renegociar.
    if (newPlazo) {
      const dueDateISO = new Date(newPlazo + 'T00:00:00').toISOString()
      const pendientes = item.linked_activity_ids
        .map((id) => activitiesById[id])
        .filter((a): a is Activity => !!a && a.status !== 'completado')
      if (pendientes.length) {
        await Promise.all(
          pendientes.map((a) => activitiesService.update(a.id, { due_date: dueDateISO })),
        )
        await load()
      }
    }
  }

  const removeItem = async (id: string) => {
    let anterior: MinuteItem[] = []
    setItems((cur) => {
      anterior = cur
      return cur.filter((i) => i.id !== id)
    })
    try {
      await minutesService.remove(id)
    } catch (err) {
      setItems(anterior)
      throw err
    }
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
      // responsables_text es el nombre libre que trae un tema cargado desde planilla, ANTES
      // de tener un responsable real del sistema. Una vez que se asigna de verdad, se limpia:
      // si no, responsablesLabel() lo sigue sumando y queda mostrando un nombre viejo junto
      // al responsable real (caso real: "Felipe Quintanilla" colgado despues de reasignar a
      // "Juan Diaz").
      responsables_text: '',
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
    filterGrupo,
    setFilterGrupo,
    gruposDisponibles,
    search,
    setSearch,
    weekMode,
    setWeekMode,
    weekOffset,
    setWeekOffset,
    weekLabel,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    tipo,
    canManage: puedeGestionar,
    canDelete: puedeEliminar,
    canAssign: canAssignMinuta,
    addItem,
    bulkAdd,
    updateItem,
    changePlazo,
    removeItem,
    createActivitiesFromItem,
    reload: load,
  }
}
