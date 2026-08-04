# ADR: Arquitectura de OPERA AI

## ADR-001: Clean Architecture + Feature-Based + DDD

**Estado:** Aceptado
**Fecha:** 2026-06-20

### Contexto

OPERA AI necesita una arquitectura escalable que soporte múltiples módulos independientes (chat, actividades, errores, reuniones, dashboard, Gantt, notificaciones) con una capa de IA transversal.

### Decision

Usar Clean Architecture combinada con Feature-Based Architecture y principios DDD:

- `core/` - Lógica de negocio compartida (auth, ai-engine, domain). No depende de frameworks.
- `features/` - Cada módulo es un feature independiente con sus propios componentes, hooks y tipos.
- `shared/` - Componentes UI genéricos, hooks reutilizables, utilidades y tipos base.
- `infrastructure/` - Implementaciones concretas (Supabase client, API calls).

### Consecuencias

- Bajo acoplamiento entre features.
- Cada feature puede desarrollarse y testearse de forma independiente.
- La capa AI Engine es reemplazable sin afectar al resto del sistema.

---

## ADR-002: Stack Tecnologico

**Estado:** Aceptado
**Fecha:** 2026-06-20

### Decisiones

| Componente         | Tecnologia          | Justificacion                                       |
| ------------------ | ------------------- | --------------------------------------------------- |
| Frontend framework | React 19            | Ecosistema maduro, amplia comunidad                 |
| Bundler            | Vite                | Rápido, HMR instantáneo                             |
| Lenguaje           | TypeScript estricto | Seguridad de tipos, mejor DX                        |
| Estilos            | Tailwind CSS 4      | Utility-first, rápido, consistente                  |
| Backend            | Supabase            | PostgreSQL, Auth, Realtime, Storage, Edge Functions |
| Hosting            | Netlify             | Despliegue continuo, serverless                     |
| IA                 | OpenAI (GPT-4o)     | Ver notas en ADR-003                                |
| Router             | React Router 7      | Estándar para SPAs React                            |
| Linting            | ESLint + Prettier   | Consistencia de código                              |
| Git hooks          | Husky + lint-staged | Calidad pre-commit                                  |

---

## ADR-003: Estrategia de IA

**Estado:** Aceptado
**Fecha:** 2026-06-20

### Contexto

El producto depende de IA para clasificar mensajes, extraer entidades, transcribir audio y generar minutas. Se necesita minimizar costos.

### Decision

- Modelo principal: GPT-4o mini (menor costo de OpenAI).
- Transcripción: Whisper-1.

> **Actualización 2026-07-31.** La decisión de usar GPT-4o mini nunca llegó a producción. Las Edge
> Functions leen `Deno.env.get('AI_MODEL') || 'gpt-4o'` y el secreto `AI_MODEL` nunca se definió en
> el proyecto Supabase, así que desde el inicio corrió **GPT-4o**, no mini. El impacto en costo fue
> menor por el bajo volumen, y 4o clasifica mejor, que es el núcleo del producto.
>
> **Decisión: se mantiene GPT-4o.** La clasificación es el corazón de Lumix y no conviene degradarla
> para ahorrar en un volumen que hoy es bajo. El secreto `AI_MODEL=gpt-4o` quedó definido de forma
> explícita en el proyecto Supabase, así que el modelo ya no depende del default del código.
> Cada fila de `ai_decisions` (migración 027) guarda el modelo que la produjo, de modo que si en el
> futuro se evalúa mini, la comparación de precisión entre ambos se puede hacer con datos reales.

> **Actualización 2026-08-03: se elimina la transcripción.** Whisper-1 queda fuera del stack. El
> único punto de entrada era el botón de micrófono del chat, que se retiró por decisión de producto
> (la voz no se va a usar ahí). Se borraron el botón y su cadena completa, el hook
> `useSpeechRecognition`, el helper `transcribeAudio` y la Edge Function `ai-transcribe`, que además
> se dio de baja del proyecto Supabase (el endpoint responde 404).
>
> Vale registrar que **ya estaba roto**: el audio se subía al bucket `chat-files`, y el proyecto no
> tiene ningún bucket creado, así que la transcripción fallaba en silencio (el `catch` se la comía).
>
> `ai-minutes` sigue desplegada y recibe un transcript como texto, pero hoy **nadie la invoca**: sin
> transcripción automática, el texto tendría que pegarse a mano. Queda pendiente decidir si la
> pantalla de Reuniones (hoy un stub) la usa o si también se retira. Las columnas `audio` y
> `transcript` de la tabla `meetings` se dejaron intactas.

- La capa AI Engine está desacoplada del frontend via Edge Functions de Supabase.
- Las llamadas a OpenAI se hacen desde Edge Functions para no exponer la API key.

### Consecuencias

- Latencia aceptable para chat (< 2s para clasificación).
- Costo por mensaje procesado muy bajo.
- Si se necesita cambiar de proveedor, solo se modifica la capa AI Engine.

---

## ADR-004: Estrategia de Datos y Tiempo Real

**Estado:** Aceptado
**Fecha:** 2026-06-20

### Decision

- PostgreSQL como base de datos principal (via Supabase).
- RLS (Row Level Security) para multi-tenancy por equipo.
- Supabase Realtime para actualizaciones en vivo del chat y notificaciones.
- Supabase Storage para archivos y grabaciones de audio.
- Computed columns para campos como `days_remaining` en actividades.

> **Actualización 2026-08-03: Realtime queda descartado.** Nunca funcionó: la publicación
> `supabase_realtime` del proyecto está **vacía**, así que todas las suscripciones
> `postgres_changes` del código (notifications, messages, activities, minute_items) jamás
> recibieron un evento. Se probó publicando `notifications` y funcionaba, pero se revirtió por
> decisión de producto: **el refresco se dispara al navegar entre páginas**
> (`NotificationContext` relee en cada cambio de ruta). Razones: con el volumen actual
> (~240 mensajes y ~50 notificaciones al mes, 16 usuarios) el costo no es el problema, pero cada
> callback del código llama a un `load()` que reconsulta varias tablas — 20 actividades creadas de
> golpe serían 20 recargas en cascada por cliente conectado. Y publicar `messages` empujaría los
> mensajes de cada persona al navegador de todo el equipo.
>
> **Storage: el proyecto no tiene ningún bucket creado.** Los adjuntos del chat suben a
> `chat-files`, que no existe, así que esa función está rota. Las grabaciones de audio ya no
> aplican (ver ADR-003).
>
> El chat es **por persona**, no compartido: cada quien ve sus mensajes y las respuestas de Lumix a
> él; el admin global ve el hilo del equipo. Eso lo garantizaba solo un `.filter()` en el cliente
> hasta la migración `028_messages_privados.sql`, que lo llevó a la política RLS.

### Consecuencias

- Seguridad a nivel de fila sin lógica adicional en backend.
- Escalabilidad gestionada por Supabase.
- Menos código boilerplate para CRUD y tiempo real.
