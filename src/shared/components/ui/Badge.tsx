import type { ReactNode } from 'react'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-2 text-fg-body',
  success:
    'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50 light:bg-emerald-100 light:text-emerald-700 light:border-emerald-300',
  warning:
    'bg-amber-900/50 text-amber-400 border border-amber-700/50 light:bg-amber-100 light:text-amber-700 light:border-amber-300',
  danger:
    'bg-red-900/50 text-red-400 border border-red-700/50 light:bg-red-100 light:text-red-700 light:border-red-300',
  info: 'bg-blue-900/50 text-blue-400 border border-blue-700/50 light:bg-blue-100 light:text-blue-700 light:border-blue-300',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
