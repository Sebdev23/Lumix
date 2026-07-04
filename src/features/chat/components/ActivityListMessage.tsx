export interface ActivityListItem {
  id: string
  title: string
  responsibleId: string
  responsibleName: string
  dueDate: string
  status: string
  priority: number
  description: string
}

const STATUS_STYLES: Record<string, string> = {
  pendiente: 'bg-slate-700 text-slate-300',
  en_proceso: 'bg-blue-600/20 text-blue-400',
  bloqueado: 'bg-red-600/20 text-red-400',
  falta_informacion: 'bg-amber-600/20 text-amber-400',
  esperando_aprobacion: 'bg-purple-600/20 text-purple-400',
  completado: 'bg-emerald-600/20 text-emerald-400',
}

const PRIORITY_STYLES: Record<number, string> = {
  1: 'text-red-400',
  2: 'text-amber-400',
  3: 'text-slate-400',
}

interface Props {
  header: string
  items: ActivityListItem[]
  onSelect: (item: ActivityListItem) => void
}

export function ActivityListMessage({ header, items, onSelect }: Props) {
  return (
    <div className="flex gap-2 max-w-[90%]">
      <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[11px] font-semibold text-indigo-400">L</span>
      </div>
      <div className="flex-1">
        <p className="text-sm text-slate-300 mb-2">{header}</p>
        <div className="space-y-1.5">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onSelect(it)}
              className="w-full text-left rounded-xl border border-slate-700 bg-slate-800/80 p-2.5 hover:bg-slate-800 hover:border-indigo-500/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] text-slate-100 font-medium leading-snug">{it.title}</p>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                    STATUS_STYLES[it.status] ?? 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {it.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                <span>👤 {it.responsibleName}</span>
                <span>
                  📅{' '}
                  {new Date(it.dueDate).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
                <span className={PRIORITY_STYLES[it.priority] ?? 'text-slate-400'}>
                  P{it.priority}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
