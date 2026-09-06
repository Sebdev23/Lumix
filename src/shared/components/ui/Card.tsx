import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border-strong/50 bg-surface/50 backdrop-blur-sm light:shadow-sm ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  )
}
