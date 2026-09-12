import { useEffect, useRef, type ReactNode } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * Panel de detalle de Proyectos: mismo patron de overlay/Escape/scroll-lock que `Modal`.
 * Se probo como panel lateral deslizante y Sebastian pidio volverlo centrado (igual que el
 * resto de los modales de la app), asi que hoy es un dialogo centrado -el nombre `Drawer`
 * quedo de la version anterior, pero el comportamiento es el de un modal-.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', handleKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className="w-full max-w-md max-h-[85vh] bg-panel border border-border-strong rounded-xl shadow-2xl flex flex-col">
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-strong/50 flex-shrink-0">
            <h3 className="text-base font-semibold text-fg">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="p-2.5 -mr-2.5 rounded-lg hover:bg-surface text-fg-faint hover:text-fg-body transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
