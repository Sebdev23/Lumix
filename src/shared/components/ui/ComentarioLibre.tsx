/**
 * Comentario de texto libre, siempre editable (sin lapiz) y sin auto-resize por foco.
 *
 * Extraido de CompromisosPage.tsx (donde se creo por primera vez, para el comentario del tema
 * vinculado a un compromiso) porque Proyectos lo necesita igual, en las tarjetas del Tablero.
 *
 * A diferencia de `EditableText` (ver/editar como dos modos con tamaños de letra distintos),
 * este campo se ve exactamente igual este enfocado o no -Sebastian reporto que el salto de
 * tamaño de EditableText al tocar el lapiz (chico -> 16px, necesario para que iOS no haga zoom
 * solo) se sentia como un salto raro.
 *
 * Arranca del tamaño de lo que ya esta escrito (contando saltos de linea reales, no lineas
 * envueltas por ancho), con un tope de 3 -mas que eso y se pisaria contra otras filas/tarjetas
 * de la lista. Si hace falta ver mas, se agranda a mano con el tirador nativo (resize-y).
 */
export function ComentarioLibre({
  value,
  canEdit,
  onSave,
  textClassName = 'text-[10px] text-slate-500',
  // Se APEGA a las clases base (no las reemplaza): permite que un caller (ej. la tarjeta del
  // Tablero de Proyectos) le quite el borde/fondo propio para meterlo dentro de un contenedor
  // con su propio estilo tipo "globo de chat", sin bifurcar el componente.
  className = '',
}: {
  value: string
  canEdit: boolean
  onSave: (next: string) => void
  textClassName?: string
  className?: string
}) {
  if (!canEdit) {
    return (
      <p className={`whitespace-pre-wrap break-words ${textClassName}`}>
        {value || 'Sin comentarios'}
      </p>
    )
  }

  const lineasEscritas = value ? value.split('\n').length : 1
  const filas = Math.min(Math.max(lineasEscritas, 1), 3)

  return (
    <textarea
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value !== value) onSave(e.target.value)
      }}
      placeholder="Agregar comentario..."
      rows={filas}
      spellCheck={false}
      // text-base (16px) SIEMPRE, no solo al enfocar: si cambiara entre ver/editar, Safari
      // haria zoom automatico igual al primer toque, y ademas se notaria el salto de tamaño.
      className={`w-full resize-y rounded border border-border-strong bg-field px-1.5 py-1 text-base sm:text-[10px] text-fg-body placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 ${className}`}
    />
  )
}
