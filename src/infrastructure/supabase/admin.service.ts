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
    if (error) throw new Error(error.message)
    if (data.error) throw new Error(data.error)
    return data
  },

  async changeRole(userId: string, teamId: string, role: string) {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'change-role', userId, teamId, role },
    })
    if (error) throw new Error(error.message)
    if (data.error) throw new Error(data.error)
    return data
  },
}
