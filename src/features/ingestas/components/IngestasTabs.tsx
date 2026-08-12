// Ingestas tiene dos vistas que conviven a proposito.
//
// La HOJA es el modelo nuevo (migracion 033): misma estructura que la minuta —estado, plazo
// con historial, responsables multiples, comentarios, actividades vinculadas— y parte vacia.
//
// ACTIVIDADES es lo de antes: las ingestas que se crearon como actividades con el prefijo
// "[Ingesta]" en el titulo. No se migraron, asi que si esta pestaña no estuviera, esas doce
// desaparecerian de la vista de la gente que las creo. Cuando ya no quede ninguna abierta,
// esta pestaña se puede sacar sin tocar nada mas.

import { useState } from 'react'
import { MinutaPage } from '@features/minuta/components/MinutaPage'
import { IngestasPage } from '@features/ingestas/components/IngestasPage'

type Vista = 'hoja' | 'actividades'

export function IngestasTabs() {
  const [vista, setVista] = useState<Vista>('hoja')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 sm:px-4 pt-2 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        {(
          [
            { v: 'hoja', label: 'Hoja' },
            { v: 'actividades', label: 'Actividades' },
          ] as const
        ).map((t) => (
          <button
            key={t.v}
            onClick={() => setVista(t.v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              vista === t.v
                ? 'text-indigo-300 border-indigo-500'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {vista === 'hoja' ? <MinutaPage tipo="ingesta" /> : <IngestasPage />}
      </div>
    </div>
  )
}
