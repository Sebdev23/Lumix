// Catalogo de capacidades (flags) que se pueden conceder por usuario y por equipo.
export type Capability =
  | 'minuta.gestionar'
  | 'minuta.eliminar'
  | 'minuta.asignar'
  | 'actividades.asignar_otros'
  | 'actividades.ver_todas'
  | 'actividades.editar_todas'
  | 'actividades.eliminar'
  | 'errores.gestionar'
  | 'ingestas.gestionar'

export const CAPABILITIES: { key: Capability; label: string; group: string }[] = [
  { key: 'minuta.gestionar', label: 'Gestionar minuta (crear/editar)', group: 'Minuta' },
  { key: 'minuta.eliminar', label: 'Eliminar temas', group: 'Minuta' },
  { key: 'minuta.asignar', label: 'Asignar actividades desde minuta', group: 'Minuta' },
  { key: 'actividades.asignar_otros', label: 'Asignar a terceros', group: 'Actividades' },
  { key: 'actividades.ver_todas', label: 'Ver todas las del equipo', group: 'Actividades' },
  { key: 'actividades.editar_todas', label: 'Editar actividades ajenas', group: 'Actividades' },
  { key: 'actividades.eliminar', label: 'Eliminar actividades', group: 'Actividades' },
  { key: 'errores.gestionar', label: 'Gestionar errores', group: 'Errores' },
  { key: 'ingestas.gestionar', label: 'Gestionar ingestas', group: 'Ingestas' },
]

// Capacidades que trae cada rol por defecto (antes de sumar flags concedidos).
export const ROLE_DEFAULTS: Record<string, Capability[]> = {
  admin: CAPABILITIES.map((c) => c.key),
  jefatura: CAPABILITIES.map((c) => c.key),
  invitado: ['actividades.ver_todas', 'errores.gestionar', 'ingestas.gestionar'],
  colaborador: [],
}
