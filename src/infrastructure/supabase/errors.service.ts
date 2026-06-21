import { supabase } from '@infrastructure/supabase/client'
import type { AppError } from '@shared/types'

export const errorsService = {
  async getAll(): Promise<AppError[]> {
    const { data, error } = await supabase
      .from('errors')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getAllBySeverity(severity: string): Promise<AppError[]> {
    const { data, error } = await supabase
      .from('errors')
      .select('*')
      .eq('severity', severity)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getByTeam(teamId: string): Promise<AppError[]> {
    const { data, error } = await supabase
      .from('errors')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getById(id: string): Promise<AppError | null> {
    const { data, error } = await supabase.from('errors').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async getBySeverity(teamId: string, severity: string): Promise<AppError[]> {
    const { data, error } = await supabase
      .from('errors')
      .select('*')
      .eq('team_id', teamId)
      .eq('severity', severity)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(
    error: Omit<
      AppError,
      'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'error_type' | 'observations'
    >,
  ): Promise<AppError> {
    const { data, error: err } = await supabase.from('errors').insert(error).select().single()
    if (err) throw err
    return data
  },

  async update(id: string, updates: Partial<AppError>): Promise<AppError> {
    const { data, error } = await supabase
      .from('errors')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async subscribeToTeam(
    teamId: string,
    callback: (payload: { new: AppError; old: AppError }) => void,
  ) {
    return supabase
      .channel(`errors-${teamId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'errors',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          callback(payload as unknown as { new: AppError; old: AppError })
        },
      )
      .subscribe()
  },
}
