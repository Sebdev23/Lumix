import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useToast } from '@shared/components/ui/Toast'
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

// `notifications` contiene SOLO las no leidas: es lo unico que muestra la hoja.
// Al marcar una como leida desaparece de la lista.
//
// Se releen al ENTRAR a cada pagina, no por websocket.
// Realtime quedo descartado a proposito: la publicacion supabase_realtime del proyecto esta
// vacia (habria que publicar tablas en la base compartida con produccion) y con estos
// volumenes no compensa. Navegar entre paginas es un momento natural para actualizar y no
// deja conexiones abiertas ni recargas en cascada.
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const toast = useToast()
  const { pathname } = useLocation()
  // Cuantas sin leer habia la ultima vez, por usuario: sirve para avisar solo cuando
  // aparecieron nuevas (y para no avisar al entrar por primera vez ni al cambiar de cuenta).
  const lastSeenRef = useRef<{ userId: string; count: number } | null>(null)

  const fetchState = useCallback(async (userId: string) => {
    const [data, count] = await Promise.all([
      notificationsService.getUnreadForUser(userId),
      notificationsService.getUnreadCount(userId),
    ])
    return { data, count }
  }, [])

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const { data, count } = await fetchState(user.id)
      setNotifications(data)
      setUnreadCount(count)
      lastSeenRef.current = { userId: user.id, count }
    } catch (err) {
      console.error('Notifications refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [user, fetchState])

  // Se dispara al montar y en cada cambio de ruta.
  useEffect(() => {
    if (!user) return

    let cancelled = false

    async function load() {
      try {
        const { data, count } = await fetchState(user!.id)
        if (cancelled) return
        setNotifications(data)
        setUnreadCount(count)

        const prev = lastSeenRef.current
        const mismoUsuario = prev?.userId === user!.id
        if (mismoUsuario && count > prev!.count) {
          const nuevas = count - prev!.count
          toast.info(
            `🔔 ${nuevas} notificacion${nuevas === 1 ? '' : 'es'} nueva${nuevas === 1 ? '' : 's'}`,
          )
        }
        lastSeenRef.current = { userId: user!.id, count }
      } catch (err) {
        console.error('Notifications load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
    // toast se recrea en cada render del provider de toasts; no debe reactivar la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pathname, fetchState])

  const markAsRead = async (id: string) => {
    // La lista solo contiene no leidas: si no esta, ya se marco (evita restar dos veces).
    if (!notifications.some((n) => n.id === id)) return
    // Optimista: desaparece de la lista y baja el contador, sin esperar al servidor.
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setUnreadCount((c) => {
      const next = Math.max(0, c - 1)
      if (user) lastSeenRef.current = { userId: user.id, count: next }
      return next
    })
    try {
      await notificationsService.markAsRead(id)
    } catch (err) {
      console.error('Mark as read failed:', err)
      await refresh()
    }
  }

  const markAllAsRead = async () => {
    if (!user) return
    setNotifications([])
    setUnreadCount(0)
    lastSeenRef.current = { userId: user.id, count: 0 }
    try {
      await notificationsService.markAllAsRead(user.id)
    } catch (err) {
      console.error('Mark all as read failed:', err)
      await refresh()
    }
  }

  return (
    <NotifContext.Provider
      value={{ unreadCount, notifications, loading, markAsRead, markAllAsRead, refresh }}
    >
      {children}
    </NotifContext.Provider>
  )
}

export function useNotificationsContext() {
  const ctx = useContext(NotifContext)
  if (!ctx) throw new Error('useNotificationsContext must be used within NotificationProvider')
  return ctx
}
