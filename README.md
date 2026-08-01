# Lumix

Sistema Operativo Conversacional para Equipos de Trabajo.

"Todo comienza con una conversacion." La IA interpreta lenguaje natural y transforma mensajes en actividades, errores e ingestas de datos.

---

## Que hace

| Modulo                 | Descripcion                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| **Chat con IA**        | Escribis en lenguaje natural y Lumix clasifica, crea y asigna automaticamente     |
| **Actividades**        | Gestion de tareas con prioridad chilena (1=urgente, 5=baja), fechas, responsables |
| **Errores (Bitacora)** | Registro de incidencias con severidad, tipo, timeline y comentarios               |
| **Ingestas**           | Tareas de datos gestionadas por el ingeniero de datos (rol invitado)              |
| **Dashboard**          | KPIs en tiempo real: pendientes, criticas, carga laboral por miembro              |
| **Gantt**              | Planificacion semanal con indicadores de saturacion (0-70% normal, +90% critico)  |
| **Notificaciones**     | Alertas en tiempo real por actividad bloqueada, deadlines, sobrecarga             |
| **Equipos**            | Multi-tenant: crea equipos, invita miembros, asigna roles                         |
| **Admin**              | Crea usuarios con clave temporal, gestiona roles por equipo                       |

---

## Roles

| Rol             | Permisos                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Admin**       | Todo: crea usuarios, equipos, ve todo el chat, asigna roles                                 |
| **Jefatura**    | Ve actividades del equipo, asigna a otros, ve Gantt y Dashboard. Chat personal              |
| **Colaborador** | Solo ve sus actividades, se auto-asigna tareas. Chat personal                               |
| **Invitado**    | Gestiona Errores e Ingestas (ingeniero de datos). Ve todos los errores sin filtro de equipo |

---

## Stack

| Capa         | Tecnologia                                                     |
| ------------ | -------------------------------------------------------------- |
| Frontend     | React 19, Vite, TypeScript, Tailwind CSS 4                     |
| Backend      | Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions) |
| IA           | OpenAI GPT-4o (clasificacion), Whisper-1 (transcripcion)       |
| Hosting      | Netlify (frontend), Supabase (backend)                         |
| Arquitectura | Clean Architecture + Feature-Based + DDD                       |

---

## Estructura del proyecto

```
src/
├── core/           # auth, ai-engine, domain, notifications
├── features/       # chat, activities, errors, ingestas, dashboard, gantt, teams, admin
├── shared/         # componentes UI, hooks, utils, types
├── infrastructure/ # supabase services
supabase/
├── functions/      # ai-classify, ai-ask, ai-transcribe, admin-users
└── migrations/     # 12 migraciones SQL
```

---

## API / Edge Functions

7 Edge Functions desplegadas en Supabase. La API key de OpenAI esta como secreto del servidor, nunca expuesta al cliente.

**Todas las funciones de IA exigen un usuario autenticado.** La anon key viaja dentro del bundle que
sirve Netlify (es publica por diseno: cualquier variable `VITE_*` queda escrita en el JavaScript
compilado), asi que por si sola no basta para invocarlas: hace falta el token de sesion de alguien
que inicio sesion en Lumix. Sin esta verificacion, cualquiera podria copiar la anon key del inspector
y gastar la `OPENAI_API_KEY` del proyecto. RLS protege los datos, pero no protege el gasto.

El codigo comun vive en `supabase/functions/_shared/`:

| Archivo         | Que hace                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `cors.ts`       | Cabeceras CORS. Lee `ALLOWED_ORIGIN` (lista separada por comas)            |
| `auth.ts`       | `getUser(req)`: valida el token de sesion. Devuelve null si no hay usuario |
| `rate-limit.ts` | Limite por usuario. En memoria: ver limitacion documentada en el archivo   |

| Funcion         | Endpoint                           | Que hace                                                                                             |
| --------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ai-classify`   | `POST /functions/v1/ai-classify`   | Clasifica mensajes con GPT-4o. Recibe `{ content }`, devuelve `{ category, depth, entities, reply }` |
| `ai-ask`        | `POST /functions/v1/ai-ask`        | Responde preguntas con datos del equipo. Recibe `{ question, teamData }`, devuelve `{ answer }`      |
| `ai-transcribe` | `POST /functions/v1/ai-transcribe` | Transcribe audio con Whisper-1. Recibe `{ audioUrl }`, devuelve `{ transcript }`                     |
| `admin-users`   | `POST /functions/v1/admin-users`   | Crea usuarios y cambia roles. Usa service_role key. Acciones: `create-user`, `change-role`           |

### Ejemplo ai-classify

```bash
curl -X POST https://<tu-proyecto>.supabase.co/functions/v1/ai-classify \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"content": "Sebastian, preparar reporte de ventas para el viernes"}'
```

Respuesta:

```json
{
  "category": "actividad",
  "depth": "superficial",
  "confidence": 1,
  "entities": {
    "title": "preparar reporte de ventas",
    "description": "Sebastian debe preparar el reporte de ventas para el viernes",
    "responsible": "Sebastian",
    "priority": 3,
    "due_date": "2026-06-26",
    "severity": null
  },
  "reply": "Actividad creada para Sebastian."
}
```

---

## Base de Datos

9 tablas con Row Level Security por equipo:

| Tabla           | Descripcion                                           |
| --------------- | ----------------------------------------------------- |
| `teams`         | Equipos                                               |
| `profiles`      | Usuarios (extiende auth.users)                        |
| `team_members`  | Miembros por equipo con rol                           |
| `activities`    | Actividades (prioridad, estado, completed_at)         |
| `errors`        | Errores (severidad, tipo, observaciones, resolved_at) |
| `messages`      | Chat (is_ai flag para respuestas de IA)               |
| `meetings`      | Reuniones (audio, transcript, minuta)                 |
| `notifications` | Notificaciones por usuario                            |

### Politicas RLS

- Cada usuario solo ve datos de su equipo
- `team_members` controla membresia y roles a nivel equipo
- `messages_insert`: solo miembros del equipo
- `teams_select`: miembros + creador
- `notifications_insert`: cualquier authenticated

---

## Flujos principales

### Crear actividad desde chat

1. Usuario escribe en lenguaje natural
2. Edge Function `ai-classify` analiza con GPT-4o
3. Extrae: titulo, responsable, prioridad, fecha
4. Si no hay fecha → +7 dias habiles
5. Si hay sobrecarga → alerta interactiva (reprogramar)
6. Actividad creada, notificacion enviada si se asigna a otro

### Preguntar al equipo

- Escribi `?como esta el equipo?` o `que tengo pendiente`
- Lumix consulta la BD y responde con datos reales

### Gestion de errores

1. Cualquier usuario reporta error desde chat
2. Invidado (ingeniero de datos) gestiona: Abierto → En revision → Resuelto → Cerrado
3. Timeline visual, tipo de error, comentarios

---

## Variables de entorno

Copiar `.env.example` a `.env` y completar con los valores reales.

### Frontend (.env / Netlify)

```
VITE_SUPABASE_URL=<url-de-tu-proyecto-supabase>
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Supabase Secrets (Edge Functions)

```
OPENAI_API_KEY=<api-key>
SERVICE_ROLE_KEY=<service-role-key>
PROJECT_URL=<url-de-tu-proyecto-supabase>
AI_MODEL=<opcional: modelo de OpenAI>
```

`AI_MODEL` controla el modelo que usan las 6 Edge Functions de IA. En produccion esta definido como
`gpt-4o` (ver ADR-003). **Si no se define, todas caen al default del codigo, que tambien es `gpt-4o`**
— no `gpt-4o-mini`. Conviene mantenerlo explicito para que el modelo no dependa de un default
escondido en el codigo.

`ai-classify` devuelve el modelo que uso en el campo `model` de su respuesta, y ese valor se guarda
en `ai_decisions.model`. Asi, si se cambia `AI_MODEL`, se puede comparar la precision entre modelos.

---

## Deploy

```bash
npm install
npm run build    # genera dist/
```

Netlify:

- Build command: `npm run build`
- Publish directory: `dist`
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## PWA

La app es instalable en iOS y Android como PWA:

- `manifest.json` con icono SVG
- Service worker registrado
- Safe area para notch
- Tema oscuro slate-950
