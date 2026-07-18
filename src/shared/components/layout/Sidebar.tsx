import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Avatar } from '@shared/components/ui/Avatar'
import { LumixIcon } from '@shared/components/ui/LumixIcon'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useNotificationsContext } from '@core/notifications/NotificationContext'
import { teamsService } from '@infrastructure/supabase/teams.service'
import { supabase } from '@infrastructure/supabase/client'
import { navItems, ShieldIcon } from './navItems'

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { profile, signOut, user } = useAuth()
  const { unreadCount } = useNotificationsContext()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (!isAdmin || !user) return
    teamsService.getMyTeams(user.id).then(setTeams)
  }, [isAdmin, user])

  const switchTeam = async (teamId: string) => {
    if (!user || !profile || teamId === profile.team_id) return
    setSwitching(true)
    await supabase.from('profiles').update({ team_id: teamId }).eq('id', user.id)
    window.location.reload()
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }
  return (
    <aside
      className="flex flex-col h-full bg-slate-900 border-r border-slate-800"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-800 flex-shrink-0">
        <LumixIcon size="sm" />
        <span className="text-slate-200 font-semibold text-sm">Lumix</span>
      </div>

      {/* Team selector - admin only */}
      {isAdmin && teams.length > 0 && (
        <div className="px-3 py-2 border-b border-slate-800">
          <select
            value={profile?.team_id ?? ''}
            onChange={(e) => switchTeam(e.target.value)}
            disabled={switching}
            className="w-full text-xs rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.id === profile?.team_id ? '(activo)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.to === '/notifications' && unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                {unreadCount}
              </span>
            )}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-red-600/20 text-red-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`
            }
          >
            <ShieldIcon className="w-5 h-5 flex-shrink-0" />
            <span>Admin</span>
          </NavLink>
        )}
      </nav>

      {/* User */}
      <div className="flex-shrink-0 border-t border-slate-800 p-3">
        <div
          onClick={() => navigate('/profile')}
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800 cursor-pointer group"
        >
          <Avatar name={profile?.full_name ?? 'Usuario'} src={profile?.avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">
              {profile?.full_name ?? 'Usuario'}
            </p>
            <p className="text-xs text-slate-500 truncate capitalize">
              {profile?.role ?? 'colaborador'}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleLogout()
            }}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors"
            title="Cerrar sesion"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
