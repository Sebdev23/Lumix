import { useState } from 'react'

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']

const pad = (n: number) => String(n).padStart(2, '0')
const toYMD = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

interface Props {
  value: string | null // YYYY-MM-DD
  onChange: (value: string | null) => void
  placeholder?: string
  className?: string
}

// Selector de fecha propio, siempre en español y formato DD-MM-AAAA (independiente del
// idioma del navegador, que es lo que rompe el <input type="date"> nativo).
export function DatePicker({ value, onChange, placeholder = 'Seleccionar', className }: Props) {
  const [open, setOpen] = useState(false)
  const sel = value
    ? { y: +value.slice(0, 4), m: +value.slice(5, 7) - 1, d: +value.slice(8, 10) }
    : null
  const today = new Date()
  const [view, setView] = useState<{ y: number; m: number }>(
    sel ? { y: sel.y, m: sel.m } : { y: today.getFullYear(), m: today.getMonth() },
  )

  const label = sel ? `${pad(sel.d)}-${pad(sel.m + 1)}-${sel.y}` : placeholder

  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7 // lunes = 0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const prev = () => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
  const next = () => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))

  const openPicker = () => {
    if (sel) setView({ y: sel.y, m: sel.m })
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={
          className ??
          'rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:border-indigo-500/50'
        }
      >
        {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-72 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={prev}
                className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                ‹
              </button>
              <span className="text-sm text-slate-200 capitalize">
                {MESES[view.m]} {view.y}
              </span>
              <button
                onClick={next}
                className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500 mb-1">
              {DIAS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) =>
                d === null ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    onClick={() => {
                      onChange(toYMD(view.y, view.m, d))
                      setOpen(false)
                    }}
                    className={`h-8 rounded-lg text-xs transition-colors ${
                      sel && sel.y === view.y && sel.m === view.m && sel.d === d
                        ? 'bg-indigo-600 text-white font-semibold'
                        : today.getFullYear() === view.y &&
                            today.getMonth() === view.m &&
                            today.getDate() === d
                          ? 'bg-slate-800 text-indigo-300'
                          : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {d}
                  </button>
                ),
              )}
            </div>
            <div className="flex justify-between mt-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
                className="text-[11px] text-slate-500 hover:text-red-400"
              >
                Limpiar
              </button>
              <button
                onClick={() => {
                  const t = new Date()
                  onChange(toYMD(t.getFullYear(), t.getMonth(), t.getDate()))
                  setOpen(false)
                }}
                className="text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                Hoy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
