import { useState } from 'react'

interface Member {
  id: string
  full_name: string
}

interface Props {
  members: Member[]
  selected: string[]
  paraTodos: boolean
  onChange: (next: { responsables: string[]; para_todos: boolean }) => void
  className?: string
}

// Selector multiple de responsables: cajita que abre un panel con checkboxes.
export function MemberMultiSelect({ members, selected, paraTodos, onChange, className }: Props) {
  const [open, setOpen] = useState(false)

  const label = paraTodos
    ? 'Todos'
    : selected.length === 0
      ? 'Sin asignar'
      : selected.length <= 2
        ? selected.map((id) => members.find((m) => m.id === id)?.full_name ?? '—').join(', ')
        : `${selected.length} personas`

  const toggleMember = (id: string) => {
    const next = selected.includes(id) ? selected.filter((r) => r !== id) : [...selected, id]
    onChange({ responsables: next, para_todos: false })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'w-full text-left rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:border-indigo-500/50 truncate'
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
            className="w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] text-slate-500 px-2 py-1">Responsable(s)</p>

            <button
              onClick={() => onChange({ responsables: [], para_todos: !paraTodos })}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 text-left"
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                  paraTodos ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600'
                }`}
              >
                {paraTodos ? '✓' : ''}
              </span>
              <span className="text-xs text-emerald-300 font-medium">Todos</span>
            </button>

            <div className="h-px bg-slate-800 my-1" />

            {/* Si esta "Todos", se oculta la lista individual (es colectivo). */}
            {paraTodos ? (
              <p className="px-2 py-1.5 text-[11px] text-slate-500">
                Colectivo: aplica a todo el equipo. Destilda "Todos" para elegir personas.
              </p>
            ) : (
              members.map((m) => {
                const on = selected.includes(m.id)
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 text-left"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                        on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-600'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="text-xs text-slate-200">{m.full_name}</span>
                  </button>
                )
              })
            )}

            <div className="h-px bg-slate-800 my-1" />
            <div className="flex justify-between px-2 py-1">
              <button
                onClick={() => onChange({ responsables: [], para_todos: false })}
                className="text-[11px] text-slate-500 hover:text-red-400"
              >
                Limpiar
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
