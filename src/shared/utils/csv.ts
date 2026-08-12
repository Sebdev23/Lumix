// Lectura de CSV. El exportador vive en ./export.ts; esto es el camino de vuelta.
//
// Escrito a mano y no con una libreria porque el caso es acotado y conocido: planillas que
// salen de Excel en español. Eso trae tres cosas que un split(',') no resuelve:
//
//   * Excel en es-CL guarda con PUNTO Y COMA, no con coma, porque la coma es el separador
//     decimal. Un archivo exportado desde la propia app (que usa coma) y uno guardado desde
//     Excel se ven iguales y se parsean distinto. Se detecta el separador en vez de asumirlo.
//   * Comillas: un campo puede contener el separador o saltos de linea si va entre comillas,
//     y las comillas internas van duplicadas ("").
//   * BOM al inicio y saltos CRLF, que dejan basura invisible en la primera cabecera y al
//     final de cada fila.

// Marca de orden de bytes. Excel la escribe al inicio del archivo y, si no se saca al leer,
// la primera cabecera deja de calzar ("Tema" con un caracter invisible pegado adelante).
// Va como escape y no como caracter literal: en el codigo fuente seria invisible.
const BOM = '\uFEFF'

/** Separador mas probable, mirando solo lo que hay FUERA de comillas en la cabecera. */
function detectDelimiter(headerLine: string): string {
  let dentro = false
  const conteo: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of headerLine) {
    if (ch === '"') dentro = !dentro
    else if (!dentro && ch in conteo) conteo[ch]++
  }
  // Empate en 0 => da lo mismo, hay una sola columna.
  return Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0]
}

/** Divide el texto completo en filas de celdas, respetando comillas y saltos embebidos. */
function splitRows(text: string, delim: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let dentro = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (dentro) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          celda += '"' // comilla escapada
          i++
        } else dentro = false
      } else celda += ch
      continue
    }

    if (ch === '"') dentro = true
    else if (ch === delim) {
      fila.push(celda)
      celda = ''
    } else if (ch === '\n') {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else if (ch !== '\r') celda += ch
  }

  // Ultima celda/fila si el archivo no termina en salto de linea.
  if (celda !== '' || fila.length) {
    fila.push(celda)
    filas.push(fila)
  }

  return filas
}

/**
 * Convierte un CSV en objetos, usando la primera fila como cabecera.
 *
 * Las claves quedan tal cual vienen en la cabecera (sin espacios sobrantes). Las filas
 * completamente vacias se descartan: Excel suele dejar varias al final del archivo.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const limpio = text.replace(/^\uFEFF/, '') // BOM (Excel lo pone y ensucia la primera cabecera)
  if (!limpio.trim()) return []

  const primeraLinea = limpio.split('\n')[0]
  const delim = detectDelimiter(primeraLinea)
  const filas = splitRows(limpio, delim)
  if (!filas.length) return []

  const cabecera = filas[0].map((h) => h.trim())

  return filas
    .slice(1)
    .filter((f) => f.some((c) => c.trim() !== ''))
    .map((f) => {
      const obj: Record<string, string> = {}
      cabecera.forEach((h, i) => {
        obj[h] = (f[i] ?? '').trim()
      })
      return obj
    })
}

/**
 * Texto CSV a partir de cabeceras y filas.
 *
 * Separador PUNTO Y COMA, no coma. Excel en español usa la coma como separador decimal, asi
 * que espera punto y coma para separar columnas: un archivo con comas lo abre con todas las
 * columnas metidas en una sola celda. Se veia como "el CSV es incomodo" cuando en realidad
 * era el separador equivocado para el Excel de quien lo abre.
 *
 * Leer no cambia: parseCSV detecta el separador solo, asi que una planilla guardada con
 * comas (o con tabulaciones) se sigue entendiendo.
 */
export function buildCSV(headers: string[], rows: string[][], delim = ';'): string {
  // Se entrecomilla solo cuando hace falta: el separador que se este usando, comillas o
  // saltos de linea. Con punto y coma, "Juan Diaz, Manuel" ya no necesita comillas, y una
  // celda sin comillas es mas facil de leer para quien abre el archivo.
  const escapar = (v: string) =>
    v.includes(delim) || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
  return BOM + [headers, ...rows].map((r) => r.map(escapar).join(delim)).join('\r\n')
}

/** Dispara la descarga de un archivo de texto en el navegador. */
export function downloadText(filename: string, contenido: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenido], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
