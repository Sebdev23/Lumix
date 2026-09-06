import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatBubble } from '@shared/components/ui/ChatBubble'
import { Button } from '@shared/components/ui/Button'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { useChatMessages } from '@features/chat/hooks/useChatMessages'
import { useTypingIndicator } from '@features/chat/hooks/useTypingIndicator'
import { type BulkActivity } from '@core/ai-engine/client'
import { teamsService } from '@infrastructure/supabase/teams.service'
import { ActivityCard, type ActivityCardMeta } from '@features/chat/components/ActivityCard'
import {
  ActivityListMessage,
  type ActivityListItem,
} from '@features/chat/components/ActivityListMessage'
import { LumixPromptBubble } from '@features/chat/components/LumixPromptBubble'
import { QuotedMessage } from '@features/chat/components/QuotedMessage'
import { useToast } from '@shared/components/ui/Toast'
import { formatDateLocal } from '@shared/utils/date'
import type { ReplyTarget } from '@features/chat/types'
import type { ActivityStatus, HojaTipo } from '@shared/types'
import type {
  PendingActivity,
  PendingUpdate,
  PendingCategory,
  PendingOverload,
  PendingLoteSobrecarga,
  PendingMinuta,
} from '@features/chat/hooks/useChatMessages'

// Un mismo popout de "elegir persona" sirve para tres casos: crear una actividad,
// reasignar una existente, o asignar un tema de minuta. El campo presente decide cual.
type NameConfirm = {
  candidates: { id: string; name: string }[]
  pending?: PendingActivity
  reassign?: { activityId: string; title: string }
  minuta?: PendingMinuta
  // Responsables de minuta que ya se resolvieron solos (ej. "Genaro y Javier": Genaro
  // calzo directo, Javier necesito preguntar). No se pierden al responder la pregunta.
  otherResponsables?: { id: string; name: string }[]
  // 'minuta' o 'proyecto': se pierde si no viaja aca, y la pregunta de desambiguacion
  // siempre terminaba creando un tema de minuta aunque el original fuera un proyecto.
  tipoMinuta?: HojaTipo
  // Primer punto del proyecto (si vino en el mismo mensaje), para no perderlo al responder
  // la pregunta de a quien asignar.
  primerPunto?: string | null
}
type ActivityPick = { candidates: { id: string; title: string }[]; pending: PendingUpdate }

// Popouts que son una PREGUNTA: se abren solos, porque si quedan como una burbuja
// mas el usuario cree que ya se creo la actividad y nunca las responde.
// 'overload_lote' NO se abre solo: las actividades ya quedaron creadas, asi que es una
// sugerencia, no una pregunta pendiente. Interrumpir por algo ya resuelto es justo lo que
// se estaba tratando de evitar.
const AUTO_OPEN_TYPES = [
  'category_confirm',
  'overload',
  'name_confirm',
  'activity_pick',
  'delete_confirm',
  'reclass_proyecto_confirm',
]

const STATUS_OPTIONS: { value: ActivityStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'bloqueado', label: 'Bloqueado' },
  { value: 'falta_informacion', label: 'Falta info' },
  { value: 'esperando_aprobacion', label: 'Esperando aprob.' },
  { value: 'completado', label: 'Completado' },
]

export function ChatPage() {
  const [input, setInput] = useState('')
  const [overloadData, setOverloadData] = useState<{
    pending: PendingOverload
    messageId: string
  } | null>(null)
  const [creatingOverload, setCreatingOverload] = useState(false)
  const [lote, setLote] = useState<{ pending: PendingLoteSobrecarga; messageId: string } | null>(
    null,
  )
  const [loteBusy, setLoteBusy] = useState(false)
  const [nameConfirm, setNameConfirm] = useState<{
    data: NameConfirm
    messageId: string
  } | null>(null)
  const [activityPick, setActivityPick] = useState<{
    data: ActivityPick
    messageId: string
  } | null>(null)
  const [categoryConfirm, setCategoryConfirm] = useState<{
    pending: PendingCategory
    messageId: string
  } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    activityId: string
    title: string
    messageId: string
  } | null>(null)
  const [deletingActivity, setDeletingActivity] = useState(false)
  const [reclassConfirm, setReclassConfirm] = useState<{
    activityId: string
    title: string
    tema: string
    comentarios: string
    primerPunto: string | null
    plazo: string | null
    senderId: string
    messageId: string
  } | null>(null)
  const [reclassifying, setReclassifying] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)
  const [savingPick, setSavingPick] = useState(false)
  const [editTarget, setEditTarget] = useState<ActivityListItem | null>(null)
  const [editForm, setEditForm] = useState<{
    priority: number
    due_date: string
    description: string
    status: ActivityStatus
    responsibleId: string
  }>({ priority: 2, due_date: '', description: '', status: 'pendiente', responsibleId: '' })
  const [editMembers, setEditMembers] = useState<{ id: string; full_name: string }[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [bulkItems, setBulkItems] = useState<BulkActivity[] | null>(null)
  const [bulkParsing, setBulkParsing] = useState(false)
  const [bulkCreating, setBulkCreating] = useState(false)
  const [feedback, setFeedback] = useState('')
  // Los popouts que se abren solos necesitan su propio mensaje de confirmacion: con uno
  // compartido, resolver un popout dejaba al siguiente mostrando el exito del anterior.
  const [assignFeedback, setAssignFeedback] = useState('')
  const [overloadFeedback, setOverloadFeedback] = useState('')
  const [customDays, setCustomDays] = useState('')
  const [showCustomDays, setShowCustomDays] = useState(false)
  const [messageType, setMessageType] = useState<
    'auto' | 'actividad' | 'error' | 'ingesta' | 'masivo' | 'minuta' | 'proyecto'
  >('auto')
  const [teamName, setTeamName] = useState('')
  const toast = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // El chip activo (ej. "Proyecto", el ultimo de la fila) se desplaza a la vista solo al
  // elegirse -sin esto quedaba fuera de la pantalla en un celular angosto, sin ningun aviso
  // de que habia que scrollear para verlo (bug real reportado por Sebastian).
  const activeChipRef = useRef<HTMLButtonElement>(null)

  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'nearest',
      block: 'nearest',
    })
  }, [messageType])

  useEffect(() => {
    if (teamId) teamsService.getById(teamId).then((t) => setTeamName(t?.name || ''))
  }, [teamId])
  const {
    messages,
    loading,
    sending,
    aiProcessing,
    sendMessage,
    classifyAndAct,
    parseBulk,
    bulkCreate,
    createResolvedActivity,
    createOverloadActivity,
    moverLoteSobrecarga,
    dejarLoteSobrecarga,
    descartarAlerta,
    createMinutaTopic,
    reassignResolved,
    confirmCategory,
    quickUpdate,
    bulkQuickUpdate,
    applyPendingUpdate,
    editActivityFields,
    listMembers,
    confirmarEliminarActividad,
    descartarEliminar,
    confirmarReclasificarProyecto,
    descartarReclasificar,
    descartarNombre,
    descartarActividadElegida,
  } = useChatMessages()

  const { canAssignOthers, canManageMinuta } = useCapabilities()

  // Compartido entre "editar una" (modal) y "reasignar varias" (barra de accion masiva del
  // listado): ambos necesitan el roster, y no vale la pena pedirlo dos veces.
  const ensureEditMembers = () => {
    if (canAssignOthers && editMembers.length === 0) {
      listMembers()
        .then((m) => setEditMembers(m.map((x) => ({ id: x.id, full_name: x.full_name }))))
        .catch(() => {})
    }
  }

  const openEdit = (item: ActivityListItem) => {
    setEditForm({
      priority: item.priority,
      due_date: item.dueDate.split('T')[0],
      description: item.description ?? '',
      status: item.status as ActivityStatus,
      responsibleId: item.responsibleId,
    })
    setEditTarget(item)
    ensureEditMembers()
  }
  const { typingUsers, broadcastTyping } = useTypingIndicator()

  // Se precarga una vez si puede asignar a otros: la barra de accion masiva del listado
  // ofrece "Reasignar" apenas aparece, sin esperar a que se abra el modal de edicion.
  useEffect(() => {
    ensureEditMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAssignOthers])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages])

  // Abrir los popouts automaticamente (sin que el usuario tenga que tocar el mensaje):
  // asi no cree que ya se creo y se olvide de elegir/asignar. El mensaje queda clickeable
  // por si cancela. Se abre solo el mas reciente que aun no se haya mostrado.
  //
  // DOS FILTROS QUE NO SON OPCIONALES, desde que estas alertas se guardan (migracion 031):
  //
  // 1. Solo las MIAS. El admin lee todo el chat del equipo, asi que sin esto le saltaba el
  //    popout de la conversacion de otra persona -paso de verdad: al admin se le abria la
  //    alerta de sobrecarga de Manuel- y podia resolver algo que no le correspondia.
  // 2. Solo las que LLEGAN durante la sesion. Antes se perdian al recargar; ahora
  //    sobreviven, y una sin resolver reaparecia en CADA recarga, para siempre. Las que ya
  //    estaban al abrir el chat se marcan como vistas: quedan como burbuja clickeable, que
  //    es suficiente para algo que uno ya vio antes.
  const autoOpenedRef = useRef<Set<string>>(new Set())
  const cargaInicialRef = useRef(true)
  useEffect(() => {
    // Se espera al fin de la carga y no a que haya mensajes: un chat que arranca vacio
    // tambien tiene que quedar marcado, o la primera alerta de la sesion no se abriria.
    if (loading) return
    if (cargaInicialRef.current) {
      cargaInicialRef.current = false
      messages.forEach((m) => autoOpenedRef.current.add(m.id))
      return
    }
    const pendingMsg = messages.find(
      (m) =>
        m.metadata?.type &&
        AUTO_OPEN_TYPES.includes(m.metadata.type as string) &&
        !m.metadata.resolved &&
        (!m.owner_id || m.owner_id === user?.id) &&
        !autoOpenedRef.current.has(m.id),
    )
    if (!pendingMsg) return
    autoOpenedRef.current.add(pendingMsg.id)
    const meta = pendingMsg.metadata as unknown as Record<string, unknown>
    switch (pendingMsg.metadata!.type) {
      case 'category_confirm':
        setCategoryConfirm({
          pending: meta.pending as PendingCategory,
          messageId: pendingMsg.id,
        })
        break
      case 'overload':
        setOverloadData({ pending: meta.pending as PendingOverload, messageId: pendingMsg.id })
        break
      case 'name_confirm':
        setNameConfirm({ data: meta as unknown as NameConfirm, messageId: pendingMsg.id })
        break
      case 'activity_pick':
        setActivityPick({ data: meta as unknown as ActivityPick, messageId: pendingMsg.id })
        break
    }
  }, [messages, loading, user?.id])

  // RESPONDER A UN MENSAJE (como WhatsApp).
  //
  // Al responder se guarda una copia del autor y el texto citado, no solo el id: el chat
  // carga los ultimos 50 mensajes y el original puede quedar fuera de esa ventana, y ahi la
  // cita se veria vacia. Tambien se guarda de que actividad habla, cuando se sabe: eso es
  // lo que le permite a Lumix aplicar el cambio sin preguntar a cual actividad te refieres.
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const registerBubble = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) bubbleRefs.current.set(id, el)
      else bubbleRefs.current.delete(id)
    },
    [],
  )

  const startReply = useCallback(
    (msg: (typeof messages)[number]) => {
      const meta = msg.metadata as
        | { activityId?: string; activity_id?: string; title?: string }
        | null
        | undefined
      setReplyTo({
        id: msg.id,
        author: msg.sender_id === user?.id ? 'Tu' : (msg.sender?.full_name ?? 'Usuario'),
        // En una tarjeta se cita el titulo de la actividad, no el texto de Lumix
        // ("Actividad creada."): citar la confirmacion no dice a que le respondiste.
        text: meta?.title ?? msg.content,
        activityId: meta?.activityId ?? meta?.activity_id,
      })
      inputRef.current?.focus()
    },
    [user?.id],
  )

  // Saltar al mensaje citado. Solo si sigue cargado en el hilo: si es mas viejo que los
  // ultimos 50, la cita se muestra igual pero no lleva a ninguna parte.
  const jumpTo = useCallback((id: string) => {
    const el = bubbleRefs.current.get(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-indigo-500/60', 'rounded-2xl')
    setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500/60', 'rounded-2xl'), 1200)
  }, [])

  const quotedOf = useCallback(
    (msg: (typeof messages)[number]) => {
      const preview = msg.metadata?.reply_preview as ReplyTarget | undefined
      if (!preview) return undefined
      const exists = messages.some((m) => m.id === preview.id)
      return (
        <QuotedMessage reply={preview} onJump={exists ? () => jumpTo(preview.id) : undefined} />
      )
    },
    [messages, jumpTo],
  )

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text) return

    const sent = await sendMessage({
      content: text,
      category: null,
      reply_to: replyTo,
    })
    setInput('')
    setReplyTo(null)

    if (sent) {
      if (messageType === 'masivo') {
        setBulkParsing(true)
        try {
          const items = await parseBulk(text)
          setBulkItems(items)
        } catch (err) {
          console.error('Bulk parse failed:', err)
          setBulkItems([])
        } finally {
          setBulkParsing(false)
        }
      } else {
        classifyAndAct(sent, messageType)
      }
    }
  }, [input, replyTo, sendMessage, classifyAndAct, parseBulk, messageType])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    broadcastTyping()
  }

  const typingText =
    typingUsers.length > 0
      ? typingUsers.length === 1
        ? `${typingUsers[0].name} esta escribiendo...`
        : `${typingUsers.length} personas estan escribiendo...`
      : null

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-3 sm:px-4 h-12 sm:h-14 border-b border-border bg-panel flex-shrink-0">
          <h2 className="text-sm font-semibold text-fg-body">Chat General</h2>
          {teamName && (
            <span className="text-xs font-medium text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 light:bg-indigo-50 light:text-indigo-600 light:border-indigo-200 rounded-full px-2 py-0.5">
              {teamName}
            </span>
          )}
          {!loading && (
            <span className="text-[10px] text-slate-600 ml-auto">{messages.length} mensajes</span>
          )}
        </div>

        {/* Messages. El ancho se acota en pantallas grandes (max-w-3xl, centrado): en un
            notebook o monitor ancho, una columna de chat que ocupa todo el ancho disponible
            se lee peor (lineas larguisimas), igual que WhatsApp Web o Slack. */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
                  <svg
                    className="w-8 h-8 text-slate-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-slate-400">No hay mensajes aun</p>
                <p className="text-xs text-slate-600 mt-1">Escribe algo para empezar</p>
              </div>
            ) : (
              messages.map((msg) =>
                msg.metadata?.type === 'activity_card' ? (
                  <ActivityCard
                    key={msg.id}
                    meta={msg.metadata as unknown as ActivityCardMeta}
                    reply={msg.content}
                    canAssignOthers={canAssignOthers}
                    onComplete={() =>
                      quickUpdate((msg.metadata as unknown as ActivityCardMeta).activityId, {
                        status: 'completado',
                      })
                    }
                    onReschedule={(dueDate) =>
                      quickUpdate((msg.metadata as unknown as ActivityCardMeta).activityId, {
                        due_date: dueDate,
                      })
                    }
                    onReassign={(memberId, memberName) =>
                      quickUpdate((msg.metadata as unknown as ActivityCardMeta).activityId, {
                        responsibleId: memberId,
                        responsibleName: memberName,
                      })
                    }
                    onReply={() => startReply(msg)}
                    listMembers={async () => {
                      const m = await listMembers()
                      return m.map((x) => ({ id: x.id, full_name: x.full_name }))
                    }}
                  />
                ) : msg.metadata?.type === 'activity_list' ? (
                  <ActivityListMessage
                    key={msg.id}
                    header={msg.content}
                    items={
                      (msg.metadata as unknown as { activities: ActivityListItem[] }).activities
                    }
                    onSelect={openEdit}
                    canAssignOthers={canAssignOthers}
                    members={editMembers}
                    onBulkUpdate={bulkQuickUpdate}
                    onQuickUpdate={async (id, changes) => {
                      await quickUpdate(id, changes)
                    }}
                    onDelete={async (id, title) => {
                      await confirmarEliminarActividad(id, title)
                    }}
                  />
                ) : msg.metadata?.type === 'overload' ? (
                  <LumixPromptBubble
                    key={msg.id}
                    content={msg.content}
                    timestamp={msg.created_at}
                    accent="amber"
                    resolution={msg.metadata.resolution as string | undefined}
                    ajena={!!msg.owner_id && msg.owner_id !== user?.id}
                    onOpen={() =>
                      setOverloadData({
                        pending: (msg.metadata as unknown as { pending: PendingOverload }).pending,
                        messageId: msg.id,
                      })
                    }
                  />
                ) : msg.metadata?.type === 'overload_lote' ? (
                  <LumixPromptBubble
                    key={msg.id}
                    content={msg.content}
                    timestamp={msg.created_at}
                    accent="amber"
                    resolution={msg.metadata.resolution as string | undefined}
                    ajena={!!msg.owner_id && msg.owner_id !== user?.id}
                    onOpen={() =>
                      setLote({
                        pending: (msg.metadata as unknown as { pending: PendingLoteSobrecarga })
                          .pending,
                        messageId: msg.id,
                      })
                    }
                  />
                ) : msg.metadata?.type === 'name_confirm' ? (
                  <LumixPromptBubble
                    key={msg.id}
                    content={msg.content}
                    timestamp={msg.created_at}
                    accent="indigo"
                    resolution={msg.metadata.resolution as string | undefined}
                    ajena={!!msg.owner_id && msg.owner_id !== user?.id}
                    onOpen={() =>
                      setNameConfirm({
                        data: msg.metadata as unknown as NameConfirm,
                        messageId: msg.id,
                      })
                    }
                  />
                ) : msg.metadata?.type === 'activity_pick' ? (
                  <LumixPromptBubble
                    key={msg.id}
                    content={msg.content}
                    timestamp={msg.created_at}
                    accent="indigo"
                    resolution={msg.metadata.resolution as string | undefined}
                    ajena={!!msg.owner_id && msg.owner_id !== user?.id}
                    onOpen={() =>
                      setActivityPick({
                        data: msg.metadata as unknown as ActivityPick,
                        messageId: msg.id,
                      })
                    }
                  />
                ) : msg.metadata?.type === 'category_confirm' ? (
                  <LumixPromptBubble
                    key={msg.id}
                    content={msg.content}
                    timestamp={msg.created_at}
                    accent="amber"
                    resolution={msg.metadata.resolution as string | undefined}
                    ajena={!!msg.owner_id && msg.owner_id !== user?.id}
                    onOpen={() =>
                      setCategoryConfirm({
                        pending: (msg.metadata as unknown as { pending: PendingCategory }).pending,
                        messageId: msg.id,
                      })
                    }
                  />
                ) : msg.metadata?.type === 'delete_confirm' ? (
                  <LumixPromptBubble
                    key={msg.id}
                    content={msg.content}
                    timestamp={msg.created_at}
                    accent="amber"
                    resolution={msg.metadata.resolution as string | undefined}
                    ajena={!!msg.owner_id && msg.owner_id !== user?.id}
                    onOpen={() =>
                      setDeleteConfirm({
                        activityId: (msg.metadata as unknown as { activityId: string }).activityId,
                        title: (msg.metadata as unknown as { title: string }).title,
                        messageId: msg.id,
                      })
                    }
                  />
                ) : msg.metadata?.type === 'reclass_proyecto_confirm' ? (
                  <LumixPromptBubble
                    key={msg.id}
                    content={msg.content}
                    timestamp={msg.created_at}
                    accent="sky"
                    resolution={msg.metadata.resolution as string | undefined}
                    ajena={!!msg.owner_id && msg.owner_id !== user?.id}
                    onOpen={() => {
                      const m = msg.metadata as unknown as {
                        activityId: string
                        title: string
                        tema: string
                        comentarios: string
                        primerPunto: string | null
                        plazo: string | null
                        senderId: string
                      }
                      setReclassConfirm({ ...m, messageId: msg.id })
                    }}
                  />
                ) : (
                  <div key={msg.id} ref={registerBubble(msg.id)}>
                    <ChatBubble
                      content={msg.content}
                      sender={{
                        name: msg.sender?.full_name ?? 'Usuario',
                        avatar_url: msg.sender?.avatar_url,
                      }}
                      timestamp={msg.created_at}
                      isOwn={msg.sender_id === user?.id}
                      category={msg.category}
                      isOptimistic={msg.id.startsWith('opt-')}
                      onClick={undefined}
                      quoted={quotedOf(msg)}
                      onReply={() => startReply(msg)}
                    />
                  </div>
                ),
              )
            )}

            {/* Typing indicator */}
            {typingText && (
              <div className="flex items-center gap-2 pl-12">
                <div className="flex gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
                <span className="text-xs text-slate-500">{typingText}</span>
              </div>
            )}
          </div>
        </div>

        {/* Respondiendo a: se ve arriba del input hasta que se envia o se cancela */}
        {replyTo && (
          <div className="px-4 py-2 bg-surface border-t border-border">
            <div className="max-w-3xl mx-auto">
              <QuotedMessage reply={replyTo} onCancel={() => setReplyTo(null)} />
            </div>
          </div>
        )}

        {/* Input */}
        <div
          className="flex-shrink-0 border-t border-border bg-panel p-2 sm:p-3"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="max-w-3xl mx-auto">
            {/* Type selector: puede haber hasta 7 chips (con Minuta/Proyecto visibles) que no
                siempre caben en una pantalla angosta; con overflow-x-auto se desplazan en vez de
                cortarse sin aviso. "Proyecto" es el ultimo de la lista: sin el scrollIntoView de
                abajo quedaba fuera de vista al elegirlo (bug real reportado por Sebastian). */}
            <div className="flex gap-1 mb-2 overflow-x-auto flex-nowrap">
              {(['auto', 'actividad', 'error', 'ingesta', 'masivo', 'minuta', 'proyecto'] as const)
                .filter((t) => (t !== 'minuta' && t !== 'proyecto') || canManageMinuta)
                .map((t) => (
                  <button
                    key={t}
                    ref={messageType === t ? activeChipRef : undefined}
                    onClick={() => setMessageType(t)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors flex-shrink-0 ${
                      messageType === t
                        ? t === 'ingesta'
                          ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                          : t === 'error'
                            ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                            : t === 'actividad'
                              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                              : t === 'masivo'
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                : t === 'minuta'
                                  ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                                  : t === 'proyecto'
                                    ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                                    : 'bg-slate-700 text-slate-200'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-surface'
                    }`}
                  >
                    {t === 'auto' ? 'Auto' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  messageType === 'masivo'
                    ? 'Pega la lista de actividades (una por linea)...'
                    : 'Escribe un mensaje...'
                }
                rows={1}
                className="flex-1 resize-none rounded-xl border border-border-strong bg-panel px-4 py-2.5 text-sm text-fg placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim() || sending || aiProcessing || bulkParsing}
              >
                {sending || aiProcessing || bulkParsing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                )}
              </Button>
            </div>
            <p className="text-[10px] text-slate-600 mt-2 text-center">
              {bulkParsing
                ? 'Analizando la lista de actividades...'
                : aiProcessing
                  ? 'Lumix esta procesando tu mensaje...'
                  : messageType === 'masivo'
                    ? 'Modo masivo: pega varias actividades y confirma antes de crear.'
                    : 'Escribe en lenguaje natural. La IA clasificara tu mensaje automaticamente.'}
            </p>
          </div>
        </div>
      </div>

      {/* Carga acumulada del dia, agrupada. A diferencia del popout de abajo, aca las
          actividades YA estan creadas: esto es una sugerencia y se puede cerrar tocando
          afuera sin consecuencias. */}
      {lote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => !loteBusy && setLote(null)}
        >
          <div
            className="bg-panel rounded-xl border border-amber-500/30 p-5 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-amber-400 mb-1">Día cargado</p>
            <p className="text-xs text-slate-400 mb-3 leading-snug">
              {lote.pending.responsibleName} ya tenía {lote.pending.yaTenia} actividades para el{' '}
              {formatDateLocal(lote.pending.dia)}. Se sumaron estas:
            </p>
            <ul className="mb-3 space-y-1 max-h-40 overflow-y-auto">
              {lote.pending.items.map((it) => (
                <li key={it.id} className="text-xs text-slate-300 leading-snug">
                  • {it.title}
                </li>
              ))}
            </ul>
            <div className="space-y-2">
              {[3, 7].map((d) => (
                <button
                  key={d}
                  disabled={loteBusy}
                  onClick={async () => {
                    setLoteBusy(true)
                    const cuando = await moverLoteSobrecarga(lote.pending, d, lote.messageId)
                    setLoteBusy(false)
                    setLote(null)
                    if (cuando) toast.success(`Movidas al ${cuando}`)
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-indigo-400 light:text-indigo-600 transition-colors"
                >
                  Mover {lote.pending.items.length === 1 ? 'la actividad' : 'las actividades'} +{d}{' '}
                  días hábiles
                </button>
              ))}
              <button
                disabled={loteBusy}
                onClick={async () => {
                  setLoteBusy(true)
                  await dejarLoteSobrecarga(lote.messageId)
                  setLoteBusy(false)
                  setLote(null)
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-fg-muted transition-colors"
              >
                Dejarlas en esa fecha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerta de sobrecarga. Se abre sola al detectarla y no se cierra tocando afuera:
          la actividad NO existe todavia, hay que decidir antes de seguir. */}
      {overloadData &&
        (() => {
          const resolveOverload = async (extraBusinessDays: number) => {
            setCreatingOverload(true)
            try {
              const when = await createOverloadActivity(
                overloadData.pending,
                extraBusinessDays,
                overloadData.messageId,
              )
              // Confirmacion inmediata en el propio modal: el usuario acaba de elegir
              // la fecha y tiene que ver que la actividad quedo creada con esa fecha.
              setOverloadFeedback(when ? `Actividad creada para el ${when}` : '')
              if (!when) setOverloadData(null)
            } finally {
              setCreatingOverload(false)
              setShowCustomDays(false)
              setCustomDays('')
            }
          }

          const closeOverload = () => {
            setOverloadData(null)
            setShowCustomDays(false)
            setCustomDays('')
            setOverloadFeedback('')
          }

          // Cancelar es una DECISION, no un cierre de ventana: queda registrada. Antes solo
          // cerraba el popout, asi que la alerta seguia pendiente y volvia a aparecer en cada
          // recarga, sin forma de decirle al sistema "ya lo decidi, no la quiero".
          const cancelarOverload = async () => {
            await descartarAlerta(overloadData.messageId)
            closeOverload()
          }

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-panel rounded-xl border border-amber-500/30 p-5 max-w-xs w-full mx-4">
                {overloadFeedback ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-emerald-400 font-medium">{overloadFeedback}</p>
                    <button
                      onClick={closeOverload}
                      className="text-xs text-slate-500 mt-3 hover:text-fg-muted"
                    >
                      Cerrar
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-amber-400 mb-1">Sobrecarga detectada</p>
                    <p className="text-xs text-slate-400 mb-1 leading-snug">
                      {overloadData.pending.responsibleName} ya tiene{' '}
                      {overloadData.pending.sameDayCount} actividades ese dia.
                    </p>
                    <p className="text-xs text-slate-500 mb-3 leading-snug">
                      "{overloadData.pending.title}" todavia no se ha creado. ¿Que hacemos?
                    </p>

                    {showCustomDays ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={customDays}
                            onChange={(e) => setCustomDays(e.target.value)}
                            placeholder="dias"
                            autoFocus
                            className="w-20 rounded-lg border border-border-strong bg-field px-3 py-2 text-sm text-fg-body placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-center"
                          />
                          <span className="text-sm text-fg-faint">dias habiles</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const days = parseInt(customDays, 10)
                              if (days && days > 0) resolveOverload(days)
                            }}
                            disabled={
                              creatingOverload || !customDays || parseInt(customDays, 10) < 1
                            }
                            className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
                          >
                            {creatingOverload ? 'Creando...' : 'Mover y crear'}
                          </button>
                          <button
                            disabled={creatingOverload}
                            onClick={() => {
                              setShowCustomDays(false)
                              setCustomDays('')
                            }}
                            className="px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-fg-muted transition-colors"
                          >
                            Volver
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {[
                          { days: 0, label: 'Crear igual en esa fecha' },
                          { days: 3, label: 'Mover +3 dias habiles y crear' },
                          { days: 7, label: 'Mover +7 dias habiles y crear' },
                        ].map((opt) => (
                          <button
                            key={opt.days}
                            disabled={creatingOverload}
                            onClick={() => resolveOverload(opt.days)}
                            className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-fg-body transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                        <button
                          disabled={creatingOverload}
                          onClick={() => setShowCustomDays(true)}
                          className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-indigo-400 light:text-indigo-600 transition-colors"
                        >
                          Otros dias...
                        </button>
                        <button
                          disabled={creatingOverload}
                          onClick={cancelarOverload}
                          className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-red-400 light:text-red-600 transition-colors"
                        >
                          Cancelar (no crear)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })()}

      {/* Confirmacion de responsable: crear actividad, reasignar una existente o asignar
          un tema de minuta. Nada se guarda hasta que se elige una persona. */}
      {nameConfirm &&
        (() => {
          const { data, messageId } = nameConfirm
          const target = data.reassign
            ? { heading: 'Reasignar actividad', label: data.reassign.title }
            : data.minuta
              ? { heading: 'Asignar tema de minuta', label: data.minuta.tema }
              : { heading: 'Asignar actividad', label: data.pending?.title ?? '' }

          const pick = async (id: string, name: string) => {
            setSavingAssign(true)
            try {
              if (data.reassign) {
                await reassignResolved(data.reassign.activityId, id, name, messageId)
              } else if (data.minuta) {
                const responsables = [...(data.otherResponsables ?? []), { id, name }]
                await createMinutaTopic(
                  data.minuta,
                  responsables,
                  user!.id,
                  messageId,
                  data.tipoMinuta,
                  data.primerPunto,
                )
              } else if (data.pending) {
                await createResolvedActivity(data.pending, id, name, messageId)
              }
              setAssignFeedback(`Asignada a ${name}`)
            } finally {
              setSavingAssign(false)
            }
          }

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-panel rounded-xl border border-indigo-500/30 p-5 max-w-xs w-full mx-4">
                {assignFeedback ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-emerald-400 font-medium">{assignFeedback}</p>
                    <button
                      onClick={() => {
                        setNameConfirm(null)
                        setAssignFeedback('')
                      }}
                      className="text-xs text-slate-500 mt-3 hover:text-fg-muted"
                    >
                      Cerrar
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-indigo-400 mb-1">{target.heading}</p>
                    <p className="text-xs text-slate-400 mb-3 leading-snug">"{target.label}"</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {data.candidates.map((c) => (
                        <button
                          key={c.id}
                          disabled={savingAssign}
                          onClick={() => pick(c.id, c.name)}
                          className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-fg-body transition-colors"
                        >
                          {c.name}
                        </button>
                      ))}
                      {user && profile && !data.candidates.some((c) => c.id === user.id) && (
                        <button
                          disabled={savingAssign}
                          onClick={() => pick(user.id, profile.full_name ?? 'Yo')}
                          className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-indigo-400 light:text-indigo-600 transition-colors"
                        >
                          Asignarme a mi
                        </button>
                      )}
                      <button
                        disabled={savingAssign}
                        onClick={async () => {
                          await descartarNombre(messageId)
                          setNameConfirm(null)
                          setAssignFeedback('')
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-red-400 light:text-red-600 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })()}

      {/* Seleccion de actividad a modificar. Al elegir se cierra directo: el resultado se ve
          en la tarjeta que Lumix deja en el chat, y asi el popout no tapa lo que venga despues
          (por ejemplo, la pregunta de a quien reasignar). */}
      {activityPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-panel rounded-xl border border-indigo-500/30 p-5 max-w-xs w-full mx-4">
            <p className="text-sm font-medium text-indigo-400 mb-1">
              ¿A cual actividad te refieres?
            </p>
            <p className="text-xs text-slate-400 mb-3">Toca la que corresponde.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {activityPick.data.candidates.map((c) => (
                <button
                  key={c.id}
                  disabled={savingPick}
                  onClick={async () => {
                    setSavingPick(true)
                    try {
                      await applyPendingUpdate(
                        c.id,
                        activityPick.data.pending,
                        activityPick.messageId,
                      )
                      setActivityPick(null)
                    } finally {
                      setSavingPick(false)
                    }
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-fg-body transition-colors"
                >
                  {c.title}
                </button>
              ))}
              <button
                disabled={savingPick}
                onClick={async () => {
                  await descartarActividadElegida(activityPick.messageId)
                  setActivityPick(null)
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-50 text-sm text-red-400 light:text-red-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmacion de categoria ambigua (actividad vs error/ingesta).
          No se cierra tocando afuera: obliga a elegir una opcion o Cancelar, para que nunca quede a medias. */}
      {categoryConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-panel rounded-xl border border-amber-500/30 p-5 max-w-xs w-full mx-4">
            <p className="text-sm font-medium text-amber-400 mb-1">¿Que tipo es?</p>
            <p className="text-xs text-slate-400 mb-3 leading-snug">
              "{categoryConfirm.pending.title}"
            </p>
            <div className="space-y-2">
              {[
                { value: 'actividad' as const, label: 'Actividad', hint: 'lo mas comun' },
                ...categoryConfirm.pending.options.map((o) =>
                  o === 'ingesta'
                    ? {
                        value: 'ingesta' as const,
                        label: 'Ingesta de datos',
                        hint: 'carga/proceso de datos',
                      }
                    : o === 'proyecto'
                      ? {
                          value: 'proyecto' as const,
                          label: 'Proyecto',
                          hint: 'con subtareas, se sigue en el tiempo',
                        }
                      : { value: 'error' as const, label: 'Error', hint: 'reportar una falla' },
                ),
              ].map((opt) => (
                <button
                  key={opt.value}
                  disabled={savingCategory}
                  onClick={async () => {
                    setSavingCategory(true)
                    try {
                      await confirmCategory(
                        categoryConfirm.pending,
                        opt.value,
                        categoryConfirm.messageId,
                      )
                      setCategoryConfirm(null)
                    } finally {
                      setSavingCategory(false)
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                    opt.value === 'actividad'
                      ? 'bg-indigo-600/20 text-indigo-200 light:text-indigo-700 border border-indigo-500/40 hover:bg-indigo-600/30'
                      : opt.value === 'proyecto'
                        ? 'bg-sky-600/20 text-sky-200 light:text-sky-700 border border-sky-500/40 hover:bg-sky-600/30'
                        : 'bg-surface text-fg-body hover:bg-surface-2'
                  }`}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="block text-[11px] text-fg-faint">{opt.hint}</span>
                </button>
              ))}
              <button
                disabled={savingCategory}
                onClick={() => setCategoryConfirm(null)}
                className="w-full text-left px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 text-sm text-red-400 light:text-red-600 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar una actividad puntual (respondiendo su mensaje con "borrala").
          No se cierra tocando afuera: eliminar no se puede deshacer, asi que exige un click
          explicito en Eliminar o Cancelar. */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-panel rounded-xl border border-red-500/30 p-5 max-w-xs w-full mx-4">
            <p className="text-sm font-medium text-red-400 mb-1">¿Eliminar esta actividad?</p>
            <p className="text-xs text-slate-400 mb-4 leading-snug">
              "{deleteConfirm.title}". No se puede deshacer.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                disabled={deletingActivity}
                onClick={async () => {
                  setDeletingActivity(true)
                  try {
                    await confirmarEliminarActividad(
                      deleteConfirm.activityId,
                      deleteConfirm.title,
                      deleteConfirm.messageId,
                    )
                    setDeleteConfirm(null)
                  } finally {
                    setDeletingActivity(false)
                  }
                }}
              >
                {deletingActivity ? 'Eliminando...' : 'Eliminar'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deletingActivity}
                onClick={async () => {
                  await descartarEliminar(deleteConfirm.messageId)
                  setDeleteConfirm(null)
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar conversion de una actividad a proyecto (respondiendo su mensaje con
          "es un proyecto"/"creala como proyecto"). Elimina la actividad y crea el proyecto
          en su lugar; no se cierra tocando afuera, exige elegir. */}
      {reclassConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-panel rounded-xl border border-sky-500/30 p-5 max-w-xs w-full mx-4">
            <p className="text-sm font-medium text-sky-400 mb-1">¿Convertir en proyecto?</p>
            <p className="text-xs text-slate-400 mb-4 leading-snug">
              "{reclassConfirm.title}". Se elimina la actividad y se crea el proyecto "
              {reclassConfirm.tema}" en su lugar.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={reclassifying}
                onClick={async () => {
                  setReclassifying(true)
                  try {
                    await confirmarReclasificarProyecto(
                      reclassConfirm.activityId,
                      reclassConfirm.tema,
                      reclassConfirm.comentarios,
                      reclassConfirm.primerPunto,
                      reclassConfirm.plazo,
                      reclassConfirm.senderId,
                      reclassConfirm.messageId,
                    )
                    setReclassConfirm(null)
                  } finally {
                    setReclassifying(false)
                  }
                }}
              >
                {reclassifying ? 'Convirtiendo...' : 'Convertir'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={reclassifying}
                onClick={async () => {
                  await descartarReclasificar(reclassConfirm.messageId)
                  setReclassConfirm(null)
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Editar actividad (desde el listado) */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!feedback && !savingEdit) setEditTarget(null)
            setFeedback('')
          }}
        >
          <div
            className="bg-panel rounded-xl border border-indigo-500/30 p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {feedback ? (
              <div className="text-center py-4">
                <p className="text-sm text-emerald-400 font-medium">{feedback}</p>
                <button
                  onClick={() => {
                    setEditTarget(null)
                    setFeedback('')
                  }}
                  className="text-xs text-slate-500 mt-3 hover:text-fg-muted"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-fg mb-3 leading-snug">
                  {editTarget.title.replace(/^\[Ingesta\]\s*/, '')}
                </p>

                <label className="block text-[11px] text-fg-faint mb-1">Descripcion</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border-strong bg-field px-3 py-2 text-sm text-fg-body focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-3"
                />

                <label className="block text-[11px] text-fg-faint mb-1">Prioridad</label>
                <div className="flex gap-1.5 mb-3">
                  {[
                    { v: 1, label: 'Alta', c: 'red' },
                    { v: 2, label: 'Media', c: 'amber' },
                    { v: 3, label: 'Baja', c: 'slate' },
                  ].map((p) => (
                    <button
                      key={p.v}
                      onClick={() => setEditForm((f) => ({ ...f, priority: p.v }))}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                        editForm.priority === p.v
                          ? 'bg-indigo-600/20 text-indigo-300 light:text-indigo-700 border border-indigo-500/40'
                          : 'bg-surface text-fg-faint hover:bg-surface-2'
                      }`}
                    >
                      P{p.v} · {p.label}
                    </button>
                  ))}
                </div>

                <label className="block text-[11px] text-fg-faint mb-1">Fecha de entrega</label>
                <input
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-sm text-fg-body focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-3"
                />

                <label className="block text-[11px] text-fg-faint mb-1">Estado</label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, status: e.target.value as ActivityStatus }))
                  }
                  className="w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-sm text-fg-body focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-4"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                {canAssignOthers && (
                  <>
                    <label className="block text-[11px] text-fg-faint mb-1">Responsable</label>
                    <select
                      value={editForm.responsibleId}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, responsibleId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-sm text-fg-body focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-4"
                    >
                      {editMembers.length === 0 && (
                        <option value={editForm.responsibleId}>{editTarget.responsibleName}</option>
                      )}
                      {editMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <div className="flex gap-2">
                  <button
                    disabled={savingEdit}
                    onClick={async () => {
                      setSavingEdit(true)
                      try {
                        await editActivityFields(editTarget.id, {
                          priority: editForm.priority,
                          due_date: editForm.due_date,
                          description: editForm.description,
                          status: editForm.status,
                          responsibleId: canAssignOthers ? editForm.responsibleId : undefined,
                        })
                        setFeedback('Actividad actualizada')
                      } finally {
                        setSavingEdit(false)
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
                  >
                    {savingEdit ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    disabled={savingEdit}
                    onClick={() => setEditTarget(null)}
                    className="px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 text-sm text-fg-muted transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirmacion de carga masiva */}
      {bulkItems && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => {
            if (!feedback && !bulkCreating) setBulkItems(null)
            setFeedback('')
          }}
        >
          <div
            className="bg-panel rounded-xl border border-emerald-500/30 p-5 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {feedback ? (
              <div className="text-center py-4">
                <p className="text-sm text-emerald-400 font-medium">{feedback}</p>
                <button
                  onClick={() => {
                    setBulkItems(null)
                    setFeedback('')
                  }}
                  className="text-xs text-slate-500 mt-3 hover:text-fg-muted"
                >
                  Cerrar
                </button>
              </div>
            ) : bulkItems.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-fg-muted">No detecte actividades en el texto.</p>
                <button
                  onClick={() => setBulkItems(null)}
                  className="text-xs text-slate-500 mt-3 hover:text-fg-muted"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-emerald-400 mb-1">
                  {bulkItems.length} actividades detectadas
                </p>
                <p className="text-xs text-fg-faint mb-3">Revisa y confirma para crearlas todas.</p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto mb-3">
                  {bulkItems.map((it, i) => (
                    <div key={i} className="px-3 py-2 rounded-lg bg-surface text-xs">
                      <p className="text-fg-body">{it.title}</p>
                      <p className="text-slate-500 mt-0.5">
                        {it.responsible ? `→ ${it.responsible}` : '→ sin asignar'}
                        {it.due_date ? ` · ${it.due_date}` : ''}
                        {` · P${it.priority ?? 2}`}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={bulkCreating}
                    onClick={async () => {
                      setBulkCreating(true)
                      try {
                        const n = await bulkCreate(bulkItems)
                        setFeedback(`${n} actividades creadas`)
                      } finally {
                        setBulkCreating(false)
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
                  >
                    {bulkCreating ? 'Creando...' : `Crear ${bulkItems.length}`}
                  </button>
                  <button
                    disabled={bulkCreating}
                    onClick={() => setBulkItems(null)}
                    className="px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 text-sm text-red-400 light:text-red-600 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
