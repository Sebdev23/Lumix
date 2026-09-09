import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { NovedadesModal } from '@shared/components/ui/NovedadesModal'
import { useAppHeight } from '@shared/hooks/useAppHeight'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  // El chat ya tiene todo lo demas al alcance via el hamburguesa: una segunda barra fija
  // abajo le resta ~50-60px permanentes justo donde vive su propio input+boton enviar, y en
  // el celular (con el teclado abierto) eso terminaba empujando el boton fuera del area
  // visible. Las demas rutas mantienen el BottomNav como siempre.
  const ocultarBottomNav = location.pathname.startsWith('/chat')
  useAppHeight()

  return (
    <div
      className="flex bg-shell text-fg"
      // position: fixed + top/height tomados en vivo de visualViewport (useAppHeight): asi
      // el layout SIEMPRE pinta donde el navegador dice que esta lo visible, en vez de vivir
      // en el flujo normal del documento -eso es lo que dejaba la parte de arriba fuera de
      // la vista al cerrar el teclado en iOS (offsetTop que no vuelve a 0, bug real
      // reportado por Sebastian; ver el docblock de useAppHeight.ts para el detalle).
      style={{
        position: 'fixed',
        top: 'var(--app-top, 0px)',
        left: 0,
        width: '100%',
        height: 'var(--app-height, 100dvh)',
      }}
    >
      <NovedadesModal />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - desktop always visible, mobile slide-over.
          El corte es en md (768px) y no lg (1024px): un notebook con escalado de Windows al
          125-150% (muy comun) reporta un ancho logico de ~900-1100px, y con el corte en lg
          caia del lado "movil" (drawer + header + bottom nav) en vez del de escritorio. */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header
          className="flex items-center gap-3 px-3 border-b border-border bg-panel md:hidden flex-shrink-0"
          style={{
            height: 'calc(3rem + env(safe-area-inset-top))',
            paddingTop: 'env(safe-area-inset-top)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            // p-2.5 (no p-1.5): objetivo tactil de ~40px, mas cerca de los 44px que
            // recomiendan Apple/Material para el boton principal de navegacion en mobile.
            className="p-2.5 -ml-2 rounded-lg hover:bg-surface text-fg-faint"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <span className="text-fg-body font-semibold text-sm">Lumix</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>

        {/* Navegacion inferior (solo movil) */}
        {!ocultarBottomNav && <BottomNav />}
      </div>
    </div>
  )
}
