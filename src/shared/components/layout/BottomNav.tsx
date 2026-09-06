import { NavLink } from 'react-router-dom'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { bottomNavItems } from './navItems'

// Barra de accesos rapidos, solo en movil (complementa al menu hamburguesa).
export function BottomNav() {
  const { can } = useCapabilities()
  return (
    <nav
      className="md:hidden flex-shrink-0 flex items-stretch border-t border-border bg-panel"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {bottomNavItems
        .filter((item) => !item.capability || can(item.capability))
        .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-indigo-400 light:text-indigo-600'
                  : 'text-slate-500 hover:text-fg-muted'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
    </nav>
  )
}
