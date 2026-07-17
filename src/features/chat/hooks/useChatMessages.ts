import { useState, useEffect, useRef } from 'react'
import { supabase } from '@infrastructure/supabase/client'
import { messagesService } from '@infrastructure/supabase/messages.service'
import {
  classifyMessage,
  classifyBulk,
  resolveUpdate,
  askQuestion,
  type ClassifyResult,
  type BulkActivity,
} from '@core/ai-engine/client'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { formatDateLocal } from '@shared/utils/date'
import type { ChatMessage, SendMessagePayload } from '@features/chat/types'
import type { Activity, ActivityStatus } from '@shared/types'

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  bloqueado: 'Bloqueado',
  falta_informacion: 'Falta info',
  esperando_aprobacion: 'Esperando aprobacion',
  completado: 'Completado',
}

// Verbos que sugieren que el mensaje MODIFICA una actividad existente (gate barato
// antes de llamar a la IA de actualizacion). La IA decide en definitiva (isUpdate).
const UPDATE_VERBS =
  /(\blist[oa]s?\b|complet|termin|finaliz|\bhech[oa]\b|mueve|p[aá]sala|p[aá]sale|reprogram|posterg|adelant|reasign|as[ií]gnal|bloque|desbloque|en proceso|falta info|esperando aprob|prioridad|cambia)/i

// Primer filtro para el popout: si el texto MENCIONA la palabra "error" o "ingesta",
// en modo Auto siempre preguntamos que tipo es (actividad / error / ingesta). Solo se salta
// si el usuario ya eligio el tipo con el selector del chat (ahi es explicito y no hay duda).
const MENTIONS_ERROR = /\berror(es)?\b/i
const MENTIONS_INGESTA = /\bingest(a|ar|as|ando|amos)\b/i

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++
    }
  }
  return result
}

const DEFAULT_DUE_DAYS = 6

function defaultDueDate(): string {
  return addBusinessDays(new Date(), DEFAULT_DUE_DAYS).toISOString()
}

// Normaliza para comparar nombres sin tildes ni mayusculas
function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

type Member = { id: string; full_name: string; avatar_url: string | null }

// Devuelve los miembros que mejor calzan con el nombre buscado.
// - 1 resultado => asignacion directa
// - 0 o >1 => se pide confirmacion en el chat
function matchMembers(searchName: string, members: Member[]): Member[] {
  const q = normalizeName(searchName)
  if (!q) return []

  const exact = members.filter((m) => normalizeName(m.full_name) === q)
  if (exact.length) return exact

  const qTokens = q.split(/\s+/).filter(Boolean)
  const scored = members
    .map((m) => {
      const nameTokens = normalizeName(m.full_name).split(/\s+/).filter(Boolean)
      const fullName = normalizeName(m.full_name)
      let score = 0
      for (const qt of qTokens) {
        if (nameTokens.some((nt) => nt === qt)) score += 3
        else if (nameTokens.some((nt) => nt.startsWith(qt) || qt.startsWith(nt))) score += 2
        else if (fullName.includes(qt)) score += 1
      }
      return { m, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return []
  const topScore = scored[0].score
  return scored.filter((x) => x.score === topScore).map((x) => x.m)
}

// Candidatos por coincidencia de titulo, para cuando la IA no logra identificar
// una sola actividad y hay que preguntar en el chat.
function pickActivityCandidates(text: string, activities: Activity[]): Activity[] {
  const q = normalizeName(text)
  const qTokens = q.split(/\s+/).filter((t) => t.length > 2)
  const scored = activities
    .map((a) => {
      const t = normalizeName(a.title)
      let score = 0
      for (const qt of qTokens) if (t.includes(qt)) score++
      return { a, score }
    })
    .sort((x, y) => y.score - x.score)
  const withScore = scored.filter((x) => x.score > 0)
  return (withScore.length ? withScore : scored).slice(0, 6).map((x) => x.a)
}

const NAME_STOPWORDS = new Set([
  'que',
  'cual',
  'cuales',
  'actividad',
  'actividades',
  'tarea',
  'tareas',
  'pendiente',
  'pendientes',
  'tiene',
  'tengo',
  'tienes',
  'esta',
  'semana',
  'para',
  'del',
  'los',
  'las',
  'mis',
  'son',
  'hay',
  'proxima',
  'proximo',
  'proximamente',
  'hoy',
  'manana',
  'muestra',
  'muestrame',
  'dame',
  'lista',
  'listar',
  'ver',
  'mias',
  'tengan',
  'tienen',
  'esas',
  'este',
  'mes',
  'dia',
  'fecha',
  'prioridad',
  'estado',
])

// Detecta si la pregunta menciona a uno (o varios) miembros del equipo.
function findMentionedMembers(question: string, members: Member[]): Member[] {
  const qTokens = normalizeName(question)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !NAME_STOPWORDS.has(t))
  if (!qTokens.length) return []

  const fullNames = members.map((m) => normalizeName(m.full_name))

  const scored = members
    .map((m, i) => {
      const nameTokens = normalizeName(m.full_name).split(/\s+/).filter(Boolean)
      const fullName = fullNames[i]
      let score = 0
      for (const qt of qTokens) {
        if (nameTokens.some((nt) => nt === qt)) score += 3
        else if (nameTokens.some((nt) => nt.startsWith(qt) || qt.startsWith(nt))) score += 2
        else if (fullName.includes(qt)) score += 1
      }
      return { m, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  if (!scored.length) return []
  const top = scored[0].score
  return scored.filter((x) => x.score === top).map((x) => x.m)
}

function weekRange(offsetWeeks = 0): { from: Date; to: Date } {
  const d = new Date()
  const diffToMon = (d.getDay() + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - diffToMon + offsetWeeks * 7)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return { from: mon, to: sun }
}

function dayRange(offsetDays = 0): { from: Date; to: Date } {
  const from = new Date()
  from.setDate(from.getDate() + offsetDays)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

// Interpreta el marco temporal mencionado en la pregunta.
function parseTimeframe(question: string): { from: Date; to: Date } | null {
  const n = normalizeName(question)
  if (/proxima semana|semana que viene|siguiente semana/.test(n)) return weekRange(1)
  if (/esta semana|semana actual/.test(n)) return weekRange(0)
  if (/\bhoy\b/.test(n)) return dayRange(0)
  if (/\bmanana\b/.test(n)) return dayRange(1)
  return null
}

function dueWithin(dueDate: string, range: { from: Date; to: Date }): boolean {
  const d = new Date(dueDate.split('T')[0] + 'T12:00:00')
  return d >= range.from && d <= range.to
}

// Mostrar tabla editable (no crear) cuando el usuario quiere gestionar varias:
//   - "cambiar/ver/modificar LAS de <persona/equipo>"  (plural + referencia)
//   - un verbo de gestion AL INICIO + palabra generica "actividades/tareas"
//     ("reasignar actividades", "modificar tareas", "quiero cambiar actividades")
// Se usan raices (stems) para tolerar typos: "modifcar", "activades", "reasignar".
function wantsEditList(content: string): boolean {
  const n = normalizeName(content)
  const editVerb = /(cambi|modif|edit|gestion|actualiz|reasign|most|muestr|\bver\b|revis)/.test(n)
  const pluralRef = /\b(las|los|todas|todos)\s+(de[l]?\b|que\b|tarea|activ|pendient|labor)/.test(n)
  const startsEdit =
    /^(reasign|cambi|modif|edit|gestion|actualiz|ver\b|mostr|muestr|revis|quiero\s+(cambi|modif|edit|ver|reasign|gestion))/.test(
      n,
    )
  const genericActs = /\b(activ|tarea|pendient)\w*/.test(n)
  return (editVerb && pluralRef) || (startsEdit && genericActs)
}

// Preguntas tipo "que actividades tiene X" / "que tengo esta semana" => tabla editable.
function wantsQuestionList(content: string): boolean {
  const n = normalizeName(content)
  const hasActWord = /(activ|tarea|pendient|labor)/.test(n)
  const listVerbs =
    /(que tiene|que tengo|tengo|tiene|mis|most|muestr|dame|lista|listar|\bver\b|cuales|proxim|esta semana|hoy|manana|pendient|semana|equipo)/.test(
      n,
    )
  return hasActWord && listVerbs
}

export interface PendingActivity {
  title: string
  description: string
  priority: number
  dueDate: string
  category: 'actividad' | 'ingesta'
  senderId: string
}

export interface PendingUpdate {
  changes: {
    status: string | null
    due_date: string | null
    responsible: string | null
    priority: number | null
  }
  action: string
  reply: string
}

export interface PendingCategory {
  content: string
  title: string
  priority: number
  dueDate: string
  severity: string | null
  responsibleHint: string | null
  senderId: string
  // Opciones no-actividad a ofrecer en el popout, segun las palabras encontradas en el texto.
  options: ('error' | 'ingesta')[]
  sourceMessageId: string
}

export interface QuickChanges {
  status?: ActivityStatus
  due_date?: string
  responsibleId?: string
  responsibleName?: string
  priority?: number
}

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [aiProcessing, setAiProcessing] = useState(false)
  const { user, profile } = useAuth()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const membersRef = useRef<Member[]>([])
  const teamId = profile?.team_id ?? ''
  const isColaborador = profile?.role === 'colaborador'
  const isAdmin = profile?.role === 'admin'
  // Solo jefatura y admin pueden asignar a terceros. Colaborador e invitado se autoasignan.
  const canAssignOthers = profile?.role === 'admin' || profile?.role === 'jefatura'

  useEffect(() => {
    if (!user || !teamId) return

    let cancelled = false

    async function load() {
      const [data, members] = await Promise.all([
        messagesService.getByTeam(teamId, 50),
        profilesService.getByTeam(teamId),
      ])
      if (cancelled) return
      membersRef.current = members
      // Cada usuario ve SOLO su propia conversacion (sus mensajes + las respuestas de
      // Lumix a el, que se guardan con su sender_id). El admin ve todo.
      const personal = !isAdmin ? data.filter((m) => m.sender_id === user?.id) : data
      setMessages(
        personal.map((msg) => {
          const isAi = msg.sender_id === 'ai' || (msg as ChatMessage).is_ai
          if (isAi) {
            return { ...msg, sender: { full_name: 'Lumix', avatar_url: null }, sender_id: 'ai' }
          }
          const member = members.find((m) => m.id === msg.sender_id)
          // El admin no esta en la lista de miembros: resolvemos su propio nombre con su perfil.
          const ownFallback =
            msg.sender_id === user?.id
              ? { full_name: profile?.full_name ?? 'Yo', avatar_url: profile?.avatar_url ?? null }
              : null
          return {
            ...msg,
            sender: member
              ? { full_name: member.full_name, avatar_url: member.avatar_url ?? null }
              : ownFallback,
          }
        }),
      )
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [user, teamId])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`chat-${teamId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          // Solo admin ve mensajes de otros. Las respuestas de Lumix llevan el sender_id
          // del usuario que las genero, asi que este filtro tambien las mantiene privadas.
          if (!isAdmin && newMsg.sender_id !== user?.id) return
          const isAiMsg = newMsg.sender_id === 'ai' || newMsg.is_ai
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            const member = membersRef.current.find((m) => m.id === newMsg.sender_id)
            return [
              ...prev,
              {
                ...newMsg,
                sender: isAiMsg
                  ? { full_name: 'Lumix', avatar_url: null }
                  : member
                    ? { full_name: member.full_name, avatar_url: member.avatar_url }
                    : newMsg.sender_id === user?.id
                      ? {
                          full_name: profile?.full_name ?? 'Yo',
                          avatar_url: profile?.avatar_url ?? null,
                        }
                      : null,
              },
            ]
          })
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, profile?.team_id])

  async function ensureMembers(): Promise<Member[]> {
    if (membersRef.current.length === 0 && teamId) {
      try {
        membersRef.current = await profilesService.getByTeam(teamId)
      } catch (err) {
        console.error('Member fetch failed:', err)
      }
    }
    return membersRef.current
  }

  const appendAndSave = async (message: ChatMessage, persist = true) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev
      return [...prev, message]
    })
    if (persist && message.sender_id === 'ai' && teamId && user) {
      try {
        await messagesService.send({
          content: message.content,
          sender_id: user.id,
          category: message.category,
          team_id: teamId,
          is_ai: true,
        })
      } catch (err) {
        console.error('Failed to save AI message:', err)
      }
    }
  }

  const aiSay = (content: string, category: ChatMessage['category'] = null) =>
    appendAndSave({
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content,
      sender_id: 'ai',
      category,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender: { full_name: 'Lumix', avatar_url: null },
    })

  const memberName = (id?: string | null): string => {
    if (!id) return 'Sin asignar'
    if (id === user?.id) return profile?.full_name || 'Tu'
    return membersRef.current.find((m) => m.id === id)?.full_name || 'Alguien'
  }

  // Tarjeta interactiva de actividad (P2). content sirve de fallback si se recarga.
  const emitActivityCard = (activity: Activity, responsibleName: string, text: string) =>
    appendAndSave({
      id: `ai-card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content: text,
      sender_id: 'ai',
      category: null,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender: { full_name: 'Lumix', avatar_url: null },
      metadata: {
        type: 'activity_card',
        activityId: activity.id,
        title: activity.title.replace(/^\[Ingesta\]\s*/, ''),
        responsibleName,
        dueDate: activity.due_date,
        status: activity.status,
        priority: activity.priority,
      },
    })

  const sendMessage = async (payload: SendMessagePayload) => {
    if (!user) return null
    setSending(true)

    const optimisticId = `opt-${Date.now()}`
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      content: payload.content,
      sender_id: user.id,
      category: payload.category,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender: { full_name: profile?.full_name ?? '', avatar_url: profile?.avatar_url ?? null },
      file_url: payload.file_url,
      file_name: payload.file_name,
      file_type: payload.file_type,
    }

    setMessages((prev) => [...prev, optimisticMsg])

    let sentMessage: ChatMessage | null = null

    try {
      const sent = await messagesService.send({
        content: payload.content,
        sender_id: user.id,
        category: payload.category,
        team_id: teamId,
      })

      sentMessage = { ...sent, sender: optimisticMsg.sender }

      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? sentMessage! : m)))
    } catch (err) {
      console.error('Failed to send message:', err)
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } finally {
      setSending(false)
    }

    return sentMessage
  }

  // Crea una actividad/ingesta ya con responsable resuelto. Notifica si es para otro.
  async function persistActivity(opts: {
    title: string
    description: string
    priority: number
    dueDate: string
    category: 'actividad' | 'ingesta'
    responsibleId: string
    responsibleName: string
    senderId: string
    silent?: boolean
  }) {
    const isIngesta = opts.category === 'ingesta'
    const cleanTitle = opts.title.replace(/^\[Ingesta\]\s*/, '')
    const title = isIngesta ? `[Ingesta] ${cleanTitle}` : opts.title

    const activity = await activitiesService.create({
      title,
      description: opts.description,
      responsible_id: opts.responsibleId,
      priority: opts.priority,
      status: 'pendiente',
      due_date: opts.dueDate,
      dependencies: [],
      observations: isIngesta ? 'Tipo: Ingesta de datos' : '',
      team_id: teamId,
      created_by: opts.senderId,
    })

    const assignedToOther = opts.responsibleId !== opts.senderId

    if (assignedToOther) {
      try {
        await notificationsService.send(opts.responsibleId, {
          title: 'Nueva actividad asignada',
          body: `"${cleanTitle}" - Entrega: ${formatDateLocal(opts.dueDate)}`,
          type: 'deadline_soon',
          metadata: { activity_id: activity.id },
        })
      } catch (err) {
        console.error('Notification send failed:', err)
      }
    }

    if (!opts.silent) {
      const reply = assignedToOther
        ? `Actividad "${cleanTitle}" asignada a ${opts.responsibleName}.`
        : isIngesta
          ? `Ingesta "${cleanTitle}" registrada.`
          : `Actividad "${cleanTitle}" creada.`
      // Confirmacion simple en texto (se persiste igual que se ve, sin discrepancia al recargar).
      await aiSay(reply)
      if (assignedToOther) {
        await aiSay(`📨 Notificacion enviada a ${opts.responsibleName}`)
      }
    }

    return activity
  }

  // Construye el objeto de cambios a partir de lo que devuelve la IA de update
  function buildUpdatesFromChanges(changes: PendingUpdate['changes']): {
    updates: Partial<Activity>
    newResponsibleName?: string
  } {
    const updates: Partial<Activity> = {}
    let newResponsibleName: string | undefined
    if (changes.status) updates.status = changes.status as ActivityStatus
    if (changes.priority) updates.priority = changes.priority
    if (changes.due_date) updates.due_date = changes.due_date
    if (changes.responsible && canAssignOthers) {
      const matches = matchMembers(changes.responsible, membersRef.current)
      if (matches.length === 1) {
        updates.responsible_id = matches[0].id
        newResponsibleName = matches[0].full_name
      }
    }
    return { updates, newResponsibleName }
  }

  // Aplica cambios a una actividad existente, con control de rol y notificaciones.
  async function commitUpdate(
    activity: Activity,
    updates: Partial<Activity>,
    opts: { replyText?: string; newResponsibleName?: string } = {},
  ) {
    // Colaborador/invitado: solo su propia actividad y no puede reasignar a terceros
    if (!canAssignOthers) {
      if (activity.responsible_id !== user?.id) {
        await aiSay('Solo puedes modificar tus propias actividades.')
        return null
      }
      if (updates.responsible_id && updates.responsible_id !== user?.id) {
        delete updates.responsible_id
      }
    }

    if (Object.keys(updates).length === 0) {
      await aiSay('No detecte ningun cambio para aplicar.')
      return null
    }

    let updated: Activity
    try {
      updated = await activitiesService.update(activity.id, updates)
    } catch (err) {
      console.error('Update failed:', err)
      await aiSay('No pude actualizar la actividad. Intentalo de nuevo.')
      return null
    }

    if (updates.status === 'bloqueado') {
      try {
        await notificationsService.sendToTeam(teamId, {
          title: 'Actividad bloqueada',
          body: `"${updated.title}" fue bloqueada`,
          type: 'activity_blocked',
          metadata: { activity_id: updated.id },
        })
      } catch (err) {
        console.error('Block notify failed:', err)
      }
    }
    if (updates.responsible_id && updates.responsible_id !== activity.responsible_id) {
      try {
        await notificationsService.send(updates.responsible_id, {
          title: 'Actividad reasignada',
          body: `"${updated.title}" - Entrega: ${formatDateLocal(updated.due_date)}`,
          type: 'deadline_soon',
          metadata: { activity_id: updated.id },
        })
      } catch (err) {
        console.error('Reassign notify failed:', err)
      }
    }

    const rName = opts.newResponsibleName || memberName(updated.responsible_id)
    await emitActivityCard(updated, rName, opts.replyText || 'Actividad actualizada.')
    return updated
  }

  // Actualizacion pendiente confirmada desde el chat (cuando la IA no supo cual era)
  const applyPendingUpdate = async (activityId: string, pending: PendingUpdate) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) {
      await aiSay('No encontre la actividad.')
      return null
    }
    const { updates, newResponsibleName } = buildUpdatesFromChanges(pending.changes)
    return commitUpdate(activity, updates, { replyText: pending.reply, newResponsibleName })
  }

  // Accion directa desde los botones de la tarjeta (sin IA)
  const quickUpdate = async (activityId: string, changes: QuickChanges) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) return null
    const updates: Partial<Activity> = {}
    if (changes.status) updates.status = changes.status
    if (changes.due_date) updates.due_date = changes.due_date
    if (changes.priority) updates.priority = changes.priority
    if (changes.responsibleId) updates.responsible_id = changes.responsibleId

    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    let replyText = 'Actividad actualizada.'
    if (changes.status === 'completado') replyText = `Actividad "${title}" completada. ✅`
    else if (changes.status)
      replyText = `Actividad "${title}" ahora esta: ${STATUS_LABELS[changes.status] ?? changes.status}.`
    else if (changes.due_date)
      replyText = `Actividad "${title}" movida al ${new Date(changes.due_date + 'T12:00:00').toLocaleDateString('es-CL')}.`
    else if (changes.responsibleId)
      replyText = `Actividad "${title}" reasignada a ${changes.responsibleName ?? 'otro miembro'}.`
    else if (changes.priority) replyText = `Actividad "${title}" con prioridad ${changes.priority}.`

    return commitUpdate(activity, updates, {
      replyText,
      newResponsibleName: changes.responsibleName,
    })
  }

  // Edicion completa desde el modal del listado (prioridad, fecha, descripcion, estado)
  const editActivityFields = async (
    activityId: string,
    changes: {
      priority?: number
      due_date?: string
      description?: string
      status?: ActivityStatus
      responsibleId?: string
    },
  ) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) return null
    const updates: Partial<Activity> = {}
    if (changes.priority) updates.priority = changes.priority
    if (changes.due_date) updates.due_date = changes.due_date
    if (changes.description !== undefined) updates.description = changes.description
    if (changes.status) updates.status = changes.status
    if (changes.responsibleId) updates.responsible_id = changes.responsibleId
    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    return commitUpdate(activity, updates, { replyText: `Actividad "${title}" actualizada.` })
  }

  const listMembers = () => ensureMembers()

  // Llamada desde la UI cuando el usuario confirma a quien asignar (flujo name_confirm)
  const createResolvedActivity = async (
    pending: PendingActivity,
    responsibleId: string,
    responsibleName: string,
  ) => {
    return persistActivity({
      title: pending.title,
      description: pending.description,
      priority: pending.priority,
      dueDate: pending.dueDate,
      category: pending.category,
      responsibleId,
      responsibleName,
      senderId: pending.senderId,
    })
  }

  // Carga masiva: crea varias actividades tras confirmacion en la UI
  const bulkCreate = async (items: BulkActivity[]) => {
    if (!user) return 0
    const members = await ensureMembers()
    let created = 0

    for (const it of items) {
      let responsibleId = user.id
      let responsibleName = profile?.full_name ?? ''

      if (canAssignOthers && it.responsible) {
        const matches = matchMembers(it.responsible, members)
        if (matches.length === 1) {
          responsibleId = matches[0].id
          responsibleName = matches[0].full_name
        }
        // Si es ambiguo o no existe en carga masiva, queda con quien lo crea.
      }

      try {
        await persistActivity({
          title: it.title || it.description?.slice(0, 100) || 'Actividad',
          description: it.description || it.title || '',
          priority: it.priority ?? 2,
          dueDate: it.due_date || defaultDueDate(),
          category: 'actividad',
          responsibleId,
          responsibleName,
          senderId: user.id,
          silent: true,
        })
        created++
      } catch (err) {
        console.error('Bulk item failed:', err)
      }
    }

    await aiSay(`✅ Carga masiva: ${created} de ${items.length} actividades creadas.`, 'actividad')
    return created
  }

  // Muestra una tabla editable de actividades filtrada por persona/periodo.
  async function showActivityList(
    content: string,
    senderId: string,
    preloaded?: { activities: Activity[]; members: Member[] },
  ) {
    const activities = preloaded?.activities ?? (await activitiesService.getByTeam(teamId))
    const members = preloaded?.members ?? (await ensureMembers())
    membersRef.current = members

    const visible = isColaborador
      ? activities.filter((a) => a.responsible_id === senderId)
      : activities

    const mentioned = findMentionedMembers(content, members)
    const wantsSelf = /\b(mis|tengo|mias)\b/i.test(normalizeName(content))
    const tf = parseTimeframe(content)
    const wantsCompleted = /complet/i.test(content)

    let list = visible.filter((a) => !a.title.startsWith('[Ingesta]'))
    let scopeLabel = ''

    if (mentioned.length === 1 && !isColaborador) {
      list = list.filter((a) => a.responsible_id === mentioned[0].id)
      scopeLabel = mentioned[0].full_name
    } else if (wantsSelf || isColaborador) {
      list = list.filter((a) => a.responsible_id === senderId)
      scopeLabel = 'tuyas'
    }

    if (tf) list = list.filter((a) => dueWithin(a.due_date, tf))
    if (!wantsCompleted) list = list.filter((a) => a.status !== 'completado')

    list.sort(
      (a, b) =>
        new Date(a.due_date.split('T')[0]).getTime() - new Date(b.due_date.split('T')[0]).getTime(),
    )

    if (list.length === 0) {
      await aiSay('No encontre actividades que coincidan con tu consulta.')
      return
    }

    const n = normalizeName(content)
    const tfLabel = /esta semana/.test(n)
      ? ' de esta semana'
      : /proxima semana/.test(n)
        ? ' de la proxima semana'
        : /\bhoy\b/.test(n)
          ? ' de hoy'
          : /\bmanana\b/.test(n)
            ? ' de manana'
            : ''
    const who = scopeLabel === 'tuyas' ? 'Tienes' : scopeLabel ? `${scopeLabel} tiene` : 'Hay'
    await appendAndSave({
      id: `ai-list-${Date.now()}`,
      content: `${who} ${list.length} actividad${list.length === 1 ? '' : 'es'}${tfLabel}. Toca una para editarla.`,
      sender_id: 'ai',
      category: null,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender: { full_name: 'Lumix', avatar_url: null },
      metadata: {
        type: 'activity_list',
        activities: list.map((a) => ({
          id: a.id,
          title: a.title,
          responsibleId: a.responsible_id,
          responsibleName: memberName(a.responsible_id),
          dueDate: a.due_date,
          status: a.status,
          priority: a.priority,
          description: a.description,
        })),
      },
    })
  }

  // Registra un error en la bitacora a partir de un mensaje ya clasificado como error.
  async function createErrorFromMessage(opts: {
    content: string
    title: string
    severity: string
    senderId: string
    sourceMessageId?: string
  }) {
    const error = await errorsService.create({
      title: opts.title,
      description: opts.content,
      severity: (opts.severity as 'baja' | 'media' | 'alta' | 'critica') || 'media',
      responsible_id: opts.senderId,
      status: 'abierto',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 8),
      team_id: teamId,
      created_by: opts.senderId,
    })
    await aiSay(
      `Error "${error.title}" registrado en bitacora. Severidad: ${error.severity}.`,
      'error',
    )
    if (opts.sourceMessageId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === opts.sourceMessageId ? { ...m, category: 'error' } : m)),
      )
    }
    return error
  }

  // Crea actividad o ingesta: resuelve responsable, chequea sobrecarga y persiste.
  // Puede abrir popouts (name_confirm / overload) si hace falta antes de crear.
  async function createActivityOrIngesta(opts: {
    content: string
    title: string
    actCategory: 'actividad' | 'ingesta'
    priority: number
    dueDate: string
    senderId: string
    responsibleHint?: string | null
    sourceMessageId?: string
  }) {
    const { content, title, actCategory, priority, dueDate, senderId } = opts
    const members = await ensureMembers()

    let responsibleId = senderId
    let responsibleName = profile?.full_name ?? ''

    if (canAssignOthers && opts.responsibleHint) {
      const matches = matchMembers(opts.responsibleHint, members)
      if (matches.length === 1) {
        responsibleId = matches[0].id
        responsibleName = matches[0].full_name
      } else {
        // 0 o >1 coincidencias => preguntar en el chat y NO crear todavia
        const notFound = matches.length === 0
        const candidates = (notFound ? members : matches).map((m) => ({
          id: m.id,
          name: m.full_name,
        }))
        const pending: PendingActivity = {
          title,
          description: content,
          priority,
          dueDate,
          category: actCategory,
          senderId,
        }
        await appendAndSave(
          {
            id: `ai-nameconfirm-${Date.now()}`,
            content: notFound
              ? `No encontre a "${opts.responsibleHint}" en el equipo. ¿A quien asigno "${title}"? Toca para elegir.`
              : `Hay varias personas que coinciden con "${opts.responsibleHint}". ¿A quien asigno "${title}"? Toca para elegir.`,
            sender_id: 'ai',
            category: null,
            created_at: new Date().toISOString(),
            team_id: teamId,
            sender: { full_name: 'Lumix', avatar_url: null },
            metadata: { type: 'name_confirm', candidates, pending },
          },
          false,
        )
        if (opts.sourceMessageId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === opts.sourceMessageId ? { ...m, category: 'actividad' } : m)),
          )
        }
        return
      }
    }

    // Chequeo de sobrecarga antes de crear (solo actividad normal, no ingesta)
    if (actCategory === 'actividad' && teamId) {
      try {
        const userActivities = await activitiesService.getByTeam(teamId)
        const dueDateStr = dueDate.split('T')[0]
        const sameDay = userActivities.filter(
          (a) =>
            a.responsible_id === responsibleId &&
            a.status !== 'completado' &&
            a.due_date.startsWith(dueDateStr),
        )
        if (sameDay.length >= 2) {
          await appendAndSave(
            {
              id: `ai-warn-${Date.now()}`,
              content: `⚠️ ${responsibleName} ya tiene ${sameDay.length} actividades para el ${formatDateLocal(dueDate)}. Clic para decidir.`,
              sender_id: 'ai',
              category: null,
              created_at: new Date().toISOString(),
              team_id: teamId,
              sender: { full_name: 'Lumix', avatar_url: null },
              metadata: {
                type: 'overload',
                pendingTitle: title,
                pendingDesc: content,
                pendingResponsibleId: responsibleId,
                pendingResponsibleName: responsibleName,
                pendingPriority: priority,
                pendingDueDate: dueDate,
                pendingSenderId: senderId,
                pendingIsColaborador: isColaborador,
              },
            },
            false,
          )
          if (opts.sourceMessageId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === opts.sourceMessageId ? { ...m, category: 'actividad' } : m,
              ),
            )
          }
          return
        }
      } catch (err) {
        console.error('Overload check failed:', err)
      }
    }

    await persistActivity({
      title,
      description: content,
      priority,
      dueDate,
      category: actCategory,
      responsibleId,
      responsibleName,
      senderId,
    })

    if (opts.sourceMessageId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === opts.sourceMessageId
            ? { ...m, category: actCategory === 'ingesta' ? null : 'actividad' }
            : m,
        ),
      )
    }
  }

  // Resuelve el popout de categoria ambigua: el usuario elige que es realmente el mensaje.
  // confirmMessageId es el mensaje-pregunta de Lumix: se elimina al resolver para que NO se
  // pueda volver a tocar y crear duplicados.
  const confirmCategory = async (
    pending: PendingCategory,
    choice: 'actividad' | 'ingesta' | 'error',
    confirmMessageId?: string,
  ) => {
    if (confirmMessageId) {
      setMessages((prev) => prev.filter((m) => m.id !== confirmMessageId))
    }
    if (choice === 'error') {
      return createErrorFromMessage({
        content: pending.content,
        title: pending.title,
        severity: pending.severity ?? 'media',
        senderId: pending.senderId,
        sourceMessageId: pending.sourceMessageId,
      })
    }
    return createActivityOrIngesta({
      content: pending.content,
      title: pending.title,
      actCategory: choice,
      priority: pending.priority,
      dueDate: pending.dueDate,
      senderId: pending.senderId,
      responsibleHint: pending.responsibleHint,
      sourceMessageId: pending.sourceMessageId,
    })
  }

  const classifyAndAct = async (message: ChatMessage, forcedType?: string) => {
    if (!message.content || message.category) return
    setAiProcessing(true)

    const content = message.content.trim()

    try {
      // PREGUNTAS: detectar con prefijo ? o palabras interrogativas
      const questionWords =
        /^(que |como |cual |cuantas |cuantos |quien |donde |cuando |dame |dime |cuentame |resume |listame |muestrame |consultame |hay |mostrame |quiero ver|ver |mis |cuales son)\b/i
      const isQuestion = /^[?¿/]/.test(content) || questionWords.test(content)
      const isAutoMode = !forcedType || forcedType === 'auto'

      // LISTADO EDITABLE: "cambiar/ver/modificar las de <persona/equipo>" (aunque no sea pregunta)
      if (isAutoMode && teamId && wantsEditList(content)) {
        await showActivityList(content, message.sender_id)
        setAiProcessing(false)
        return
      }

      if (isQuestion && teamId) {
        // Preguntas de listado => tabla editable en vez de texto
        if (wantsQuestionList(content)) {
          await showActivityList(content, message.sender_id)
          setAiProcessing(false)
          return
        }

        const [activities, errors, members] = await Promise.all([
          activitiesService.getByTeam(teamId),
          errorsService.getByTeam(teamId),
          profilesService.getByTeam(teamId),
        ])

        const visibleActivities = isColaborador
          ? activities.filter((a) => a.responsible_id === message.sender_id)
          : activities

        membersRef.current = members

        const teamData = {
          today: new Date().toLocaleDateString('es-CL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
          activities: visibleActivities.map((a) => {
            const [y, m, d] = a.due_date.split('T')[0].split('-').map(Number)
            return {
              title: a.title,
              status: a.status,
              priority: a.priority,
              due_date: new Date(y, m - 1, d).toLocaleDateString('es-CL'),
              responsible:
                members.find((m) => m.id === a.responsible_id)?.full_name || 'Sin asignar',
            }
          }),
          errors: errors
            .filter((e) => e.status !== 'cerrado')
            .map((e) => ({
              title: e.title,
              severity: e.severity,
              status: e.status,
            })),
          members: isColaborador
            ? [
                {
                  name: profile?.full_name || 'Tu',
                  activeTasks: visibleActivities.filter((a) => a.status !== 'completado').length,
                  load: Math.min(
                    Math.round(
                      (visibleActivities
                        .filter((a) => a.status !== 'completado')
                        .reduce((sum, a) => sum + (a.estimated_hours ?? 3), 0) /
                        42) *
                        100,
                    ),
                    100,
                  ),
                },
              ]
            : members.map((m) => {
                const tasks = activities.filter(
                  (a) => a.responsible_id === m.id && a.status !== 'completado',
                )
                const totalHours = tasks.reduce((sum, a) => sum + (a.estimated_hours ?? 3), 0)
                return {
                  name: m.full_name,
                  activeTasks: tasks.length,
                  load: Math.min(Math.round((totalHours / 42) * 100), 100),
                }
              }),
        }

        try {
          const answer = await askQuestion(content, teamData)
          await aiSay(answer)
        } catch (err) {
          console.error('AI question failed:', err)
          await aiSay('No pude responder tu consulta en este momento. Intentalo de nuevo.')
        }
        setAiProcessing(false)
        return
      }

      // ACTUALIZACION: si el mensaje suena a editar una actividad existente (solo en Auto),
      // consultamos a la IA de update. Si no aplica, cae a creacion normal.
      if (isAutoMode && teamId && UPDATE_VERBS.test(content)) {
        try {
          const memList = await ensureMembers()
          const acts = await activitiesService.getByTeam(teamId)
          const scope = canAssignOthers
            ? acts
            : acts.filter((a) => a.responsible_id === message.sender_id)
          const open = scope.filter((a) => a.status !== 'completado')

          if (open.length) {
            const upd = await resolveUpdate(
              content,
              open.map((a) => ({
                title: a.title,
                responsible: memberName(a.responsible_id),
                status: a.status,
                due_date: a.due_date.split('T')[0],
                priority: a.priority,
              })),
              memList.map((m) => m.full_name),
            )

            if (upd.isUpdate) {
              if (upd.targetIndex >= 0 && upd.targetIndex < open.length) {
                const { updates, newResponsibleName } = buildUpdatesFromChanges(upd.changes)
                await commitUpdate(open[upd.targetIndex], updates, {
                  replyText: upd.reply,
                  newResponsibleName,
                })
              } else {
                // Ambiguo: preguntar a cual actividad se refiere
                const candidates = pickActivityCandidates(content, open).map((a) => ({
                  id: a.id,
                  title: a.title.replace(/^\[Ingesta\]\s*/, ''),
                }))
                await appendAndSave(
                  {
                    id: `ai-actpick-${Date.now()}`,
                    content: '¿A cual actividad te refieres? Toca para elegir.',
                    sender_id: 'ai',
                    category: null,
                    created_at: new Date().toISOString(),
                    team_id: teamId,
                    sender: { full_name: 'Lumix', avatar_url: null },
                    metadata: {
                      type: 'activity_pick',
                      candidates,
                      pending: { changes: upd.changes, action: upd.action, reply: upd.reply },
                    },
                  },
                  false,
                )
              }
              setMessages((prev) =>
                prev.map((m) => (m.id === message.id ? { ...m, category: 'actividad' } : m)),
              )
              setAiProcessing(false)
              return
            }
            // isUpdate=false => continua al flujo de creacion
          }
        } catch (err) {
          console.error('Update resolution failed, fallback to create:', err)
        }
      }

      // CLASIFICACION
      const members = await ensureMembers()
      const memberNames = members.map((m) => m.full_name)

      let result: ClassifyResult
      try {
        result = await classifyMessage(content, memberNames)
      } catch (err) {
        console.error('AI classification failed:', err)
        await aiSay('No pude procesar tu mensaje ahora. Intentalo de nuevo en unos segundos.')
        setAiProcessing(false)
        return
      }

      if (!result?.category) {
        await aiSay('No pude interpretar tu mensaje. Intenta reformularlo.')
        setAiProcessing(false)
        return
      }

      // Tipo forzado desde el selector del chat (actividad/error/ingesta)
      if (forcedType && forcedType !== 'auto') {
        result = { ...result, category: forcedType as ClassifyResult['category'] }
      }

      const category = result.category
      const dueDate = result.entities.due_date || defaultDueDate()
      const priority = result.entities.priority ?? 2
      const title = result.entities.title || content.slice(0, 100)

      // Primer filtro: si el texto menciona la palabra "error" o "ingesta", en modo Auto
      // siempre preguntamos que tipo es (actividad / error / ingesta). Si el usuario ya eligio
      // el tipo con el selector del chat, forcedType != 'auto' y no entra aca (es explicito).
      const mentionsError = MENTIONS_ERROR.test(content)
      const mentionsIngesta = MENTIONS_INGESTA.test(content)
      if (isAutoMode && (mentionsError || mentionsIngesta)) {
        const options: ('error' | 'ingesta')[] = []
        if (mentionsError) options.push('error')
        if (mentionsIngesta) options.push('ingesta')
        const pending: PendingCategory = {
          content,
          title,
          priority,
          dueDate,
          severity: (result.entities.severity as string) ?? null,
          responsibleHint: result.entities.responsible ?? null,
          senderId: message.sender_id,
          options,
          sourceMessageId: message.id,
        }
        const optLabel = options
          .map((o) => (o === 'ingesta' ? 'una ingesta de datos' : 'un error'))
          .join(' o ')
        await appendAndSave(
          {
            id: `ai-catconfirm-${Date.now()}`,
            content: `¿"${title}" es una actividad o ${optLabel}?`,
            sender_id: 'ai',
            category: null,
            created_at: new Date().toISOString(),
            team_id: teamId,
            sender: { full_name: 'Lumix', avatar_url: null },
            metadata: { type: 'category_confirm', pending },
          },
          false,
        )
        return
      }

      // ERROR
      if (category === 'error') {
        await createErrorFromMessage({
          content,
          title,
          severity: (result.entities.severity as string) || 'media',
          senderId: message.sender_id,
          sourceMessageId: message.id,
        })
        return
      }

      // ACTIVIDAD / INGESTA
      const actCategory: 'actividad' | 'ingesta' = category === 'ingesta' ? 'ingesta' : 'actividad'
      await createActivityOrIngesta({
        content,
        title,
        actCategory,
        priority,
        dueDate,
        senderId: message.sender_id,
        responsibleHint: result.entities.responsible,
        sourceMessageId: message.id,
      })
    } catch (err) {
      console.error('AI processing failed:', err)
      await aiSay('Ocurrio un problema al procesar tu mensaje. Intentalo de nuevo.')
    } finally {
      setAiProcessing(false)
    }
  }

  // Modo Masivo: parsea el texto y devuelve las actividades detectadas (sin crear aun)
  const parseBulk = async (content: string): Promise<BulkActivity[]> => {
    const members = await ensureMembers()
    const result = await classifyBulk(
      content,
      members.map((m) => m.full_name),
    )
    return result.activities
  }

  return {
    messages,
    loading,
    sending,
    aiProcessing,
    sendMessage,
    classifyAndAct,
    parseBulk,
    bulkCreate,
    createResolvedActivity,
    confirmCategory,
    quickUpdate,
    applyPendingUpdate,
    editActivityFields,
    listMembers,
  }
}
