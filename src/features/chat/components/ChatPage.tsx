import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatBubble } from '@shared/components/ui/ChatBubble'
import { Button } from '@shared/components/ui/Button'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useChatMessages } from '@features/chat/hooks/useChatMessages'
import { useTypingIndicator } from '@features/chat/hooks/useTypingIndicator'
import { useFileUpload } from '@features/chat/hooks/useFileUpload'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { teamsService } from '@infrastructure/supabase/teams.service'

export function ChatPage() {
  const [input, setInput] = useState('')
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [overloadData, setOverloadData] = useState<Record<string, unknown> | null>(null)
  const [feedback, setFeedback] = useState('')
  const [messageType, setMessageType] = useState<'auto' | 'actividad' | 'error' | 'ingesta'>('auto')
  const [teamName, setTeamName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { user, profile } = useAuth()
  const teamId = profile?.team_id ?? ''

  useEffect(() => {
    if (teamId) teamsService.getById(teamId).then((t) => setTeamName(t?.name || ''))
  }, [teamId])
  const { messages, loading, sending, aiProcessing, sendMessage, classifyAndAct } =
    useChatMessages()
  const { typingUsers, broadcastTyping } = useTypingIndicator()
  const { upload, uploading } = useFileUpload()

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
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
        if (messageType === 'ingesta') {
          await activitiesService.create({
            title: `[Ingesta] ${text.slice(0, 100)}`,
            description: text,
            responsible_id: user!.id,
            priority: 3,
            status: 'pendiente',
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            dependencies: [],
            observations: 'Tipo: Ingesta de datos',
            team_id: teamId,
            created_by: user!.id,
          })
          sendMessage({ content: `Ingesta creada: ${text}`, category: 'actividad' })
        } else {
          classifyAndAct(sent, messageType)
        }
      }
    }
  }, [input, attachedFile, sendMessage, upload, classifyAndAct, messageType, teamId, user])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setAttachedFile(file)
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
            messages.map((msg) => (
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
                onClick={
                  msg.metadata?.type === 'overload'
                    ? () => {
                        setOverloadData(msg.metadata!)
                      }
                    : undefined
                }
              />
            ))
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
            {(['auto', 'actividad', 'error', 'ingesta'] as const).map((t) => (
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
                          : 'bg-slate-700 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t === 'auto'
                  ? 'Auto'
                  : t === 'ingesta'
                    ? 'Ingesta'
                    : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors flex-shrink-0"
              title="Adjuntar archivo"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={(!input.trim() && !attachedFile) || sending || uploading || aiProcessing}
            >
              {sending || uploading || aiProcessing ? (
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
            {aiProcessing
              ? 'Lumix esta procesando tu mensaje...'
              : 'Escribe en lenguaje natural. La IA clasificara tu mensaje automaticamente.'}
          </p>
        </div>
      </div>

      {overloadData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => {
            if (!feedback) setOverloadData(null)
            setFeedback('')
          }}
        >
          <div
            className="bg-slate-900 rounded-xl border border-amber-500/30 p-5 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {feedback ? (
              <div className="text-center py-4">
                <svg
                  className="w-10 h-10 text-emerald-400 mx-auto mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-emerald-400 font-medium">{feedback}</p>
                <button
                  onClick={() => {
                    setOverloadData(null)
                    setFeedback('')
                  }}
                  className="text-xs text-slate-500 mt-3 hover:text-slate-400"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-400 mb-1">Sobrecarga detectada</p>
                <p className="text-xs text-slate-400 mb-3">Que queres hacer con esta actividad?</p>
                <div className="space-y-2">
                  <button
                    onClick={async () => {
                      const m = overloadData
                      const dueDate = new Date(m.pendingDueDate as string)
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
                      setFeedback('Actividad creada')
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                  >
                    Crear igual
                  </button>
                  <button
                    onClick={async () => {
                      const m = overloadData
                      const dueDate = new Date(m.pendingDueDate as string)
                      dueDate.setDate(dueDate.getDate() + 3)
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
                      setFeedback('Actividad movida +3 dias')
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                  >
                    Mover +3 dias
                  </button>
                  <button
                    onClick={async () => {
                      const m = overloadData
                      const dueDate = new Date(m.pendingDueDate as string)
                      dueDate.setDate(dueDate.getDate() + 7)
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
                      setFeedback('Actividad movida +7 dias')
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                  >
                    Mover +7 dias
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
