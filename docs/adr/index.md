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

| Componente         | Tecnologia                       | Justificacion                                       |
| ------------------ | -------------------------------- | --------------------------------------------------- |
| Frontend framework | React 19                         | Ecosistema maduro, amplia comunidad                 |
| Bundler            | Vite                             | Rápido, HMR instantáneo                             |
| Lenguaje           | TypeScript estricto              | Seguridad de tipos, mejor DX                        |
| Estilos            | Tailwind CSS 4                   | Utility-first, rápido, consistente                  |
| Backend            | Supabase                         | PostgreSQL, Auth, Realtime, Storage, Edge Functions |
| Hosting            | Netlify                          | Despliegue continuo, serverless                     |
| IA                 | OpenAI (GPT-4o mini + Whisper-1) | Modelos más económicos                              |
| Router             | React Router 7                   | Estándar para SPAs React                            |
| Linting            | ESLint + Prettier                | Consistencia de código                              |
| Git hooks          | Husky + lint-staged              | Calidad pre-commit                                  |

---

## ADR-003: Estrategia de IA

**Estado:** Aceptado
**Fecha:** 2026-06-20

### Contexto

El producto depende de IA para clasificar mensajes, extraer entidades, transcribir audio y generar minutas. Se necesita minimizar costos.

### Decision

- Modelo principal: GPT-4o mini (menor costo de OpenAI).
- Transcripción: Whisper-1.
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
