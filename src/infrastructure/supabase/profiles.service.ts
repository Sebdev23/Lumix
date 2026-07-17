import { supabase } from '@infrastructure/supabase/client'
import type { Profile } from '@shared/types'

export const profilesService = {
  async getById(id: string): Promise<Profile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async getByTeam(teamId: string): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('user:profiles(*)')
      .eq('team_id', teamId)

    if (error) throw error
    // El admin es supervisor global, no miembro de los equipos: no se lista como integrante.
    return (data ?? [])
      .map((row: { user: unknown }) => row.user as Profile)
      .filter((p) => p && p.role !== 'admin')
  },

  async update(id: string, updates: Partial<Profile>): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
