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

  // Deja el id de la actividad en la metadata del mensaje que la origino (migracion 032),
  // para que despues se pueda responder a ese mensaje y saber de que actividad se habla.
  // Es best-effort: si falla, responder a ese mensaje simplemente cae al flujo de siempre.
  async linkActivity(messageId: string, activityId: string): Promise<void> {
    const { error } = await supabase.rpc('vincular_mensaje_actividad', {
      p_message_id: messageId,
      p_activity_id: activityId,
    })
    if (error) throw error
  },

  // Marca una alerta interactiva como resuelta (migracion 031). Va por RPC y no por un
  // update directo: messages no tiene politica UPDATE a proposito, y la funcion solo puede
  // tocar metadata de mensajes propios.
  async resolveInteractive(messageId: string, resolution: string): Promise<void> {
    const { error } = await supabase.rpc('resolver_mensaje_interactivo', {
      p_message_id: messageId,
      p_resolucion: resolution,
    })
    if (error) throw error
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
