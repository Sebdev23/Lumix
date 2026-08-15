// Hoja de compromisos: la reunion semanal del equipo.
//
// QUE PROBLEMA RESUELVE
//
// Hoy la reunion se hace sobre la minuta completa: 112 temas abiertos de los cuales solo 18
// vencen esta semana. Se revisa todo, se avanza en nada. "Periodismo en vez de gestion".
//
// Esta hoja muestra UNA ventana: lo que se comprometio para esta semana. Ni lo de mas
// adelante ni lo que no tiene fecha.
//
// Y SOLO lo que nacio de la minuta. Un compromiso es algo que alguien tomo delante del
// equipo en la reunion; una actividad creada desde el chat es trabajo propio y no se le
// rinde cuentas a nadie en la reunion semanal. Mezclarlas volvia la hoja otra lista de
// tareas mas, que es justo lo que se queria evitar.
//
// DE DONDE SALE EL MODELO
//
// Del Level 10 Meeting de EOS, que es el estandar de la industria para esta reunion:
//   * el repaso es BINARIO -hecho / no hecho-, sin explicaciones, en unos 5 minutos
//   * la meta sana es 90% de cumplimiento semanal
//   * lo no hecho se mueve a la semana siguiente o baja a "temas a discutir" si hay un
//     bloqueo de fondo que merece conversacion
//   * nada deberia quedar mas de dos semanas dando vueltas
//
// Por eso la UI prioriza la velocidad de marcar por sobre la riqueza de datos: en una
// reunion de 5 minutos, un formulario mata la dinamica.
//
// NO HAY TABLA NUEVA. Un compromiso es una actividad con fecha de entrega en la ventana.
// Los datos ya existen (due_date, completed_at que pone un trigger), y duplicarlos en otra
// tabla habria creado justamente el problema que estamos tratando de deshacer.

import { useState, useEffect, useCallback } from 'react'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { minutesService } from '@infrastructure/supabase/minutes.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import type { Activity, Profile } from '@shared/types'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Lunes a domingo de la semana desplazada N semanas desde hoy. */
export function semanaDe(offset: number): { desde: Date; hasta: Date; etiqueta: string } {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  const aLunes = (d.getDay() + 6) % 7
  const desde = new Date(d)
  desde.setDate(d.getDate() - aLunes)
  desde.setHours(0, 0, 0, 0)
  const hasta = new Date(desde)
  hasta.setDate(desde.getDate() + 6)
  hasta.setHours(23, 59, 59, 999)
  return {
    desde,
    hasta,
    etiqueta: `${desde.getDate()} ${MESES[desde.getMonth()]} – ${hasta.getDate()} ${MESES[hasta.getMonth()]}`,
  }
}

export interface Compromiso extends Activity {
  /** Se cerro dentro del plazo. Solo tiene sentido si esta completada. */
  aTiempo: boolean
  /** Dias que lleva vencida sin cerrarse. 0 si no esta vencida. */
  diasVencida: number
  /** Ya se escalo a la minuta para conversarse. */
  enMinuta: boolean
}

export interface GrupoPersona {
  id: string
  nombre: string
  avatar: string | null
  compromisos: Compromiso[]
  cumplidos: number
  /** Mismo resumen que el general de arriba, pero de esta persona. */
  total: number
  porcentaje: number | null
  vencidos: number
}

export function useCompromisos() {
  const [todas, setTodas] = useState<Activity[]>([])
  const [miembros, setMiembros] = useState<Profile[]>([])
  // Actividades que ya tienen un tema de minuta esperando conversacion. Sin esto la fila no
  // cambiaba al escalarla y la gente volvia a apretar el boton: pasó de verdad, tres temas
  // identicos en 25 segundos.
  const [escaladas, setEscaladas] = useState<Set<string>>(new Set())
  // Actividades nacidas de un tema de minuta: son las unicas que cuentan como compromiso.
  const [deMinuta, setDeMinuta] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const { profile } = useAuth()
  const { canViewAllActivities, isGlobalAdmin } = useCapabilities()
  const teamId = profile?.team_id ?? ''

  const load = useCallback(async () => {
    if (!teamId) return
    const [acts, gente, temas] = await Promise.all([
      activitiesService.getByTeam(teamId),
      profilesService.getByTeam(teamId),
      minutesService.getByTeam(teamId, 'minuta'),
    ])
    setTodas(acts)
    setMiembros(gente)
    setEscaladas(
      new Set(
        temas
          .filter((t) => t.estado === 'definir')
          .flatMap((t) => t.linked_activity_ids as string[]),
      ),
    )
    setDeMinuta(new Set(temas.flatMap((t) => t.linked_activity_ids as string[])))
    setLoading(false)
  }, [teamId])

  useEffect(() => {
    if (!profile) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [profile, load])

  const { desde, hasta, etiqueta } = semanaDe(offset)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  // Quien ve a quien: la misma regla del resto de la app. Un colaborador ve lo suyo; quien
  // puede ver todo el equipo, ve a todos. La reunion la conduce esa persona.
  const visibles = todas.filter((a) => {
    // Nacio de un tema de minuta. Esto reemplaza al filtro por prefijo "[Ingesta]" que habia
    // antes: una actividad suelta ya no entra por ningun lado, venga de donde venga.
    if (!deMinuta.has(a.id)) return false
    const d = new Date(a.due_date)
    if (d < desde || d > hasta) return false
    if (!canViewAllActivities && !isGlobalAdmin && a.responsible_id !== profile?.id) return false
    return true
  })

  const decorar = (a: Activity): Compromiso => {
    const vence = new Date(a.due_date)
    vence.setHours(0, 0, 0, 0)
    const completada = a.status === 'completado'
    return {
      ...a,
      aTiempo: completada && !!a.completed_at && new Date(a.completed_at) <= new Date(a.due_date),
      diasVencida:
        !completada && vence < hoy ? Math.floor((hoy.getTime() - vence.getTime()) / 86_400_000) : 0,
      enMinuta: escaladas.has(a.id),
    }
  }

  const compromisos = visibles.map(decorar)

  // Agrupado por persona: la reunion recorre "que te toco a ti", no una lista plana.
  const porPersona: GrupoPersona[] = miembros
    .map((m) => {
      const suyos = compromisos.filter((c) => c.responsible_id === m.id)
      const cumplidos = suyos.filter((c) => c.status === 'completado').length
      return {
        id: m.id,
        nombre: m.full_name,
        avatar: m.avatar_url ?? null,
        // Lo no cumplido primero: en la reunion es lo que hay que conversar.
        compromisos: suyos.sort((a, b) => {
          const ha = a.status === 'completado' ? 1 : 0
          const hb = b.status === 'completado' ? 1 : 0
          return ha !== hb ? ha - hb : a.due_date.localeCompare(b.due_date)
        }),
        cumplidos,
        total: suyos.length,
        porcentaje: suyos.length ? Math.round((cumplidos / suyos.length) * 100) : null,
        vencidos: suyos.filter((c) => c.diasVencida > 0).length,
      }
    })
    .filter((g) => g.compromisos.length > 0)
    .sort((a, b) => b.compromisos.length - a.compromisos.length)

  const total = compromisos.length
  const cumplidos = compromisos.filter((c) => c.status === 'completado').length
  const resumen = {
    total,
    cumplidos,
    aTiempo: compromisos.filter((c) => c.aTiempo).length,
    vencidos: compromisos.filter((c) => c.diasVencida > 0).length,
    // El 90% es la referencia de EOS para un equipo sano, no un invento.
    porcentaje: total ? Math.round((cumplidos / total) * 100) : null,
    meta: 90,
  }

  /** Marca hecho o deshecho. El trigger de la base pone completed_at. */
  const marcar = async (id: string, hecha: boolean) => {
    const anterior = todas
    setTodas((cur) =>
      cur.map((a) => (a.id === id ? { ...a, status: hecha ? 'completado' : 'pendiente' } : a)),
    )
    try {
      await activitiesService.update(id, { status: hecha ? 'completado' : 'pendiente' })
      await load() // para traer el completed_at que puso el trigger
    } catch (err) {
      setTodas(anterior)
      throw err
    }
  }

  /** Mueve el compromiso a la semana siguiente (regla de EOS: se arrastra o se discute). */
  const moverUnaSemana = async (a: Activity) => {
    const nueva = new Date(a.due_date)
    nueva.setDate(nueva.getDate() + 7)
    const iso = nueva.toISOString()
    const anterior = todas
    setTodas((cur) => cur.map((x) => (x.id === a.id ? { ...x, due_date: iso } : x)))
    try {
      await activitiesService.update(a.id, { due_date: iso })
    } catch (err) {
      setTodas(anterior)
      throw err
    }
  }

  /**
   * Baja el compromiso a la minuta como tema a discutir.
   *
   * Es la valvula de escape del modelo: si algo no se hizo porque hay un bloqueo de fondo,
   * moverlo de semana otra vez no resuelve nada. Vuelve a la minuta, que es donde se
   * conversa, y la actividad queda vinculada para no perder el hilo.
   */
  const llevarAMinuta = async (a: Activity) => {
    if (!profile) return
    // Idempotente: si ya hay un tema esperando conversacion para esta actividad, no se crea
    // otro. La UI ademas desactiva el boton, pero la guardia va aca por si se hace doble
    // clic antes de que el estado se actualice.
    if (escaladas.has(a.id)) return
    setEscaladas((cur) => new Set(cur).add(a.id))
    const existentes = await minutesService.getByTeam(teamId, 'minuta')
    await minutesService
      .create({
        team_id: teamId,
        tipo: 'minuta',
        orden: existentes.length,
        tema: a.title,
        para_todos: false,
        responsables: a.responsible_id ? [a.responsible_id] : [],
        responsables_text: '',
        estado: 'definir',
        plazo: a.due_date.split('T')[0],
        comentarios: 'Vino de la hoja de compromisos: no se cumplio y necesita conversarse.',
        linked_activity_ids: [a.id],
        created_by: profile.id,
      })
      .catch((err) => {
        setEscaladas((cur) => {
          const n = new Set(cur)
          n.delete(a.id)
          return n
        })
        throw err
      })
  }

  return {
    porPersona,
    resumen,
    loading,
    offset,
    setOffset,
    etiqueta,
    esSemanaActual: offset === 0,
    marcar,
    moverUnaSemana,
    llevarAMinuta,
    reload: load,
  }
}
