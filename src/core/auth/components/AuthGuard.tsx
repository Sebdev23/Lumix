import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@core/auth/hooks/useAuth'

interface AuthGuardProps {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, profile } = useAuth()

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  const mustChange = user.user_metadata?.must_change_password === true || user.user_metadata?.must_change_password === 'true'

  if (mustChange && profile) {
    return <Navigate to="/change-password" replace />
  }

  return <>{children}</>
}
