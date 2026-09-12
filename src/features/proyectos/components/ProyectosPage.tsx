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
import {
  plazoEfectivo,
  fechaInicioEfectiva,
  resumenProyecto,
  alertasProyecto,
} from '@features/minuta/utils/subtareas'
import { formatDateLocal } from '@shared/utils/date'

// Estado general del proyecto, para el "de un vistazo" que pide la tarjeta: no es el `estado`
// de la fila (eso es un detalle interno), es una lectura de mas alto nivel sobre el conjunto.
type EstadoGeneral = 'completado' | 'atrasado' | 'en_curso' | 'sin_actividad'

const ESTADO_GENERAL_ESTILO: Record<EstadoGeneral, { label: string; clase: string }> = {
  completado: { label: 'Completado', clase: 'bg-emerald-500/15 text-emerald-500' },
  atrasado: { label: 'Atrasado', clase: 'bg-red-500/15 text-red-500' },
  en_curso: { label: 'En curso', clase: 'bg-blue-500/15 text-blue-500' },
  sin_actividad: { label: 'Sin actividades', clase: 'bg-slate-500/15 text-slate-400' },
}

export function ProyectosPage() {
  const { allItems, canManage, addItem, loading } = useMinuta('proyecto')
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const navigate = useNavigate()

  const proyectos = allItems.filter((it) => !it.parent_item_id)

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
            const { actividades, subtareas, subtareasResueltas } = resumenProyecto(p.id, allItems)
            const inicio = fechaInicioEfectiva(p.id, allItems)
            const fin = plazoEfectivo(p, allItems)
            const avance = subtareas > 0 ? Math.round((subtareasResueltas / subtareas) * 100) : 0
            const { vencidas, proximas } = alertasProyecto(p.id, allItems)
            const estadoGeneral: EstadoGeneral =
              actividades === 0
                ? 'sin_actividad'
                : avance === 100
                  ? 'completado'
                  : vencidas > 0
                    ? 'atrasado'
                    : 'en_curso'
            const estilo = ESTADO_GENERAL_ESTILO[estadoGeneral]
            return (
              <Card
                key={p.id}
                padding="sm"
                className="cursor-pointer hover:border-indigo-500/40 transition-colors"
              >
                <button onClick={() => navigate(`/proyectos/${p.id}`)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-fg">{p.tema}</p>
                    <span
                      className={`flex-shrink-0 text-[10px] font-medium rounded-full px-2.5 py-0.5 ${estilo.clase}`}
                    >
                      {estilo.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-faint mt-1">
                    {actividades} actividad{actividades === 1 ? '' : 'es'}
                    {subtareas > 0 && ` · ${subtareas} subtarea${subtareas === 1 ? '' : 's'}`}
                  </p>
                  {(inicio || fin) && (
                    <p className="text-[11px] text-fg-faint mt-0.5">
                      {inicio ? formatDateLocal(inicio, 'short') : '¿?'}
                      {' → '}
                      {fin ? formatDateLocal(fin, 'short') : '¿?'}
                    </p>
                  )}
                  {subtareas > 0 && (
                    <>
                      <div className="flex items-center justify-between mt-2 mb-1">
                        <span className="text-[11px] font-medium text-fg-muted">
                          {avance}% completado
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${avance}%` }}
                        />
                      </div>
                    </>
                  )}
                  {(vencidas > 0 || proximas > 0) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {vencidas > 0 && (
                        <span className="text-[10px] font-medium text-red-500 bg-red-500/10 rounded-full px-2 py-0.5">
                          ⚠ {vencidas} vencida{vencidas === 1 ? '' : 's'}
                        </span>
                      )}
                      {proximas > 0 && (
                        <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 rounded-full px-2 py-0.5">
                          ⏱ {proximas} por vencer
                        </span>
                      )}
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
