-- Migration 044: aviso de novedades, una vez por USUARIO (no por dispositivo).
--
-- Sebastian pidio que quien entre a Lumix se entere de los cambios de esta sesion (tema
-- claro, Proyectos, grupos de trabajo, ayuda en el chat, etc.), pero que el aviso se muestre
-- UNA sola vez por persona -no una vez por dispositivo, como el tema claro (Fase 6): si
-- alguien entra desde el celular y despues desde la notebook, no deberia verlo dos veces.
-- Por eso va en `profiles` (por usuario), no en localStorage (por dispositivo).
--
-- `changelog_visto` guarda el numero de version de changelog que la persona ya vio
-- (`CHANGELOG_VERSION` en `src/shared/changelog.ts`). Si el numero guardado es menor al
-- actual, se le muestra el aviso; al cerrarlo, se actualiza a la version actual.
--
-- Sin RLS nueva: `profiles_update` (migracion 001) ya permite `auth.uid() = id`, y el
-- trigger anti-escalacion (migracion 017) solo vigila `role`/`team_id` -esta columna
-- actualiza libre, como cualquier otro campo propio (avatar, nombre, etc.).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS changelog_visto INTEGER NOT NULL DEFAULT 0;
