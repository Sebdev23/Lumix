// Bloque citado, como en WhatsApp. Se usa en dos lugares: arriba del input mientras
// escribes la respuesta, y dentro de la burbuja una vez enviada.
//
// El texto viene de la copia guardada al responder, no del mensaje original: el chat carga
// los ultimos 50 mensajes y el original puede quedar fuera de esa ventana.

import type { ReplyTarget } from '@features/chat/types'

type Props = {
  reply: ReplyTarget
  /** Saltar al mensaje original. Solo se ofrece si sigue cargado en el hilo. */
  onJump?: () => void
  /** Cancelar la respuesta (solo en el preview sobre el input). */
  onCancel?: () => void
}

export function QuotedMessage({ reply, onJump, onCancel }: Props) {
  const text = reply.text.length > 120 ? `${reply.text.slice(0, 120)}…` : reply.text

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={onJump}
        disabled={!onJump}
        className={`flex-1 flex items-stretch gap-2 rounded-lg bg-slate-800/70 text-left overflow-hidden ${
          onJump ? 'cursor-pointer hover:bg-slate-800' : 'cursor-default'
        }`}
      >
        <span className="w-1 bg-indigo-500 flex-shrink-0" aria-hidden="true" />
        <span className="py-1.5 pr-2 min-w-0">
          <span className="block text-xs font-medium text-indigo-400 truncate">{reply.author}</span>
          <span className="block text-xs text-slate-400 truncate">{text}</span>
        </span>
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar respuesta"
          className="px-2 text-slate-500 hover:text-slate-300 transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  )
}
