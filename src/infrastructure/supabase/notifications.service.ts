import { supabase } from '@infrastructure/supabase/client'
import type { AppNotification } from '@shared/types'

interface NotificationPayload {
  title: string
  body: string
  type: 'activity_blocked' | 'missing_info' | 'critical_error' | 'deadline_soon' | 'overload'
  metadata?: Record<string, unknown>
}

export const notificationsService = {
  // La hoja de Notificaciones muestra SOLO las no leidas, asi que se filtran en la consulta
  // y no en el cliente: con el tope de 50, traer tambien las leidas hacia que las viejas
  // desplazaran a las nuevas fuera del listado.
  async getUnreadForUser(userId: string): Promise<AppNotification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
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

  // Avisa a un subconjunto del equipo. Sin opciones, le llega a todos (como antes).
  //   roles       : solo esos roles dentro del equipo (ej. jefatura/admin)
  //   alsoUserIds : se suman aunque no cumplan el filtro de rol (ej. el responsable)
  //   exceptUserId: quien provoco el evento no necesita que le avisen de su propia accion
  // Existe porque "Actividad bloqueada" le llegaba al equipo entero: era el 61% de todas
  // las notificaciones del sistema y casi ninguna se leia.
  async sendToTeam(
    teamId: string,
    notification: NotificationPayload,
    opts: {
      exceptUserId?: string
      roles?: string[]
      alsoUserIds?: (string | null | undefined)[]
    } = {},
  ): Promise<void> {
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId)

    if (!members) return

    const byRole = opts.roles ? members.filter((m) => opts.roles!.includes(m.role)) : members
    const ids = new Set(byRole.map((m) => m.user_id))

    // Los sumados deben pertenecer al equipo: si no, la fila queda sin poder verse.
    const enTeam = new Set(members.map((m) => m.user_id))
    for (const extra of opts.alsoUserIds ?? []) {
      if (extra && enTeam.has(extra)) ids.add(extra)
    }

    if (opts.exceptUserId) ids.delete(opts.exceptUserId)
    if (ids.size === 0) return

    const notifications = [...ids].map((userId) => ({
      user_id: userId,
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

  // No hay subscribeToUser: las notificaciones se releen al navegar entre paginas
  // (ver NotificationContext). Existia una suscripcion realtime que NUNCA recibio nada,
  // porque la publicacion supabase_realtime del proyecto no tiene ninguna tabla. Un
  // suscriptor que parece funcionar y no funciona es peor que no tenerlo.
}
