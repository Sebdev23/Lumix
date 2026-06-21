import { Avatar } from './Avatar'

interface ChatBubbleProps {
  content: string
  sender: {
    name: string
    avatar_url?: string | null
  }
  timestamp: string
  isOwn?: boolean
  category?: string | null
  fileUrl?: string | null
  fileName?: string | null
  isOptimistic?: boolean
  onClick?: () => void
}

const categoryLabels: Record<string, string> = {
  actividad: 'Actividad',
  error: 'Error',
  reunion: 'Reunion',
  recordatorio: 'Recordatorio',
  nota: 'Nota',
  consulta: 'Consulta',
}

export function ChatBubble({
  content,
  sender,
  timestamp,
  isOwn = false,
  category,
  fileUrl,
  fileName,
  isOptimistic = false,
  onClick,
}: ChatBubbleProps) {
  const isFile = !!fileUrl

  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && (
        <Avatar
          name={sender.name}
          src={sender.avatar_url}
          size="sm"
          className="mt-1 flex-shrink-0"
        />
      )}
      <div className={`flex flex-col ${isOwn ? 'items-end' : ''} max-w-[80%]`}>
        {!isOwn && <span className="text-xs text-slate-400 mb-1 ml-1">{sender.name}</span>}

        {/* File attachment */}
        {isFile && fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm ${
              isOwn ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-200'
            } mb-1 hover:underline`}
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="truncate">{fileName}</span>
          </a>
        )}

        {/* Text content */}
        {content && (
          <div
            onClick={onClick}
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isOwn
                ? 'bg-indigo-600 text-white rounded-br-md'
                : 'bg-slate-700 text-slate-200 rounded-bl-md'
            } ${isOptimistic ? 'opacity-70' : ''} ${onClick ? 'cursor-pointer hover:brightness-110' : ''}`}
          >
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>
        )}

        <div className={`flex items-center gap-2 mt-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-slate-500">{formatTime(timestamp)}</span>
          {category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">
              {categoryLabels[category] ?? category}
            </span>
          )}
          {isOwn && (
            <span className="text-[10px] text-slate-600">
              {isOptimistic ? 'enviando...' : 'enviado'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
