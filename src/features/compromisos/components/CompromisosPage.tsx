// Hoja de compromisos: la pantalla que se proyecta en la reunion semanal.
//
// DECISIONES DE DISEÑO, Y POR QUE
//
// 1. Marcar hecho es UN clic sobre una casilla grande. En una reunion de 5 minutos con el
//    equipo mirando, cualquier cosa que exija abrir un modal rompe el ritmo.
// 2. El numero grande arriba es el % de cumplimiento con la meta de 90% al lado. Es la
//    unica metrica de la reunion; si no esta a la vista, la conversacion se dispersa.
// 3. Agrupado por persona, porque la pregunta que se hace es "a ti te tocaba esto".
// 4. Las acciones de lo no cumplido -mover una semana, llevar a minuta- aparecen SOLO en
//    las filas no cumplidas, y solo para quien conduce. No se ofrece nada mas: en EOS lo no
//    hecho se arrastra o se discute, no se justifica en el momento.

import { useState } from 'react'
import { Avatar } from '@shared/components/ui/Avatar'
import { SkeletonRows } from '@shared/components/ui/Skeleton'
import { useToast } from '@shared/components/ui/Toast'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { useCompromisos, type Compromiso } from '@features/compromisos/hooks/useCompromisos'
import { formatDateLocal } from '@shared/utils/date'

export function CompromisosPage() {
  const {
    porPersona,
    resumen,
    loading,
    offset,
    setOffset,
    etiqueta,
    esSemanaActual,
    marcar,
    moverUnaSemana,
    llevarAMinuta,
    reload,
  } = useCompromisos()
  const { canViewAllActivities, isGlobalAdmin } = useCapabilities()
  const conduce = canViewAllActivities || isGlobalAdmin
  const toast = useToast()

  // Arranca TODO PLEGADO: la primera mirada es el tablero del equipo -quien va como- y
  // recien despues se abre a la persona de la que se esta hablando. Al reves, con todo
  // desplegado, hay que hacer scroll para saber si alguien va mal.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const alternar = (id: string) =>
    setAbiertos((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // Si solo hay una persona -un colaborador viendo lo suyo- plegar no aporta nada.
  const soloUno = porPersona.length === 1
  const estaAbierto = (id: string) => soloUno || abiertos.has(id)
  const todoAbierto = porPersona.length > 0 && porPersona.every((g) => abiertos.has(g.id))

  // La MISMA escala arriba y por persona: si el equipo va en ambar y una persona en verde,
  // tiene que significar lo mismo en los dos lugares.
  const colorDe = (pct: number | null) =>
    pct === null
      ? 'text-slate-400'
      : pct >= resumen.meta
        ? 'text-emerald-400'
        : pct >= 60
          ? 'text-amber-400'
          : 'text-red-400'

  const barraDe = (pct: number | null) =>
    pct === null
      ? 'bg-slate-700'
      : pct >= resumen.meta
        ? 'bg-emerald-500'
        : pct >= 60
          ? 'bg-amber-500'
          : 'bg-red-500'

  const alMarcar = (c: Compromiso) =>
    marcar(c.id, c.status !== 'completado').catch(() => toast.error('No se pudo guardar'))

  const alMover = (c: Compromiso) =>
    moverUnaSemana(c)
      .then(() => toast.success('Movido a la próxima semana'))
      .catch(() => toast.error('No se pudo mover'))

  const alDiscutir = (c: Compromiso) =>
    llevarAMinuta(c)
      .then(() => toast.success('Agregado a la minuta para conversarlo'))
      .catch(() => toast.error('No se pudo agregar a la minuta'))

  return (
    <div className="flex flex-col h-full">
      {/* Cabecera: semana + cumplimiento */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900 px-3 sm:px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Compromisos</h2>
            <div className="inline-flex items-center rounded-lg bg-slate-800 p-0.5">
              <button
                onClick={() => setOffset(offset - 1)}
                className="px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                aria-label="Semana anterior"
              >
                ‹
              </button>
              <span className="px-2 text-xs text-slate-300 whitespace-nowrap">{etiqueta}</span>
              <button
                onClick={() => setOffset(offset + 1)}
                className="px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                aria-label="Semana siguiente"
              >
                ›
              </button>
            </div>
            {!esSemanaActual && (
              <button
                onClick={() => setOffset(0)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
              >
                Volver a esta semana
              </button>
            )}
          </div>

          {resumen.total > 0 && (
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold tabular-nums ${colorDe(resumen.porcentaje)}`}
              >
                {resumen.porcentaje}%
              </span>
              <span className="text-xs text-slate-400">
                {resumen.cumplidos} de {resumen.total} cumplidos
              </span>
              <span className="text-[10px] text-slate-600">meta {resumen.meta}%</span>
            </div>
          )}
        </div>

        {resumen.total > 0 && (
          <div className="mt-2 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barraDe(resumen.porcentaje)}`}
              style={{ width: `${resumen.porcentaje}%` }}
            />
          </div>
        )}

        {porPersona.length > 1 && (
          <button
            onClick={() =>
              setAbiertos(todoAbierto ? new Set() : new Set(porPersona.map((g) => g.id)))
            }
            className="mt-2 text-[11px] text-slate-500 hover:text-slate-300"
          >
            {todoAbierto ? 'Contraer todo' : 'Expandir todo'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3">
        {loading ? (
          <SkeletonRows />
        ) : porPersona.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-slate-400">No hay compromisos para esta semana</p>
            {/* Importante ser preciso: puede haber actividades del equipo esa semana y aun
                asi no haber compromisos. Solo cuenta lo que se asigno desde la minuta. */}
            <p className="text-xs text-slate-600 mt-1 max-w-sm leading-snug">
              Aquí solo aparece lo asignado desde la minuta con entrega entre el {etiqueta}. Las
              actividades creadas por el chat o el listado no son compromisos del equipo.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {porPersona.map((g) => (
              <div key={g.id} className="rounded-xl border border-slate-800 bg-slate-900/60">
                {/* Cabecera plegable: el resumen de la persona, con la misma lectura que el
                    general de arriba. De un vistazo se ve quien va bien sin abrir nada. */}
                <button
                  onClick={() => alternar(g.id)}
                  aria-expanded={estaAbierto(g.id)}
                  disabled={soloUno}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-xl transition-colors ${
                    soloUno ? '' : 'hover:bg-slate-800/50'
                  } ${estaAbierto(g.id) ? 'border-b border-slate-800 rounded-b-none' : ''}`}
                >
                  {!soloUno && (
                    <svg
                      className={`w-3 h-3 text-slate-500 flex-shrink-0 transition-transform ${
                        estaAbierto(g.id) ? 'rotate-90' : ''
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M7 5l6 5-6 5V5z" />
                    </svg>
                  )}
                  <Avatar name={g.nombre} src={g.avatar} size="sm" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {g.nombre}
                      </span>
                      {g.vencidos > 0 && (
                        <span className="text-[10px] text-red-400 whitespace-nowrap">
                          {g.vencidos} vencida{g.vencidos === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 h-1 w-full max-w-[180px] rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barraDe(g.porcentaje)}`}
                        style={{ width: `${g.porcentaje ?? 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1.5 flex-shrink-0">
                    <span
                      className={`text-base font-semibold tabular-nums ${colorDe(g.porcentaje)}`}
                    >
                      {g.porcentaje}%
                    </span>
                    <span className="text-[11px] tabular-nums text-slate-500">
                      {g.cumplidos}/{g.total}
                    </span>
                  </div>
                </button>

                <ul className={`divide-y divide-slate-800/60 ${estaAbierto(g.id) ? '' : 'hidden'}`}>
                  {g.compromisos.map((c) => {
                    const hecha = c.status === 'completado'
                    return (
                      <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                        {/* Casilla grande: el gesto principal de la reunion */}
                        <button
                          onClick={() => alMarcar(c)}
                          aria-label={hecha ? 'Marcar como no hecha' : 'Marcar como hecha'}
                          className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-colors ${
                            hecha
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-slate-600 hover:border-emerald-500 hover:bg-emerald-500/10'
                          }`}
                        >
                          {hecha && (
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs leading-snug ${
                              hecha ? 'text-slate-500 line-through' : 'text-slate-200'
                            }`}
                          >
                            {c.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px]">
                            <span className="text-slate-500">{formatDateLocal(c.due_date)}</span>
                            {/* Cuantas veces se movio la fecha (migracion 035, trigger en la
                                base). Un compromiso movido varias veces no es un atraso mas:
                                es señal de que hay otra conversacion pendiente. */}
                            {(c.plazo_change_count ?? 0) > 0 && (
                              <span
                                className="text-amber-400"
                                title="Veces que se movio la fecha de entrega desde que se creo"
                              >
                                movida {c.plazo_change_count}x
                              </span>
                            )}
                            {hecha && c.aTiempo && (
                              <span className="text-emerald-500">a tiempo</span>
                            )}
                            {hecha && !c.aTiempo && (
                              <span className="text-amber-500">fuera de plazo</span>
                            )}
                            {!hecha && c.diasVencida > 0 && (
                              <span className="text-red-400">
                                vencida hace {c.diasVencida} día{c.diasVencida === 1 ? '' : 's'}
                              </span>
                            )}

                            {/* Solo en lo no cumplido, y solo para quien conduce: arrastrar o discutir. */}
                            {!hecha && conduce && (
                              <>
                                <button
                                  onClick={() => alMover(c)}
                                  className="text-slate-500 hover:text-slate-300 underline"
                                >
                                  mover 1 semana
                                </button>
                                {/* Una vez escalado, la fila lo dice y el boton desaparece. Antes
                                    no cambiaba nada al apretarlo y se creaban temas repetidos. */}
                                {c.enMinuta ? (
                                  <span
                                    className="text-amber-400"
                                    title="Queda para conversar en la minuta"
                                  >
                                    ↑ en minuta
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => alDiscutir(c)}
                                    className="text-slate-500 hover:text-amber-400 underline"
                                    title="Si hay un bloqueo de fondo, va a la minuta para conversarlo"
                                  >
                                    llevar a minuta
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}

            <button
              onClick={reload}
              className="w-full text-[11px] text-slate-600 hover:text-slate-400 py-2"
            >
              Actualizar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
