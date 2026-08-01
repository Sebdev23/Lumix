// CORS compartido por todas las Edge Functions.
//
// ALLOWED_ORIGIN acepta una lista separada por comas, por ejemplo:
//   https://lumix.netlify.app,http://localhost:5173
//
// Si el Origin de la peticion esta en la lista, se devuelve ese origen exacto
// (obligatorio: el navegador rechaza una lista o un comodin cuando se envian
// credenciales). Si el secreto no esta definido, se cae a "*", que es el
// comportamiento historico: sirve para no romper nada mientras se configura.
//
// OJO: CORS es una proteccion del NAVEGADOR. No detiene a curl ni a un script.
// Lo que realmente protege estas funciones es requireUser() en ./auth.ts.

const RAW = Deno.env.get('ALLOWED_ORIGIN') || ''
const ALLOWED = RAW.split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export function buildCors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''

  let allowOrigin = '*'
  if (ALLOWED.length > 0) {
    // Si no calza, se devuelve el primero de la lista: el navegador bloquea igual,
    // pero no filtramos que otros origenes existen.
    allowOrigin = ALLOWED.includes(origin) ? origin : ALLOWED[0]
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
