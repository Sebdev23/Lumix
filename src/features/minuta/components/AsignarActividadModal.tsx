// Modal chico para convertir un tema/subtarea (de Minuta o de un Proyecto) en actividad(es).
// Extraido de MinutaPage para que Proyectos lo reuse tal cual -mismo createActivitiesFromItem,
// mismo comportamiento-, sin duplicar el formulario de prioridad/fecha.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { DatePicker } from '@shared/components/ui/DatePicker'
import { useToast } from '@shared/components/ui/Toast'
import { statusLabels } from '@features/activities/hooks/useActivities'
import type { DecoratedItem } from '@features/minuta/hooks/useMinuta'

interface Props {
  item: DecoratedItem | null
  // Por defecto todos los responsables del tema; se puede acotar (ej. "falta la actividad
  // de X" cuando alguien ya tiene la suya y no hay que duplicarsela).
  soloResponsables?: string[]
  memberName: (id: string) => string
  onClose: () => void
  onCreate: (
    item: DecoratedItem,
    opts: { responsibleIds: string[]; priority: number; dueDate: string | null },
  ) => Promise<unknown>
}

export function AsignarActividadModal({
  item,
  soloResponsables,
  memberName,
  onClose,
  onCreate,
}: Props) {
  const [priority, setPriority] = useState(2)
  const [due, setDue] = useState(item?.plazo ?? '')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  const resp = soloResponsables ?? item?.responsables ?? []

  return (
    <Modal open={!!item} onClose={onClose} title="Crear actividad" size="sm">
      {item && (
        <div className="space-y-3">
          <p className="text-sm text-fg-body leading-snug">"{item.tema}"</p>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">
              Se asignara a (definido en Responsable(s))
            </p>
            <div className="flex flex-wrap gap-1.5">
              {resp.map((rid) => (
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
                    onClick={() => setPriority(p)}
                    className={`w-7 h-7 rounded text-xs font-bold text-white ${
                      priority === p
                        ? p === 1
                          ? 'bg-red-600'
                          : p === 2
                            ? 'bg-amber-600'
                            : 'bg-emerald-600'
                        : 'bg-surface-2'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-slate-500 mb-1">Fecha entrega</p>
              <DatePicker value={due || null} onChange={(v) => setDue(v ?? '')} />
            </div>
          </div>
          {item.linkedActivities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.linkedActivities.map((a) => (
                // Abre el detalle en Actividades: es donde vive "Subtareas" para
                // descomponer este compromiso en un proyecto de varios niveles.
                <button
                  key={a.id}
                  onClick={() => navigate('/activities', { state: { activityId: a.id } })}
                  title="Abrir actividad (agregar subtareas)"
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface/80 hover:bg-surface text-[11px]"
                >
                  <span className="text-fg-muted">{memberName(a.responsible_id)}</span>
                  <Badge variant={a.status === 'completado' ? 'success' : 'info'}>
                    {statusLabels[a.status]}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={busy || resp.length === 0}
              onClick={async () => {
                setBusy(true)
                try {
                  await onCreate(item, {
                    responsibleIds: resp,
                    priority,
                    dueDate: due || null,
                  })
                  onClose()
                  toast.success(
                    `${resp.length} actividad${resp.length === 1 ? '' : 'es'} creada${resp.length === 1 ? '' : 's'}`,
                  )
                } catch {
                  toast.error('No se pudo crear la actividad')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy
                ? 'Creando...'
                : `Crear ${resp.length || ''} actividad${resp.length === 1 ? '' : 'es'}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
