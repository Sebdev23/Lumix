import { useEffect, useState } from 'react'
import { Card } from '@shared/components/ui/Card'
import { useAuth } from '@core/auth/hooks/useAuth'
import { aiDecisionsService } from '@infrastructure/supabase/ai-decisions.service'

const CATEGORY_LABELS: Record<string, string> = {
  actividad: 'Actividad',
  error: 'Error',
  ingesta: 'Ingesta',
  consulta: 'Consulta',
}

interface Row {
  category: string
  model: string
  total: number
  corrected: number
}

// "corrected" solo capta lo que el usuario corrigio por popout o editando en los 30 minutos
// siguientes (ver ai-decisions.service.ts). No es precision absoluta, es la unica señal real
// que hoy se graba: mejor esto que decidir a ciegas si el prompt de clasificacion necesita
// ajustarse.
function buildRows(
  decisions: { predicted_category: string | null; model: string | null; corrected: boolean }[],
): Row[] {
  const groups = new Map<string, Row>()
  for (const d of decisions) {
    const category = d.predicted_category ?? 'desconocida'
    const model = d.model ?? 'desconocido'
    const key = `${category}|${model}`
    const row = groups.get(key) ?? { category, model, total: 0, corrected: 0 }
    row.total++
    if (d.corrected) row.corrected++
    groups.set(key, row)
  }
  return [...groups.values()].sort((a, b) => b.total - a.total)
}

export function AiAccuracyPanel() {
  const { profile } = useAuth()
  const teamId = profile?.team_id ?? ''
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    aiDecisionsService.getRecentDecisions(teamId, 30).then((data) => {
      if (!cancelled) setRows(buildRows(data))
    })
    return () => {
      cancelled = true
    }
  }, [teamId])

  if (rows === null) return null
  if (rows.length === 0) {
    return (
      <Card padding="md">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Precision de la IA</h3>
        <p className="text-xs text-slate-500">
          Sin clasificaciones registradas en los ultimos 30 dias.
        </p>
      </Card>
    )
  }

  return (
    <Card padding="md">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Precision de la IA</h3>
      <p className="text-xs text-slate-500 mb-3">
        Ultimos 30 dias. "Corregidas" = el usuario cambio la categoria o edito la actividad poco
        despues de creada.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left border-b border-slate-700/50">
              <th className="pb-1.5 pr-3 font-medium">Categoria</th>
              <th className="pb-1.5 pr-3 font-medium">Modelo</th>
              <th className="pb-1.5 pr-3 font-medium text-right">Total</th>
              <th className="pb-1.5 pr-3 font-medium text-right">Corregidas</th>
              <th className="pb-1.5 font-medium text-right">% correccion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.total ? Math.round((r.corrected / r.total) * 100) : 0
              return (
                <tr key={`${r.category}-${r.model}`} className="border-b border-slate-800/60">
                  <td className="py-1.5 pr-3 text-slate-200">
                    {CATEGORY_LABELS[r.category] ?? r.category}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-400">{r.model}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{r.total}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{r.corrected}</td>
                  <td
                    className={`py-1.5 text-right font-medium ${
                      pct >= 20 ? 'text-red-400' : pct >= 8 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {pct}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
