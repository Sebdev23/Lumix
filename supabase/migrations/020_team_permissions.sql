-- Migration 020: permisos granulares por usuario y por equipo (flags)
-- Cada miembro (team_members) puede tener permisos EXTRA mas alla de su rol, en un JSONB.
-- Claves usadas por la app:
--   minuta.gestionar, minuta.eliminar, minuta.asignar,
--   actividades.asignar_otros, actividades.ver_todas, actividades.editar_todas,
--   errores.gestionar, ingestas.gestionar
-- Se conceden/quitan desde la UI (data), sin tocar codigo.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}';

-- Helper: el usuario actual puede gestionar la minuta de un equipo si es admin global,
-- o en ese equipo es admin/jefatura, o tiene el flag correspondiente.
-- Se refleja en las policies de minute_items (unica tabla cuya escritura esta gateada por rol).

-- INSERT / UPDATE: requiere permiso de gestion de minuta.
DROP POLICY IF EXISTS minute_items_insert ON minute_items;
CREATE POLICY minute_items_insert ON minute_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = minute_items.team_id AND tm.user_id = auth.uid()
        AND (tm.role IN ('admin', 'jefatura') OR (tm.permissions->>'minuta.gestionar')::boolean IS TRUE)
    )
  );

DROP POLICY IF EXISTS minute_items_update ON minute_items;
CREATE POLICY minute_items_update ON minute_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = minute_items.team_id AND tm.user_id = auth.uid()
        AND (tm.role IN ('admin', 'jefatura') OR (tm.permissions->>'minuta.gestionar')::boolean IS TRUE)
    )
  );

-- DELETE: requiere permiso de eliminar minuta.
DROP POLICY IF EXISTS minute_items_delete ON minute_items;
CREATE POLICY minute_items_delete ON minute_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = minute_items.team_id AND tm.user_id = auth.uid()
        AND (tm.role IN ('admin', 'jefatura') OR (tm.permissions->>'minuta.eliminar')::boolean IS TRUE)
    )
  );

-- Permitir que un miembro lea permissions de su propio equipo (para resolver capacidades).
-- (team_members_select ya expone las filas del equipo; permissions viaja en la misma fila.)
