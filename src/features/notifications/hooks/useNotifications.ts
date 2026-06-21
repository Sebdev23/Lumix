import { useState, useEffect } from 'react'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { AppNotification } from '@shared/types'

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    let cancelled = false

    async function load() {
      const [data, count] = await Promise.all([
        notificationsService.getForUser(user!.id),
        notificationsService.getUnreadCount(user!.id),
      ])
      if (cancelled) return
      setNotifications(data as unknown as AppNotification[])
      setUnreadCount(count)
      setLoading(false)
    }

    load()

    const channel = notificationsService.subscribeToUser(user.id, () => {
      if (!cancelled) load()
    })

    return () => {
      cancelled = true
      channel.unsubscribe()
    }
  }, [user])

  const markAsRead = async (id: string) => {
    await notificationsService.markAsRead(id)
    if (!user) return
    const [data, count] = await Promise.all([
      notificationsService.getForUser(user.id),
      notificationsService.getUnreadCount(user.id),
    ])
    setNotifications(data as unknown as AppNotification[])
    setUnreadCount(count)
  }

  const markAllAsRead = async () => {
    if (!user) return
    await notificationsService.markAllAsRead(user.id)
    const [data, count] = await Promise.all([
      notificationsService.getForUser(user.id),
      notificationsService.getUnreadCount(user.id),
    ])
    setNotifications(data as unknown as AppNotification[])
    setUnreadCount(count)
  }

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead }
}

export function getNotificationIcon(type: string) {
  switch (type) {
    case 'activity_blocked':
      return 'bg-red-500'
    case 'critical_error':
      return 'bg-red-600'
    case 'deadline_soon':
      return 'bg-amber-500'
    case 'missing_info':
      return 'bg-blue-500'
    case 'overload':
      return 'bg-orange-500'
    default:
      return 'bg-slate-500'
  }
}

export function getNotificationLabel(type: string) {
  switch (type) {
    case 'activity_blocked':
      return 'Actividad bloqueada'
    case 'critical_error':
      return 'Error critico'
    case 'deadline_soon':
      return 'Fecha limite proxima'
    case 'missing_info':
      return 'Falta informacion'
    case 'overload':
      return 'Sobrecarga'
    default:
      return 'Notificacion'
  }
}
