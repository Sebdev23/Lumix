import { Card } from '@shared/components/ui/Card'
import { useNotificationsContext } from '@core/notifications/NotificationContext'
import { getNotificationIcon, getNotificationLabel } from '@features/notifications/hooks/useNotifications'

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMs / 3600000)

  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin}m`
  if (diffHrs < 24) return `Hace ${diffHrs}h`
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export function NotificationsPage() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotificationsContext()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Notificaciones</h2>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-medium">
              {unreadCount} nuevas
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Marcar todas leidas
          </button>
        )}
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="w-12 h-12 text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm text-slate-400">No hay notificaciones</p>
            <p className="text-xs text-slate-600 mt-1">Todo al dia</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <Card
              key={notif.id}
              padding="md"
              className={`transition-colors ${!notif.read ? 'border-indigo-500/30 bg-indigo-500/5' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${getNotificationIcon(notif.type)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] text-indigo-400 uppercase tracking-wider">
                        {getNotificationLabel(notif.type)}
                      </span>
                      <h3 className={`text-sm mt-0.5 ${!notif.read ? 'text-slate-100 font-medium' : 'text-slate-400'}`}>
                        {notif.title}
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">
                      {formatTime(notif.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{notif.body}</p>

                  {!notif.read && (
                    <button
                      onClick={() => markAsRead(notif.id)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-2 transition-colors"
                    >
                      Marcar como leida
                    </button>
                  )}
                </div>
                {!notif.read && (
                  <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
