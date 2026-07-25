import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '@shared/types'

export interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  /** Rol del usuario EN EL EQUIPO ACTIVO (team_members.role). Base para capacidades por equipo. */
  teamRole: string | null
  /** Permisos extra (flags) del usuario en el equipo activo. */
  teamPermissions: Record<string, boolean>
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
}
