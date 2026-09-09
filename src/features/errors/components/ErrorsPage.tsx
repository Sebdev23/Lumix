import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { EditableText } from '@shared/components/ui/EditableText'
import { useErrors, errorStatusLabels } from '@features/errors/hooks/useErrors'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { exportToCSV } from '@shared/utils/export'
import { formatDateLocal } from '@shared/utils/date'
import type { ErrorStatus } from '@shared/types'

const statusFilters: { value: ErrorStatus | 'todas' | 'activos'; label: string }[] = [
  { value: 'todas', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'abierto', label: 'Abiertos' },
  { value: 'en_revision', label: 'En proceso' },
  { value: 'resuelto', label: 'Resueltos' },
  { value: 'cerrado', label: 'Cerrados' },
]

// Estado como "pill" coloreada y clickeable -un solo control que ES el estado, en vez de un
// badge de solo lectura + una columna de botones aparte. Mismo patron que Linear/Jira: la
// pastilla coloreada abre directo las opciones, sin un control separado para cambiarla.
const statusPillClasses: Record<ErrorStatus, string> = {
  abierto: 'bg-red-600/20 text-red-400',
  en_revision: 'bg-amber-600/20 text-amber-400',
  resuelto: 'bg-emerald-600/20 text-emerald-400',
  cerrado: 'bg-slate-600/30 text-slate-400',
}

// Pantalla simplificada a pedido de Sebastian: todo en pantalla, sin modal, columnas exactas
// (Transaccion o query / Comentario / Quien lo levanto / Fecha de creacion / Estado / Fecha de
// cierre) -mismo espiritu que Ingesta. Severidad y "Responsable" por area quedaron fuera de
// esta vista (las columnas siguen en la base, sin usarse aca).
export function ErrorsPage() {
  const {
    errors,
    members,
    loading,
    filterStatus,
    setFilterStatus,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    search,
    setSearch,
    changeStatus,
    createError,
    updateField,
    counts,
    isInvitado,
  } = useErrors()
  const { canManageErrors } = useCapabilities()

  const memberName = (id: string) => members.find((m) => m.id === id)?.full_name || 'Desconocido'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-border bg-panel flex-shrink-0">
        <h2 className="text-sm font-semibold text-fg-body">Bitacora de Errores</h2>
        {isInvitado && (
          <Badge variant="info" className="text-[10px]">
            Invitado
          </Badge>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToCSV(
                errors.map((e) => ({
                  'Transaccion o query': e.title,
                  Comentario: e.description,
                  'Quien lo levanto': memberName(e.created_by),
                  'Fecha de creacion': e.date,
                  Estado: errorStatusLabels[e.status],
                  'Fecha de cierre': e.closed_at ? formatDateLocal(e.closed_at) : '-',
                })),
                'errores',
              )
            }
            className="px-2 py-1 rounded text-[10px] text-fg-faint hover:text-emerald-400 hover:bg-surface transition-colors"
            title="Exportar a Excel"
          >
            <svg
              className="w-3.5 h-3.5 inline mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Excel
          </button>
          {canManageErrors && (
            <Button size="sm" onClick={() => createError('')}>
              + Nuevo error
            </Button>
          )}
          <span className="text-xs text-slate-500">{counts.todas} total</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-2 sm:px-4 pt-2 border-b-0 bg-surface-soft/50 overflow-x-auto flex-shrink-0 flex-nowrap">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filterStatus === f.value
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-fg-faint hover:text-fg-body hover:bg-surface'
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-slate-600">{counts[f.value]}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2 sm:px-4 pb-2 border-b border-border bg-surface-soft/50 overflow-x-auto flex-nowrap flex-shrink-0">
        <select
          value={dateType}
          onChange={(e) => setDateType(e.target.value as typeof dateType)}
          className="px-2 py-1.5 rounded-lg text-xs bg-surface border border-border-strong text-fg-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        >
          <option value="reportadas">Reportadas</option>
          <option value="cerradas">Cerradas</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-surface border border-border-strong text-fg-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-[120px]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-surface border border-border-strong text-fg-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-[120px]"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom('')
              setDateTo('')
            }}
            className="px-2 py-1.5 rounded-lg text-xs text-fg-faint hover:text-fg-body hover:bg-surface"
          >
            Limpiar
          </button>
        )}
        <div className="flex-1" />
        <div className="relative min-w-[160px] max-w-xs w-full sm:w-auto">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar error..."
            className="w-full rounded-lg bg-surface border border-border-strong pl-8 pr-7 py-1.5 text-base sm:text-xs text-fg-body placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Limpiar busqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-fg-muted text-sm"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tabla editable inline (sin modal, mismo criterio que Ingesta) */}
      <div className="flex-1 overflow-auto p-3 sm:p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : errors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-12 h-12 text-slate-700 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-fg-faint">No hay errores registrados</p>
            {canManageErrors && (
              <p className="text-xs text-slate-600 mt-1">Toca "+ Nuevo error" para empezar</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-strong text-slate-500">
                  <th className="text-left py-2 px-3 font-medium min-w-[160px]">
                    Transaccion o query
                  </th>
                  <th className="text-left py-2 px-3 font-medium min-w-[180px]">Comentario</th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">
                    Quien lo levanto
                  </th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">
                    Fecha de creacion
                  </th>
                  <th className="text-left py-2 px-3 font-medium">Estado</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">
                    Fecha de cierre
                  </th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error) => (
                  <tr
                    key={error.id}
                    className="border-b border-border hover:bg-surface/30 transition-colors align-top"
                  >
                    <td className="py-2.5 px-3">
                      <EditableText
                        value={error.title}
                        canEdit={canManageErrors}
                        onSave={(next) => updateField(error.id, { title: next })}
                        textClassName="text-xs text-fg-body"
                        preventEmpty
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <EditableText
                        value={error.description}
                        canEdit={canManageErrors}
                        onSave={(next) => updateField(error.id, { description: next })}
                        placeholder="Descripcion del error..."
                        emptyLabel="Sin comentario"
                        textClassName="text-xs text-fg-muted"
                      />
                    </td>
                    <td className="py-2.5 px-3 hidden md:table-cell text-fg-faint">
                      {memberName(error.created_by)}
                    </td>
                    <td className="py-2.5 px-3 hidden sm:table-cell text-slate-500">
                      {formatDateLocal(error.date, 'short')}
                    </td>
                    <td className="py-2.5 px-3">
                      {canManageErrors ? (
                        <select
                          value={error.status}
                          onChange={(e) => changeStatus(error.id, e.target.value as ErrorStatus)}
                          className={`appearance-none rounded-full pl-3 pr-6 py-1 text-xs font-medium border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 bg-[length:10px] bg-[right_8px_center] bg-no-repeat ${statusPillClasses[error.status]}`}
                          style={{
                            backgroundImage:
                              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
                          }}
                        >
                          {(['abierto', 'en_revision', 'resuelto', 'cerrado'] as ErrorStatus[]).map(
                            (s) => (
                              <option key={s} value={s} className="bg-surface text-fg-body">
                                {errorStatusLabels[s]}
                              </option>
                            ),
                          )}
                        </select>
                      ) : (
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${statusPillClasses[error.status]}`}
                        >
                          {errorStatusLabels[error.status]}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 hidden sm:table-cell text-slate-500">
                      {error.closed_at ? formatDateLocal(error.closed_at, 'short') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
