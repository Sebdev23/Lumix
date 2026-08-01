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

| Componente         | Tecnologia                  | Justificacion                                       |
| ------------------ | --------------------------- | --------------------------------------------------- |
| Frontend framework | React 19                    | Ecosistema maduro, amplia comunidad                 |
| Bundler            | Vite                        | Rápido, HMR instantáneo                             |
| Lenguaje           | TypeScript estricto         | Seguridad de tipos, mejor DX                        |
| Estilos            | Tailwind CSS 4              | Utility-first, rápido, consistente                  |
| Backend            | Supabase                    | PostgreSQL, Auth, Realtime, Storage, Edge Functions |
| Hosting            | Netlify                     | Despliegue continuo, serverless                     |
| IA                 | OpenAI (GPT-4o + Whisper-1) | Ver nota en ADR-003                                 |
| Router             | React Router 7              | Estándar para SPAs React                            |
| Linting            | ESLint + Prettier           | Consistencia de código                              |
| Git hooks          | Husky + lint-staged         | Calidad pre-commit                                  |

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

### Consecuencias

- Seguridad a nivel de fila sin lógica adicional en backend.
- Escalabilidad gestionada por Supabase.
- Menos código boilerplate para CRUD y tiempo real.
