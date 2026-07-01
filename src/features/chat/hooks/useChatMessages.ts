import { useState, useEffect, useRef } from 'react'
import { supabase } from '@infrastructure/supabase/client'
import { messagesService } from '@infrastructure/supabase/messages.service'
import { classifyMessage, askQuestion, type ClassifyResult } from '@core/ai-engine/client'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { ChatMessage, SendMessagePayload } from '@features/chat/types'

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

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [aiProcessing, setAiProcessing] = useState(false)
  const { user, profile } = useAuth()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const membersRef = useRef<{ id: string; full_name: string; avatar_url: string | null }[]>([])
  const teamId = profile?.team_id ?? ''
  const isColaborador = profile?.role === 'colaborador'
  const isAdmin = profile?.role === 'admin'

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
      const personal = !isAdmin
        ? data.filter(
            (m) => m.sender_id === user?.id || m.sender_id === 'ai' || (m as ChatMessage).is_ai,
          )
        : data
      setMessages(
        personal.map((msg) => {
          const isAi = msg.sender_id === 'ai' || (msg as ChatMessage).is_ai
          if (isAi) {
            return { ...msg, sender: { full_name: 'Lumix', avatar_url: null }, sender_id: 'ai' }
          }
          const member = members.find((m) => m.id === msg.sender_id)
          return {
            ...msg,
            sender: member
              ? { full_name: member.full_name, avatar_url: member.avatar_url ?? null }
              : null,
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
          // Solo admin ve mensajes de otros
          if (
            !isAdmin &&
            newMsg.sender_id !== user?.id &&
            newMsg.sender_id !== 'ai' &&
            !newMsg.is_ai
          )
            return
          const isAiMsg = newMsg.sender_id === 'ai' || newMsg.is_ai
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [
              ...prev,
              {
                ...newMsg,
                sender: isAiMsg
                  ? { full_name: 'Lumix', avatar_url: null }
                  : newMsg.sender_id === 'ai'
                    ? { full_name: 'Lumix', avatar_url: null }
                    : membersRef.current.find((m) => m.id === newMsg.sender_id)
                      ? {
                          full_name: membersRef.current.find((m) => m.id === newMsg.sender_id)!
                            .full_name,
                          avatar_url: membersRef.current.find((m) => m.id === newMsg.sender_id)!
                            .avatar_url,
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

  const appendAndSave = async (message: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev
      return [...prev, message]
    })
    if (message.sender_id === 'ai' && teamId && user) {
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

  const classifyAndAct = async (message: ChatMessage, forcedType?: string) => {
    if (!message.content || message.category) return
    setAiProcessing(true)

    const content = message.content.trim()

    try {
      // QUESTIONS: detect with ? prefix or question keywords
      const questionWords =
        /^(que |como |cual |cuantas |cuantos |quien |donde |cuando |dame |dime |cuentame |resume |listame |muestrame |consultame |hay |mostrame |quiero ver|ver |mis |cuales son)\b/i
      const isQuestion = /^[?¿/]/.test(content) || questionWords.test(content)

      if (isQuestion && teamId) {
        const [activities, errors, members] = await Promise.all([
          activitiesService.getByTeam(teamId),
          errorsService.getByTeam(teamId),
          profilesService.getByTeam(teamId),
        ])

        const visibleActivities = isColaborador
          ? activities.filter((a) => a.responsible_id === message.sender_id)
          : activities

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
                  load: 0,
                },
              ]
            : members.map((m) => {
                const tasks = activities.filter(
                  (a) => a.responsible_id === m.id && a.status !== 'completado',
                )
                return {
                  name: m.full_name,
                  activeTasks: tasks.length,
                  load: Math.min(Math.round((tasks.length / 10) * 100), 100),
                }
              }),
        }

        const answer = await askQuestion(content, teamData)
        appendAndSave({
          id: `ai-q-${Date.now()}`,
          content: answer,
          sender_id: 'ai',
          category: null,
          created_at: new Date().toISOString(),
          team_id: teamId,
          sender: { full_name: 'Lumix', avatar_url: null },
        })
        setAiProcessing(false)
        return
      }

      // Forced type: skip AI classification
      let result: ClassifyResult

      // Auto-detect ingesta keywords even in Auto mode
      const ingestaWords =
        /\b(ingestar|ingesta|ingerir|cargar datos|subir datos|descargar datos|etl|data pipeline|migrar datos|importar datos|exportar datos)\b/i
      const effectiveType =
        forcedType && forcedType !== 'auto'
          ? forcedType
          : ingestaWords.test(content)
            ? 'ingesta'
            : null

      if (effectiveType) {
        // Still use AI to extract title/description, but force the category
        try {
          const aiResult = await classifyMessage(content)
          if (aiResult?.category) {
            result = {
              ...aiResult,
              category: effectiveType === 'error' ? 'error' : 'actividad',
              entities: {
                ...aiResult.entities,
                title:
                  effectiveType === 'ingesta'
                    ? `[Ingesta] ${aiResult.entities.title || content.slice(0, 100)}`
                    : aiResult.entities.title || content.slice(0, 100),
              },
              reply:
                effectiveType === 'error'
                  ? 'Error registrado.'
                  : effectiveType === 'ingesta'
                    ? 'Ingesta registrada.'
                    : 'Actividad creada.',
            }
          } else {
            result = {
              category: effectiveType === 'error' ? 'error' : 'actividad',
              confidence: 1,
              entities: {
                title:
                  effectiveType === 'ingesta'
                    ? `[Ingesta] ${content.slice(0, 100)}`
                    : content.slice(0, 100),
                description: content,
                responsible: null,
                priority: 2,
                due_date: null,
                severity: effectiveType === 'error' ? 'media' : null,
                scheduled_at: null,
              },
              reply:
                effectiveType === 'error'
                  ? 'Error registrado.'
                  : effectiveType === 'ingesta'
                    ? 'Ingesta registrada.'
                    : 'Actividad creada.',
            }
          }
        } catch (err) {
          console.error('AI classification failed:', err)
          result = {
            category: effectiveType === 'error' ? 'error' : 'actividad',
            confidence: 1,
            entities: {
              title:
                effectiveType === 'ingesta'
                  ? `[Ingesta] ${content.slice(0, 100)}`
                  : content.slice(0, 100),
              description: content,
              responsible: null,
              priority: 3,
              due_date: null,
              severity: effectiveType === 'error' ? 'media' : null,
              scheduled_at: null,
            },
            reply:
              effectiveType === 'error'
                ? 'Error registrado.'
                : effectiveType === 'ingesta'
                  ? 'Ingesta registrada.'
                  : 'Actividad creada.',
          }
        }
      } else {
        const aiResult = await classifyMessage(content)
        if (!aiResult?.category) {
          setAiProcessing(false)
          return
        }
        result = aiResult
      }

      let aiContent = result.reply
      let skipAiReply = false

      let responsibleId = message.sender_id
      let responsibleName = profile?.full_name ?? ''

      if (!isColaborador && result.entities.responsible && teamId) {
        try {
          const members = await profilesService.getByTeam(teamId)
          const searchName = result.entities.responsible.toLowerCase().trim()

          const found = members.find((m) => {
            const full = m.full_name.toLowerCase()
            if (full.includes(searchName)) return true
            const firstName = full.split(' ')[0]
            if (firstName.includes(searchName) || searchName.includes(firstName)) return true
            return false
          })
          if (found) {
            responsibleId = found.id
            responsibleName = found.full_name
          } else {
            // If name not found, log for debugging
            console.log(
              'AI detected responsible:',
              result.entities.responsible,
              'but not found in team:',
              members.map((m) => m.full_name),
            )
          }
        } catch (err) {
          console.error('Member lookup failed:', err)
        }
      }

      const isIngesta = result.entities.title.startsWith('[Ingesta]')

      switch (result.category) {
        case 'actividad': {
          const dueDate = result.entities.due_date || addBusinessDays(new Date(), 7).toISOString()
          const dueDateStr = dueDate.split('T')[0]

          // Check overload BEFORE creating (skip for ingesta)
          let hasOverload = false
          if (!isIngesta && teamId) {
            try {
              const userActivities = await activitiesService.getByTeam(teamId)
              const sameDay = userActivities.filter(
                (a) =>
                  a.responsible_id === responsibleId &&
                  a.status !== 'completado' &&
                  a.due_date.startsWith(dueDateStr),
              )

              if (sameDay.length >= 2) {
                hasOverload = true
                skipAiReply = true
                appendAndSave({
                  id: `ai-warn-${Date.now()}`,
                  content: `⚠️ ${responsibleName} ya tiene ${sameDay.length} actividades para el ${new Date(dueDate).toLocaleDateString('es-CL')}. Clic para decidir.`,
                  sender_id: 'ai',
                  category: null,
                  created_at: new Date().toISOString(),
                  team_id: teamId,
                  sender: { full_name: 'Lumix', avatar_url: null },
                  metadata: {
                    type: 'overload',
                    pendingTitle: result.entities.title || message.content.slice(0, 100),
                    pendingDesc: result.entities.description || message.content,
                    pendingResponsibleId: responsibleId,
                    pendingResponsibleName: responsibleName,
                    pendingPriority: result.entities.priority ?? 2,
                    pendingDueDate: dueDate,
                    pendingSenderId: message.sender_id,
                    pendingIsColaborador: isColaborador,
                  },
                })
              }
            } catch (err) {
              console.error('Overload check failed:', err)
            }
          }

          if (!hasOverload) {
            const activity = await activitiesService.create({
              title: result.entities.title || message.content.slice(0, 100),
              description: message.content,
              responsible_id: responsibleId,
              priority: result.entities.priority ?? 2,
              status: 'pendiente',
              due_date: dueDate,
              dependencies: [],
              observations: '',
              team_id: teamId,
              created_by: message.sender_id,
            })
            aiContent =
              responsibleId !== message.sender_id
                ? `Actividad "${activity.title}" asignada a ${responsibleName}. Prioridad: ${activity.priority}/3.`
                : isColaborador
                  ? `Actividad "${activity.title}" auto-asignada. Prioridad: ${activity.priority}/3.`
                  : isIngesta
                    ? `Ingesta "${activity.title.replace('[Ingesta] ', '')}" registrada.`
                    : `Actividad "${activity.title}" creada. Prioridad: ${activity.priority}/3.`

            // Notify if assigned to someone else
            if (responsibleId !== message.sender_id) {
              try {
                await notificationsService.send(responsibleId, {
                  title: 'Nueva actividad asignada',
                  body: `"${activity.title}" - Entrega: ${new Date(activity.due_date).toLocaleDateString('es-CL')}`,
                  type: 'deadline_soon',
                  metadata: { activity_id: activity.id },
                })
              } catch (err) {
                console.error('Notification send failed:', err)
              }
              appendAndSave({
                id: `ai-notify-${Date.now()}`,
                content: `📨 Notificacion enviada a ${responsibleName}`,
                sender_id: 'ai',
                category: null,
                created_at: new Date().toISOString(),
                team_id: teamId,
                sender: { full_name: 'Lumix', avatar_url: null },
              })
            }
          }
          break
        }
        case 'error': {
          const error = await errorsService.create({
            title: result.entities.title || message.content.slice(0, 100),
            description: result.entities.description || message.content,
            severity:
              (result.entities.severity as 'baja' | 'media' | 'alta' | 'critica') || 'media',
            responsible_id: responsibleId,
            status: 'abierto',
            date: new Date().toISOString().split('T')[0],
            time: new Date().toTimeString().slice(0, 8),
            team_id: teamId,
            created_by: message.sender_id,
          })
          aiContent = `Error "${error.title}" registrado en bitacora. Severidad: ${error.severity}.`
          break
        }
        default: {
          aiContent = result.reply || 'Mensaje procesado.'
        }
      }

      if (!skipAiReply) {
        appendAndSave({
          id: `ai-${Date.now()}`,
          content: aiContent,
          sender_id: 'ai',
          category: result.category as ChatMessage['category'],
          created_at: new Date().toISOString(),
          team_id: teamId,
          sender: { full_name: 'Lumix', avatar_url: null },
        })
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? { ...m, category: isIngesta ? null : (result.category as ChatMessage['category']) }
            : m,
        ),
      )
    } catch (err) {
      console.error('AI processing failed:', err)
    } finally {
      setAiProcessing(false)
    }
  }

  return { messages, loading, sending, aiProcessing, sendMessage, classifyAndAct }
}
