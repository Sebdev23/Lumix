// Lista de proyectos del equipo.
//
// Un proyecto es un tema raiz de tipo='proyecto' (migracion 042, misma tabla y motor que
// Minuta/Ingesta, listas separadas por tipo -ver docblock de useMinuta-). No comparte la
// cadencia semanal de Minuta: no hace falta "conversarlo" cada semana, se le da seguimiento
// como iniciativa. Si una subtarea puntual se traba y si amerita conversarse, se escala a
// Minuta desde el detalle (mismo patron que useCompromisos.llevarAMinuta).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@shared/components/ui/Card'
import { Button } from '@shared/components/ui/Button'
import { SkeletonRows } from '@shared/components/ui/Skeleton'
import { useMinuta } from '@features/minuta/hooks/useMinuta'
import { plazoEfectivo, contarSubtareas } from '@features/minuta/utils/subtareas'
import { formatDateLocal } from '@shared/utils/date'

export function ProyectosPage() {
  const { allItems, members, canManage, addItem, loading } = useMinuta('proyecto')
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const navigate = useNavigate()

  const proyectos = allItems.filter((it) => !it.parent_item_id)

  const memberName = (id: string) => members.find((m) => m.id === id)?.full_name || 'Desconocido'

  const crear = async () => {
    if (!nuevo.trim()) return
    const id = await addItem(nuevo.trim())
    setNuevo('')
    setCreando(false)
    if (id) navigate(`/proyectos/${id}`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 sm:px-4 h-14 border-b border-border bg-panel flex-shrink-0">
        <h2 className="text-sm font-semibold text-fg-body">Proyectos</h2>
        {canManage && !creando && (
          <Button size="sm" onClick={() => setCreando(true)}>
            + Nuevo proyecto
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {creando && (
          <Card padding="sm" className="flex items-center gap-2">
            <input
              autoFocus
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crear()
                if (e.key === 'Escape') setCreando(false)
              }}
              placeholder="Nombre del proyecto…"
              className="flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-base text-fg-body placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <Button size="sm" onClick={crear} disabled={!nuevo.trim()}>
              Crear
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
          </Card>
        )}

        {loading ? (
          <SkeletonRows />
        ) : proyectos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-fg-faint">Todavia no hay proyectos</p>
            <p className="text-xs text-slate-600 mt-1">
              Se crean igual que un tema de minuta: por chat (elegí "Proyecto" en el selector) o con
              "+ Nuevo proyecto" arriba.
            </p>
          </div>
        ) : (
          proyectos.map((p) => {
            const { total, resueltas } = contarSubtareas(p.id, allItems)
            const fecha = plazoEfectivo(p, allItems)
            return (
              <Card
                key={p.id}
                padding="sm"
                className="cursor-pointer hover:border-indigo-500/40 transition-colors"
              >
                <button onClick={() => navigate(`/proyectos/${p.id}`)} className="w-full text-left">
                  <p className="text-sm font-medium text-fg">{p.tema}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-fg-faint">
                    {total > 0 && (
                      <span>
                        {resueltas}/{total} subtareas resueltas
                      </span>
                    )}
                    {fecha && <span>📅 {formatDateLocal(fecha)}</span>}
                    {p.responsables.length > 0 && (
                      <span>👤 {p.responsables.map(memberName).join(', ')}</span>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1 w-full rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${Math.round((resueltas / total) * 100)}%` }}
                      />
                    </div>
                  )}
                </button>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
