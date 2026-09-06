// Aviso de novedades: se muestra UNA vez por usuario (no por dispositivo, ver migracion 044)
// cuando `profile.changelog_visto` queda atras de este numero. Al agregar una tanda nueva de
// cambios: subir CHANGELOG_VERSION en 1, actualizar APP_VERSION_DATE a la fecha de esa tanda, y
// reemplazar CHANGELOG_ITEMS por los cambios de esa tanda (no se acumulan versiones viejas en la
// lista, cada version muestra solo lo suyo).
export const CHANGELOG_VERSION = 2

// Se muestra en Perfil (footer de "Sobre Lumix") para que cualquiera pueda confirmar, mirando
// la pantalla, que version tiene cargada -util para saber si ya le llego una actualizacion.
export const APP_VERSION = `1.${CHANGELOG_VERSION}`
export const APP_VERSION_DATE = '06-09-2026' // DD-MM-AAAA, se actualiza junto con la version

export interface ChangelogItem {
  icon: string
  title: string
  desc: string
}

export const CHANGELOG_ITEMS: ChangelogItem[] = [
  {
    icon: '📱',
    title: 'Chat mas estable en el celular',
    desc: 'Ya no salta la pantalla ni hace zoom al escribir, y el texto crece con el mensaje.',
  },
  {
    icon: '🧭',
    title: 'Mas accesos rapidos',
    desc: 'Proyectos y Compromisos ya estan en la barra de abajo del celular.',
  },
  {
    icon: '👥',
    title: 'Filtro de grupo corregido',
    desc: 'Ahora funciona bien en Minuta, incluso en temas sin responsable propio.',
  },
  {
    icon: '🔢',
    title: 'Numero de version en Perfil',
    desc: 'Al pie de "Sobre Lumix" para saber siempre que version tenes cargada.',
  },
]
