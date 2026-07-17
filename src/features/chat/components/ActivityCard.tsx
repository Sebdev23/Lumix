import { useState } from 'react'
import { formatDateLocal } from '@shared/utils/date'

export interface ActivityCardMeta {
  activityId: string
  title: string
  responsibleName: string
  dueDate: string
  status: string
  priority: number
}

interface Props {
  meta: ActivityCardMeta
  reply?: string
  canAssignOthers: boolean
  onComplete: () => void
  onReschedule: (dueDate: string) => void
  onReassign: (memberId: string, memberName: string) => void
  listMembers: () => Promise<{ id: string; full_name: string }[]>
}

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  bloqueado: 'Bloqueado',
  falta_informacion: 'Falta info',
  esperando_aprobacion: 'Esperando aprobacion',
  completado: 'Completado',
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

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ActivityCard({
  meta,
  reply,
  canAssignOthers,
  onComplete,
  onReschedule,
  onReassign,
  listMembers,
}: Props) {
  const [panel, setPanel] = useState<'move' | 'assign' | null>(null)
  const [members, setMembers] = useState<{ id: string; full_name: string }[]>([])
  const [busy, setBusy] = useState(false)

  const isDone = meta.status === 'completado'
  // formatDateLocal: formato familiar en Chile DD-MM-AAAA y ademas interpreta la fecha como
  // local (evita el corrimiento de 1 dia por zona horaria). Coincide con el listado.
  const dueLabel = formatDateLocal(meta.dueDate)

  const openAssign = async () => {
    if (panel === 'assign') {
      setPanel(null)
      return
    }
    setPanel('assign')
    if (members.length === 0) {
      try {
        setMembers(await listMembers())
      } catch {
        /* ignore */
      }
    }
  }

  const act = async (fn: () => void | Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
      setPanel(null)
    }
  }

  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  const nextWeek = new Date()
  nextWeek.setDate(today.getDate() + 7)

  return (
    <div className="flex gap-2 max-w-[85%]">
      <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[11px] font-semibold text-indigo-400">L</span>
      </div>
      <div className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 p-3">
        {reply && <p className="text-sm text-slate-200 mb-2">{reply}</p>}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-slate-100 font-medium leading-snug">{meta.title}</p>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
              STATUS_STYLES[meta.status] ?? 'bg-slate-700 text-slate-300'
            }`}
          >
            {STATUS_LABELS[meta.status] ?? meta.status}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
          <span>👤 {meta.responsibleName}</span>
          <span>📅 {dueLabel}</span>
          <span className={PRIORITY_STYLES[meta.priority] ?? 'text-slate-400'}>
            P{meta.priority}
          </span>
        </div>

        {!isDone && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <button
              disabled={busy}
              onClick={() => act(onComplete)}
              className="px-2 py-1 rounded-lg bg-emerald-600/15 text-emerald-400 text-[11px] font-medium hover:bg-emerald-600/25 disabled:opacity-50 transition-colors"
            >
              ✓ Completar
            </button>
            <button
              disabled={busy}
              onClick={() => setPanel(panel === 'move' ? null : 'move')}
              className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[11px] font-medium hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              📅 Mover
            </button>
            {canAssignOthers && (
              <button
                disabled={busy}
                onClick={openAssign}
                className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[11px] font-medium hover:bg-slate-600 disabled:opacity-50 transition-colors"
              >
                👤 Reasignar
              </button>
            )}
          </div>
        )}

        {panel === 'move' && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <button
              disabled={busy}
              onClick={() => act(() => onReschedule(toYMD(today)))}
              className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] hover:bg-slate-600 disabled:opacity-50"
            >
              Hoy
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => onReschedule(toYMD(tomorrow)))}
              className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] hover:bg-slate-600 disabled:opacity-50"
            >
              Manana
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => onReschedule(toYMD(nextWeek)))}
              className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] hover:bg-slate-600 disabled:opacity-50"
            >
              +1 semana
            </button>
            <input
              type="date"
              disabled={busy}
              onChange={(e) => e.target.value && act(() => onReschedule(e.target.value))}
              className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] border-0 focus:outline-none"
            />
          </div>
        )}

        {panel === 'assign' && (
          <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto">
            {members.length === 0 ? (
              <span className="text-[11px] text-slate-500">Cargando miembros...</span>
            ) : (
              members.map((m) => (
                <button
                  key={m.id}
                  disabled={busy}
                  onClick={() => act(() => onReassign(m.id, m.full_name))}
                  className="text-left px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] hover:bg-slate-600 disabled:opacity-50"
                >
                  {m.full_name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
