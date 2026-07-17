import { useState } from 'react'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { useErrors, severityLabels, errorStatusLabels } from '@features/errors/hooks/useErrors'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { exportToCSV } from '@shared/utils/export'
import { formatDateLocal, parseDateLocal } from '@shared/utils/date'
import type { AppError, ErrorSeverity, ErrorStatus } from '@shared/types'
import type { BadgeVariant } from '@shared/components/ui/Badge'

const statusFilters: { value: ErrorStatus | 'todas' | 'activos'; label: string }[] = [
  { value: 'todas', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'abierto', label: 'Abiertos' },
  { value: 'en_revision', label: 'En revision' },
  { value: 'resuelto', label: 'Resueltos' },
  { value: 'cerrado', label: 'Cerrados' },
]

const severityOptions: (ErrorSeverity | 'todas')[] = ['todas', 'critica', 'alta', 'media', 'baja']

const severityColors: Record<ErrorSeverity, BadgeVariant> = {
  baja: 'info',
  media: 'warning',
  alta: 'danger',
  critica: 'danger',
}

const severityBarColors: Record<ErrorSeverity, string> = {
  baja: 'bg-blue-500',
  media: 'bg-amber-500',
  alta: 'bg-red-500',
  critica: 'bg-red-600',
}

const statusColors: Record<ErrorStatus, BadgeVariant> = {
  abierto: 'danger',
  en_revision: 'warning',
  resuelto: 'success',
  cerrado: 'default',
}

function SeverityIcon({ severity }: { severity: ErrorSeverity }) {
  if (severity === 'critica') {
    return (
      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  return <div className={`w-2.5 h-2.5 rounded-full ${severityBarColors[severity]}`} />
}

export function ErrorsPage() {
  const {
    errors,
    members,
    loading,
    filterStatus,
    setFilterStatus,
    filterSeverity,
    setFilterSeverity,
    filterMember,
    setFilterMember,
    dateType,
    setDateType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    changeStatus,
    counts,
    isInvitado,
    reload,
  } = useErrors()
  const [selectedError, setSelectedError] = useState<AppError | null>(null)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Bitacora de Errores</h2>
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
                  Titulo: e.title,
                  Descripcion: e.description,
                  Severidad: severityLabels[e.severity],
                  Estado: errorStatusLabels[e.status],
                  Fecha: e.date,
                  Hora: e.time.slice(0, 5),
                  Cerrado: e.resolved_at ? formatDateLocal(e.resolved_at) : '-',
                  'Dias para resolver': e.resolved_at
                    ? Math.ceil(
                        (parseDateLocal(e.resolved_at).getTime() -
                          parseDateLocal(e.date).getTime()) /
                          86400000,
                      )
                    : '-',
                })),
                'errores',
              )
            }
            className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
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
          <span className="text-xs text-slate-500">{counts.todas} total</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-2 sm:px-4 py-2 border-b border-slate-800 bg-slate-900/50 overflow-x-auto flex-shrink-0 flex-nowrap">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filterStatus === f.value
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-slate-600">{counts[f.value]}</span>
          </button>
        ))}
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as ErrorSeverity | 'todas')}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        >
          {severityOptions.map((s) => (
            <option key={s} value={s}>
              {s === 'todas' ? 'Toda severidad' : severityLabels[s]}
            </option>
          ))}
        </select>
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
        <div className="w-px bg-slate-700 mx-1" />
        <select
          value={dateType}
          onChange={(e) => setDateType(e.target.value as typeof dateType)}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        >
          <option value="reportadas">Reportadas</option>
          <option value="cerradas">Cerradas</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-[120px]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-[120px]"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom('')
              setDateTo('')
            }}
            className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            Limpiar
          </button>
        )}
        <div className="flex-1" />
      </div>

      {/* Error list */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
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
            <p className="text-sm text-slate-400">No hay errores registrados</p>
            <p className="text-xs text-slate-600 mt-1">Reporta un error en el chat</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-500">
                  <th className="text-left py-2 px-3 font-medium">Error</th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">
                    Responsable
                  </th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell">
                    Severidad
                  </th>
                  <th className="text-left py-2 px-3 font-medium">Estado</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Fecha</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Cerrado</th>
                  <th className="text-right py-2 px-3 font-medium">Accion</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error) => (
                  <tr
                    key={error.id}
                    onClick={() => setSelectedError(error)}
                    className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <SeverityIcon severity={error.severity} />
                        <span className="text-slate-200 truncate max-w-[220px]">{error.title}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 hidden md:table-cell">
                      <span className="text-xs text-slate-400 truncate max-w-[100px] block">
                        {members.find((m) => m.id === error.responsible_id)?.full_name ||
                          'Sin asignar'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 hidden md:table-cell">
                      <Badge variant={severityColors[error.severity]}>
                        {severityLabels[error.severity]}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={statusColors[error.status]}>
                        {errorStatusLabels[error.status]}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                      {error.date}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell">
                      {error.resolved_at ? formatDateLocal(error.resolved_at, 'short') : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {error.status === 'abierto' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => changeStatus(error.id, 'en_revision')}
                          >
                            Revisar
                          </Button>
                        )}
                        {error.status === 'en_revision' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => changeStatus(error.id, 'resuelto')}
                          >
                            Resolver
                          </Button>
                        )}
                        {error.status === 'resuelto' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => changeStatus(error.id, 'cerrado')}
                          >
                            Cerrar
                          </Button>
                        )}
                        {(error.status === 'cerrado' || error.status === 'resuelto') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => changeStatus(error.id, 'abierto')}
                          >
                            Reabrir
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!selectedError}
        onClose={() => setSelectedError(null)}
        title={selectedError?.title}
        size="md"
      >
        {selectedError && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-3">
              <Badge variant={severityColors[selectedError.severity]}>
                {severityLabels[selectedError.severity]}
              </Badge>
              <Badge variant={statusColors[selectedError.status]}>
                {errorStatusLabels[selectedError.status]}
              </Badge>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Descripcion</p>
              <p className="text-sm text-slate-300">
                {selectedError.description || 'Sin descripcion'}
              </p>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50">
              <p className="text-xs text-slate-500">Reportado por:</p>
              <p className="text-xs text-slate-300 font-medium">
                {members.find((m) => m.id === selectedError.created_by)?.full_name || 'Desconocido'}
              </p>
              {members.find((m) => m.id === selectedError.created_by)?.email && (
                <a
                  href={`mailto:${members.find((m) => m.id === selectedError.created_by)!.email}`}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300"
                >
                  Contactar
                </a>
              )}
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Tipo de error</p>
              <select
                value={selectedError.error_type || 'funcional'}
                onChange={async (e) => {
                  await errorsService.update(selectedError.id, { error_type: e.target.value })
                  setSelectedError({ ...selectedError, error_type: e.target.value })
                  reload()
                }}
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
              >
                <option value="funcional">Funcional</option>
                <option value="tecnico">Tecnico</option>
                <option value="datos">Datos</option>
                <option value="integracion">Integracion</option>
                <option value="rendimiento">Rendimiento</option>
                <option value="seguridad">Seguridad</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Comentarios</p>
              <textarea
                defaultValue={selectedError.observations || ''}
                onBlur={async (e) => {
                  if (e.target.value !== (selectedError.observations || '')) {
                    await errorsService.update(selectedError.id, { observations: e.target.value })
                    reload()
                  }
                }}
                rows={2}
                placeholder="Agregar comentario..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Fecha</p>
                <p className="text-sm text-slate-300">{selectedError.date}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Hora</p>
                <p className="text-sm text-slate-300">{selectedError.time.slice(0, 5)}</p>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <p className="text-xs text-slate-500 mb-3">Historial</p>
              <div className="space-y-3">
                {[
                  {
                    label: 'Reportado',
                    date: selectedError.date,
                    time: selectedError.time,
                    active: true,
                  },
                  {
                    label: 'En revision',
                    date: selectedError.status === 'abierto' ? null : selectedError.date,
                    time: null,
                    active: selectedError.status !== 'abierto',
                  },
                  {
                    label: 'Resuelto',
                    date:
                      selectedError.status === 'resuelto' || selectedError.status === 'cerrado'
                        ? selectedError.date
                        : null,
                    time: null,
                    active:
                      selectedError.status === 'resuelto' || selectedError.status === 'cerrado',
                  },
                  {
                    label: 'Cerrado',
                    date: selectedError.status === 'cerrado' ? selectedError.date : null,
                    time: null,
                    active: selectedError.status === 'cerrado',
                  },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                          step.active
                            ? 'bg-indigo-500 border-indigo-500'
                            : 'bg-slate-800 border-slate-600'
                        }`}
                      />
                      {i < 3 && (
                        <div
                          className={`w-0.5 h-6 ${step.active ? 'bg-indigo-500' : 'bg-slate-700'}`}
                        />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className={`text-sm ${step.active ? 'text-slate-200' : 'text-slate-500'}`}>
                        {step.label}
                      </p>
                      {step.date && <p className="text-[10px] text-slate-600">{step.date}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status actions */}
            <div className="flex gap-2 pt-2 border-t border-slate-700">
              {selectedError.status === 'abierto' && (
                <Button
                  size="sm"
                  onClick={() => {
                    changeStatus(selectedError.id, 'en_revision')
                    reload()
                    setSelectedError(null)
                  }}
                >
                  Poner en revision
                </Button>
              )}
              {selectedError.status === 'en_revision' && (
                <Button
                  size="sm"
                  onClick={() => {
                    changeStatus(selectedError.id, 'resuelto')
                    reload()
                    setSelectedError(null)
                  }}
                >
                  Marcar como resuelto
                </Button>
              )}
              {selectedError.status === 'resuelto' && (
                <Button
                  size="sm"
                  onClick={() => {
                    changeStatus(selectedError.id, 'cerrado')
                    reload()
                    setSelectedError(null)
                  }}
                >
                  Cerrar error
                </Button>
              )}
              {(selectedError.status === 'cerrado' || selectedError.status === 'resuelto') && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    changeStatus(selectedError.id, 'abierto')
                    reload()
                    setSelectedError(null)
                  }}
                >
                  Reabrir
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
