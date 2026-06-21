import { Card } from '@shared/components/ui/Card'
import { Badge } from '@shared/components/ui/Badge'
import { useDashboard } from '@features/dashboard/hooks/useDashboard'

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
    criticalActivities,
    openErrors,
    criticalErrors,
    completedThisWeek,
    memberWorkloads,
    loading,
  } = useDashboard()

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 h-14 border-b border-slate-800 bg-slate-900">
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
      <div className="flex items-center px-4 h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Dashboard</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <KpiCard
            label="Pendientes"
            value={pendingActivities}
            sub={`${criticalActivities} criticas`}
            color="text-amber-400"
            critical={criticalActivities > 0}
          />
          <KpiCard
            label="Errores abiertos"
            value={openErrors}
            sub={`${criticalErrors} criticos`}
            color="text-red-400"
            critical={criticalErrors > 0}
          />
          <KpiCard
            label="Completadas"
            value={completedThisWeek}
            sub="esta semana"
            color="text-emerald-400"
          />
        </div>

        {/* Carga por miembro */}
        <Card>
          <h3 className="text-sm font-medium text-slate-200 mb-4">Carga laboral del equipo</h3>
          {memberWorkloads.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">Sin datos de carga</p>
          ) : (
            <div className="space-y-4">
              {memberWorkloads.map((member) => (
                <div key={member.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-300">{member.name}</span>
                      <Badge variant={getLoadBadge(member.percentage)}>
                        {getLoadLabel(member.percentage)}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-400">
                      {member.total} activas · {member.completed} completadas
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
                    <span>0%</span>
                    <span>70%</span>
                    <span>90%</span>
                    <span>100%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Resumen */}
        <Card>
          <h3 className="text-sm font-medium text-slate-200 mb-2">Indicadores</h3>
          <div className="space-y-3">
            <IndicatorRow
              label="Tasa de completitud"
              value={`${pendingActivities + completedThisWeek > 0 ? Math.round((completedThisWeek / (pendingActivities + completedThisWeek)) * 100) : 0}%`}
            />
            <IndicatorRow
              label="Errores sin asignar"
              value={`${openErrors - (memberWorkloads.length > 0 ? openErrors : 0)}`}
            />
            <IndicatorRow
              label="Miembros del equipo"
              value={`${memberWorkloads.length}`}
            />
          </div>
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
  critical,
}: {
  label: string
  value: number
  sub: string
  color: string
  critical?: boolean
}) {
  return (
    <Card>
      <div className="relative">
        {critical && (
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
        <p className="text-xs text-slate-400">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
      </div>
    </Card>
  )
}

function IndicatorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-200">{value}</span>
    </div>
  )
}
