import { supabase } from '@infrastructure/supabase/client'
import type { Message } from '@shared/types'

export const messagesService = {
  async getByTeam(teamId: string, limit = 50): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(full_name, avatar_url)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).reverse()
  },

  async getByTeamAfter(teamId: string, after: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(full_name, avatar_url)')
      .eq('team_id', teamId)
      .gt('created_at', after)
      .order('created_at')
    if (error) throw error
    return data ?? []
  },

  async send(message: Omit<Message, 'id' | 'created_at'> & { is_ai?: boolean }): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({ ...message, is_ai: message.is_ai ?? false })
      .select()
      .single()
    if (error) throw error
    return data
  },

  subscribeToTeam(teamId: string, callback: (message: Message) => void) {
    return supabase
      .channel(`messages-${teamId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          callback(payload.new as Message)
        },
      )
      .subscribe()
  },
}
