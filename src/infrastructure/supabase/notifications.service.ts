import { supabase } from '@infrastructure/supabase/client'

interface NotificationPayload {
  title: string
  body: string
  type: 'activity_blocked' | 'missing_info' | 'critical_error' | 'deadline_soon' | 'overload'
  metadata?: Record<string, unknown>
}

export const notificationsService = {
  async getForUser(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data ?? []
  },

  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
    if (error) throw error
    return count ?? 0
  },

  async send(userId: string, notification: NotificationPayload): Promise<void> {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      metadata: notification.metadata ?? {},
    })
    if (error) throw error
  },

  async sendToTeam(teamId: string, notification: NotificationPayload): Promise<void> {
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId)

    if (!members) return

    const notifications = members.map((m) => ({
      user_id: m.user_id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      metadata: notification.metadata ?? {},
    }))

    const { error } = await supabase.from('notifications').insert(notifications)
    if (error) throw error
  },

  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
    if (error) throw error
  },

  async markAllAsRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
    if (error) throw error
  },

  subscribeToUser(userId: string, callback: (notification: Notification) => void) {
    return supabase
      .channel(`notifications-${userId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          callback(payload.new as Notification)
        },
      )
      .subscribe()
  },
}
