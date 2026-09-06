import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-medium text-fg-muted">{label}</label>}
        <input
          ref={ref}
          // text-base (16px), no text-sm: Safari/iOS hace zoom automatico al enfocar un
          // input con letra menor a 16px (mismo bug real que en el textarea del chat).
          className={`w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-base text-fg placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors light:placeholder:text-slate-400 ${error ? 'border-red-500 focus:ring-red-500/50' : ''} ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'
