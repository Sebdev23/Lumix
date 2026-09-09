// Aviso de novedades: se muestra UNA vez por usuario (no por dispositivo, ver migracion 044)
// cuando `profile.changelog_visto` queda atras de este numero. Al agregar una tanda nueva de
// cambios: subir CHANGELOG_VERSION en 1, actualizar APP_VERSION_DATE a la fecha de esa tanda, y
// reemplazar CHANGELOG_ITEMS por los cambios de esa tanda (no se acumulan versiones viejas en la
// lista, cada version muestra solo lo suyo).
export const CHANGELOG_VERSION = 3

// Se muestra en Perfil (footer de "Sobre Lumix") para que cualquiera pueda confirmar, mirando
// la pantalla, que version tiene cargada -util para saber si ya le llego una actualizacion.
export const APP_VERSION = `1.${CHANGELOG_VERSION}`
export const APP_VERSION_DATE = '08-09-2026' // DD-MM-AAAA, se actualiza junto con la version

export interface ChangelogItem {
  icon: string
  title: string
  desc: string
}

export const CHANGELOG_ITEMS: ChangelogItem[] = [
  {
    icon: '📅',
    title: 'Filtro de fechas en Ingesta',
    desc: 'Elegis el rango (fecha de solicitud o de compromiso) en vez del viejo "por semana".',
  },
  {
    icon: '🔄',
    title: 'Reclasificar por chat',
    desc: 'Respondiendo un mensaje podes decir "es un proyecto/ingesta/error" para convertirlo, sin perder datos si algo falla.',
  },
  {
    icon: '📝',
    title: 'Pegar una minuta ya la separa sola',
    desc: 'Si pegas un acta con varios puntos, Lumix la divide en temas automaticamente en vez de meterla toda junta.',
  },
  {
    icon: '🐛',
    title: 'Bitacora de Errores mas simple',
    desc: 'Todo editable en la misma pantalla, sin ventanas: quien lo reporto, fecha de creacion y de cierre.',
  },
]
