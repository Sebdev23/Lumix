interface LumixIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
}

export function LumixIcon({ size = 'md', className = '' }: LumixIconProps) {
  return (
    <div
      className={`${sizes[size]} rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 ${className}`}
    >
      <svg
        className="w-[60%] h-[60%]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Cabeza del bot */}
        <rect x="3" y="6" width="18" height="13" rx="3" />
        {/* Antena */}
        <line x1="12" y1="3" x2="12" y2="6" />
        <circle cx="12" cy="2.5" r="0.8" fill="white" stroke="none" />
        {/* Ojos */}
        <circle cx="8.5" cy="11" r="1.2" fill="white" stroke="none" />
        <circle cx="15.5" cy="11" r="1.2" fill="white" stroke="none" />
        {/* Boca (sonrisa) */}
        <path d="M9 15.5 Q12 18 15 15.5" />
        {/* Rayitas laterales */}
        <line x1="21" y1="10" x2="22.5" y2="10" />
        <line x1="21" y1="13" x2="22.5" y2="13" />
        <line x1="21" y1="16" x2="22.5" y2="16" />
      </svg>
    </div>
  )
}
