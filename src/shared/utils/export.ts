/**
 * Exporta a CSV para abrir en Excel.
 *
 * Separador PUNTO Y COMA: Excel en español usa la coma como separador decimal y espera
 * punto y coma entre columnas. Con comas abria todo en una sola celda, que es lo que hacia
 * incomodo trabajar con estos archivos. Ver tambien buildCSV en ./csv.ts.
 */
export function exportToCSV<T extends Record<string, unknown>>(data: T[], filename: string) {
  if (data.length === 0) return

  const DELIM = ';'
  const headers = Object.keys(data[0])
  const csvRows = [headers.join(DELIM)]

  for (const row of data) {
    const values = headers.map((h) => {
      const val = String(row[h] ?? '')
      if (val.includes(DELIM) || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    })
    csvRows.push(values.join(DELIM))
  }

  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
