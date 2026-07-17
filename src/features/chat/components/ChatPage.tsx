import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatBubble } from '@shared/components/ui/ChatBubble'
import { Button } from '@shared/components/ui/Button'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useChatMessages } from '@features/chat/hooks/useChatMessages'
import { useTypingIndicator } from '@features/chat/hooks/useTypingIndicator'
import { useFileUpload } from '@features/chat/hooks/useFileUpload'
import { useSpeechRecognition } from '@features/chat/hooks/useSpeechRecognition'
import { transcribeAudio, type BulkActivity } from '@core/ai-engine/client'
import { supabase } from '@infrastructure/supabase/client'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { teamsService } from '@infrastructure/supabase/teams.service'
import { ActivityCard, type ActivityCardMeta } from '@features/chat/components/ActivityCard'
import {
  ActivityListMessage,
  type ActivityListItem,
} from '@features/chat/components/ActivityListMessage'
import type { ActivityStatus } from '@shared/types'
import type {
  PendingActivity,
  PendingUpdate,
  PendingCategory,
} from '@features/chat/hooks/useChatMessages'

type NameConfirm = { candidates: { id: string; name: string }[]; pending: PendingActivity }
type ActivityPick = { candidates: { id: string; title: string }[]; pending: PendingUpdate }

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
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [overloadData, setOverloadData] = useState<Record<string, unknown> | null>(null)
  const [nameConfirm, setNameConfirm] = useState<NameConfirm | null>(null)
  const [activityPick, setActivityPick] = useState<ActivityPick | null>(null)
  const [categoryConfirm, setCategoryConfirm] = useState<{
    pending: PendingCategory
    messageId: string
  } | null>(null)
  const [savingCategory, setSavingCategory] = useState(false)
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
  const [customDays, setCustomDays] = useState('')
  const [showCustomDays, setShowCustomDays] = useState(false)
  const [messageType, setMessageType] = useState<
    'auto' | 'actividad' | 'error' | 'ingesta' | 'masivo'
  >('auto')
  const [teamName, setTeamName] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''

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
    confirmCategory,
    quickUpdate,
    applyPendingUpdate,
    editActivityFields,
    listMembers,
  } = useChatMessages()

  const canAssignOthers = profile?.role === 'admin' || profile?.role === 'jefatura'

  const openEdit = (item: ActivityListItem) => {
    setEditForm({
      priority: item.priority,
      due_date: item.dueDate.split('T')[0],
      description: item.description ?? '',
      status: item.status as ActivityStatus,
      responsibleId: item.responsibleId,
    })
    setEditTarget(item)
    if (canAssignOthers && editMembers.length === 0) {
      listMembers()
        .then((m) => setEditMembers(m.map((x) => ({ id: x.id, full_name: x.full_name }))))
        .catch(() => {})
    }
  }
  const { typingUsers, broadcastTyping } = useTypingIndicator()
  const { upload, uploading } = useFileUpload()
  const {
    isListening,
    isSupported,
    startListening,
    stopListening,
    transcript,
    error: recorderError,
  } = useSpeechRecognition()
  const [transcribing, setTranscribing] = useState(false)
  const prevListeningRef = useRef(false)

  useEffect(() => {
    if (prevListeningRef.current && !isListening && transcript) {
      setInput((prev) => prev + (prev ? ' ' : '') + transcript)
    }
    prevListeningRef.current = isListening
  }, [isListening, transcript])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages])

  // Abrir el popout de categoria automaticamente (sin que el usuario tenga que tocar el mensaje):
  // asi no cree que ya se creo y se olvide de elegir/asignar. El mensaje queda clickeable por si cancela.
  const autoOpenedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const pendingMsg = messages.find(
      (m) => m.metadata?.type === 'category_confirm' && !autoOpenedRef.current.has(m.id),
    )
    if (pendingMsg) {
      autoOpenedRef.current.add(pendingMsg.id)
      setCategoryConfirm({
        pending: (pendingMsg.metadata as unknown as { pending: PendingCategory }).pending,
        messageId: pendingMsg.id,
      })
    }
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text && !attachedFile) return

    let fileUrl: string | undefined
    let fileName: string | undefined
    let fileType: string | undefined

    if (attachedFile) {
      const result = await upload(attachedFile)
      if (result) {
        fileUrl = result.url
        fileName = result.name
        fileType = result.type
      }
      setAttachedFile(null)
    }

    if (text || fileUrl) {
      const sent = await sendMessage({
        content: text,
        category: null,
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,
      })
      setInput('')

      if (sent && text) {
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
    }
  }, [input, attachedFile, sendMessage, upload, classifyAndAct, parseBulk, messageType])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleVoiceToggle = useCallback(async () => {
    if (isListening || transcribing) {
      if (transcribing) return
      const blob = await stopListening()
      if (blob) {
        setTranscribing(true)
        const filePath = `chat/voice-${Date.now()}.webm`
        try {
          const { error: uploadErr } = await supabase.storage
            .from('chat-files')
            .upload(filePath, blob, { contentType: 'audio/webm' })
          if (uploadErr) throw uploadErr
          // URL firmada de corta duracion (privada): solo vive lo que dura la transcripcion
          const { data: urlData, error: signErr } = await supabase.storage
            .from('chat-files')
            .createSignedUrl(filePath, 120)
          if (signErr || !urlData) throw signErr ?? new Error('No se pudo firmar el audio')
          const text = await transcribeAudio(urlData.signedUrl)
          setInput((prev) => prev + (prev ? ' ' : '') + text)
        } catch {
          /* ignore */
        } finally {
          // Borrar el audio: no se almacena nada (mas barato y privado)
          try {
            await supabase.storage.from('chat-files').remove([filePath])
          } catch {
            /* ignore */
          }
          setTranscribing(false)
        }
      }
    } else {
      setInput('')
      startListening()
    }
  }, [isListening, transcribing, stopListening, startListening])

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
        <div className="flex items-center gap-3 px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-200">Chat General</h2>
          <span className="text-xs text-slate-500">{teamName || 'Chat'}</span>
          {!loading && (
            <span className="text-[10px] text-slate-600 ml-auto">{messages.length} mensajes</span>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
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
                  listMembers={async () => {
                    const m = await listMembers()
                    return m.map((x) => ({ id: x.id, full_name: x.full_name }))
                  }}
                />
              ) : msg.metadata?.type === 'activity_list' ? (
                <ActivityListMessage
                  key={msg.id}
                  header={msg.content}
                  items={(msg.metadata as unknown as { activities: ActivityListItem[] }).activities}
                  onSelect={openEdit}
                />
              ) : msg.metadata?.type === 'overload' ? (
                <div key={msg.id} className="flex gap-3 max-w-[85%]">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[11px] font-semibold text-indigo-400">L</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 mb-1 ml-1">Lumix</span>
                    <button
                      onClick={() => setOverloadData(msg.metadata!)}
                      className="rounded-2xl rounded-bl-md bg-slate-700 px-4 py-2.5 text-sm text-left text-slate-200 cursor-pointer hover:brightness-110 transition-all border border-amber-500/20"
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </button>
                    <span className="text-[10px] text-slate-500 mt-1 ml-1">
                      {new Date(msg.created_at).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ) : msg.metadata?.type === 'name_confirm' ? (
                <div key={msg.id} className="flex gap-3 max-w-[85%]">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[11px] font-semibold text-indigo-400">L</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 mb-1 ml-1">Lumix</span>
                    <button
                      onClick={() => setNameConfirm(msg.metadata as unknown as NameConfirm)}
                      className="rounded-2xl rounded-bl-md bg-slate-700 px-4 py-2.5 text-sm text-left text-slate-200 cursor-pointer hover:brightness-110 transition-all border border-indigo-500/20"
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </button>
                    <span className="text-[10px] text-slate-500 mt-1 ml-1">
                      {new Date(msg.created_at).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ) : msg.metadata?.type === 'activity_pick' ? (
                <div key={msg.id} className="flex gap-3 max-w-[85%]">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[11px] font-semibold text-indigo-400">L</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 mb-1 ml-1">Lumix</span>
                    <button
                      onClick={() => setActivityPick(msg.metadata as unknown as ActivityPick)}
                      className="rounded-2xl rounded-bl-md bg-slate-700 px-4 py-2.5 text-sm text-left text-slate-200 cursor-pointer hover:brightness-110 transition-all border border-indigo-500/20"
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </button>
                    <span className="text-[10px] text-slate-500 mt-1 ml-1">
                      {new Date(msg.created_at).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ) : msg.metadata?.type === 'category_confirm' ? (
                <div key={msg.id} className="flex gap-3 max-w-[85%]">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[11px] font-semibold text-indigo-400">L</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 mb-1 ml-1">Lumix</span>
                    <button
                      onClick={() =>
                        setCategoryConfirm({
                          pending: (msg.metadata as unknown as { pending: PendingCategory })
                            .pending,
                          messageId: msg.id,
                        })
                      }
                      className="rounded-2xl rounded-bl-md bg-slate-700 px-4 py-2.5 text-sm text-left text-slate-200 cursor-pointer hover:brightness-110 transition-all border border-amber-500/20"
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </button>
                    <span className="text-[10px] text-slate-500 mt-1 ml-1">
                      {new Date(msg.created_at).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ) : (
                <ChatBubble
                  key={msg.id}
                  content={msg.content}
                  sender={{
                    name: msg.sender?.full_name ?? 'Usuario',
                    avatar_url: msg.sender?.avatar_url,
                  }}
                  timestamp={msg.created_at}
                  isOwn={msg.sender_id === user?.id}
                  category={msg.category}
                  fileUrl={msg.file_url}
                  fileName={msg.file_name}
                  isOptimistic={msg.id.startsWith('opt-')}
                  onClick={undefined}
                />
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

        {/* Attached file preview */}
        {attachedFile && (
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-t border-slate-700">
            <svg
              className="w-4 h-4 text-indigo-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
            <span className="text-xs text-slate-300 truncate flex-1">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Input */}
        <div
          className="flex-shrink-0 border-t border-slate-800 bg-slate-900 p-2 sm:p-3"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Type selector */}
          <div className="flex gap-1 mb-2">
            {(['auto', 'actividad', 'error', 'ingesta', 'masivo'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMessageType(t)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                  messageType === t
                    ? t === 'ingesta'
                      ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                      : t === 'error'
                        ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                        : t === 'actividad'
                          ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                          : t === 'masivo'
                            ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-700 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t === 'auto' ? 'Auto' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            {isSupported && (
              <button
                onClick={handleVoiceToggle}
                disabled={transcribing}
                className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                  isListening
                    ? 'bg-red-600 text-white animate-pulse'
                    : transcribing
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-indigo-400'
                }`}
                title={
                  isListening
                    ? 'Detener grabacion'
                    : transcribing
                      ? 'Transcribiendo...'
                      : 'Grabar mensaje de voz'
                }
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </button>
            )}
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                messageType === 'masivo'
                  ? 'Pega la lista de actividades (una por linea)...'
                  : 'Escribe un mensaje...'
              }
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={
                (!input.trim() && !attachedFile) ||
                sending ||
                uploading ||
                aiProcessing ||
                bulkParsing
              }
            >
              {sending || uploading || aiProcessing || bulkParsing ? (
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
            {isListening
              ? 'Grabando... toca el microfono para detener'
              : recorderError
                ? recorderError
                : bulkParsing
                  ? 'Analizando la lista de actividades...'
                  : aiProcessing
                    ? 'Lumix esta procesando tu mensaje...'
                    : messageType === 'masivo'
                      ? 'Modo masivo: pega varias actividades y confirma antes de crear.'
                      : 'Escribe en lenguaje natural. La IA clasificara tu mensaje automaticamente.'}
          </p>
        </div>
      </div>

      {overloadData &&
        (() => {
          const createOverloadActivity = async (extraDays: number) => {
            const m = overloadData
            const dueDate = new Date(m.pendingDueDate as string)
            dueDate.setDate(dueDate.getDate() + extraDays)
            await activitiesService.create({
              title: m.pendingTitle as string,
              description: m.pendingDesc as string,
              responsible_id: m.pendingResponsibleId as string,
              priority: m.pendingPriority as number,
              status: 'pendiente',
              due_date: dueDate.toISOString(),
              dependencies: [],
              observations: '',
              team_id: teamId,
              created_by: m.pendingSenderId as string,
            })
          }

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              onClick={() => {
                setOverloadData(null)
                setShowCustomDays(false)
                setCustomDays('')
              }}
            >
              <div
                className="bg-slate-900 rounded-xl border border-amber-500/30 p-5 max-w-xs w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-medium text-amber-400 mb-1">Sobrecarga detectada</p>
                <p className="text-xs text-slate-400 mb-3">Que queres hacer con esta actividad?</p>

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
                        className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-center"
                      />
                      <span className="text-sm text-slate-400">dias</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const days = parseInt(customDays, 10)
                          if (days && days > 0) {
                            await createOverloadActivity(days)
                            setOverloadData(null)
                            setShowCustomDays(false)
                            setCustomDays('')
                          }
                        }}
                        disabled={!customDays || parseInt(customDays, 10) < 1}
                        className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
                      >
                        Mover
                      </button>
                      <button
                        onClick={() => {
                          setShowCustomDays(false)
                          setCustomDays('')
                        }}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-300 transition-colors"
                      >
                        Volver
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={async () => {
                        await createOverloadActivity(0)
                        setOverloadData(null)
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                    >
                      Crear igual
                    </button>
                    <button
                      onClick={async () => {
                        await createOverloadActivity(3)
                        setOverloadData(null)
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                    >
                      Mover +3 dias
                    </button>
                    <button
                      onClick={async () => {
                        await createOverloadActivity(7)
                        setOverloadData(null)
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                    >
                      Mover +7 dias
                    </button>
                    <button
                      onClick={() => setShowCustomDays(true)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-indigo-300 transition-colors"
                    >
                      Otros dias...
                    </button>
                    <button
                      onClick={() => {
                        setOverloadData(null)
                        setFeedback('')
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-red-400 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

      {/* Confirmacion de responsable */}
      {nameConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => {
            if (!feedback) setNameConfirm(null)
            setFeedback('')
          }}
        >
          <div
            className="bg-slate-900 rounded-xl border border-indigo-500/30 p-5 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {feedback ? (
              <div className="text-center py-4">
                <p className="text-sm text-emerald-400 font-medium">{feedback}</p>
                <button
                  onClick={() => {
                    setNameConfirm(null)
                    setFeedback('')
                  }}
                  className="text-xs text-slate-500 mt-3 hover:text-slate-400"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-indigo-400 mb-1">Asignar actividad</p>
                <p className="text-xs text-slate-400 mb-3">"{nameConfirm.pending.title}"</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {nameConfirm.candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={async () => {
                        await createResolvedActivity(nameConfirm.pending, c.id, c.name)
                        setFeedback(`Asignada a ${c.name}`)
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                    >
                      {c.name}
                    </button>
                  ))}
                  {user && profile && (
                    <button
                      onClick={async () => {
                        await createResolvedActivity(
                          nameConfirm.pending,
                          user.id,
                          profile.full_name ?? 'Yo',
                        )
                        setFeedback('Asignada a ti')
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-indigo-300 transition-colors"
                    >
                      Asignarme a mi
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setNameConfirm(null)
                      setFeedback('')
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-red-400 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Seleccion de actividad a modificar */}
      {activityPick && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => {
            if (!feedback) setActivityPick(null)
            setFeedback('')
          }}
        >
          <div
            className="bg-slate-900 rounded-xl border border-indigo-500/30 p-5 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {feedback ? (
              <div className="text-center py-4">
                <p className="text-sm text-emerald-400 font-medium">{feedback}</p>
                <button
                  onClick={() => {
                    setActivityPick(null)
                    setFeedback('')
                  }}
                  className="text-xs text-slate-500 mt-3 hover:text-slate-400"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-indigo-400 mb-1">
                  ¿A cual actividad te refieres?
                </p>
                <p className="text-xs text-slate-400 mb-3">Toca la que corresponde.</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {activityPick.candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={async () => {
                        await applyPendingUpdate(c.id, activityPick.pending)
                        setFeedback('Actividad actualizada')
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                    >
                      {c.title}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setActivityPick(null)
                      setFeedback('')
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-red-400 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirmacion de categoria ambigua (actividad vs error/ingesta).
          No se cierra tocando afuera: obliga a elegir una opcion o Cancelar, para que nunca quede a medias. */}
      {categoryConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 rounded-xl border border-amber-500/30 p-5 max-w-xs w-full mx-4">
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
                      ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-600/30'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="block text-[11px] text-slate-400">{opt.hint}</span>
                </button>
              ))}
              <button
                disabled={savingCategory}
                onClick={() => setCategoryConfirm(null)}
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-red-400 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
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
            className="bg-slate-900 rounded-xl border border-indigo-500/30 p-5 max-w-sm w-full"
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
                  className="text-xs text-slate-500 mt-3 hover:text-slate-400"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-100 mb-3 leading-snug">
                  {editTarget.title.replace(/^\[Ingesta\]\s*/, '')}
                </p>

                <label className="block text-[11px] text-slate-400 mb-1">Descripcion</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-3"
                />

                <label className="block text-[11px] text-slate-400 mb-1">Prioridad</label>
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
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      P{p.v} · {p.label}
                    </button>
                  ))}
                </div>

                <label className="block text-[11px] text-slate-400 mb-1">Fecha de entrega</label>
                <input
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-3"
                />

                <label className="block text-[11px] text-slate-400 mb-1">Estado</label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, status: e.target.value as ActivityStatus }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-4"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                {canAssignOthers && (
                  <>
                    <label className="block text-[11px] text-slate-400 mb-1">Responsable</label>
                    <select
                      value={editForm.responsibleId}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, responsibleId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-4"
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
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-300 transition-colors"
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
            className="bg-slate-900 rounded-xl border border-emerald-500/30 p-5 max-w-sm w-full mx-4"
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
                  className="text-xs text-slate-500 mt-3 hover:text-slate-400"
                >
                  Cerrar
                </button>
              </div>
            ) : bulkItems.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-300">No detecte actividades en el texto.</p>
                <button
                  onClick={() => setBulkItems(null)}
                  className="text-xs text-slate-500 mt-3 hover:text-slate-400"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-emerald-400 mb-1">
                  {bulkItems.length} actividades detectadas
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Revisa y confirma para crearlas todas.
                </p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto mb-3">
                  {bulkItems.map((it, i) => (
                    <div key={i} className="px-3 py-2 rounded-lg bg-slate-800 text-xs">
                      <p className="text-slate-200">{it.title}</p>
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
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-red-400 transition-colors"
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
