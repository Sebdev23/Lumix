# Plan: mejoras UX/administración de Lumix (nombres, permisos, módulos, proyectos, mobile, tema claro)

**Estado general:** Fases 1-5, 7, 8 completas y probadas contra la base real. Fase 6 (tema claro)
con una primera pasada completa en TODA la app (infraestructura, primitivos, shell, Chat, y las
18 páginas restantes) — falta la revisión visual fina de detalle. Fase 9 (evaluar depender menos
de regex) anotada para evaluar a futuro.

## Contexto

Tanda de mejoras pedida por Sebastián sobre Lumix, en 7 puntos. Cada uno se investigó contra el
código y los datos reales antes de tocar nada (ver detalle por fase). Seguimos en modo "solo local":
nada se publica (`git push`, deploy de Edge Functions, escritura en producción) sin pedido explícito.

---

## Fase 1 — Normalizar nombres ✅ HECHO

7 perfiles con capitalización inconsistente corregidos en la base real (incluye el caso especial
"SebaDiaz" → "Sebastian Diaz", confirmado por Sebastián). Nueva utilidad `normalizeFullName()`
(`src/shared/utils/name.ts`) aplicada en los 3 puntos donde un nombre entra al sistema: `SignUpPage`,
`AdminPage` (crear usuario), `ProfilePage` (editar perfil propio).

---

## Fase 2 — Permisos parametrizables ✅ HECHO

Catálogo `CAPABILITIES` (`src/core/auth/capabilities.ts`) ya existía con 9 flags por equipo/persona,
más UI genérica en `TeamsPage.tsx` que renderiza un checkbox por capability sin código nuevo.

Se agregó `equipo.gestionar_miembros` (agregar/quitar miembros e invitar), **cableado a nivel de
base** (migración 041), con límites de seguridad explícitos:

- Solo puede agregar/quitar personas con rol `colaborador` o `invitado` — nunca `jefatura`/`admin`.
- Nunca puede cambiar el rol de nadie ni editar permisos de nadie — eso sigue exclusivo de
  jefatura/admin, en la UI y en la base (RLS + el trigger anti-escalación de la migración 022, que
  se extendió con un camino más sin debilitar el resto).

Verificado con datos reales simulando la sesión de un colaborador con el flag: `puede_gestionar:
true`, `es_manager: false` — la lógica distingue correctamente.

---

## Fase 3 — Visibilidad de módulos por persona ✅ HECHO

`navItems`/`bottomNavItems` (`src/shared/components/layout/navItems.tsx`) eran arrays estáticos sin
ningún filtro: todos veían todos los módulos. Se agregaron 7 capabilities nuevas
(`modulos.actividades/minuta/compromisos/errores/ingestas/planificacion/dashboard`), todas en `true`
por defecto para todos los roles (nadie pierde nada hoy). Jefatura/admin puede destildarlas por
persona desde `TeamsPage`, y `Sidebar`/`BottomNav` ahora filtran según esos flags. Chat, Notificaciones,
Equipos y Perfil quedan siempre visibles (identidad/core).

---

## Fase 4 — "Proyectos" ✅ HECHO

**Lo que se hizo primero** (mantener, no se revierte): badge "📁 Proyecto" en Minuta y procedencia
en Compromisos. Sigue siendo útil, pero el diseño original tenía un problema de fondo que Sebastián
marcó bien:

> "¿tiene el mismo foco la minuta que hablar de proyectos?" — No. Minuta es la cadencia semanal
> (temas para LA reunión de esta semana, se conversan y se cierran). Un Proyecto es una iniciativa
> de varias semanas que no necesita "conversarse" cada semana, solo cuando algo puntual se traba.
> Guardar el proyecto raíz como un `tipo='minuta'` más (aunque se le pusiera un badge y se filtrara
> de la lista) seguía siendo, en el fondo, la misma hoja.

> "¿se debe administrar desde el chat? ¿ese es el motor de esto?" — Sí, tiene que serlo. Todo en
> Lumix se dicta por chat (actividades, temas de minuta); una pantalla de Proyectos que solo se
> llena a mano rompe el principio central del producto.

### Arquitectura corregida: `tipo='proyecto'`, tercer valor de `HojaTipo`

`minute_items.tipo` ya distingue `'minuta'` de `'ingesta'` — misma tabla, mismo hook
(`useMinuta(tipo)`), mismo motor, pero **listas separadas** porque el propósito es distinto (ver
migración 033 y el docblock de `useMinuta.ts`). Agregar `'proyecto'` como tercer valor es lo
consistente con ese patrón ya probado, en vez de inventar uno nuevo:

- Un proyecto (tema raíz + subtareas) se crea con `tipo='proyecto'` → **no aparece en Minuta en
  absoluto** (la query de Minuta sigue filtrando `tipo='minuta'`, sin cambios). Vive solo en la
  pantalla nueva.
- Si una subtarea puntual de un proyecto se traba y sí amerita conversarse en la reunión semanal,
  se **escala a Minuta** con el mismo mecanismo que ya existe para compromisos trabados
  (`llevarAMinuta` en `useCompromisos.ts`: crea un `minute_item` nuevo con `tipo='minuta'`,
  `estado='definir'`, vinculado a la misma actividad). Así los dos mundos se conectan solo cuando
  hace falta, no por defecto.
- **Migración necesaria** (antes no hacía falta ninguna, ahora sí): `minute_items` tiene un
  `CHECK (tipo = ANY (ARRAY['minuta','ingesta']))` — hay que ampliarlo para aceptar `'proyecto'`.
  `puede_escribir_hoja()` no necesita cambios: ya trata "cualquier tipo que no sea ingesta" con
  `minuta.gestionar`/`minuta.eliminar`, así que `'proyecto'` reusa esos mismos permisos sin tocar la
  función (se puede separar en un flag `proyecto.gestionar` más adelante si hace falta, no para el
  MVP).

### Motor: el chat sigue siendo la puerta de entrada

En `ChatPage.tsx`, el selector de tipo (`auto | actividad | error | ingesta | masivo | minuta`)
suma `proyecto`. En `useChatMessages.ts`, el branch `forcedType === 'minuta'` (clasifica con IA,
resuelve responsable, llama `createMinutaTopic`) se generaliza para aceptar `tipo` como parámetro
en vez de tenerlo fijo — mismo clasificador, misma resolución de responsable, mismo
`minutesService.create`, solo cambia el valor de `tipo`. Ejemplo de uso real: dictar "Revisar
capacidad de la planta" con el selector en Proyecto crea el proyecto raíz; después "agrégale ver
etiquetado, ver posiciones, ver faena" (respondiendo el mensaje del proyecto, o desde la pantalla)
cuelga las subtareas del mismo proyecto — igual que ya funciona hoy para subtareas de Minuta.

### Lo mejor de Planner y Todoist, sin inventar de más

Investigado antes de diseñar (no se copia lo que no encaja con lo que ya existe):

| Concepto Todoist/Planner                            | Se usa?                    | Equivalente en Lumix                                                                                                                                                            |
| --------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto                                            | Sí                         | Tema raíz con `tipo='proyecto'`                                                                                                                                                 |
| Tarea / Subtarea                                    | Sí                         | `minute_items.parent_item_id`, profundidad ilimitada (ya construido)                                                                                                            |
| Secciones (Todoist) / Buckets (Planner)             | **No** — resuelto distinto | El campo `estado` ya existente (`pendiente`/`en_desarrollo`/`resuelto`/`definir`) cumple la misma función de "columnas por fase" sin inventar un concepto nuevo que administrar |
| Vista Tablero (Kanban)                              | Sí                         | Nueva: columnas = esos 4 estados, tarjetas = subtareas aplanadas con indentación por profundidad                                                                                |
| Vista Cronograma (Planner)                          | Sí                         | El `GanttModal` ya construido, de modal a vista embebida                                                                                                                        |
| Vista Lista                                         | Sí                         | El árbol `SubtareasPanel` ya construido, a pantalla completa                                                                                                                    |
| Quick-add en lenguaje natural (Todoist)             | Sí                         | Ya lo tenemos mejor resuelto: es el chat con IA, no un parser de texto suelto                                                                                                   |
| Checklist/subtareas de un solo nivel (Planner free) | No aplica                  | Ya tenemos jerarquía real sin límite de niveles, superior a lo que ofrece Planner gratis                                                                                        |
| Vista Gráficos/Charts (Planner)                     | No, MVP                    | Nice-to-have futuro (torta por estado/responsable); no es núcleo de la experiencia y se puede agregar después sin rediseñar nada                                                |

### Plan de implementación

1. **Migración**: ampliar el `CHECK` de `minute_items.tipo` para incluir `'proyecto'`.
2. **Tipos**: `HojaTipo = 'minuta' | 'ingesta' | 'proyecto'` (`src/shared/types/index.ts`).
3. **Chat**: agregar `proyecto` al selector de tipo en `ChatPage.tsx`; generalizar el branch
   `forcedType === 'minuta'` en `useChatMessages.ts` para aceptar el tipo como parámetro
   (clasificación, responsable y creación funcionan igual, solo cambia `tipo`).
4. **Hook**: `useProyectos()` como envoltorio fino de `useMinuta('proyecto')` — reusa `addItem`,
   `changePlazo`, `createActivitiesFromItem`, subtareas, todo tal cual, solo relabeling de la UI.
5. **Nueva ruta** `/proyectos` + nav item + capability `modulos.proyectos` (mismo mecanismo genérico
   de la Fase 3, sin tocar `Sidebar`/`BottomNav` de nuevo salvo agregar la entrada).
6. **Vista lista de proyectos**: tarjetas — título, avance (X/Y subtareas resueltas), fecha derivada
   (`plazoEfectivo`, ya existe), responsables.
7. **Vista detalle**, con selector Lista / Tablero / Cronograma (los tres reusan código ya
   construido, según la tabla de arriba).
8. **Escalar a Minuta**: acción "Llevar a discutir en la reunión" sobre una subtarea trabada,
   calcada de `llevarAMinuta` (`useCompromisos.ts`).

**Verificación cuando se ejecute:** `npm run build`/`eslint` limpios, más prueba con datos reales
contra RLS (patrón ya usado toda la sesión con el usuario de prueba en Equipo Prueba) — crear un
proyecto por chat, agregarle subtareas, confirmar que NO aparece en Minuta, y escalar una subtarea
trabada para confirmar que SÍ aparece ahí cuando corresponde.

### Implementado

- Migración 042 aplicada. `HojaTipo` con `'proyecto'`. Chat generaliza el branch de minuta
  (`useChatMessages.ts`) para aceptar `tipo`, incluido el camino de desambiguación de nombres
  (que antes perdía el tipo al confirmar). Selector de chat con la opción "Proyecto".
- `SubtareasPanel`, `GanttModal` y el modal "Crear actividad" (extraído a
  `AsignarActividadModal.tsx`, ahora compartido con Minuta — Minuta también se simplificó al
  reusarlo) quedaron exportados/reusables desde `MinutaPage.tsx`, sin duplicar código.
- `plazoEfectivo`/`contarSubtareas` extraídos a `src/features/minuta/utils/subtareas.ts` para
  que Proyectos los use igual.
- Nuevas páginas: `ProyectosPage.tsx` (lista con avance y fecha derivada) y
  `ProyectoDetailPage.tsx` (Lista / Tablero / botón Cronograma).
- **Decisión de alcance, Tablero:** sin drag-and-drop (más frágil en mobile); cambiar de
  columna se hace con los mismos botones/acciones que ya existían (Asignar, Discutir en
  reunión). Se puede sumar drag-and-drop más adelante si hace falta.
- **Decisión de alcance, Cronograma:** se abre como overlay (reusa `GanttModal` tal cual, sin
  modificarlo) en vez de fingir que es una pestaña embebida.
- Probado extremo a extremo contra RLS real (usuario de prueba): crear proyecto → agregar
  subtarea → confirmar que NO aparece en Minuta → asignar y crear actividad → escalar a
  Minuta → confirmar que SÍ aparece ahí. Datos de prueba limpiados al terminar.
- **Pendiente opcional (no bloqueante):** un candado a nivel de base que impida que una
  subtarea tenga un `tipo` distinto al de su padre (hoy solo se valida que el `team_id`
  coincida, migración 040 — el `tipo` no se mezcla porque el código nunca lo permite, pero no
  hay nada en la base que lo impida si alguien insertara directo).

### Bug real encontrado al probar: "Auto" no reconocía la intención de crear un proyecto

Sebastián probó dejando el chat en modo **Auto** (sin tocar el selector) escribiendo
"agrega un proyecto, gobernar el infull, primer punto, revisar quien cargara el pedido y cual
sera la fuente oficial". Se creó como una actividad genérica ("Agregar proyecto 'Gobernar el
Infull' y revisar carga de pedido"), no como proyecto — el clasificador de Auto no sabía que
`'proyecto'` existía como tipo.

**Corregido:**

- `PROYECTO_RE` detecta frases tipo "agrega/crea/arma un proyecto..." en Auto y enruta al
  mismo camino que si se hubiera tocado el selector.
- El título de la IA (`ai-classify`) está entrenado para tareas ("Agregar proyecto y revisar
  X"), no para el nombre limpio de un proyecto — se agregó `parseProyectoIntent()`, un parseo
  dedicado que separa el **nombre del proyecto** de su **primer punto/subtarea** cuando los
  dos vienen en el mismo mensaje (exactamente el caso real: "...gobernar el infull, primer
  punto, revisar quien cargara..."). El primer punto se cuelga automáticamente como la primera
  subtarea apenas se crea la raíz.
- Probado con la frase real contra RLS: nombre="Gobernar el infull", primer punto="revisar
  quien cargara el pedido y cual sera la fuente oficial", ambos creados correctamente
  (root + subtarea vinculada).

### Mejora: cuando es ambiguo, Lumix pregunta en vez de adivinar

Sebastián pidió que, si la IA detecta ambigüedad y no sabe si algo es actividad o proyecto, en vez
de crear una actividad suelta a ciegas, **pregunte** — reusando el mismo mecanismo de popout que ya
existía para actividad/error/ingesta (`category_confirm`), no uno nuevo.

- `MENTIONS_PROYECTO_SUAVE` (`useChatMessages.ts`): detecta señales suaves de que un mensaje trae
  varios pasos relacionados sin usar la frase explícita "crea un proyecto" (esa ya se resuelve sola
  vía `PROYECTO_RE`, sin preguntar) — "primer punto", "primera tarea", "paso 1", "varios pasos",
  "varias tareas/subtareas/etapas", "subtareas".
- El popout de ambigüedad (antes solo actividad/error/ingesta) ahora también puede ofrecer
  "Proyecto (con subtareas, se sigue en el tiempo)" cuando `mentionsProyecto` es cierto, con el
  mismo texto de apertura ("¿'{título}' es una actividad o...?") y el mismo comportamiento: no se
  cierra tocando afuera, obliga a elegir. Si el usuario elige Proyecto, se llama
  `parseProyectoIntent()` (la misma función que ya separaba nombre/primer punto en el camino
  explícito) y se crea con `tipo='proyecto'`.
- El caso "el modelo dudó pero el texto no menciona nada" (`dudaDelModelo` sin ninguna pista) sigue
  ofreciendo error+ingesta como antes — no se le agrega "proyecto" a ciegas sin ninguna señal en el
  texto, sería inventar una alternativa que el texto no sugiere.
- Como el popout queda como un mensaje más en el historial del chat (no un modal efímero que
  desaparece), si la persona no contesta al toque, el mensaje sigue visible: al volver a entrar al
  chat, ve la pregunta pendiente y entiende qué pasó con lo que escribió.

Probado: `MENTIONS_PROYECTO_SUAVE` contra frases reales ("primer punto, revisar...", "varias
etapas", "subtareas que definir" → true; una reunión normal sin nada especial → false).
`npm run build`/`eslint` limpios.

### Mejora: reclasificar una actividad ya creada respondiendo el mensaje

Sebastián preguntó: si Lumix se equivoca y crea una Actividad cuando en realidad era un
Proyecto, ¿se puede responder el mensaje para corregirlo? Antes no — responder a una actividad
solo dispara el flujo de "actualizar campos" (estado, plazo, responsable), que no tiene forma de
cambiar el tipo de registro y contestaba "no vi ningún cambio que aplicar" (caso real
reproducido en pruebas).

- `RECLASIFICAR_PROYECTO_RE` (`useChatMessages.ts`): detecta, en una respuesta, frases como "es
  un proyecto", "creala como proyecto", "conviertelo a proyecto", "hazlo proyecto". Se revisa
  ANTES que el flujo normal de actualización, en el mismo lugar donde ya se intercepta
  "bórrala" respondiendo a una actividad puntual.
- Al detectarse, se pide confirmar (mismo patrón que eliminar por chat: popout que no se cierra
  tocando afuera, exige Convertir o Cancelar) — convertir es destructivo (borra la actividad
  original), así que no se hace a ciegas.
- Al confirmar: se elimina la actividad, se reusa `parseProyectoIntent()` sobre su descripción
  original para separar nombre/primer punto, y se crea el proyecto con `createMinutaTopic(...,
'proyecto', primerPunto)` — mismo motor que el resto de esta fase, sin código nuevo de
  creación.
- Si la actividad ya no está en estado "pendiente" (alguien ya avanzó en ella), se bloquea la
  conversión con aviso, igual que ya pasa con eliminar.

Probado: `RECLASIFICAR_PROYECTO_RE` contra frases reales (todas las variantes de arriba →
true; una actualización normal como "ya esta lista, marcala completa" → false, no se cruza con
el flujo de actualización existente). `npm run build` limpio.

**Nota:** al correr `eslint .` completo aparecieron 3 errores nuevos de la regla
`react-hooks/purity`/`immutability` (uso de `Date.now()` como id en un popout de
`activity_pick`, y una función referenciada antes de declararse en un `useEffect` de
sobrecarga) — son código preexistente, no tocado en esta sesión ni relacionado a Proyectos;
posible efecto de que el analizador ahora completa el analisis de la funcion con más código
alrededor. Queda pendiente decidir si se corrige (son 2-3 líneas, bajo riesgo) en una pasada
aparte, no mezclado con esta feature.

---

## Fase 5 — Bug móvil: chat pierde el botón enviar ✅ HECHO (falta confirmación en celular real)

Causa raíz: `BottomNav` se renderizaba siempre, como hermano fijo de `<main>`, en todas las rutas
incluida `/chat` — restándole ~50-60px permanentes al chat, justo donde vive su propio input+botón
enviar, empeorado con el teclado abierto. Se ocultó `BottomNav` específicamente en `/chat`
(`AppLayout.tsx`, vía `useLocation()`) y se agregó `interactive-widget=resizes-content` al viewport
(`index.html`) para mejor comportamiento del teclado en Android/iOS.

**Pendiente:** confirmación de Sebastián en un teléfono real — no hay forma de probar esto sin
navegador/dispositivo en esta sesión.

---

## Fase 6 — Tema claro configurable 🟡 EN PROGRESO (infraestructura y pantalla principal hechas)

Cero componentes usaban tokens de color al empezar — todo son clases Tailwind fijas
(`bg-slate-900`, etc.) repetidas en ~20 archivos de página. Sebastián pidió explícitamente que
**"fijo debe quedar el actual"** — el oscuro de hoy no se toca ni se re-diseña, el tema claro se
suma al lado — y que se investigaran buenas prácticas de diseño gráfico antes de definir la
paleta clara, en vez de improvisar colores.

### Decisión de arquitectura: variante `light:` ADITIVA, no `dark:` invertida

El plan original (ver más abajo, "plan original de la sesión") proponía invertir todo: paleta
clara como default, `dark:` para preservar el look actual — eso obliga a cambiar CADA clase de
color existente en todos los archivos (aunque sea agregando `dark:` al lado), con el riesgo real
de alterar el oscuro actual por un error de tipeo en medio de un cambio masivo.

En cambio, con el pedido explícito de "fijo debe quedar el actual", se invirtió el approach:

- `@custom-variant light (&:where([data-theme='light'], [data-theme='light'] *));` en
  `src/index.css` (patrón recomendado por la documentación de Tailwind v4 para variantes por
  atributo).
- Las clases SIN prefijo siguen siendo exactamente las de hoy — **cero riesgo de romper el
  oscuro**, porque no se toca ninguna clase existente, solo se agregan clases `light:` al lado.
- El tema claro es 100% opt-in (no seguido de `prefers-color-scheme`): por default todos ven el
  oscuro de siempre, y activarlo es una decisión explícita desde Perfil, persistida en
  `localStorage` por dispositivo (`src/core/theme/ThemeContext.tsx`, hook `useTheme()`).

### Paleta clara: investigada, no improvisada

Antes de elegir colores, se buscaron prácticas de diseño reales para paletas de SaaS/apps de
productividad en modo claro (2025-2026):

- **Neutro cálido en vez de blanco puro**: blanco puro (`#FFFFFF`) se lee "frío/corporativo" y
  cansa más la vista en sesiones largas; editores de texto/notas modernos (línea Notion y
  similares) usan un off-white cálido para reducir fatiga visual y transmitir una marca más
  "humana". Se eligió `#FAF9F7` como fondo de página (no `#FFFFFF`), con las tarjetas/paneles en
  blanco puro encima para dar jerarquía (fondo ligeramente más oscuro que las superficies "más
  arriba" — patrón estándar de elevación).
- **Sistema por tokens con contraste verificado**: se evitaron grises medios (`#808080`) como
  texto o borde — casi nunca son accesibles; se usaron pares claros/oscuros con contraste
  pensado para pasar WCAG AA (≥4.5:1 texto normal).
- Fuentes: ["UI Color Palette 2026: Best Practices" (IxDF)](https://ixdf.org/literature/article/ui-color-palette),
  ["SaaS Dark Mode UI Design" (Orbix)](https://www.orbix.studio/blogs/saas-dark-mode-ui-design) —
  aunque hablan de modo oscuro, el mismo principio de "sistema de tokens + contraste verificado"
  aplica igual de bien al lado claro. Para la implementación técnica en Tailwind v4:
  ["Flexible Dark Mode with Tailwind CSS v4 Custom Variants" (Nils Schönwald)](https://schoen.world/n/tailwind-dark-mode-custom-variant)
  y la [discusión oficial de tailwindlabs sobre variables CSS para dark/light](https://github.com/tailwindlabs/tailwindcss/discussions/15083).

**Nota sobre "que el usuario configure qué paleta quiere":** hoy es una elección binaria (oscuro
por defecto / claro opcional), guardada por dispositivo — eso YA es "cada usuario configura la
suya". Si más adelante se quiere ofrecer MÁS de dos paletas (ej. varios acentos de color, o un
claro "frío" además del cálido), la arquitectura actual (clases Tailwind fijas + variante
`light:` aditiva) no escala bien a un tercer/cuarto tema — habría que migrar a tokens CSS
semánticos (`--color-surface`, `--color-text`, etc., ya esbozados pero sin usar en
`index.css`) para que agregar una paleta nueva sea "redefinir 5-6 variables", no "agregar un
prefijo más a cada clase de cada archivo". Vale la pena evaluarlo si en el futuro se pide más de
un claro/oscuro.

### Hecho hasta ahora

1. **Infraestructura completa**: `@custom-variant light` en `index.css`, `ThemeProvider`/
   `useTheme()` (`src/core/theme/ThemeContext.tsx`), envuelto en `App.tsx`. Toggle visible en
   `ProfilePage.tsx` ("Apariencia": 🌙 Oscuro / ☀️ Claro), con nota de que se guarda por
   dispositivo.
2. **Todos los primitivos compartidos** (`shared/components/ui/*`): `Card`, `Button`, `Badge`,
   `Modal`, `Toast`, `DatePicker`, `Input`, `Skeleton`, `MemberMultiSelect`, `EditableText`,
   `ChatBubble` — todos con sus variantes `light:` agregadas. Como son compartidos, cualquier
   pantalla que ya los use hereda el tema claro ahí automáticamente, sin tocar la pantalla.
3. **Shell de la app** (visible siempre): `AppLayout.tsx` (fondo, header móvil), `Sidebar.tsx`
   (logo, selector de equipo, nav, perfil/logout), `BottomNav.tsx`.
4. **Chat** (pantalla principal, la que más se usa): header, burbujas propias/ajenas
   (`ChatBubble`), burbujas de pregunta (`LumixPromptBubble`), los 9 popouts de confirmación
   (delete/reclass/category/name/activity/overload, todos comparten el mismo patrón de fondo),
   selector de tipo de mensaje, y la barra de escribir mensaje.

**Probado:** `npm run build` y `npx eslint .` limpios en cada paso (mismos 3 errores
preexistentes de siempre en `useChatMessages.ts`, no relacionados). **No probado visualmente**
— no hay navegador en esta sesión, así que el look real del tema claro (contraste, que no quede
ningún texto oscuro-sobre-claro ilegible) necesita que Sebastián lo mire con sus propios ojos
antes de darlo por bueno, iterando lo que no cuadre.

### Las 18 páginas restantes: primera pasada completa (mecánica, vía script)

Sebastián pidió seguir con las demás páginas. Dado el volumen (18 archivos,
`ActivitiesPage`, `AdminPage`, `ActivityCard`, `ActivityListMessage`, `QuotedMessage`,
`CompromisosPage`, `DashboardPage`, `ErrorsPage`, `GanttPage`, `IngestasPage`/`IngestasTabs`,
`AsignarActividadModal`, `CargaMasivaModal`, `MinutaPage`, `NotificationsPage`,
`ProyectoDetailPage`, `ProyectosPage`, `TeamsPage`), se armó un mapeo de reemplazo (sed con
límites de palabra estrictos — solo aplica cuando la clase termina en espacio o comilla doble,
así nunca se mete a medias en una clase con sufijo de opacidad como `/40` o `/60`) que agrega la
variante `light:` correspondiente al lado de cada clase de color oscuro repetida
(`bg-slate-900/800/700`, `border-slate-800/700`, `text-slate-100/200/300/400`, con sus variantes
`hover:`), sin tocar ninguna clase existente. Aplicado a los 18 archivos de una pasada.

**Limitación conocida:** el patrón de límite (espacio o comilla doble) no cubre clases que
terminan justo antes de una comilla SIMPLE dentro de un ternario en template literal (ej.
`` `${activo ? 'bg-slate-800' : 'otro'}` ``) — esos casos puntuales quedaron sin su variante
`light:` en esta pasada (no se reintentó con un límite más amplio para no arriesgar duplicar
`light:` en las clases que ya lo tenían). Son minoría; se detectan fácil en la revisión visual
(se ven con el color oscuro de fondo en una fila/botón puntual) y se corrigen a mano donde
aparezcan.

**Probado:** `npm run build` y `npx eslint .` limpios en los 18 archivos después del script
(mismos 3 errores preexistentes de `useChatMessages.ts`, no relacionados). Sin duplicados de
`light:` (verificado). **No probado visualmente** — sigue pendiente que Sebastián lo mire con
sus propios ojos; es esperable encontrar ajustes de contraste puntuales y los casos de comilla
simple mencionados arriba.

### Ronda 2 — bugs reales que Sebastián encontró activando el tema claro

Sebastián activó el tema claro y probó: "en Actividades se ve mal el encabezado", "en
Compromisos no se ve muy bien las letras", "en Planificación se visualiza mal". Los tres eran
reales, y los tres eran exactamente la limitación conocida de la ronda anterior (clases dentro
de un ternario con comilla simple, o con sufijo de opacidad `/NN` no contemplado):

- **Actividades — encabezado feo**: la barra de filtros bajo el título tenía
  `bg-slate-900/50` (un azul oscuro al 50% de opacidad) flotando directo sobre el fondo claro
  nuevo — se veía como una mancha grisácea sucia justo debajo del título. Mismo bug en Errores e
  Ingestas (usan la misma barra). Corregido con `light:bg-slate-50`.
- **Compromisos — "no se ve bien las letras"**: el título de cada compromiso (`c.title`, el
  texto más importante de la fila) usaba `text-slate-200` — un gris casi blanco, pensado para
  fondo oscuro, que sobre el nuevo fondo claro queda casi invisible (blanco sobre casi-blanco).
  Era exactamente el texto que la reunión semanal necesita leer. Corregido a
  `light:text-slate-700`. De paso se corrigieron el % con `pct===null` (`colorDe`) y la barra de
  progreso vacía (`barraDe`), que tenían el mismo problema.
- **Planificación (Gantt) — se visualiza mal**: las celdas del calendario (día de semana vs. fin
  de semana) usaban `bg-slate-900/30` y `bg-slate-900/50` sin variante clara — mismo efecto de
  mancha oscura sobre fondo claro que en Actividades.

**Causa raíz común**: el script de la ronda 1 solo cubría los sufijos de opacidad que aparecían
en los archivos que se revisaron a mano en ese momento (`/40`, `/60`, `/80`) — cualquier otro
sufijo (`/30`, `/50`, `/70`) o cualquier clase "sola" dentro de un ternario con comilla simple
quedaba afuera. Se hizo un barrido **de toda la app** (no solo las 3 páginas reportadas) para
estos dos patrones:

1. Todo sufijo de opacidad (`/NN`) que quedó sin variante clara — se agregó, con la misma
   lógica de color por capa (900→blanco/gris-50, 800→gris-100, 700→gris-200).
2. Toda clase de color "sola" entre comillas simples dentro de un ternario (`'text-slate-200'`,
   `'bg-slate-700'`, etc.) — se agregó su variante, con un patrón de reemplazo que por diseño no
   puede duplicarse (una clase ya migrada deja de terminar justo antes de la comilla, así que la
   regla no vuelve a matchearla).

**Encontrado en el camino:** el barrido tocó también `Card.tsx` y `Modal.tsx` (componentes
compartidos, editados a mano en la Fase 6 original) y por una superposición de reglas quedaron
con `light:border-slate-200` **duplicado** dos veces en la misma clase — inofensivo para
Tailwind pero descuidado. Se hizo un escaneo de duplicados en TODA la app (script en Python,
busca clases `light:` repetidas en la misma línea) y se limpiaron los 2 casos reales
encontrados (los demás resultados eran falsos positivos: dos ramas de un mismo ternario, nunca
aplicadas juntas).

**Probado:** `npm run build` y `npx eslint .` limpios después de cada barrido. Verificado
puntualmente que las 3 líneas que Sebastián reportó ahora sí tienen su variante clara. Sigue
pendiente la revisión visual completa (no hay navegador en esta sesión) — puede que aparezcan
más ajustes finos de contraste al mirarlo en pantalla.

### Ronda 3 — migración completa a tokens de color (`light:` → `bg-panel`/`text-fg`/etc.)

Conversando sobre los bugs de la Ronda 2, se identificó la causa de fondo: agregar el tema
claro clase por clase (`light:` al lado de cada `bg-slate-900`) es inherentemente frágil —
cualquier script o edición manual puede desincronizar el par. La corrección real es un sistema
de **tokens**: nombres semánticos (`bg-panel`, `text-fg`, `border-border`, etc.) cuyo valor real
vive en una variable CSS que cambia sola con `[data-theme]` — un componente escribe UNA clase,
nunca dos que mantener sincronizadas. Sebastián pidió migrar.

**Infraestructura** (`src/index.css`): patrón de dos etapas recomendado por Tailwind v4 — canales
RGB crudos en `:root`/`[data-theme='light']`, mapeados por un `@theme` NO-inline a colores de
Tailwind reales. Tokens definidos: `shell` (fondo general), `panel` (headers/modales/paneles
sólidos), `surface`/`surface-2` (superficies secundaria/terciaria: botones, inputs, hover),
`surface-soft` (insets sutiles con opacidad), `border`/`border-strong` (divisores/bordes),
`fg`/`fg-body`/`fg-muted`/`fg-faint` (jerarquía de texto). Los colores de acento (indigo,
emerald, amber, red) NO se tokenizaron — ya funcionan bien en los dos temas tal cual, y no
forman parte del problema (el problema era solo la escala de grises).

**Incidente durante la primera pasada, y cómo se recuperó:** un script automático de reemplazo
masivo (Python, buscaba `"clase-oscura light:clase-clara"` para fusionarlas en un token) tenía
un bug de regex — `\S+` (para capturar el valor de la clase clara) es goloso y no se detenía en
comillas ni cierres de etiqueta, así que en muchas líneas se comió de más: la comilla de cierre,
el `>` que cierra la etiqueta, y en un puñado de casos texto real visible ("No hay actividades",
"Sin miembros en el equipo"). Resultado: **26 archivos con errores de sintaxis**, la app dejó de
compilar.

No hay Git en este proyecto (no es un repositorio versionado) ni backup de código — solo de la
base de datos (`backups/` en la carpeta del proyecto, sin utilidad para esto). La recuperación
se hizo usando el **último `npm run build` exitoso** (carpeta `dist/`, generado justo antes de
correr el script) como fuente de verdad: el bundle minificado conserva los strings literales
(clases CSS, textos de UI) tal cual, así que se pudo buscar ahí el contenido exacto que faltaba
en cada línea rota y reconstruirla. Se fue arreglando archivo por archivo, verificando cada uno
con `npx tsc --noEmit` hasta llegar a cero errores, y se cruzaron varios títulos reconstruidos
contra ese bundle para confirmar que quedaron idénticos al original ("Actividades", "Chat
General", "Proyectos", "Equipos", "Notificaciones", todos verificados).

Una vez reparado y con `tsc`/`build`/`eslint` en cero errores, **se completó la migración a mano,
archivo por archivo, sin más scripts automáticos** (decisión explícita de Sebastián después del
incidente) sobre los ~26 archivos que todavía tenían pares `light:` sueltos:
todos los primitivos compartidos (`Card`, `Modal`, `Badge`, `Button`, `Toast`, `DatePicker`,
`Input`, `MemberMultiSelect`, `EditableText`, `ChatBubble`), el shell (`AppLayout`, `Sidebar`,
`BottomNav`), y las páginas (`ChatPage`, `MinutaPage`, `ActivitiesPage`, `CompromisosPage`,
`ErrorsPage`, `IngestasPage`, `GanttPage`, `TeamsPage`, `ProfilePage`, etc.).

De paso, revisar cada línea a mano (en vez de un script ciego) encontró **bugs reales
adicionales**: varios botones tenían un color de fondo "siempre encendido" en modo claro
(`light:bg-slate-200` sin `hover:`) cuando en oscuro ese mismo botón solo se pinta al pasar el
mouse — quedaban permanentemente resaltados en claro por una inconsistencia del parche anterior.
Corregido en el camino (ej. los botones de navegación de semana en Minuta).

**Qué queda sin tokenizar, a propósito:** ~18 archivos todavía tienen algún `light:` suelto,
pero son casos legítimos que no son parte del problema — colores de acento (indigo/emerald en
botones activos), pares de gris que no calzan con ningún token base (ej. `slate-600`/`slate-300`
puntuales), y un par de `light:shadow-sm` (las sombras no tienen equivalente oscuro, son
exclusivas del tema claro por diseño).

**Probado:** `npm run build`, `npx tsc --noEmit` y `npx eslint .` en cero errores al final de
toda la migración. Escaneo de duplicados (script en Python) confirma cero clases `light:`
repetidas en toda la app.

### Ronda 4 — la paleta clara no gustó: se corrigió una regresión real en oscuro + rediseño

Sebastián probó el resultado y no le gustó la paleta clara — y señaló, con razón, que el
oscuro debía quedar intacto. Se encontró que **sí hubo una regresión real, chica pero real**:
al forzar blanco en los inputs/dropdowns durante la migración a tokens (Ronda 3), varios
elementos que en oscuro eran `bg-slate-800` quedaron mapeados al token `panel` (`bg-slate-900`)
— un tono más oscuro que el original — porque `panel` era el único token que daba blanco en
claro. Afectaba: `Input`, `EditableText` (el campo del lápiz), `MemberMultiSelect` (el botón
selector), y el combo de equipo en el `Sidebar`.

**Corregido:** se agregó un token nuevo, `field` (oscuro = `slate-800`, igual que antes;
claro = blanco), separado de `panel`, así los inputs pueden ser blancos en claro sin tener que
pedir prestado el tono de los headers/modales y sin tocar su sombra en oscuro. Los 4 lugares
afectados se movieron a `bg-field`.

**Paleta clara, repensada con referencias reales** (no inventada a ojo):

- [Vercel Geist](https://vercel.com/geist/colors) — superficie primaria `#fff`, secundaria
  `#fafafa`, texto primario `#000`, secundario `#666`. Importante: Geist trata el oscuro como
  el tema "canónico" y el claro como la variante — el mismo criterio que ya usa Lumix.
- [GitHub Primer](https://primer.style/foundations/color/overview/) — borde default `#d0d7de`,
  fondo sutil `#f6f8fa`.

Cambios concretos sobre la paleta anterior:

- **Fondo general (`shell`)**: de `#faf9f7` (un cálido con tinte beige, que se leía "sucio")
  a `#f8fafc` (gris frío casi blanco, slate-50) — más parecido a lo que usan Vercel/GitHub/Linear,
  sin el tinte amarillento.
- **Texto de títulos (`fg`)**: de `slate-800` a `slate-900` — más oscuro, más contraste, se lee
  con más peso (más cerca del negro casi puro que usa Geist para texto primario).
- El resto de la escala (`surface`, `border`, `fg-body/muted/faint`) se mantuvo — ya estaba
  razonablemente alineada con Primer/WCAG AA.

**Probado:** `npm run build`, `tsc --noEmit`, `eslint` limpios. **Pendiente:** que Sebastián lo
vuelva a mirar — sigue sin haber navegador en esta sesión para validar visualmente.

### Ronda 5 — los divisores del Sidebar se veían "duros"

Sebastián probó de nuevo: las líneas de los divisores (bajo el logo, bajo el selector de
equipo, sobre el pie con el usuario) se marcaban demasiado en modo claro. Investigado: es un
efecto conocido, no un capricho — el ojo es más sensible a una raya gris sobre un fondo blanco
que a esa misma raya sobre un fondo ya oscuro, así que un tono que se ve "bien discreto" en
oscuro puede leerse "duro" en claro con el mismo valor exacto. La práctica recomendada en la
literatura de UI (y en sistemas reales como Primer/Geist) es dos cosas: preferir espacio en
blanco a líneas cuando se pueda, y cuando sí hace falta una línea, que sea casi invisible, no
un gris marcado.

**Corregido:** el token `border` (el que se usa para estos divisores sueltos, bajo cabeceras y
entre secciones) se aclaró de `slate-200` a `slate-100` en modo claro — mucho más sutil,
"insinuado" en vez de "dibujado". `border-strong` (los bordes de inputs/tarjetas, que sí
necesitan notarse para que se entienda que son interactivos) se dejó igual (`slate-300`,
alineado con el borde default de Primer). Solo se tocó el valor en `[data-theme='light']`; el
oscuro no cambió un bit.

**Probado:** `npm run build`, `tsc --noEmit`, `eslint` limpios.

Fuentes: ["Best UX Practices for Designing a Sidebar" (UX Planet)](https://uxplanet.org/best-ux-practices-for-designing-a-sidebar-9174ee0ecaa2), ["UI Design in Practice: Dividers" (DesignerUp)](https://designerup.co/blog/ui-design-in-practice-series-dividers/), [GitHub Primer — Color](https://primer.style/foundations/color/overview/).

### Ronda 6 — bug real de fondo: los tokens nunca tuvieron color (CSS inválido desde el inicio)

Sebastián reportó algo puntual pero que resultó ser la causa de fondo de varios de los
problemas anteriores: **"me preocupa el color blanco en los bordes para el oscuro, y borde
negro para el claro"**. Investigando eso se encontró un bug real en `src/index.css`, presente
desde que se armó el sistema de tokens (Ronda 3):

```css
--color-border: rgb(var(--border) / <alpha-value>);
```

`<alpha-value>` es un placeholder de **Tailwind v3** (un texto literal que el build en
JavaScript de v3 reemplazaba a mano por el valor de opacidad pedido, ej. `bg-border/50`). En
Tailwind v4 ese reemplazo **no existe** — es CSS puro, nadie procesa ese texto, y llegaba tal
cual al navegador: `rgb(30 41 59 / <alpha-value>)` no es una función `rgb()` válida. Cuando un
`var()` resuelve a un valor inválido, la propiedad cae a su valor inicial/heredado: para
`background-color` eso es **transparente**, y para `border-color` es **`currentColor`** (el
mismo color que el texto). Por eso los bordes se veían blancos en oscuro (el texto ahí es
claro) y negros en claro (el texto ahí es oscuro) — exactamente lo que describió Sebastián.

**Esto afectaba a TODOS los tokens de color de fondo/texto/borde de toda la migración** (Ronda
3), no solo a los bordes — `bg-panel`, `bg-surface`, `bg-shell`, `text-fg`, etc. llevaban el
mismo patrón roto. Los fondos de paneles/headers/modales nunca pintaron su color propio (quedaban
transparentes, dejando ver lo que hubiera detrás), y el texto tokenizado heredaba el color del
padre en vez de usar el tono pensado. Es la explicación real de por qué varias pantallas se
sentían "planas" o con jerarquía confusa en los reportes anteriores — no era (solo) elección de
color, era que gran parte del color ni siquiera se estaba aplicando.

**Corregido:** se sacó el `/ <alpha-value>` de las 12 variables `--color-*` del `@theme`. En
Tailwind v4 el soporte de opacidad (`bg-panel/50`, etc.) funciona automáticamente vía
`color-mix()` para cualquier color válido — no hace falta ningún placeholder. Verificado en el
CSS compilado: antes `--color-border:rgb(var(--border) / <alpha-value>)` (inválido), ahora
`--color-border:rgb(var(--border))` (válido), y las clases con opacidad como
`bg-surface-soft/40` siguen compilando a `color-mix(...)` correctamente.

**Probado:** `npm run build`, `tsc --noEmit`, `eslint` limpios. Inspeccionado el CSS generado
directamente (no solo que compile) para confirmar que el `<alpha-value>` ya no aparece en
ningún lado y que los `color-mix()` de opacidad siguen ahí.

**Pendiente:** esto cambia de verdad cómo se ve toda la app tokenizada (por primera vez los
fondos de panel/superficie van a pintar su color real). Es el ajuste más importante de toda la
Fase 6 hasta ahora — conviene que el QA con la otra IA se haga DESPUÉS de este fix, no antes,
para no evaluar capturas de la versión rota.

### Plan original de la sesión (referencia, ya no vigente tal cual)

Fases internas propuestas originalmente: configurar `@custom-variant dark`, crear
`ThemeContext`/`useTheme`, definir la paleta clara en `@theme`, pasada sistemática componente
por componente. Se mantiene como referencia histórica; la decisión real tomada fue la variante
`light:` aditiva descrita arriba, más fiel al pedido de "el oscuro actual queda fijo".

---

## Fase 7 — Minuta acumula demasiado, edición sin lápiz, texto largo se corta ✅ HECHO

Sebastián probó Minuta/Proyectos y encontró 3 problemas reales, investigados a fondo antes de
tocar nada:

### 7.1 — Minuta ya no debe acumular tantas actividades

Un tema de Minuta debería ser puntual (algo que se conversa en la reunión semanal), pero hoy
`createActivitiesFromItem` (`useMinuta.ts:359-410`) crea **una actividad por cada responsable**
del tema, sin ningún tope — un tema con 5 responsables genera 5 actividades de una vez, y el
contador "X/Y actividades" (`MinutaPage.tsx:604-605,840-841`) refuerza visualmente que Minuta
acumula trabajo como si fuera un Proyecto. No hay duplicados si se reabre el modal (`sinActividad()`,
líneas 348-349, ya filtra a quien ya tiene una), pero el volumen de fondo no tiene límite.

**Rumbo de arreglo:** acotar un tema de Minuta a una sola actividad vinculada (o una por
responsable único, sin permitir múltiples responsables desde Minuta) — el caso "varias tareas
para varias personas" debería empujarse hacia Proyectos, que ya está pensado para eso.

### 7.2 — Editar el texto debe ser con un lápiz, no tocando el texto mismo

Hoy la edición es inconsistente y en el lugar equivocado:

- **Tema de Minuta**: `<textarea>` siempre editable con solo tocarlo, sin ningún ícono
  (`MinutaPage.tsx:579-588` en móvil, `815-824` en escritorio). Mismo patrón para comentarios
  (líneas 691-702, 941-952).
- **Subtarea** (`SubtareasPanel`): **no se puede editar en absoluto** hoy — es un `<span>` de
  solo lectura. Falta la función completa.
- **Proyecto raíz** (`ProyectoDetailPage.tsx:111`) y su tarjeta en el Tablero (línea 178):
  tampoco editables, mismo problema.

**Rumbo de arreglo:** en los 4 lugares (tema de Minuta, comentarios, subtarea, nombre de
Proyecto), reemplazar el texto siempre-editable por texto de solo lectura + un botón de lápiz
que abre el modo edición (input/modal) — y agregar la edición que hoy falta del todo en
subtareas y Proyecto.

### 7.3 — Texto largo se corta en vez de mostrarse completo

- **Gantt** (`MinutaPage.tsx:229-232`): `className="... truncate ..." style={{width:140}}`, el
  texto completo solo aparece como tooltip (`title`) al pasar el mouse — en el celular no hay
  forma fácil de leerlo completo.
- **Tema en escritorio**: intenta estimar filas por longitud (`Math.ceil(it.tema.length/48)`,
  línea 821), una aproximación que no considera saltos de línea reales ni el ancho real de la
  columna.
- **Tema en móvil** (`rows={2}` fijo, línea 585) y **comentarios en ambos modos** (`rows={2}`
  fijo, líneas 698 y 948): no crecen con el contenido, un texto largo queda parcialmente oculto
  con scroll interno poco evidente.
- Las vistas de solo lectura (`<p>`/`<span>` con `whitespace-pre-wrap`) sí muestran todo bien —
  el problema es específico de los `<textarea>` de edición y del Gantt.

**Rumbo de arreglo:** quitar los `rows` fijos/aproximados y usar auto-resize real (o mover la
edición a un modal sin límite de alto, consistente con el punto 7.2), y cambiar el `truncate`
del Gantt por texto envuelto o un tooltip más visible/accesible en mobile.

### Implementado (ejecutado mientras Sebastián estaba fuera, sin publicar)

**7.1 — Minuta: un solo responsable, no un reparto**
`MemberMultiSelect` (`shared/components/ui/MemberMultiSelect.tsx`) suma un prop `single?:
boolean`: al elegir a alguien reemplaza la selección en vez de sumarla (y cierra el panel solo).
En `MinutaPage.tsx` y en `SubtareasPanel` (temas y subtareas, ambos con `tipo='minuta'`) se pasa
`single={esMinuta}`/`singleResponsable={esMinuta}` — Proyectos (`tipo='proyecto'`) sigue
permitiendo varios responsables tal cual, sin cambios. Como `createActivitiesFromItem` crea una
actividad por responsable elegido, limitar a uno en el origen limita el volumen sin tocar esa
función compartida ni arriesgar el comportamiento de Proyectos.

Sebastián probó y encontró que Minuta seguía dejando **agregar** subtareas nuevas — un tema
puntual no debería poder armarse un árbol de subtareas propio, eso es exactamente lo que ya
existe para eso (Proyectos). Se agregó `canAddSubtareas?: boolean` a `SubtareasPanel` (default
`true`): en `MinutaPage.tsx` se pasa `canAddSubtareas={!esMinuta}` (oculta el botón "+ Subtarea"
y el input de agregar, en el tema y en cualquier nivel de subtareas existentes), en
`ProyectoDetailPage.tsx` no se pasa nada y queda en `true` por defecto. Las subtareas que un
tema de Minuta ya tuviera de antes de este cambio se siguen mostrando y gestionando igual — no
se ocultan ni se borran, solo no se puede sumar más desde ahí.

**7.2 — Lápiz para editar, en los 4 lugares que faltaban**
Componente nuevo `shared/components/ui/EditableText.tsx`: texto de solo lectura (siempre
visible completo, `whitespace-pre-wrap`) + botón lápiz que abre un `<textarea>` con auto-resize
real (crece con el contenido, no con un `rows` fijo o aproximado). Guarda con Enter o al perder
el foco; Escape cancela sin guardar. Reemplazó:

- Tema y comentarios de Minuta/Ingesta (móvil y escritorio, `MinutaPage.tsx`).
- Subtarea (`SubtareasPanel`) — **antes no se podía editar en absoluto**, ahora sí, vía un nuevo
  callback `onGuardarTema` enhebrado por las dos hojas que usan este panel (Minuta y Proyectos).
- Nombre del Proyecto raíz y el título de cada tarjeta en el Tablero
  (`ProyectoDetailPage.tsx`) — mismo caso, antes de solo lectura.

Se preservó la regla de negocio que ya tenía el `<textarea>` anterior: un tema no puede quedar
vacío (`preventEmpty` en `EditableText`, activo en los 5 lugares donde se edita un "tema"); los
comentarios sí pueden estar vacíos, por eso ese prop no se usa ahí.

**Bug real encontrado al probar (7.2):** Sebastián reportó "el texto se contrae... muestra tres
puntos" en el tema — resultó ser un bug de la primera versión de `EditableText`: el contenedor
de solo lectura era un `<span>` (en línea), pero cuando `as="p"` (usado en el tema de Minuta en
móvil y en el nombre del Proyecto) terminaba habiendo un `<p>` (bloque) DENTRO de ese `<span>` —
HTML inválido. El navegador lo "corrige" solo cortando el `<span>` a la mitad, lo que rompía el
layout flex y producía justo el efecto contrario al buscado (texto recortado). Corregido:
el contenedor ahora es siempre un `<div>` (válido para envolver tanto `<span>` como `<p>`).

**7.3 — Texto largo ya no se corta**

- Gantt (`MinutaPage.tsx`, `GanttModal`): se quitó `truncate` y el tooltip como único acceso al
  texto completo; ahora envuelve en varias líneas dentro de su columna de 140px
  (`whitespace-normal break-words`, fila con `items-start`).
- Los `<textarea>` de edición (dentro de `EditableText`) ya no tienen `rows` fijo ni la
  aproximación por longitud de caracteres: se ajustan solos vía `scrollHeight`.

**Encontrado al probar: el mismo corte de texto también estaba en Actividades** (estaba en el
pedido original — "modificar el texto del tema, tarea, **actividad**, o subtareas" — pero se
había pasado por alto al enfocar la investigación en Minuta/Proyectos). En
`ActivitiesPage.tsx`: el título de la actividad en la tabla principal tenía
`truncate max-w-[200px]` (línea ~643), y el título de una subtarea dentro del detalle tenía
`truncate` sin límite explícito (línea ~994) — ambos cortaban con "..." en vez de mostrar todo.
Se quitó el `truncate`/`max-w` y se dejó envolver normalmente (`whitespace-normal break-words`),
ajustando el `items-center` a `items-start` en la fila de subtarea para que el badge de estado
no quede descentrado con texto de varias líneas.

**Probado contra RLS real** (usuario de prueba, Equipo Prueba, limpiado al terminar):

- Se creó un tema de Minuta y se aplicó el mismo PATCH que dispara el lápiz (`{tema: <texto
largo>}`) — confirmado que el backend lo acepta tal cual, sin cambios de permisos necesarios.
- Se creó una subtarea y se le aplicó el PATCH de edición de texto (`{tema: "..."}`) — antes esta
  ruta no existía en la UI; confirmado que el backend ya la aceptaba (el gap era solo de
  interfaz, no de permisos), y ahora la UI la expone.
- `npm run build` y `npx eslint .` limpios (los 3 errores de `react-hooks/purity` que aparecen
  son en `useChatMessages.ts`, código no tocado en esta fase — ver nota en Fase 4).

**Pendiente (no se puede probar sin navegador en esta sesión):** confirmación visual de
Sebastián — que el lápiz se vea y funcione bien al tacto/click, que el auto-resize del
`textarea` se sienta natural, y que el Gantt envuelva bien en pantallas angostas. Igual que la
Fase 5, queda marcado como "código listo, falta confirmar viendo la pantalla".

### Fase 7 — Minuta con subtareas de UN solo nivel, sin badge "Proyecto", con borrado ✅ HECHO

Sebastián pidió ajustar el punto 7.1 (Minuta acota a un responsable, sin agregar subtareas
nuevas — `canAddSubtareas={!esMinuta}`). En vez de bloquear subtareas del todo en Minuta, la
idea es permitirlas pero con reglas más chicas que en Proyectos:

1. **Subtareas en Minuta, pero acotadas a UN solo nivel** (hoy `SubtareasPanel` es recursivo
   sin límite de profundidad — pensado para Proyectos). Para Minuta habría que permitir agregar
   subtareas al tema raíz, pero NO permitir que esa subtarea tenga a su vez otra subtarea propia
   (nada de sub-subtareas). Implica pasarle a `SubtareasPanel` alguna noción de profundidad
   actual y, en Minuta, no renderizar el "+ Subtarea" ni el panel recursivo una vez que ya se
   está en el primer nivel (pero sí en Proyectos, que sigue sin límite).
2. **Sacar el badge "📁 Proyecto"** que hoy aparece en un tema de Minuta cuando tiene subtareas
   (`MinutaPage.tsx`, el `<span title="Tiene subtareas: se sigue como un proyecto">📁
Proyecto</span>` en las vistas móvil y escritorio). Ya no aplica: desde que Proyectos existe
   como su propia hoja separada, un tema de Minuta con una subtarea de un solo nivel ya no
   "se sigue como un proyecto" — es solo un tema con un paso más, y llamarlo "Proyecto" ahí
   confunde con la hoja real de Proyectos.
3. **Permitir borrar una subtarea** dentro de Minuta. Hoy `SubtareasPanel` no tiene ningún botón
   de eliminar por subtarea (solo el tema raíz se puede borrar, desde el botón "Eliminar" de la
   fila principal). Habría que agregar un botón de borrado por subtarea, probablemente
   reutilizando `removeItem` de `useMinuta` (ya existe, se usa hoy para los temas raíz) — a
   confirmar si necesita su propio popout de confirmación o alcanza con uno directo dado que ya
   es un nivel secundario.

**Implementado:**

1. `SubtareasPanel` ahora recibe `maxDepth`/`depth` (default `undefined`/`0`): en cada llamada
   recursiva `depth` sube en 1, y solo se renderiza el panel anidado de la subtarea si
   `maxDepth === undefined || depth+1 < maxDepth`. Minuta llama con `maxDepth={esMinuta ? 1 :
undefined}` — permite agregar UNA subtarea al tema raíz, pero esa subtarea ya no puede tener
   las suyas (ni el botón "+ Subtarea" ni el panel recursivo se muestran ahí). Proyectos sigue
   sin tocar (`maxDepth` no se le pasa, sigue ilimitado).
2. Sacados los dos badges "📁 Proyecto" (móvil y escritorio) de `MinutaPage.tsx` — ya no
   aplican, esa idea la cubre la hoja de Proyectos.
3. Agregado un botón 🗑 por subtarea (nuevo prop `canDelete`/`onRemove` en `SubtareasPanel`),
   cableado a la misma confirmación de borrado que ya existía para el tema raíz
   (`confirmDeleteId`/`removeItem` — el modal ya buscaba en `allItems`, así que servía para
   subtareas sin cambios). El texto del popout ahora distingue "¿eliminar esta subtarea?" de
   "¿eliminar este tema de la minuta/hoja de ingesta?" según si el item tiene `parent_item_id`.
   No se agregó a Proyectos (`onRemove`/`canDelete` no se le pasan) — pedido explícito de
   Sebastián, se puede sumar después con el mismo mecanismo si hace falta.

**Probado:** `npm run build`, `tsc --noEmit`, `eslint` limpios. **Pendiente:** confirmación
visual (no hay navegador en esta sesión) — que el botón 🗑 se vea bien al lado de cada
subtarea, y que al agregar una subtarea a un tema de Minuta, esa subtarea ya no ofrezca su
propio "+ Subtarea".

**Auditoría posterior (a pedido de Sebastián — "¿la lógica de compromisos o fechas está bien,
no se pierde nada?"):** revisión completa de `useMinuta.ts` (`removeItem`, `changePlazo`),
`useCompromisos.ts` (`temaDe`/`raizDe`) y `subtareas.ts` (`plazoEfectivo`/`contarSubtareas`)
contra los cambios de Fase 7 y de la migración de tokens. Sin regresiones:

- Borrar una subtarea no afecta actividades ya creadas desde ella — `linked_activity_ids` es un
  arreglo de IDs en `minute_items`, no una FK hacia `activities` (confirmado en migraciones
  018/037/038); el modal ya avisa que esas actividades sobreviven.
- El riesgo teórico de "hijos fantasma" en el estado local si se borra una subtarea con hijos
  (por el `ON DELETE CASCADE` de `parent_item_id`, migración 039) no aplica hoy: en Minuta el
  botón 🗑 solo existe en subtareas de profundidad 1 (no pueden tener hijos, por el propio
  `maxDepth`), y en Proyectos ese botón no está conectado.
- `changePlazo`, `plazoEfectivo` y `contarSubtareas` no cambiaron y no asumen ninguna
  profundidad — árboles viejos más profundos se siguen leyendo bien.
- El responsable único de Minuta es solo una restricción de la UI; datos viejos con varios
  responsables no rompen nada al leerlos.

---

## Fase 8 — Bugs encontrados probando la pregunta de ambigüedad en vivo ✅ HECHO

Sebastián probó en el chat real la pregunta actividad/proyecto (Fase 4/ambigüedad). Dos
hallazgos:

### 8.1 — "hay que X" se interpretaba como pregunta, no como orden

Al escribir "hay que ordenar la bodega, primer punto, contar el inventario", Lumix contestó
como si le hubieran preguntado algo ("Actualmente no hay ninguna actividad pendiente..."), sin
crear nada y sin llegar nunca a la pregunta de ambigüedad. Causa: el detector de preguntas
(`questionWords`, `useChatMessages.ts`) incluye "hay " como inicio de pregunta (pensado para
"hay actividades pendientes?"), pero "hay QUE hacer algo" es una orden en español, no una
consulta — coincidencia de prefijo no prevista. Corregido con un lookahead negativo
(`hay (?!que\b)`) que sigue reconociendo "hay actividades..." como pregunta pero deja pasar
"hay que...". Probado con 5 frases reales (con y sin "que"), todas se clasifican bien.

### 8.2 — "Cancelar" en dos preguntas no las marcaba resueltas

Sebastián preguntó qué pasa si hay varias preguntas pendientes y se cambia de página sin
responder. Investigando eso (sin tocar código) se confirmó que el diseño general ya es sólido:
cada pregunta es un mensaje real en la base, no un modal efímero — nada se pierde al navegar, y
al volver al chat quedan como burbuja para tocar y reabrir (a propósito no se auto-reabren todas
juntas, para no bombardear con modales al entrar).

Pero se encontró un bug real en el camino: el botón "Cancelar" de `name_confirm` (¿a quién
asigno?) y de `activity_pick` (¿cuál actividad?) solo cerraba el modal en pantalla, sin marcar
la pregunta como resuelta en la base — a diferencia de `delete_confirm`, `reclass_proyecto_confirm`
y `overload`, que sí lo hacían. Cancelar esas dos dejaba la pregunta "pendiente" para siempre,
apareciendo como si nunca se hubiera respondido. Se agregaron `descartarNombre`/
`descartarActividadElegida` (mismo patrón que `descartarEliminar`) y se cablearon a los botones
Cancelar correspondientes.

**Probado contra RLS real:** se creó un mensaje `activity_pick` de prueba y se llamó al mismo
RPC que usa el botón Cancelar (`resolver_mensaje_interactivo`) — confirmado que el mensaje queda
`resolved: true` con `resolution: "No se eligio"`. Dato de prueba limpiado. `npm run build` y
`npx eslint .` limpios (mismos 3 errores preexistentes de siempre, no relacionados).

---

## Fase 9 — A evaluar a futuro: depender menos de regex a mano / que la IA aprenda de sus errores (sin ejecutar)

Conversando sobre el patrón "cada vez que aparece una frase mal clasificada, se agrega un regex
nuevo" (ej. "hay que...", "primer punto..."), Sebastián planteó dos preocupaciones: 1) no quiere
seguir "alimentando palabras" a mano para siempre, y 2) un prompt fijo tampoco mejora solo con
el tiempo — sigue siendo un techo que hay que empujar a mano.

**Diagnóstico actual:** el chat ya es un sistema híbrido — regex (reglas fijas, gratis e
instantáneas) como filtro rápido antes de decidir si hace falta preguntarle a la IA
(`ai-classify`/`ai-update`/`askQuestion`, todas IA generativa real, con costo y latencia por
llamada). Sacar los regex por completo saldría más caro/lento y sería más difícil de depurar
(un regex se arregla con una línea y un test; un prompt hay que reprobarlo contra varios casos
para no romper otro sin querer).

**Dos ideas concretas para evaluar, sin implementar todavía:**

1. **Mejorar el prompt en vez de agregar regex**, para los casos de matiz de lenguaje (no los
   atajos obvios tipo "deshacer", esos se quedan como regex). Mismo costo/latencia que hoy (es
   la misma llamada, solo con mejores instrucciones), pero requiere reprobar manualmente cada
   vez — sigue siendo "a mano", solo que en el prompt en vez de en el código.
2. **Que aprenda solo de sus propios errores** (la idea que de verdad resuelve "no mejora con el
   tiempo"): el sistema YA guarda cada corrección que hace una persona cuando la IA se equivoca
   (tabla `ai_decisions`, `predictedCategory` vs `finalCategory`, ver
   `aiDecisionsService.markCorrection` en `useChatMessages.ts`, usado en `confirmCategory`) —
   hoy esa data solo se guarda para estadística, nadie la usa todavía. La mejora real sería, antes
   de clasificar un mensaje nuevo, buscar entre esas correcciones ya hechas las más parecidas y
   pasárselas a la IA como ejemplo ("así es como la gente corrigió un caso parecido a este") —
   así el sistema mejora con el uso real, sin que nadie edite prompts ni regex a mano cada vez.

**Estado: queda anotado para evaluar en una próxima sesión, no es chico** (implica diseñar cómo
buscar "correcciones parecidas" — por palabras clave o por similitud semántica/embeddings — y
probarlo contra casos reales antes de confiar en que mejora y no empeora). Antes de construirlo
convendría revisar cuántas correcciones reales hay acumuladas en `ai_decisions` para saber si ya
hay suficiente material para que valga la pena.

---

## Fase 10 — QA externo (otra IA, Playwright) sobre Fase 6/7 ✅ HECHO

Sebastián corrió el QA que había anunciado en la Fase 6 (Ronda 3-6): navegación automatizada
(Playwright + Chromium) sobre las 11 secciones en desktop y mobile, más 6 flujos end-to-end
(login, chat con IA, modales, creación de proyecto). **Veredicto: sin hallazgos P1.** El bug
crítico de una revisión anterior (sidebar mobile transparente e ilegible) ya estaba corregido —
confirma que el fix de la Ronda 6 (`<alpha-value>`) funcionó de verdad, no solo en el CSS
compilado.

Quedaron 4 hallazgos menores, los 4 corregidos:

- **H1 — Toolbar de Errores desbordaba** (6 tabs + 3 selects + 2 datepickers + lupa no cabían en
  una fila, ni en desktop ni en mobile). `ErrorsPage.tsx`: se separó en dos filas — los tabs de
  estado quedan en su propia fila con scroll horizontal (pueden ser muchos), y el resto de
  filtros/búsqueda pasa a `flex-wrap` (puede ocupar 2 líneas en vez de cortarse).
- **H2 — Copy sin tildes e inglés en Login**: `LoginPage.tsx` tenía "Contrasena", "Iniciar
  sesion", "invitacion" (sin tildes) mientras el resto de la app sí las usa, y el `required`
  nativo del navegador mostraba el mensaje de validación en inglés. Corregido: tildes agregadas,
  y se reemplazó `required` por una validación propia en español ("Completa email y
  contraseña.") reusando el mismo banner de error que ya existía para fallos de login.
- **H3 — Backdrop del sidebar mobile**: al revisar `AppLayout.tsx` se confirmó que el overlay
  oscuro clickeable-para-cerrar **ya existe** (línea 18-23, `bg-black/60 md:hidden` con
  `onClick`) — el hallazgo del QA estaba desactualizado o probó una versión anterior; no había
  nada que corregir acá.
- **H4 — Detalles cosméticos**: la cabecera "Accion" de las tablas de Actividades y Errores
  ganó `whitespace-nowrap` (para que nunca se corte por compresión de columna en mobile). Los
  chips de tipo del chat (Auto/Actividad/.../Proyecto, hasta 7 con Minuta+Proyecto visibles)
  ganaron `overflow-x-auto` + `flex-shrink-0` por chip, así se desplazan en vez de cortarse sin
  aviso cuando no caben.

**Probado:** `npm run build`, `tsc --noEmit`, `eslint` limpios (mismos 3 errores preexistentes
de `useChatMessages.ts`, no relacionados). **Pendiente:** confirmación visual de Sebastián — no
hay navegador en esta sesión. El QA también dejó 3 actividades reales de prueba en el equipo del
usuario de prueba ("QA ok", "revisar inventario de bodega central", "etiquetar cajas del lote
42") — pendiente que Sebastián confirme si se eliminan.

**Bug encontrado por Sebastián probando después del QA:** el contador "cambiada N veces" (que
avisa cuando el plazo de un tema se movió más de una vez) solo se mostraba en el tema raíz
(`MinutaPage.tsx`), no en las subtareas — aunque `useMinuta.ts:321` (`changePlazo`) ya
incrementa `plazo_change_count` igual para cualquier `minute_item`, raíz o subtarea, la base
siempre lo trackeó bien, faltaba solo mostrarlo. Corregido en `SubtareasPanel` (el mismo
componente que usan Minuta y Proyectos), junto al `DatePicker` de cada subtarea — como es
compartido, el fix aplica a las dos hojas de una vez, no hace falta repetirlo en Proyectos.

Sebastián pidió extender esto a **todos** los lugares con fecha de plazo, no solo Minuta.
Revisando, `Activity` también trackea el mismo contador (`plazo_change_count`, migración 035,
lo mantiene un trigger de la base, no la app) para `due_date` — y aparecía ya en Compromisos
(`CompromisosPage.tsx:280`, `c` es un `Activity`), pero faltaba en **todos los demás lugares
donde se edita o se lista una actividad**: `ActivitiesPage.tsx` (tabla principal y modal de
detalle), `IngestasPage.tsx` (misma tabla/modal, ingestas son actividades) y `GanttPage.tsx`
(modal de detalle de una actividad). Se agregó el mismo indicador ("cambiada N veces" en detalle,
"movida Nx" en tabla) en los 4 archivos. No aplica en `AsignarActividadModal.tsx` (crea una
actividad nueva, el contador siempre es 0 ahí) ni en Errores (`AppError` no tiene concepto de
plazo movible, `date`/`resolved_at` no son lo mismo).

`npm run build`/`tsc --noEmit`/`eslint` limpios (mismos 3 errores preexistentes de siempre).

**Bug de tema claro encontrado por Sebastián: texto invisible en Planificación (Gantt).** Las
tarjetitas de actividad dentro de cada celda del calendario (`GanttPage.tsx`) usan un color de
acento translúcido de fondo (ej. `bg-red-500/40`) con texto en un tono claro pensado solo para
fondo oscuro (`text-red-300`, `text-amber-300`, `text-indigo-300`, `text-emerald-400`) — en tema
claro ese texto queda casi invisible sobre el mismo fondo pálido (a diferencia del resto de la
app, este es de los pocos casos donde el color de acento SÍ necesitaba una variante `light:`,
porque el texto va encima de un fondo de acento, no del fondo neutro de la página). Corregido
agregando `light:text-*-700` a las 4 variantes (completado/prioridad 1/2/3).

**Mismo tipo de bug encontrado en Admin y Perfil.** Sebastián pidió revisar Admin y apareció la
misma familia de problema: los banners de éxito/error (`bg-emerald-900/30`/`bg-red-900/30`, un
fondo de acento fijo, no tokenizado) con texto en tono claro (`text-emerald-400/300`,
`text-red-400`) pensado para fondo oscuro — en tema claro, sobre el mismo fondo (que además no
tenía variante `light:`, así que quedaba con un lavado oscuro-sobre-claro poco legible). Mismo
patrón que ya usa `Badge.tsx` correctamente (`light:bg-emerald-100 light:text-emerald-700`, etc,
confirmado al revisar cómo se resolvió ahí) — se aplicó igual en:

- `AdminPage.tsx`: el error de creación de usuario, y el banner de éxito con la clave temporal
  generada (los 3 textos adentro).
- `ProfilePage.tsx`: error/éxito al cambiar contraseña, el botón "Cerrar sesión", y el botón de
  quitar el emoji de avatar.

**No se tocó** `LoginPage.tsx`, `SignUpPage.tsx`, `ChangePasswordPage.tsx` ni `ErrorBoundary.tsx`
— estas 4 pantallas usan `bg-slate-950` fijo (no `bg-shell`) y clases de texto sin tokenizar en
todo el resto del layout: quedan siempre oscuras sin importar el tema elegido, por diseño (no
participan del sistema de tema claro en absoluto), así que el mismo patrón ahí no es un bug.

`npm run build`/`tsc --noEmit` limpios.

**Datos de prueba del QA (Fase 10) limpiados:** de las 3 actividades que mencionaba el informe,
solo **una** llegó a crearse de verdad como actividad ("Revisar inventario de bodega central con
entrega mañana") — eliminada de la base. Las otras dos ("QA ok", "etiquetar cajas del lote 42")
nunca pasaron de ser mensajes de chat (la clasificación no se llegó a confirmar), así que no
había ninguna actividad real que borrar para esos dos casos.

### Ronda 7 — `ProfilePage.tsx` nunca se había tokenizado de verdad

Sebastián reportó "fondo gris que no se aprecia bien" en `/profile`. Al revisar, casi toda la
página seguía con clases fijas de tema oscuro (`bg-slate-900`, `text-slate-200/300/400/100`,
`border-slate-700/800`) sin ningún token ni variante `light:` — contradice lo que decía este
mismo plan (Fase 6, "Hecho hasta ahora" listaba `ProfilePage` entre las 18 páginas ya migradas).
Solo la tarjeta "Apariencia" (el propio selector de tema) y los 3 puntos ya tocados en la Fase 10
(banners de contraseña, botón de cerrar sesión, quitar emoji) estaban bien. El resto — header,
nombre/badge/email, acordeón de emoji, "Cambiar contraseña", y toda la tarjeta "Sobre Lumix"
(título, descripción, las 6 tarjetitas de features, el tip de ayuda) — nunca se había tocado.
Corregido de punta a punta con los tokens ya existentes (`bg-panel`, `text-fg-body/faint`,
`border-border`, `bg-surface-soft`), y el tip de ayuda (texto indigo sobre fondo indigo
translúcido) con `light:text-indigo-700` — mismo patrón que el bug del Gantt (Ronda 6 de más
arriba). `npm run build`/`tsc --noEmit` limpios.

**Pendiente, no ejecutado (a pedido de Sebastián, solo queda anotado):** revisando el resto de
la app en busca del mismo patrón (fondo fijo `bg-slate-800/900` sin tokenizar, en vez de
invisibilidad de texto por sí sola es más bien una caja gris que no encaja en un layout ya
claro) aparecieron más casos, ninguno tocado todavía:

- **`ChatPage.tsx`** — el popout de "Día cargado"/sobrecarga (alerta de sobrecarga, botones de
  mover fechas), el modo masivo y varios botones sueltos de los popouts de confirmación (~20
  lugares) usan `bg-slate-800`/`bg-slate-700` fijos en vez de `bg-surface`/`bg-surface-2`. Es
  extraño porque el plan (Fase 6, "Hecho hasta ahora") decía que los 9 popouts de Chat ya
  estaban migrados — probablemente estos son popouts agregados en fases posteriores (Fase 4/8,
  sobrecarga y modo masivo) que nunca pasaron por esa migración.
- **`CompromisosPage.tsx:184`** — `hover:bg-slate-800/50` sin variante clara.
- **`InstalarApp.tsx`** (parte de abajo del Sidebar, instrucciones para instalar en iPhone) — ya
  corregido en esta misma ronda (era un hallazgo aparte, revisando por el reporte inicial de
  "fondo gris" antes de identificar que el real era `/profile`).

Queda para una próxima pasada, archivo por archivo como siempre (sin scripts automáticos).

**Actualización: ejecutado.** Sebastián pidió revisar `ChatPage.tsx` y `CompromisosPage.tsx`
también. Se tokenizaron los ~24 lugares encontrados en `ChatPage.tsx` (el popout de "Día
cargado"/sobrecarga y sus botones de mover fecha, el modo masivo completo — textarea de
descripción, prioridad, fecha, estado, responsable —, el formulario de edición de actividad, el
recordatorio de "respondiendo a", el ícono del estado vacío, y los botones Cancelar/Volver de
varios popouts) con los tokens ya existentes (`bg-surface`/`bg-surface-2`/`bg-field`/
`border-border-strong`/`text-fg-*`). De paso aparecieron 3 casos más del bug de texto-claro-
sobre-fondo-de-acento (Ronda 6/Fase 10): `text-indigo-200`/`text-sky-200`/`text-indigo-300`
sobre fondos `bg-indigo-600/20`/`bg-sky-600/20` en el popout de categoría y en el selector de
prioridad del formulario de edición — corregidos con `light:text-indigo-700`/`light:text-sky-700`
igual que en el Gantt. En `CompromisosPage.tsx` se tokenizó el único caso encontrado
(`hover:bg-slate-800/50` → `hover:bg-surface-2/50` en la cabecera plegable por persona).

`npm run build`/`tsc --noEmit`/`eslint` limpios (0 errores, mismos warnings preexistentes de
siempre).

---

## Fase 11 — "Grupos de trabajo" (foco) por equipo: filtro en Minuta/Actividades ✅ HECHO

Sebastián transmitió feedback de usuarios: un equipo puede tener distintos **focos** internos
(sus ejemplos: "excelencia", "productividad", "entrenamiento"), y a la jefatura le gustaría ver
a las personas agrupadas por foco, expandible, en Minuta o Compromisos — asignar el foco de cada
persona sería una acción exclusiva de jefatura. Por separado (relacionado pero no lo mismo):
en Actividades (y "lo que sea") le gustaría poder **ordenar** por fecha, nombre, tema, o grupo de
trabajo. Sebastián no tenía claro cómo aterrizar la idea y pidió una recomendación concreta, no
solo dejarla anotada.

### Qué existe hoy (investigado antes de proponer nada)

- **No existe ningún concepto de "foco" o subgrupo** en el modelo de datos: `Profile`
  (`shared/types/index.ts:17-25`) solo tiene `role`/`team_id`, y `MinuteItem` no tiene ningún
  campo de agrupación más allá de `responsables`. Habría que crear el campo.
- El sistema de **capabilities** (`core/auth/capabilities.ts`) es el mecanismo ya probado para
  que jefatura controle cosas por persona (Fase 2/3), pero son flags booleanos puros — no sirve
  para guardar un valor categórico como "foco". Hace falta un campo nuevo, no una capability más.
- `TeamsPage.tsx` ya tiene, por fila de miembro, un patrón editable exclusivo de jefatura: select
  de rol (línea ~192) + checkboxes de capabilities (línea ~222) sobre `m.permissions`. Es el
  lugar natural para sumar un campo "Foco" nuevo, con el mismo control de permisos que ya protege
  rol/capabilities ahí mismo.
- El campo de rol/permisos ya vive en la **membresía** (`team_members`), no en `Profile` global
  — es decir, ya se acepta que una persona tenga rol distinto por equipo. El foco debería vivir
  en el mismo lugar (`team_members.foco`), no en `Profile`, por la misma razón: alguien podría
  tener un foco distinto en otro equipo si perteneciera a más de uno.
- **Compromisos** (`useCompromisos.ts:177-190` + `CompromisosPage.tsx:44-54,175-229`) ya agrupa
  por persona, plegable (`porPersona`, `alternar`/`estaAbierto`) — un solo nivel hoy (persona →
  sus compromisos). Es el candidato natural para la idea: envolver ese agrupamiento en un nivel
  más arriba (foco → personas de ese foco → sus compromisos, con "Sin foco" para quien no tenga
  uno asignado) es **aditivo**, no una reescritura.
- **Minuta** (`MinutaPage.tsx`) es una lista plana por diseño — no agrupa por persona hoy. Esto
  no es un descuido: la Fase 4 de este mismo plan ya estableció que Minuta es la agenda puntual
  semanal, distinta a una estructura organizacional persistente (por eso existe Proyectos aparte).
  Injertarle un agrupamiento persistente por foco choca con esa idea de fondo más de lo que ayuda.
- **Actividades** (`ActivitiesPage.tsx` + `useActivities.ts:181-186`) hoy NO tiene un selector de
  orden — el único `<select>` de fecha (línea ~490) elige qué fecha usar para _filtrar_, no para
  ordenar. El orden real es un `.sort()` fijo en el hook (por `due_date` y luego `priority`),
  sobre un arreglo ya cargado en memoria — no es una consulta al servidor. Agregar un selector de
  orden (fecha/nombre/tema/grupo) es barato: un estado nuevo + cambiar el comparador, sin tocar
  la base ni el backend.

### Recomendación concreta

1. **Foco como campo de la membresía, no de la persona global.** Migración chica: columna
   `foco text null` en `team_members` (o una tabla `equipo_focos` si jefatura quiere definir sus
   propios nombres de foco por equipo en vez de escribir texto libre cada vez — más prolijo,
   evita typos como "Productividad" vs "productividad"; recomiendo la tabla si el catálogo de
   focos se va a reusar seguido, texto libre si es más informal/cambia mucho).
2. **Asignar el foco: en `TeamsPage.tsx`**, junto al select de rol de cada miembro (mismo
   permiso que ya protege esa fila — jefatura/admin). Un `<select>` con los focos ya usados en
   ese equipo + opción "Crear nuevo" si se hizo con catálogo, o un input de texto simple si se
   optó por texto libre.
3. **Mostrar agrupado, primero en Compromisos** (no en Minuta): extender `porPersona` a
   `porFoco → porPersona`, reusando el mismo componente colapsable que ya existe, solo con un
   nivel más envolviéndolo. Bajo riesgo porque no toca la lógica de compromisos en sí, solo cómo
   se organizan visualmente.
4. **Minuta: filtro, no agrupamiento.** En vez de reestructurar la lista plana, agregar un
   `<select>` "Foco" arriba (como los filtros que ya existen en Errores/Actividades) que
   simplemente oculta temas cuyo responsable no pertenezca al foco elegido — misma agenda
   semanal, sin romper el modelo mental de Fase 4. Si más adelante Sebastián de verdad quiere
   agrupamiento visual (no solo filtro) dentro de Minuta, evaluarlo aparte con datos reales de
   uso primero.
5. **Orden configurable en Actividades**: agregar un `<select>` "Ordenar por" (fecha, nombre,
   tema, foco/grupo) al lado del filtro de fecha existente, con un comparador nuevo en
   `useActivities.ts` que reemplace al `.sort()` fijo actual segun la opcion elegida. Extender a
   Ingestas/Compromisos despues si a Sebastián le sirve ahi tambien (mismo patron, archivo por
   archivo).

**Antes de ejecutar, decidir con Sebastián:**

- ¿Catálogo de focos por equipo (jefatura los crea, evita typos) o texto libre? Cambia si hace
  falta una tabla nueva o solo una columna.
- ¿El filtro de foco en Minuta alcanza, o de verdad quiere ver el agrupamiento visual (como en
  Compromisos) ahí también?
- ¿"Grupo de trabajo" para el orden en Actividades es lo mismo que "foco", o es un concepto
  distinto (ej. el equipo/`team_id`, no un sub-grupo dentro del equipo)? Aclarar antes de
  construir el comparador de orden.

**Estado: solo anotado, sin ejecutar** — falta que Sebastián resuelva las 3 preguntas de arriba
antes de empezar.

**Actualización — Sebastián simplificó el alcance:** confirmó que alcanza con un **filtro** de
foco (no agrupamiento visual) tanto en Minuta como en Actividades, visible solo para jefatura —
descarta la parte más compleja de agrupar Compromisos por foco (punto 3 de la recomendación de
arriba, que queda descartado) y confirma el punto 4 (filtro en Minuta) extendido también a
Actividades. Y resolvió las 2 preguntas pendientes: **"foco" y "grupo de trabajo" son el mismo
concepto**, y **la jefatura los crea y asigna** (catálogo por equipo, no texto libre).

### Implementado ✅ HECHO

**Migración 043** (`grupos_trabajo`): tabla nueva por equipo (`team_id`, `nombre`, único por
equipo), columna `grupo_id` en `team_members` (`ON DELETE SET NULL`: borrar un grupo no borra a
nadie, solo lo deja "sin grupo"). RLS reusa los helpers ya probados (`is_team_manager` para
crear/editar/borrar, `es_miembro_del_equipo` para que cualquiera del equipo pueda leer el
catálogo y usarlo en el filtro) — nada de policies nuevas raras. Asignar el grupo a una persona
es un `UPDATE` de `team_members`, ya gobernado por la policy de la migración 021: no hizo falta
tocar RLS para eso.

- **Gestión** (`TeamsPage.tsx`): nueva sección "Grupos de trabajo" (solo jefatura/admin del
  equipo) con chips + input para crear, y un ✕ para borrar cada uno. Por cada miembro, un
  `<select>` "Grupo" junto al de rol (solo aparece si el equipo ya tiene al menos un grupo
  creado, para no ensuciar la UI de un equipo que no lo usa).
- **Filtro en Actividades** (`useActivities.ts`/`ActivitiesPage.tsx`): nuevo `<select>` "Grupo",
  visible solo si `isManager` (ya usado para el filtro de responsable) y hay un equipo
  específico elegido (el grupo es un catálogo por equipo, no tiene sentido con "todos los
  equipos" a la vez). Se resuelve con una consulta chica (`getGrupos` + `getMembers` del equipo
  elegido) que arma un mapa `usuario → grupo`, y filtra el arreglo ya cargado en memoria — sin
  tocar el resto de filtros existentes.
- **Filtro en Minuta** (`useMinuta.ts`/`MinutaPage.tsx`): mismo patrón, resuelto contra el equipo
  activo (`profile.team_id`). Visible solo si el rol en el equipo activo es jefatura/admin (o
  admin global) — a diferencia de Actividades, acá se gateó por rol y no por una capability,
  porque es explícitamente "una herramienta de supervisión", no algo graduable con permisos.

**Probado contra RLS real** (Equipo Prueba, datos de prueba limpiados al terminar): se creó un
grupo "Excelencia (prueba)", se asignó a un colaborador (`UPDATE team_members`), se confirmó que
el mapeo queda como se espera, y al borrar el grupo el colaborador quedó "sin grupo" solo
(`ON DELETE SET NULL` funcionando), sin tocar nada más de su membresía.

`npm run build`, `tsc --noEmit` y `eslint` limpios (0 errores, mismos warnings preexistentes de
siempre). **Pendiente:** confirmación visual de Sebastián — no hay navegador en esta sesión.

### Bug real reportado: el filtro de grupo "no funcionaba" en Minuta ✅ HECHO

Sebastián probó de verdad (creó los grupos "Despacho" y "Excelencia" en Equipo Prueba, asignó
gente) y reportó que el filtro no funcionaba. Investigando contra sus propios datos reales se
encontró la causa: un tema "contenedor" puede no tener responsable propio y dejar todo el
trabajo real colgado en sus subtareas (caso real encontrado: "Seguimiento de líder de
entrenamiento" con `responsables: []`, y Manuel — asignado a "Excelencia" — como responsable de
sus subtareas "Pedido" y "Pedido de control"). El filtro de grupo (`useMinuta.ts`) solo miraba
el responsable del tema RAÍZ, así que ese tema desaparecía al filtrar por "Excelencia" aunque la
persona que sí hace el trabajo estuviera en ese grupo — exactamente el caso que Sebastián probó.

**Corregido:** nueva función `perteneceAlGrupo(it)` que revisa el responsable del tema Y,
recursivamente, el de todas sus subtareas (a cualquier profundidad) — si cualquiera de ellos
pertenece al grupo elegido, el tema completo se muestra. Verificado a mano contra los datos
reales de Sebastián (sin tocarlos): filtrar por "Excelencia" ahora sí incluye "Seguimiento de
líder de entrenamiento" (por Manuel, en sus subtareas); filtrar por "Despacho" solo muestra los
temas de Juan Diaz, sin ese contenedor. De paso se simplificó el permiso que muestra el selector
del filtro: de un chequeo de rol exacto (`jefatura`/`admin`) a la misma capability `canManage`
que ya gobierna el resto de Minuta, más consistente con cómo se resuelve todo lo demás en la
pantalla.

`npm run build`/`tsc --noEmit`/`eslint` limpios (0 errores).

**Pendiente, sin ejecutar:** Compromisos ganó una vista opcional "Por grupo" (además de "Por
persona", que sigue siendo la vista por defecto) — agrupa a las personas bajo su grupo de
trabajo, con el mismo patrón plegable de siempre, solo aparece si el equipo tiene grupos con
gente asignada. `useCompromisos.ts` expone `porGrupo` (grupo → personas, con un balde "Sin
grupo" para quien no tenga uno); `CompromisosPage.tsx` factorizó el bloque de una persona en un
componente `PersonaCard` reusado en las dos vistas, para no duplicar el JSX. `npm run
build`/`tsc --noEmit`/`eslint` limpios. **Falta confirmación visual de Sebastián.**

---

## Bug encontrado de paso: columna "Plazo" se contrae en la tabla de Minuta ✅ HECHO

Sebastián notó que la columna "Plazo" (tabla de escritorio, `MinutaPage.tsx:853`) se veía
angosta/contraída, a diferencia de "Estado" o "Responsable(s)". Causa: "Tema", "Responsable(s)"
y "Comentarios" tenían un `min-w-[...]` explícito en su `<th>`, pero "Estado" y "Plazo" no
tenían ninguno — en una tabla `border-collapse` sin ancho fijo por columna, el navegador
comprime las columnas sin mínimo cuando el resto reclama espacio, apretando el `DatePicker` (que
por defecto no tiene ancho propio) y el texto de trazabilidad debajo ("cambiada N veces", "≈
fecha por subtareas"). Corregido agregando `min-w-[130px]` a Estado (para que quepa "Definir en
reunion", la etiqueta más larga) y `min-w-[110px]` a Plazo (para el `DatePicker` + su texto de
abajo). `npm run build`/`tsc --noEmit` limpios.

---

## Notas de ejecución

- Cada fase se compila (`npm run build`) y lintea (`npx eslint .`) antes de pasar a la siguiente.
- Los cambios de datos reales se hacen con el token de gestión de Supabase, con confirmación
  explícita cuando el caso es ambiguo (ej. "SebaDiaz" → "Sebastian Diaz").
- Nada se commitea ni se publica hasta que Sebastián lo pida explícito.
