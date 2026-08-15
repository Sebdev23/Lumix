import { useState } from 'react'
import { parseDateLocal } from '@shared/utils/date'
import type { ActivityStatus } from '@shared/types'

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

export interface BulkChanges {
  status?: ActivityStatus
  due_date?: string
  responsibleId?: string
  responsibleName?: string
}

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface Props {
  header: string
  items: ActivityListItem[]
  onSelect: (item: ActivityListItem) => void
  canAssignOthers?: boolean
  members?: { id: string; full_name: string }[]
  onBulkUpdate?: (ids: string[], changes: BulkChanges) => Promise<void>
  // Accion rapida sobre UNA fila, igual que los botones de ActivityCard (crear/editar desde
  // el chat). Sin esto la fila solo abre el modal completo al tocarla.
  onQuickUpdate?: (id: string, changes: BulkChanges) => Promise<void>
}

// Modo seleccion: solo tiene sentido ofrecerlo si hay a donde aplicar el resultado
// (onBulkUpdate). Sin eso, el listado se comporta igual que antes (tocar = editar una).
export function ActivityListMessage({
  header,
  items,
  onSelect,
  canAssignOthers = false,
  members = [],
  onBulkUpdate,
  onQuickUpdate,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [picker, setPicker] = useState<'date' | 'reassign' | null>(null)
  const [dateValue, setDateValue] = useState('')
  const [reassignId, setReassignId] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  // Panel rapido abierto en UNA fila (mover o reasignar), independiente del modo seleccion.
  const [rowPanel, setRowPanel] = useState<{ id: string; type: 'move' | 'assign' } | null>(null)
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)

  const supportsBulk = !!onBulkUpdate
  const hasSelection = selected.size > 0

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelected(new Set())
    setPicker(null)
    setDateValue('')
    setReassignId('')
  }

  const applyBulk = async (changes: BulkChanges) => {
    if (!onBulkUpdate || selected.size === 0) return
    setBusy(true)
    try {
      const ids = [...selected]
      await onBulkUpdate(ids, changes)
      setDone(
        `${ids.length} actividad${ids.length === 1 ? '' : 'es'} actualizada${ids.length === 1 ? '' : 's'}`,
      )
      clearSelection()
    } finally {
      setBusy(false)
    }
  }

  const runQuick = async (id: string, changes: BulkChanges) => {
    if (!onQuickUpdate) return
    setRowBusyId(id)
    try {
      await onQuickUpdate(id, changes)
      setRowPanel(null)
    } finally {
      setRowBusyId(null)
    }
  }

  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  const nextWeek = new Date()
  nextWeek.setDate(today.getDate() + 7)

  return (
    <div className="flex gap-2 max-w-[90%]">
      <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[11px] font-semibold text-indigo-400">L</span>
      </div>
      <div className="flex-1">
        <p className="text-sm text-slate-300 mb-2">{header}</p>
        <div className="space-y-1.5">
          {items.map((it) => {
            const isSelected = selected.has(it.id)
            const isDone = it.status === 'completado'
            const showQuickActions = !!onQuickUpdate && !hasSelection && !isDone
            const panelOpen = rowPanel?.id === it.id ? rowPanel.type : null
            const rowBusy = rowBusyId === it.id
            return (
              <div
                key={it.id}
                onClick={() => (hasSelection ? toggle(it.id) : onSelect(it))}
                className={`w-full text-left rounded-xl border p-2.5 transition-colors cursor-pointer flex items-start gap-2 ${
                  isSelected
                    ? 'border-indigo-500/60 bg-indigo-600/10'
                    : 'border-slate-700 bg-slate-800/80 hover:bg-slate-800 hover:border-indigo-500/40'
                }`}
              >
                {supportsBulk && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(it.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 flex-shrink-0 accent-indigo-500"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] text-slate-100 font-medium leading-snug">
                      {it.title}
                    </p>
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
                      {parseDateLocal(it.dueDate).toLocaleDateString('es-CL', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                    <span className={PRIORITY_STYLES[it.priority] ?? 'text-slate-400'}>
                      P{it.priority}
                    </span>
                  </div>

                  {/* Mismos botones rapidos que ActivityCard, para poder actuar directo desde
                      una lista (ej. "que tengo esta semana") sin abrir el modal completo. */}
                  {showQuickActions && (
                    <div
                      className="flex flex-wrap gap-1.5 mt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        disabled={rowBusy}
                        onClick={() => runQuick(it.id, { status: 'completado' as ActivityStatus })}
                        className="px-2 py-1 rounded-lg bg-emerald-600/15 text-emerald-400 text-[11px] font-medium hover:bg-emerald-600/25 disabled:opacity-50 transition-colors"
                      >
                        ✓ Completar
                      </button>
                      <button
                        disabled={rowBusy}
                        onClick={() =>
                          setRowPanel(panelOpen === 'move' ? null : { id: it.id, type: 'move' })
                        }
                        className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[11px] font-medium hover:bg-slate-600 disabled:opacity-50 transition-colors"
                      >
                        📅 Mover
                      </button>
                      {canAssignOthers && (
                        <button
                          disabled={rowBusy}
                          onClick={() =>
                            setRowPanel(
                              panelOpen === 'assign' ? null : { id: it.id, type: 'assign' },
                            )
                          }
                          className="px-2 py-1 rounded-lg bg-slate-700 text-slate-300 text-[11px] font-medium hover:bg-slate-600 disabled:opacity-50 transition-colors"
                        >
                          👤 Reasignar
                        </button>
                      )}
                    </div>
                  )}

                  {panelOpen === 'move' && (
                    <div
                      className="flex flex-wrap items-center gap-1.5 mt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        disabled={rowBusy}
                        onClick={() => runQuick(it.id, { due_date: toYMD(today) })}
                        className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] hover:bg-slate-600 disabled:opacity-50"
                      >
                        Hoy
                      </button>
                      <button
                        disabled={rowBusy}
                        onClick={() => runQuick(it.id, { due_date: toYMD(tomorrow) })}
                        className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] hover:bg-slate-600 disabled:opacity-50"
                      >
                        Manana
                      </button>
                      <button
                        disabled={rowBusy}
                        onClick={() => runQuick(it.id, { due_date: toYMD(nextWeek) })}
                        className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] hover:bg-slate-600 disabled:opacity-50"
                      >
                        +1 semana
                      </button>
                      <input
                        type="date"
                        disabled={rowBusy}
                        onChange={(e) =>
                          e.target.value && runQuick(it.id, { due_date: e.target.value })
                        }
                        className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] border-0 focus:outline-none"
                      />
                    </div>
                  )}

                  {panelOpen === 'assign' && (
                    <div
                      className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {members.length === 0 ? (
                        <span className="text-[11px] text-slate-500">Cargando miembros...</span>
                      ) : (
                        members.map((m) => (
                          <button
                            key={m.id}
                            disabled={rowBusy}
                            onClick={() =>
                              runQuick(it.id, { responsibleId: m.id, responsibleName: m.full_name })
                            }
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
          })}
        </div>

        {/* Barra de accion masiva: solo aparece con algo seleccionado. */}
        {supportsBulk && hasSelection && (
          <div className="mt-2 rounded-xl border border-indigo-500/30 bg-slate-800/80 p-2.5">
            {done ? (
              <p className="text-xs text-emerald-400 text-center py-1">{done}</p>
            ) : picker === 'date' ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  autoFocus
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <button
                  disabled={busy || !dateValue}
                  onClick={() => applyBulk({ due_date: dateValue })}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-medium"
                >
                  {busy ? '...' : 'Aplicar'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => setPicker(null)}
                  className="px-2 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300"
                >
                  Volver
                </button>
              </div>
            ) : picker === 'reassign' ? (
              <div className="flex items-center gap-2">
                <select
                  value={reassignId}
                  onChange={(e) => setReassignId(e.target.value)}
                  autoFocus
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="">Elegir persona...</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy || !reassignId}
                  onClick={() => {
                    const m = members.find((x) => x.id === reassignId)
                    if (m) applyBulk({ responsibleId: m.id, responsibleName: m.full_name })
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-medium"
                >
                  {busy ? '...' : 'Aplicar'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => setPicker(null)}
                  className="px-2 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300"
                >
                  Volver
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 mr-auto">
                  {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
                </span>
                <button
                  disabled={busy}
                  onClick={() => applyBulk({ status: 'completado' as ActivityStatus })}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-medium disabled:opacity-50"
                >
                  Completar
                </button>
                <button
                  disabled={busy}
                  onClick={() => setPicker('date')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium disabled:opacity-50"
                >
                  Mover fecha
                </button>
                {canAssignOthers && (
                  <button
                    disabled={busy}
                    onClick={() => setPicker('reassign')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium disabled:opacity-50"
                  >
                    Reasignar
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={clearSelection}
                  className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-300 text-xs disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
