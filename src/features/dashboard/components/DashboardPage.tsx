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
    weeklyTrend,
    loading,
  } = useDashboard()

  const statusSegments = [
    { label: 'Pendientes', value: statusCounts.pendiente, color: '#d97706' },
    { label: 'En proceso', value: statusCounts.en_proceso, color: '#6366f1' },
    { label: 'Bloqueadas', value: statusCounts.bloqueado, color: '#dc2626' },
    { label: 'Completadas', value: statusCounts.completado, color: '#059669' },
  ]
  const statusTotal = statusSegments.reduce((s, x) => s + x.value, 0)

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

        {/* Estado (donut) + Tendencia semanal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm font-medium text-slate-200 mb-3">Estado de actividades</h3>
            {statusTotal === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Sin actividades</p>
            ) : (
              <div className="flex items-center gap-4">
                <Donut segments={statusSegments} total={statusTotal} />
                <div className="flex-1 space-y-1.5">
                  {statusSegments.map((s) => (
                    <div key={s.label} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: s.color }}
                      />
                      <span className="text-slate-400 flex-1">{s.label}</span>
                      <span className="text-slate-200 font-medium">{s.value}</span>
                      <span className="text-slate-600 w-9 text-right">
                        {Math.round((s.value / statusTotal) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card>
            <h3 className="text-sm font-medium text-slate-200 mb-3">
              Completadas (ultimos 7 dias)
            </h3>
            <WeeklyTrend data={weeklyTrend} />
          </Card>
        </div>

        {/* Prioridad */}
        <Card>
          <h3 className="text-sm font-medium text-slate-200 mb-3">Prioridad (activas)</h3>
          <div className="grid grid-cols-3 gap-3">
            <PriorityRow label="Alta" count={priorityCounts.alta} color="bg-red-500" />
            <PriorityRow label="Media" count={priorityCounts.media} color="bg-amber-500" />
            <PriorityRow label="Baja" count={priorityCounts.baja} color="bg-emerald-500" />
          </div>
        </Card>

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

// Donut de composicion (SVG inline, sin dependencias). Segmentos con 2px de gap.
function Donut({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: string }[]
  total: number
}) {
  const size = 128
  const thickness = 18
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  const denom = total || 1
  const gap = total > 0 ? 2 : 0
  const lens = segments.map((s) => (s.value / denom) * C)
  const offsets = segments.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#1e293b"
          strokeWidth={thickness}
        />
        {segments.map((s, i) => {
          if (s.value <= 0) return null
          const dash = Math.max(lens[i] - gap, 0.5)
          return (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offsets[i]}
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-100">{total}</span>
        <span className="text-[10px] text-slate-500">total</span>
      </div>
    </div>
  )
}

// Grafico de columnas: completadas por dia (ultimos 7 dias).
function WeeklyTrend({ data }: { data: { label: string; date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const totalWeek = data.reduce((s, d) => s + d.count, 0)
  if (totalWeek === 0) {
    return <p className="text-xs text-slate-500 py-6 text-center">Sin completadas esta semana</p>
  }
  return (
    <div className="flex items-end justify-between gap-1.5 h-28 pt-4">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
          {d.count > 0 && <span className="text-[10px] text-slate-400">{d.count}</span>}
          <div
            className="w-full max-w-[26px] rounded-t bg-emerald-600 hover:bg-emerald-500 transition-colors"
            style={{
              height: `${(d.count / max) * 100}%`,
              minHeight: d.count > 0 ? '4px' : '2px',
              opacity: d.count > 0 ? 1 : 0.3,
            }}
            title={`${d.label}: ${d.count} completada${d.count === 1 ? '' : 's'}`}
          />
          <span className="text-[10px] text-slate-500 capitalize">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function PriorityRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="rounded-lg bg-slate-800/60 p-3 flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <span className="text-xl font-bold text-slate-100">{count}</span>
    </div>
  )
}
