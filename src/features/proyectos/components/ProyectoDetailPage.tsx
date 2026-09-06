// Detalle de un proyecto: Lista (arbol de subtareas) / Tablero (columnas por estado) /
// Cronograma (linea de tiempo). Las tres vistas reusan componentes ya construidos para
// Minuta -mismo motor, mismo hook useMinuta('proyecto')-, no se reimplementa nada.
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { useToast } from '@shared/components/ui/Toast'
import { EditableText } from '@shared/components/ui/EditableText'
import { useMinuta, estadoLabels, type DecoratedItem } from '@features/minuta/hooks/useMinuta'
import { SubtareasPanel, GanttModal } from '@features/minuta/components/MinutaPage'
import { AsignarActividadModal } from '@features/minuta/components/AsignarActividadModal'
import { plazoEfectivo, contarSubtareas } from '@features/minuta/utils/subtareas'
import { minutesService } from '@infrastructure/supabase/minutes.service'
import { formatDateLocal } from '@shared/utils/date'
import { useAuth } from '@core/auth/hooks/useAuth'
import type { MinuteEstado } from '@shared/types'

const ESTADOS: MinuteEstado[] = ['pendiente', 'en_desarrollo', 'resuelto', 'definir']

export function ProyectoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const {
    allItems,
    members,
    canManage,
    canAssign,
    updateItem,
    changePlazo,
    createActivitiesFromItem,
    addItem,
    loading,
    reload,
  } = useMinuta('proyecto')

  const [vista, setVista] = useState<'lista' | 'tablero'>('lista')
  const [verGantt, setVerGantt] = useState(false)
  const [createForId, setCreateForId] = useState<string | null>(null)

  const proyecto = allItems.find((it) => it.id === id)
  const memberName = (mid: string) => members.find((m) => m.id === mid)?.full_name || 'Desconocido'
  const createItem = createForId ? (allItems.find((i) => i.id === createForId) ?? null) : null

  // Todos los descendientes (cualquier nivel), aplanados, para el Tablero.
  const descendientes = (raizId: string): DecoratedItem[] => {
    const hijos = allItems.filter((d) => d.parent_item_id === raizId)
    return hijos.flatMap((h) => [h, ...descendientes(h.id)])
  }

  // Escala una subtarea trabada a Minuta para conversarla en la reunion semanal -mismo
  // patron que useCompromisos.llevarAMinuta, aplicado desde el lado de Proyectos-.
  const escalarAMinuta = async (item: DecoratedItem) => {
    if (!profile) return
    try {
      const existentes = await minutesService.getByTeam(profile.team_id, 'minuta')
      await minutesService.create({
        team_id: profile.team_id,
        tipo: 'minuta',
        orden: existentes.length,
        tema: item.tema,
        para_todos: false,
        responsables: item.responsables,
        responsables_text: '',
        estado: 'definir',
        plazo: item.plazo,
        comentarios: `Viene del proyecto "${proyecto?.tema}": no se cumplio y necesita conversarse.`,
        linked_activity_ids: item.linked_activity_ids,
        created_by: profile.id,
      })
      toast.success('Llevado a la minuta para discutir')
    } catch {
      toast.error('No se pudo escalar a la minuta')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!proyecto) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-sm text-fg-faint">Ese proyecto ya no existe</p>
        <Button size="sm" variant="ghost" onClick={() => navigate('/proyectos')}>
          ← Volver a Proyectos
        </Button>
      </div>
    )
  }

  const { total, resueltas } = contarSubtareas(proyecto.id, allItems)
  const fecha = plazoEfectivo(proyecto, allItems)

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 sm:px-4 py-3 border-b border-border bg-panel flex-shrink-0">
        <button
          onClick={() => navigate('/proyectos')}
          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium mb-1"
        >
          ← Proyectos
        </button>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <EditableText
              as="p"
              value={proyecto.tema}
              canEdit={canManage}
              onSave={(next) => updateItem(proyecto.id, { tema: next })}
              textClassName="text-sm font-semibold text-fg-body"
              preventEmpty
            />
            <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-fg-faint">
              {total > 0 && (
                <span>
                  {resueltas}/{total} subtareas resueltas
                </span>
              )}
              {fecha && <span>📅 {formatDateLocal(fecha)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-surface p-0.5">
              <button
                onClick={() => setVista('lista')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  vista === 'lista' ? 'bg-indigo-600 text-white' : 'text-fg-faint'
                }`}
              >
                Lista
              </button>
              <button
                onClick={() => setVista('tablero')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  vista === 'tablero' ? 'bg-indigo-600 text-white' : 'text-fg-faint'
                }`}
              >
                Tablero
              </button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setVerGantt(true)}>
              Cronograma
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {vista === 'lista' ? (
          <SubtareasPanel
            parentId={proyecto.id}
            allItems={allItems}
            members={members}
            canManage={canManage}
            canAssign={canAssign}
            memberName={memberName}
            onGuardar={(mid, patch) => updateItem(mid, patch)}
            onGuardarTema={(mid, tema) => updateItem(mid, { tema })}
            onGuardarPlazo={(item, v) =>
              changePlazo(item, v).catch(() => toast.error('No se pudo guardar la fecha'))
            }
            onOpenCreate={(it) => setCreateForId(it.id)}
            onAdd={(tema, parentId) => addItem(tema, parentId)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ESTADOS.map((estado) => {
              const items = descendientes(proyecto.id).filter((it) => it.effectiveEstado === estado)
              return (
                <div
                  key={estado}
                  className="rounded-xl border border-border bg-surface-soft/60 p-2.5"
                >
                  <p className="text-xs font-medium text-fg-faint mb-2">
                    {estadoLabels[estado]} ({items.length})
                  </p>
                  <div className="space-y-1.5">
                    {items.map((it) => (
                      <div
                        key={it.id}
                        className="rounded-lg bg-surface/80 p-2 text-[11px] space-y-1"
                      >
                        <EditableText
                          as="p"
                          value={it.tema}
                          canEdit={canManage}
                          onSave={(next) => updateItem(it.id, { tema: next })}
                          textClassName="text-fg-body font-medium leading-snug"
                          preventEmpty
                        />
                        <div className="flex flex-wrap items-center gap-1.5 text-fg-faint">
                          {it.responsables.length > 0 && (
                            <span>👤 {it.responsables.map(memberName).join(', ')}</span>
                          )}
                          {it.plazo && <span>📅 {formatDateLocal(it.plazo)}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {it.linkedActivities.length === 0 &&
                            canAssign &&
                            it.responsables.length > 0 && (
                              <button
                                onClick={() => setCreateForId(it.id)}
                                className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium"
                              >
                                Asignar
                              </button>
                            )}
                          {it.linkedActivities.length > 0 && estado !== 'resuelto' && canManage && (
                            <button
                              onClick={() => escalarAMinuta(it)}
                              title="Si hay un bloqueo de fondo, se conversa en la reunion semanal"
                              className="px-1.5 py-0.5 rounded bg-surface-2 hover:bg-slate-600 text-fg-muted text-[10px] font-medium"
                            >
                              ↑ Discutir en reunión
                            </button>
                          )}
                          {it.linkedActivities.length > 0 && (
                            <Badge variant={estado === 'resuelto' ? 'success' : 'info'}>
                              {it.linkedActivities.filter((a) => a.status === 'completado').length}/
                              {it.linkedActivities.length} activ.
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <p className="text-[11px] text-slate-600 text-center py-4">—</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {verGantt && (
        <GanttModal root={proyecto} allItems={allItems} onClose={() => setVerGantt(false)} />
      )}

      <AsignarActividadModal
        key={createItem?.id ?? 'closed'}
        item={createItem}
        memberName={memberName}
        onClose={() => {
          setCreateForId(null)
          reload()
        }}
        onCreate={createActivitiesFromItem}
      />
    </div>
  )
}
