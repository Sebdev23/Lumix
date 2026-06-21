import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { AppNotification } from '@shared/types'

interface NotifContextValue {
  unreadCount: number
  notifications: AppNotification[]
  loading: boolean
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

const NotifContext = createContext<NotifContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const refresh = useCallback(async () => {
    if (!user) return
    const [data, count] = await Promise.all([
      notificationsService.getForUser(user.id),
      notificationsService.getUnreadCount(user.id),
    ])
    setNotifications(data as unknown as AppNotification[])
    setUnreadCount(count)
    setLoading(false)
  }, [user])

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
    await refresh()
  }

  const markAllAsRead = async () => {
    if (!user) return
    await notificationsService.markAllAsRead(user.id)
    await refresh()
  }

  return (
    <NotifContext.Provider value={{ unreadCount, notifications, loading, markAsRead, markAllAsRead, refresh }}>
      {children}
    </NotifContext.Provider>
  )
}

export function useNotificationsContext() {
  const ctx = useContext(NotifContext)
  if (!ctx) throw new Error('useNotificationsContext must be used within NotificationProvider')
  return ctx
}
