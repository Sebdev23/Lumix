// Aviso de novedades: se muestra UNA vez por usuario (no por dispositivo, ver migracion 044)
// cuando `profile.changelog_visto` queda atras de este numero. Al agregar una tanda nueva de
// cambios: subir CHANGELOG_VERSION en 1, actualizar APP_VERSION_DATE a la fecha de esa tanda, y
// reemplazar CHANGELOG_ITEMS por los cambios de esa tanda (no se acumulan versiones viejas en la
// lista, cada version muestra solo lo suyo).
export const CHANGELOG_VERSION = 4

// Se muestra en Perfil (footer de "Sobre Lumix") para que cualquiera pueda confirmar, mirando
// la pantalla, que version tiene cargada -util para saber si ya le llego una actualizacion.
export const APP_VERSION = `1.${CHANGELOG_VERSION}`
export const APP_VERSION_DATE = '11-09-2026' // DD-MM-AAAA, se actualiza junto con la version

export interface ChangelogItem {
  icon: string
  title: string
  desc: string
}

export const CHANGELOG_ITEMS: ChangelogItem[] = [
  {
    icon: '📁',
    title: 'Proyectos, rediseñado',
    desc: 'Lista, Tablero y Cronograma con el mismo look: arrastrar tarjetas, prioridad, fecha de inicio, avance y alertas de vencidas/bloqueadas.',
  },
  {
    icon: '💬',
    title: 'Comentarios mas simples',
    desc: 'En Compromisos y Proyectos el campo de comentario ya no tiene boton de editar: se escribe directo.',
  },
  {
    icon: '🛡️',
    title: 'Confirmacion antes de borrar',
    desc: 'Remover a alguien de un equipo o borrar un grupo de trabajo ahora pide "¿Seguro?" antes de hacerlo.',
  },
  {
    icon: '⚡',
    title: 'Carga mas rapida',
    desc: 'Dashboard y Planificacion ya no se quedan pegados si falla la conexion, y la app arranca mas liviana.',
  },
]
