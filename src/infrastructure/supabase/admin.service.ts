import { supabase } from '@infrastructure/supabase/client'

export const adminService = {
  async createUser(
    email: string,
    password: string,
    fullName: string,
    role: string,
    teamId?: string,
  ) {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create-user', email, password, fullName, role, teamId },
    })

    if (error) {
      const detail =
        typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
      throw new Error(detail)
    }
    if (!data) throw new Error('Empty response from admin-users function')
    if (data.error) throw new Error(data.error)
    return data
  },

  async changeRole(userId: string, teamId: string, role: string) {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'change-role', userId, teamId, role },
    })
    if (error) {
      const detail =
        typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
      throw new Error(detail)
    }
    if (!data) throw new Error('Empty response from admin-users function')
    if (data.error) throw new Error(data.error)
    return data
  },
}
