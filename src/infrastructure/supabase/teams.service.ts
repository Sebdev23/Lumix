import { supabase } from '@infrastructure/supabase/client'

interface Team {
  id: string
  name: string
  /** Cuantas actividades puede tener alguien para un mismo dia antes de que Lumix avise.
   *  0 = sin aviso. Lo decide la jefatura del equipo (migracion 036). */
  umbral_sobrecarga?: number
  description: string | null
  created_by: string
  created_at: string
}

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: string
  permissions?: Record<string, boolean>
  joined_at: string
}

export const teamsService = {
  async getMyTeams(userId: string): Promise<Team[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('team:teams(*)')
      .eq('user_id', userId)

    if (error) throw error
    return (data ?? []).map((d: { team: unknown }) => d.team as Team)
  },

  // Equipos donde el usuario es manager (jefatura/admin): destinos para delegar.
  async getManagedTeams(userId: string): Promise<Team[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('role, team:teams(*)')
      .eq('user_id', userId)
      .in('role', ['admin', 'jefatura'])
    if (error) throw error
    return (data ?? []).map((d: { team: unknown }) => d.team as Team)
  },

  async getById(teamId: string): Promise<Team | null> {
    const { data, error } = await supabase.from('teams').select('*').eq('id', teamId).single()
    if (error) return null
    return data
  },

  async getMembers(
    teamId: string,
  ): Promise<(TeamMember & { profile: { full_name: string; email: string } })[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('*, profile:profiles(full_name, email)')
      .eq('team_id', teamId)
      .neq('role', 'admin')
    if (error) throw error
    return data as unknown as (TeamMember & { profile: { full_name: string; email: string } })[]
  },

  /** Cambia el umbral de sobrecarga del equipo. La RLS solo lo permite a admin/jefatura. */
  async setUmbralSobrecarga(teamId: string, umbral: number): Promise<void> {
    const { error } = await supabase
      .from('teams')
      .update({ umbral_sobrecarga: umbral })
      .eq('id', teamId)
    if (error) throw error
  },

  async create(name: string, description: string, userId: string): Promise<Team> {
    const { data, error } = await supabase
      .from('teams')
      .insert({ name, description, created_by: userId })
      .select()
      .single()
    if (error) throw error

    await supabase.from('team_members').insert({
      team_id: data.id,
      user_id: userId,
      role: 'admin',
    })

    return data
  },

  async addMember(teamId: string, email: string): Promise<void> {
    const { data: userId, error: lookupError } = await supabase.rpc('find_user_id_by_email', {
      lookup_email: email,
    })

    if (lookupError) throw new Error('Error al buscar usuario')
    if (!userId) throw new Error('Usuario no encontrado. Debe registrarse primero en /signup')

    const { error } = await supabase.from('team_members').insert({
      team_id: teamId,
      user_id: userId,
      role: 'colaborador',
    })

    if (error) throw error

    await supabase.from('profiles').update({ team_id: teamId }).eq('id', userId)
  },

  async changeRole(teamId: string, userId: string, role: string): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId)
    if (error) throw error
  },

  async updatePermissions(
    teamId: string,
    userId: string,
    permissions: Record<string, boolean>,
  ): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .update({ permissions })
      .eq('team_id', teamId)
      .eq('user_id', userId)
    if (error) throw error
  },

  async removeMember(teamId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId)
    if (error) throw error
  },
}
