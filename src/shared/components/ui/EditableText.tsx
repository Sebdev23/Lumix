import { useEffect, useRef, useState } from 'react'

/**
 * Texto de solo lectura + lapiz para editar.
 *
 * Antes el campo de texto (tema, comentarios) era editable con solo tocarlo -un
 * <textarea> siempre activo, sin ningun icono- y con un alto fijo (rows={2} o una
 * aproximacion por longitud) que escondia el texto largo detras de scroll interno poco
 * visible. Eso invitaba ediciones accidentales y cortaba texto real (caso reportado).
 *
 * Ahora el texto se ve SIEMPRE completo (whitespace-pre-wrap, sin alto fijo), y editar es
 * una accion explicita: tocar el lapiz abre un campo que crece con el contenido.
 */
export function EditableText({
  value,
  onSave,
  canEdit,
  placeholder,
  textClassName = '',
  emptyLabel = '-',
  as = 'span',
  // Un tema no puede quedar vacio (mismo criterio que tenia el textarea anterior); los
  // comentarios si pueden, por eso es opcional y no el default.
  preventEmpty = false,
}: {
  value: string
  onSave: (next: string) => void
  canEdit: boolean
  placeholder?: string
  textClassName?: string
  emptyLabel?: string
  as?: 'span' | 'p'
  preventEmpty?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing, draft])

  const confirmar = () => {
    setEditing(false)
    const next = draft.trim()
    if (preventEmpty && !next) {
      setDraft(value)
      return
    }
    if (next !== value) onSave(next)
  }

  const cancelar = () => {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            confirmar()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            cancelar()
          }
        }}
        rows={1}
        spellCheck={false}
        placeholder={placeholder}
        className={`w-full resize-none overflow-hidden rounded border border-indigo-500/40 bg-field px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500/60 ${textClassName}`}
      />
    )
  }

  const Tag = as
  // Contenedor SIEMPRE <div>: un <p> (bloque) no puede ir dentro de un <span> (en linea) -
  // HTML invalido que el navegador "arregla" solo cortando el span a la mitad, rompiendo el
  // flex y produciendo justo el efecto contrario al buscado (texto que se corta/contrae).
  return (
    <div className="flex items-start gap-1.5 w-full">
      <Tag className={`whitespace-pre-wrap break-words flex-1 ${textClassName}`}>
        {value || <span className="text-slate-600">{emptyLabel}</span>}
      </Tag>
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
          title="Editar"
          aria-label="Editar"
          className="flex-shrink-0 mt-0.5 text-slate-500 hover:text-indigo-400 transition-colors"
        >
          ✎
        </button>
      )}
    </div>
  )
}
