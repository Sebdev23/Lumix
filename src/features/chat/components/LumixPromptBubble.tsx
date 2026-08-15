// Burbuja de Lumix que hace una PREGUNTA: sobrecarga, a quien asigno, que categoria es,
// cual actividad. Los cuatro casos se renderizaban con el mismo bloque copiado; ahora
// tambien tienen que saber mostrarse resueltos, asi que vive en un solo lugar.
//
// Resuelta = el usuario ya decidio. Deja de ser un boton: desde la migracion 031 estos
// mensajes se guardan de verdad, y si siguieran clickeables se podria responder la misma
// pregunta otra vez despues de recargar y crear la actividad dos veces.

type Props = {
  content: string
  timestamp: string
  accent: 'amber' | 'indigo'
  /** Texto de lo que se decidio. Si viene, la burbuja queda inerte. */
  resolution?: string | null
  /**
   * La pregunta es de otra conversacion (el admin lee el chat de todo el equipo).
   *
   * Se muestra, pero no se puede responder: solo su dueño puede cerrarla, y la base lo
   * exige. Sin esto el admin podia resolver la alerta de otra persona, crear la actividad a
   * su nombre y dejar la alerta abierta igual, porque la marca era rechazada.
   */
  ajena?: boolean
  onOpen: () => void
}

const ACCENT_BORDER = {
  amber: 'border-amber-500/20',
  indigo: 'border-indigo-500/20',
}

export function LumixPromptBubble({
  content,
  timestamp,
  accent,
  resolution,
  ajena,
  onOpen,
}: Props) {
  const bubble = 'rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-left border'

  return (
    <div className="flex gap-3 max-w-[85%]">
      <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[11px] font-semibold text-indigo-400">L</span>
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-slate-400 mb-1 ml-1">Lumix</span>
        {resolution ? (
          <div className={`${bubble} bg-slate-800 text-slate-400 border-slate-700`}>
            <p className="whitespace-pre-wrap break-words">{content}</p>
            <p className="mt-1.5 text-xs text-emerald-500/80">✓ {resolution}</p>
          </div>
        ) : ajena ? (
          <div className={`${bubble} bg-slate-800 text-slate-400 border-slate-700`}>
            <p className="whitespace-pre-wrap break-words">{content}</p>
            <p className="mt-1.5 text-xs text-slate-500">Pendiente de su responsable</p>
          </div>
        ) : (
          <button
            onClick={onOpen}
            className={`${bubble} bg-slate-700 text-slate-200 cursor-pointer hover:brightness-110 transition-all ${ACCENT_BORDER[accent]}`}
          >
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </button>
        )}
        <span className="text-[10px] text-slate-500 mt-1 ml-1">
          {new Date(timestamp).toLocaleTimeString('es-CL', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}
