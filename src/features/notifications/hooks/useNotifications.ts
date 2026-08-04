// Etiquetas y colores por tipo de notificacion. El estado vive en NotificationContext:
// tener ademas un hook con su propia copia significaba dos canales realtime abiertos y
// un contador que no se enteraba de lo que hacia el otro.

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
