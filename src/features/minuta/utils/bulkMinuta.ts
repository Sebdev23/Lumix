// Carga masiva de minuta por planilla.
//
// A proposito SIN IA. En carga masiva un error de interpretacion no es un error: es uno por
// cada fila. Las columnas son fijas, la validacion es deterministica y todo lo que no calza
// se muestra antes de escribir nada.
//
// Las cabeceras son las MISMAS que exporta la minuta a Excel, para que el ciclo cierre:
// exportar -> editar en Excel -> volver a subir.

import { parseCSV, buildCSV } from '@shared/utils/csv'
import type { MinuteEstado, Profile } from '@shared/types'

export const COLUMNAS = [
  'Tema',
  'Responsables',
  'Estado',
  'Plazo',
  'Comentarios',
  'Para todos',
] as const

/** Fila lista para insertar, mas lo que haya que advertir sobre ella. */
export interface FilaValidada {
  linea: number // numero de fila en la planilla, para poder ubicarla
  tema: string
  responsables: string[] // ids que calzaron con miembros del equipo
  responsablesText: string // nombres que no calzaron (externos, "Todos", etc.)
  estado: MinuteEstado
  plazo: string | null // YYYY-MM-DD
  comentarios: string
  paraTodos: boolean
  errores: string[] // bloquean la fila
  avisos: string[] // se importa igual, pero conviene mirarlo
}

const ESTADOS: Record<string, MinuteEstado> = {
  pendiente: 'pendiente',
  'en desarrollo': 'en_desarrollo',
  en_desarrollo: 'en_desarrollo',
  resuelto: 'resuelto',
  'definir en reunion': 'definir',
  definir: 'definir',
}

/** Sin acentos, sin mayusculas y sin espacios de sobra: para comparar lo que escribio la gente. */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento, ya separadas por NFD
    .toLowerCase()
    .trim()

/**
 * Interpreta una fecha escrita por una persona.
 *
 * Acepta DD-MM-AAAA (lo que usa la app y lo que espera cualquiera en Chile) y AAAA-MM-DD
 * (lo que a veces deja Excel). Se descarta la ambiguedad validando el rango real del dia y
 * del mes: "13-05-2026" solo puede ser 13 de mayo, nunca el mes 13.
 */
export function parsePlazo(raw: string): string | null | 'invalida' {
  const v = raw.trim()
  if (!v) return null

  const m = v.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (!m) return 'invalida'

  const [, a, b, c] = m
  let dia: number, mes: number, anio: number

  if (a.length === 4) {
    anio = +a
    mes = +b
    dia = +c
  } else {
    dia = +a
    mes = +b
    anio = +c
    if (anio < 100) anio += 2000
  }

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || anio < 2000 || anio > 2100) return 'invalida'

  // El dia tiene que existir en ese mes (rechaza 31-02).
  const d = new Date(anio, mes - 1, dia)
  if (d.getMonth() !== mes - 1 || d.getDate() !== dia) return 'invalida'

  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** CSV de plantilla: cabeceras, una fila de ejemplo y los valores validos de Estado. */
export function plantillaCSV(): string {
  return buildCSV(
    [...COLUMNAS],
    [
      [
        'Revisar utilizacion del frigorifico con Emilio',
        'Juan Diaz, Manuel',
        'Pendiente',
        '20-08-2026',
        'Queda pendiente confirmar la capacidad real',
        'No',
      ],
      [
        'Seguimiento semanal del plan de mantenimiento',
        '',
        'Definir en reunion',
        '',
        'Tema de todo el equipo',
        'Si',
      ],
      [
        'BORRA ESTAS 3 FILAS DE EJEMPLO ANTES DE SUBIR.',
        'Separa varios con coma',
        'Pendiente / En desarrollo / Resuelto / Definir en reunion',
        'DD-MM-AAAA (o vacio)',
        'Texto libre',
        'Si / No',
      ],
    ],
  )
}

/**
 * Valida la planilla completa contra los miembros del equipo.
 *
 * Un nombre que no calza NO bloquea la fila: el modelo de la minuta ya tiene
 * responsables_text justamente para externos y para "Todos". Queda como aviso, no como
 * error, y el tema se importa con ese nombre en texto libre.
 */
export function validarFilas(texto: string, miembros: Profile[]): FilaValidada[] {
  const porNombre = new Map(miembros.map((m) => [normalizar(m.full_name), m]))

  return parseCSV(texto).map((row, i) => {
    const errores: string[] = []
    const avisos: string[] = []

    const tema = (row['Tema'] ?? '').trim()
    if (!tema) errores.push('Falta el tema')
    else if (tema.length > 300) errores.push('El tema es demasiado largo (max 300)')

    // Estado
    const estadoRaw = (row['Estado'] ?? '').trim()
    let estado: MinuteEstado = 'pendiente'
    if (estadoRaw) {
      const encontrado = ESTADOS[normalizar(estadoRaw)]
      if (encontrado) estado = encontrado
      else errores.push(`Estado no valido: "${estadoRaw}"`)
    }

    // Plazo
    const plazoRaw = (row['Plazo'] ?? '').trim()
    const plazo = parsePlazo(plazoRaw)
    if (plazo === 'invalida') errores.push(`Fecha no valida: "${plazoRaw}" (usa DD-MM-AAAA)`)

    // Responsables
    const responsables: string[] = []
    const sinCalzar: string[] = []
    const nombres = (row['Responsables'] ?? '')
      .split(/[,;/]/)
      .map((n) => n.trim())
      .filter(Boolean)
    for (const n of nombres) {
      const m = porNombre.get(normalizar(n))
      if (m) {
        if (!responsables.includes(m.id)) responsables.push(m.id)
      } else sinCalzar.push(n)
    }
    if (sinCalzar.length)
      avisos.push(`No estan en el equipo: ${sinCalzar.join(', ')}. Quedan como texto, sin asignar.`)

    const paraTodosRaw = normalizar(row['Para todos'] ?? '')
    const paraTodos = ['si', 'sí', 'x', 'true', '1', 'verdadero'].includes(paraTodosRaw)
    if (paraTodos && responsables.length)
      avisos.push('Marcado "para todos" y con responsables: se respeta "para todos".')

    return {
      linea: i + 2, // +1 por la cabecera, +1 porque Excel cuenta desde 1
      tema,
      responsables: paraTodos ? [] : responsables,
      responsablesText: sinCalzar.join(', '),
      estado,
      plazo: plazo === 'invalida' ? null : plazo,
      comentarios: (row['Comentarios'] ?? '').trim(),
      paraTodos,
      errores,
      avisos,
    }
  })
}
