import { useState } from 'react'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { DatePicker } from '@shared/components/ui/DatePicker'
import { MemberMultiSelect } from '@shared/components/ui/MemberMultiSelect'
import { useMinuta, estadoLabels, type DecoratedItem } from '@features/minuta/hooks/useMinuta'
import { statusLabels } from '@features/activities/hooks/useActivities'
import { exportToCSV } from '@shared/utils/export'
import { formatDateLocal } from '@shared/utils/date'
import type { BadgeVariant } from '@shared/components/ui/Badge'
import type { MinuteEstado } from '@shared/types'

const estadoColors: Record<MinuteEstado, BadgeVariant> = {
  pendiente: 'warning',
  en_desarrollo: 'info',
  resuelto: 'success',
  definir: 'default',
}

export function MinutaPage() {
  const {
    items,
    counts,
    members,
    loading,
    view,
    setView,
    filterMember,
    setFilterMember,
    search,
    setSearch,
    canManage,
    addItem,
    updateItem,
    changePlazo,
    removeItem,
    createActivitiesFromItem,
  } = useMinuta()

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [createForId, setCreateForId] = useState<string | null>(null)
  const [createResp, setCreateResp] = useState<string[]>([])
  const [createPriority, setCreatePriority] = useState(2)
  const [createDue, setCreateDue] = useState('')
  const [busy, setBusy] = useState(false)

  const memberName = (id: string) => members.find((m) => m.id === id)?.full_name || 'Desconocido'

  const responsablesLabel = (it: DecoratedItem) => {
    if (it.para_todos) return 'Todos'
    const names = it.responsables.map(memberName)
    if (it.responsables_text) names.push(it.responsables_text)
    return names.length ? names.join(', ') : 'Sin asignar'
  }

  const createItem = createForId ? (items.find((i) => i.id === createForId) ?? null) : null
  const deleteItem = confirmDeleteId ? (items.find((i) => i.id === confirmDeleteId) ?? null) : null

  const openCreate = (it: DecoratedItem) => {
    setCreateResp(it.responsables.length ? it.responsables : [])
    setCreatePriority(2)
    setCreateDue(it.plazo ?? '')
    setCreateForId(it.id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Minuta Semanal</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToCSV(
                items.map((it) => ({
                  Tema: it.tema,
                  Responsables: responsablesLabel(it),
                  Estado: estadoLabels[it.effectiveEstado],
                  Plazo: it.plazo ? formatDateLocal(it.plazo) : '-',
                  'Cambios de plazo': it.plazo_change_count,
                  Comentarios: it.comentarios,
                })),
                'minuta',
              )
            }
            className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
            title="Exportar a Excel"
          >
            Excel
          </button>
          <span className="text-xs text-slate-500">{counts.pendientes} pendientes</span>
        </div>
      </div>

      {/* Toolbar de filtros */}
      <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-2 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
        {(
          [
            { v: 'pendientes', label: 'Pendientes', n: counts.pendientes },
            { v: 'resueltos', label: 'Resueltos', n: counts.resueltos },
            { v: 'todos', label: 'Todos', n: counts.todos },
          ] as const
        ).map((f) => (
          <button
            key={f.v}
            onClick={() => setView(f.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === f.v
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            {f.label} <span className="ml-1 text-slate-600">{f.n}</span>
          </button>
        ))}

        <select
          value={filterMember}
          onChange={(e) => setFilterMember(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        >
          <option value="todas">Todo el equipo</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tema..."
            className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-3 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex-1" />
        {canManage && (
          <Button size="sm" onClick={() => addItem('')}>
            + Nuevo tema
          </Button>
        )}
      </div>

      {/* Tabla editable inline (scroll con encabezado fijo) */}
      <div className="flex-1 overflow-auto px-3 sm:px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-slate-400">
              {search || filterMember !== 'todas'
                ? 'No hay temas que coincidan con el filtro'
                : view === 'resueltos'
                  ? 'No hay temas resueltos'
                  : view === 'todos'
                    ? 'No hay temas en la minuta'
                    : 'No hay temas pendientes'}
            </p>
            {canManage && (
              <p className="text-xs text-slate-600 mt-1">Toca "+ Nuevo tema" para empezar</p>
            )}
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-slate-400 align-bottom [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-slate-900 [&>th]:border-b [&>th]:border-slate-700">
                <th className="text-left py-2 px-2 font-medium w-[38%] min-w-[340px]">Tema</th>
                <th className="text-left py-2 px-2 font-medium min-w-[170px]">Responsable(s)</th>
                <th className="text-left py-2 px-2 font-medium">Estado</th>
                <th className="text-left py-2 px-2 font-medium">Plazo</th>
                <th className="text-left py-2 px-2 font-medium min-w-[180px]">Comentarios</th>
                <th className="text-right py-2 px-2 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-slate-800 align-top">
                  {/* Tema (texto completo, editable inline) */}
                  <td className="py-2 px-2">
                    {canManage ? (
                      <textarea
                        defaultValue={it.tema}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value !== it.tema)
                            updateItem(it.id, { tema: e.target.value })
                        }}
                        rows={Math.max(1, Math.ceil(it.tema.length / 48))}
                        spellCheck={false}
                        className="w-full resize-none rounded bg-transparent px-1 py-0.5 text-sm text-slate-100 font-medium leading-snug focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-indigo-500/40"
                      />
                    ) : (
                      <span className="text-slate-100 font-medium whitespace-pre-wrap">
                        {it.tema}
                      </span>
                    )}
                    {it.linkedActivities.length > 0 && (
                      <span className="block text-[10px] text-indigo-400 mt-0.5">
                        {it.linkedActivities.filter((a) => a.status === 'completado').length}/
                        {it.linkedActivities.length} actividades
                      </span>
                    )}
                  </td>

                  {/* Responsable(s): selector multiple */}
                  <td className="py-2 px-2">
                    {canManage ? (
                      <MemberMultiSelect
                        members={members}
                        selected={it.responsables}
                        paraTodos={it.para_todos}
                        onChange={(next) => updateItem(it.id, next)}
                      />
                    ) : (
                      <span className="text-slate-400">{responsablesLabel(it)}</span>
                    )}
                  </td>

                  {/* Estado */}
                  <td className="py-2 px-2">
                    {it.linkedActivities.length > 0 ? (
                      <span title="Sincronizado con actividades">
                        <Badge variant={estadoColors[it.effectiveEstado]}>
                          {estadoLabels[it.effectiveEstado]}
                        </Badge>
                      </span>
                    ) : canManage ? (
                      <select
                        value={it.estado}
                        onChange={(e) =>
                          updateItem(it.id, { estado: e.target.value as MinuteEstado })
                        }
                        className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-200"
                      >
                        {(Object.keys(estadoLabels) as MinuteEstado[]).map((s) => (
                          <option key={s} value={s}>
                            {estadoLabels[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant={estadoColors[it.effectiveEstado]}>
                        {estadoLabels[it.effectiveEstado]}
                      </Badge>
                    )}
                  </td>

                  {/* Plazo + trazabilidad */}
                  <td className="py-2 px-2">
                    {canManage ? (
                      <DatePicker
                        value={it.plazo}
                        onChange={(v) => changePlazo(it, v)}
                        placeholder="+ fecha"
                      />
                    ) : (
                      <span className="text-slate-300">
                        {it.plazo ? formatDateLocal(it.plazo) : '-'}
                      </span>
                    )}
                    {it.plazo_change_count > 0 && (
                      <span
                        className="block text-[10px] text-amber-400 mt-0.5"
                        title={it.plazo_history.map((h) => formatDateLocal(h.date)).join(' → ')}
                      >
                        cambiada {it.plazo_change_count}{' '}
                        {it.plazo_change_count === 1 ? 'vez' : 'veces'}
                      </span>
                    )}
                  </td>

                  {/* Comentarios (texto completo, editable inline) */}
                  <td className="py-2 px-2">
                    {canManage ? (
                      <textarea
                        defaultValue={it.comentarios}
                        onBlur={(e) => {
                          if (e.target.value !== it.comentarios)
                            updateItem(it.id, { comentarios: e.target.value })
                        }}
                        rows={Math.max(1, Math.ceil((it.comentarios.length || 1) / 34))}
                        placeholder="Notas..."
                        spellCheck={false}
                        className="w-full resize-none rounded bg-transparent px-1 py-0.5 text-slate-300 leading-snug focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-indigo-500/40 placeholder:text-slate-600"
                      />
                    ) : (
                      <span className="text-slate-300 whitespace-pre-wrap">
                        {it.comentarios || '-'}
                      </span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {canManage && (
                      <div className="flex flex-col items-end gap-1.5">
                        {!it.para_todos &&
                          it.responsables.length > 0 &&
                          (it.linkedActivities.length > 0 ? (
                            <span
                              title="Este tema ya tiene actividad(es) asignada(s)"
                              className="px-2 py-1 rounded-lg bg-slate-800 text-slate-500 text-[11px] font-medium cursor-not-allowed"
                            >
                              Actividad asignada
                            </span>
                          ) : (
                            <button
                              onClick={() => openCreate(it)}
                              className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors"
                            >
                              Asignar actividad
                            </button>
                          ))}
                        <button
                          onClick={() => setConfirmDeleteId(it.id)}
                          className="text-[11px] text-slate-500 hover:text-red-400"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal chico solo para crear actividad(es) desde un tema */}
      <Modal
        open={!!createItem}
        onClose={() => setCreateForId(null)}
        title="Crear actividad"
        size="sm"
      >
        {createItem && (
          <div className="space-y-3">
            <p className="text-sm text-slate-200 leading-snug">"{createItem.tema}"</p>
            <div>
              <p className="text-[11px] text-slate-500 mb-1">
                Se asignara a (definido en Responsable(s))
              </p>
              <div className="flex flex-wrap gap-1.5">
                {createResp.map((rid) => (
                  <span
                    key={rid}
                    className="px-2 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 text-[11px] font-medium"
                  >
                    {memberName(rid)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <div>
                <p className="text-[11px] text-slate-500 mb-1">Prioridad</p>
                <div className="flex gap-1">
                  {[1, 2, 3].map((p) => (
                    <button
                      key={p}
                      onClick={() => setCreatePriority(p)}
                      className={`w-7 h-7 rounded text-xs font-bold text-white ${
                        createPriority === p
                          ? p === 1
                            ? 'bg-red-600'
                            : p === 2
                              ? 'bg-amber-600'
                              : 'bg-emerald-600'
                          : 'bg-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-slate-500 mb-1">Fecha entrega</p>
                <DatePicker value={createDue || null} onChange={(v) => setCreateDue(v ?? '')} />
              </div>
            </div>
            {createItem.linkedActivities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {createItem.linkedActivities.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 text-[11px]"
                  >
                    <span className="text-slate-300">{memberName(a.responsible_id)}</span>
                    <Badge variant={a.status === 'completado' ? 'success' : 'info'}>
                      {statusLabels[a.status]}
                    </Badge>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                disabled={busy || createResp.length === 0}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await createActivitiesFromItem(createItem, {
                      responsibleIds: createResp,
                      priority: createPriority,
                      dueDate: createDue || null,
                    })
                    setCreateForId(null)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy
                  ? 'Creando...'
                  : `Crear ${createResp.length || ''} actividad${createResp.length === 1 ? '' : 'es'}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreateForId(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Popout de confirmacion de borrado */}
      <Modal
        open={!!deleteItem}
        onClose={() => setConfirmDeleteId(null)}
        title="Eliminar tema"
        size="sm"
      >
        {deleteItem && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <span className="text-xl leading-none">⚠️</span>
              <div className="space-y-1">
                <p className="text-sm text-slate-200">
                  ¿Seguro que quieres eliminar este tema de la minuta?
                </p>
                <p className="text-sm text-slate-400 leading-snug">"{deleteItem.tema}"</p>
                <p className="text-[11px] text-slate-500">
                  Esta accion no se puede deshacer.
                  {deleteItem.linkedActivities.length > 0 &&
                    ' Las actividades ya creadas NO se eliminan.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  const id = deleteItem.id
                  setConfirmDeleteId(null)
                  await removeItem(id)
                }}
              >
                Eliminar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
