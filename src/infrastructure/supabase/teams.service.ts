import { supabase } from '@infrastructure/supabase/client'

interface Team {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
}

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: string
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
    if (error) throw error
    return data as unknown as (TeamMember & { profile: { full_name: string; email: string } })[]
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
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (profileError) throw new Error('Error al buscar usuario')
    if (!profile) throw new Error('Usuario no encontrado. Debe registrarse primero en /signup')

    const { error } = await supabase.from('team_members').insert({
      team_id: teamId,
      user_id: profile.id,
      role: 'colaborador',
    })

    if (error) throw error

    await supabase.from('profiles').update({ team_id: teamId }).eq('id', profile.id)
  },

  async changeRole(teamId: string, userId: string, role: string): Promise<void> {
    const { error } = await supabase
      .from('team_members')
      .update({ role })
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
