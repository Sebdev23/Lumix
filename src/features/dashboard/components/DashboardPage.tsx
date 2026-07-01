import { Card } from '@shared/components/ui/Card'
import { Badge } from '@shared/components/ui/Badge'
import { useDashboard } from '@features/dashboard/hooks/useDashboard'
import { formatDateLocal, parseDateLocal } from '@shared/utils/date'

function getLoadColor(percentage: number): string {
  if (percentage > 100) return 'bg-red-500'
  if (percentage >= 90) return 'bg-red-400'
  if (percentage >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function getLoadLabel(percentage: number): string {
  if (percentage > 100) return 'Critico'
  if (percentage >= 90) return 'Saturado'
  if (percentage >= 70) return 'Advertencia'
  return 'Normal'
}

function getLoadBadge(percentage: number) {
  if (percentage > 100) return 'danger' as const
  if (percentage >= 90) return 'danger' as const
  if (percentage >= 70) return 'warning' as const
  return 'success' as const
}

export function DashboardPage() {
  const {
    pendingActivities,
    openErrors,
    criticalErrors,
    completedThisWeek,
    overdue,
    upcomingDeadlines,
    memberWorkloads,
    statusCounts,
    priorityCounts,
    loading,
  } = useDashboard()

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-200">Dashboard</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Dashboard</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Pendientes"
            value={pendingActivities}
            sub={overdue > 0 ? `${overdue} vencidas` : 'al dia'}
            color={overdue > 0 ? 'text-red-400' : 'text-amber-400'}
          />
          <KpiCard
            label="Errores"
            value={openErrors}
            sub={`${criticalErrors} criticos`}
            color="text-red-400"
          />
          <KpiCard
            label="Completadas"
            value={completedThisWeek}
            sub="esta semana"
            color="text-emerald-400"
          />
          <TotalHoursCard workloads={memberWorkloads} />
        </div>

        {/* Status + Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm font-medium text-slate-200 mb-3">Estado de actividades</h3>
            <div className="space-y-2">
              <StatusBar
                label="Pendientes"
                count={statusCounts.pendiente}
                color="bg-amber-500"
                total={pendingActivities + statusCounts.completado}
              />
              <StatusBar
                label="En proceso"
                count={statusCounts.en_proceso}
                color="bg-indigo-500"
                total={pendingActivities + statusCounts.completado}
              />
              <StatusBar
                label="Bloqueadas"
                count={statusCounts.bloqueado}
                color="bg-red-500"
                total={pendingActivities + statusCounts.completado}
              />
              <StatusBar
                label="Completadas"
                count={statusCounts.completado}
                color="bg-emerald-500"
                total={pendingActivities + statusCounts.completado}
              />
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-medium text-slate-200 mb-3">Prioridad</h3>
            <div className="space-y-2">
              <PriorityRow label="Alta" count={priorityCounts.alta} color="bg-red-500" />
              <PriorityRow label="Media" count={priorityCounts.media} color="bg-amber-500" />
              <PriorityRow label="Baja" count={priorityCounts.baja} color="bg-emerald-500" />
            </div>
          </Card>
        </div>

        {/* Proximos vencimientos */}
        {upcomingDeadlines.length > 0 && (
          <Card>
            <h3 className="text-sm font-medium text-slate-200 mb-3">Proximos vencimientos</h3>
            <div className="space-y-2">
              {upcomingDeadlines.map((a) => {
                const days = Math.ceil(
                  (parseDateLocal(a.due_date).getTime() - new Date().getTime()) / 86400000,
                )
                return (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 truncate flex-1 mr-2">{a.title}</span>
                    <span
                      className={
                        days <= 1 ? 'text-red-400' : days <= 2 ? 'text-amber-400' : 'text-slate-400'
                      }
                    >
                      {days === 0
                        ? 'Hoy'
                        : days === 1
                          ? 'Manana'
                          : formatDateLocal(a.due_date, 'short')}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Carga por miembro */}
        <Card>
          <h3 className="text-sm font-medium text-slate-200 mb-4">Carga laboral del equipo</h3>
          {memberWorkloads.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">Sin datos de carga</p>
          ) : (
            <div className="space-y-4">
              {memberWorkloads.map((member) => (
                <div key={member.name} className="space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-300">{member.name}</span>
                      <Badge variant={getLoadBadge(member.percentage)}>
                        {getLoadLabel(member.percentage)}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-400">
                      {member.total} activas ({member.totalHours}h) · {member.completed} completadas
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all ${getLoadColor(member.percentage)}`}
                      style={{ width: `${Math.min(member.percentage, 100)}%` }}
                    />
                    {member.percentage > 100 && (
                      <div className="absolute inset-y-0 right-0 w-2 bg-red-600 rounded-r-full" />
                    )}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>0h</span>
                    <span>21h</span>
                    <span>30h</span>
                    <span>42h</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: number
  sub: string
  color: string
}) {
  return (
    <Card>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
    </Card>
  )
}

function TotalHoursCard({
  workloads,
}: {
  workloads: { totalHours: number; percentage: number }[]
}) {
  const total = workloads.reduce((s, w) => s + w.totalHours, 0)
  return (
    <Card>
      <p className="text-xs text-slate-400">Horas equipo</p>
      <p className={`text-2xl font-bold mt-1 ${total > 42 ? 'text-red-400' : 'text-indigo-400'}`}>
        {total}h
      </p>
      <p className="text-[10px] text-slate-500 mt-0.5">de 42h semanales</p>
    </Card>
  )
}

function StatusBar({
  label,
  count,
  color,
  total,
}: {
  label: string
  count: number
  color: string
  total: number
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-20">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-300 w-8 text-right">{count}</span>
    </div>
  )
}

function PriorityRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <span className="text-sm font-medium text-slate-200">{count}</span>
    </div>
  )
}
