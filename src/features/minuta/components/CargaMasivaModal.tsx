// Carga masiva de temas de minuta desde una planilla.
//
// El paso de validacion no es un adorno: se muestra TODO lo que se va a escribir, fila por
// fila, antes de escribir nada. En una carga de cincuenta temas, descubrir despues que
// veinte quedaron con el responsable equivocado cuesta mucho mas que revisar antes.

import { useState } from 'react'
import { Modal } from '@shared/components/ui/Modal'
import { Button } from '@shared/components/ui/Button'
import { useToast } from '@shared/components/ui/Toast'
import { downloadText } from '@shared/utils/csv'
import { formatDateLocal } from '@shared/utils/date'
import { plantillaCSV, validarFilas, type FilaValidada } from '@features/minuta/utils/bulkMinuta'
import { estadoLabels } from '@features/minuta/hooks/useMinuta'
import type { Profile } from '@shared/types'

type Props = {
  open: boolean
  onClose: () => void
  members: Profile[]
  onConfirm: (
    filas: FilaValidada[],
  ) => Promise<{ creados: number; fallidos: { linea: number; motivo: string }[] }>
}

export function CargaMasivaModal({ open, onClose, members, onConfirm }: Props) {
  const [filas, setFilas] = useState<FilaValidada[] | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [importando, setImportando] = useState(false)
  const toast = useToast()

  const validas = filas?.filter((f) => !f.errores.length) ?? []
  const conError = filas?.filter((f) => f.errores.length) ?? []
  const conAviso = validas.filter((f) => f.avisos.length)

  const cerrar = () => {
    setFilas(null)
    setNombreArchivo('')
    onClose()
  }

  const leerArchivo = async (file: File) => {
    setNombreArchivo(file.name)
    try {
      const texto = await file.text()
      const resultado = validarFilas(texto, members)
      if (!resultado.length) {
        toast.error('La planilla no tiene filas con datos.')
        setFilas(null)
        return
      }
      setFilas(resultado)
    } catch (err) {
      console.error('Lectura de planilla fallida:', err)
      toast.error('No pude leer el archivo. Debe ser un CSV.')
      setFilas(null)
    }
  }

  const importar = async () => {
    if (!validas.length) return
    setImportando(true)
    try {
      const { creados, fallidos } = await onConfirm(validas)
      if (creados) toast.success(`${creados} tema${creados === 1 ? '' : 's'} agregado a la minuta.`)
      if (fallidos.length)
        toast.error(
          `${fallidos.length} fila(s) no se pudieron guardar: linea ${fallidos.map((f) => f.linea).join(', ')}.`,
        )
      if (creados) cerrar()
    } finally {
      setImportando(false)
    }
  }

  return (
    <Modal open={open} onClose={cerrar} title="Carga masiva de minuta" size="lg">
      <div className="space-y-4">
        {/* Paso 1: plantilla */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="text-xs text-slate-300 font-medium mb-1">1. Descarga la plantilla</p>
          <p className="text-[11px] text-slate-500 mb-2 leading-snug">
            Tiene las columnas exactas y filas de ejemplo. Tambien sirve un archivo exportado desde
            el boton Excel de la minuta: son las mismas columnas.
          </p>
          <button
            onClick={() => downloadText('plantilla_minuta.csv', plantillaCSV())}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Descargar plantilla CSV
          </button>
        </div>

        {/* Paso 2: archivo */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="text-xs text-slate-300 font-medium mb-2">2. Sube la planilla completada</p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) leerArchivo(f)
              e.target.value = '' // permite volver a subir el mismo archivo corregido
            }}
            className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 file:cursor-pointer"
          />
          {nombreArchivo && <p className="text-[11px] text-slate-500 mt-1.5">{nombreArchivo}</p>}
        </div>

        {/* Paso 3: revision */}
        {filas && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <p className="text-xs text-slate-300 font-medium mb-2">3. Revisa antes de importar</p>

            <div className="flex flex-wrap gap-3 text-[11px] mb-3">
              <span className="text-emerald-400">{validas.length} se van a importar</span>
              {conAviso.length > 0 && (
                <span className="text-amber-400">{conAviso.length} con aviso</span>
              )}
              {conError.length > 0 && (
                <span className="text-red-400">{conError.length} con error, se omiten</span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto overflow-x-auto rounded border border-slate-700">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-800 sticky top-0">
                  <tr className="text-slate-400">
                    <th className="px-2 py-1.5 text-left font-medium">#</th>
                    <th className="px-2 py-1.5 text-left font-medium">Tema</th>
                    <th className="px-2 py-1.5 text-left font-medium">Responsables</th>
                    <th className="px-2 py-1.5 text-left font-medium">Estado</th>
                    <th className="px-2 py-1.5 text-left font-medium">Plazo</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const malo = f.errores.length > 0
                    return (
                      <tr
                        key={f.linea}
                        className={`border-t border-slate-700/60 ${malo ? 'bg-red-500/5' : ''}`}
                      >
                        <td className="px-2 py-1.5 text-slate-500 align-top">{f.linea}</td>
                        <td className="px-2 py-1.5 align-top">
                          <span className={malo ? 'text-slate-500 line-through' : 'text-slate-200'}>
                            {f.tema || '(vacio)'}
                          </span>
                          {f.errores.map((e, i) => (
                            <p key={i} className="text-red-400 mt-0.5">
                              {e}
                            </p>
                          ))}
                          {f.avisos.map((a, i) => (
                            <p key={i} className="text-amber-400/90 mt-0.5">
                              {a}
                            </p>
                          ))}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400 align-top">
                          {f.paraTodos
                            ? 'Todos'
                            : f.responsables.length
                              ? f.responsables
                                  .map((id) => members.find((m) => m.id === id)?.full_name ?? '?')
                                  .join(', ')
                              : (f.responsablesText ?? '') || '-'}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400 align-top">
                          {estadoLabels[f.estado]}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400 align-top whitespace-nowrap">
                          {f.plazo ? formatDateLocal(f.plazo) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={cerrar} disabled={importando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={importar} disabled={!validas.length || importando}>
            {importando
              ? 'Importando...'
              : `Importar ${validas.length || ''} tema${validas.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
