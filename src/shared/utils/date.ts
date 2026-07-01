export function parseDateLocal(isoString: string): Date {
  const [y, m, d] = isoString.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDateLocal(isoString: string, format?: 'short' | 'full'): string {
  const date = parseDateLocal(isoString)
  if (format === 'short') {
    return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
  }
  return date.toLocaleDateString('es-CL')
}

export function getDaysRemainingLocal(dueDate: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = parseDateLocal(dueDate)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}
