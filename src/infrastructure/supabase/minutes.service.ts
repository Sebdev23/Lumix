import { supabase } from '@infrastructure/supabase/client'
import type { MinuteItem } from '@shared/types'

export const minutesService = {
  async getByTeam(teamId: string): Promise<MinuteItem[]> {
    const { data, error } = await supabase
      .from('minute_items')
      .select('*')
      .eq('team_id', teamId)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async create(
    item: Omit<
      MinuteItem,
      'id' | 'created_at' | 'updated_at' | 'plazo_change_count' | 'plazo_history'
    > &
      Partial<Pick<MinuteItem, 'plazo_change_count' | 'plazo_history'>>,
  ): Promise<MinuteItem> {
    const { data, error } = await supabase.from('minute_items').insert(item).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<MinuteItem>): Promise<MinuteItem> {
    const { data, error } = await supabase
      .from('minute_items')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('minute_items').delete().eq('id', id)
    if (error) throw error
  },

  async subscribeToTeam(teamId: string, callback: () => void) {
    return supabase
      .channel(`minutes-${teamId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'minute_items', filter: `team_id=eq.${teamId}` },
        () => callback(),
      )
      .subscribe()
  },
}
