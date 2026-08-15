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

  const can = (cap: Capability): boolean =>
    isGlobalAdmin || defaults.includes(cap) || teamPermissions?.[cap] === true

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
