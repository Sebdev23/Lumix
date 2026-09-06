import { useAuth } from './useAuth'
import { ROLE_DEFAULTS, type Capability } from '../capabilities'

// Capacidades resueltas por el ROL DEL EQUIPO ACTIVO + los permisos (flags) concedidos a
// ese usuario en ese equipo. El admin global es override total. Asi una persona puede ser
// jefatura en un equipo y colaboradora en otro, y ademas recibir permisos puntuales.
export function useCapabilities() {
  const { profile, teamRole, teamPermissions } = useAuth()
  const isGlobalAdmin = profile?.role === 'admin'
  const role = teamRole ?? profile?.role ?? 'colaborador'
  const defaults = ROLE_DEFAULTS[role] ?? []

  // El admin global nunca se bloquea. Para el resto: un flag explicito (true o false) en
  // team_members.permissions manda por sobre el default del rol -asi jefatura puede
  // ocultarle un modulo puntual a alguien sin tocar su rol-; sin flag explicito, gana el
  // default. Antes solo se podia SUMAR capacidades (nunca quitar una que traia el rol); los
  // flags de "modulos.*" necesitan poder revocarse, asi que el chequeo de `false` aplica
  // parejo a todo el catalogo (nadie fijaba `false` antes, asi que no cambia nada existente).
  const can = (cap: Capability): boolean => {
    if (isGlobalAdmin) return true
    const override = teamPermissions?.[cap]
    if (override === true) return true
    if (override === false) return false
    return defaults.includes(cap)
  }

  return {
    role,
    isGlobalAdmin,
    can,
    // Convenience
    canManageMinuta: can('minuta.gestionar'),
    canDeleteMinuta: can('minuta.eliminar'),
    canAssignMinuta: can('minuta.asignar'),
    canAssignOthers: can('actividades.asignar_otros'),
    canViewAllActivities: can('actividades.ver_todas'),
    canEditAllActivities: can('actividades.editar_todas'),
    canDeleteActivities: can('actividades.eliminar'),
    canManageErrors: can('errores.gestionar'),
    canManageIngestas: can('ingestas.gestionar'),
    // "Ve solo lo suyo" en actividades (compat con filtros existentes).
    isColaborador: !isGlobalAdmin && !can('actividades.ver_todas'),
    isInvitado: role === 'invitado',
  }
}
