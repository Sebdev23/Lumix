// Rate limit por usuario.
//
// LIMITACION CONOCIDA: el estado vive en memoria del proceso Deno. Se pierde en
// cada arranque en frio y no se comparte entre instancias, asi que el limite real
// es "por instancia", no global. No sirve como defensa contra un atacante.
//
// Es aceptable HOY porque estas funciones ya exigen usuario autenticado
// (ver ./auth.ts): el limite pasa a ser una malla para errores honestos
// (un bucle en el cliente, alguien pegando 200 lineas), no una barrera de
// seguridad. Si algun dia hace falta un limite real, hay que moverlo a Postgres.

const buckets = new Map<string, number[]>()

export function checkRateLimit(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs)

  if (recent.length >= max) {
    buckets.set(key, recent)
    return false
  }

  recent.push(now)
  buckets.set(key, recent)

  // Evita que el Map crezca sin techo en instancias de larga vida.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k)
    }
  }

  return true
}
