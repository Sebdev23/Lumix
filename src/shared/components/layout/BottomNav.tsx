import { NavLink } from 'react-router-dom'
import { bottomNavItems } from './navItems'

// Barra de accesos rapidos, solo en movil (complementa al menu hamburguesa).
export function BottomNav() {
  return (
    <nav
      className="lg:hidden flex-shrink-0 flex items-stretch border-t border-slate-800 bg-slate-900"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {bottomNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={item.label}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
              isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
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
