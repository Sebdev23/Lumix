// Aviso de novedades: se muestra UNA vez por usuario (no por dispositivo, ver migracion 044)
// cuando `profile.changelog_visto` queda atras de este numero. Al agregar una tanda nueva de
// cambios: subir CHANGELOG_VERSION en 1 y reemplazar CHANGELOG_ITEMS por los cambios de esa
// tanda (no se acumulan versiones viejas en la lista, cada version muestra solo lo suyo).
export const CHANGELOG_VERSION = 1

export interface ChangelogItem {
  icon: string
  title: string
  desc: string
}

export const CHANGELOG_ITEMS: ChangelogItem[] = [
  {
    icon: '☀️',
    title: 'Tema claro',
    desc: 'Elegi entre oscuro y claro desde tu Perfil. Se guarda por dispositivo.',
  },
  {
    icon: '🚀',
    title: 'Proyectos',
    desc: 'Nueva hoja para iniciativas de varias semanas, con vista Lista, Tablero y Cronograma.',
  },
  {
    icon: '👥',
    title: 'Grupos de trabajo',
    desc: 'La jefatura arma grupos (ej. "Excelencia") y puede filtrar Minuta, Actividades y Compromisos por grupo.',
  },
  {
    icon: '🗓️',
    title: 'Minuta con subtareas',
    desc: 'Los temas admiten un paso mas (subtarea), con edicion con lapiz y borrado.',
  },
  {
    icon: '💬',
    title: 'Ayuda en el chat',
    desc: 'Escribi "ayuda" para ver ejemplos de todo lo que le podes pedir a Lumix.',
  },
]
