// Verificacion de usuario para las Edge Functions de IA.
//
// POR QUE EXISTE ESTE ARCHIVO
// La anon key viaja dentro del bundle que sirve Netlify: es publica por diseno.
// Sin esta verificacion, cualquiera que la copie del inspector puede invocar las
// funciones de IA y gastar la OPENAI_API_KEY del proyecto. RLS protege los datos,
// pero no protege el gasto: una Edge Function es computo, no una tabla.
//
// Se usa el mismo patron que ya usaba admin-users (validar el token contra
// /auth/v1/user), para no introducir dependencias nuevas.

const PROJECT_URL = Deno.env.get('PROJECT_URL') || Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY =
  Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

export interface AuthedUser {
  id: string
  email?: string
}

// Devuelve el usuario autenticado, o null si el llamado no trae una sesion valida.
// La anon key sola NO alcanza: tiene que ser el token de alguien con sesion iniciada.
export async function getUser(req: Request): Promise<AuthedUser | null> {
  if (!PROJECT_URL || !SERVICE_KEY) {
    // Sin configuracion no se puede verificar. Se falla cerrado a proposito:
    // preferimos cortar el servicio antes que dejar la puerta abierta.
    console.error('auth: falta PROJECT_URL o SERVICE_ROLE_KEY')
    return null
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  try {
    const res = await fetch(`${PROJECT_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
    })
    if (!res.ok) return null

    const user = await res.json()
    if (!user?.id) return null

    return { id: user.id, email: user.email }
  } catch (err) {
    console.error('auth: fallo la verificacion del token', err)
    return null
  }
}
