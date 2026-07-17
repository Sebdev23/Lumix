-- Migration 018: Minuta semanal (unica y viva por equipo)
-- Una sola "minuta" por equipo = coleccion de temas (minute_items). Por defecto la UI
-- muestra los pendientes, con opcion de ver el historico (resueltos/antiguos).
-- Cada tema se puede asignar a una o mas personas y generar actividades vinculadas.
-- Trazabilidad del plazo: se guarda cuantas veces cambio la fecha y su historial.

CREATE TABLE IF NOT EXISTS minute_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  tema TEXT NOT NULL,
  responsables UUID[] NOT NULL DEFAULT '{}',        -- miembros asignados (uno o varios)
  responsables_text TEXT NOT NULL DEFAULT '',        -- fallback libre ("Todos", externos)
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_desarrollo', 'resuelto', 'definir')),
  plazo DATE,
  plazo_change_count INTEGER NOT NULL DEFAULT 0,
  plazo_history JSONB NOT NULL DEFAULT '[]',         -- [{ "date": "YYYY-MM-DD", "at": "ISO" }]
  comentarios TEXT NOT NULL DEFAULT '',
  linked_activity_ids UUID[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minute_items_team ON minute_items(team_id);
CREATE INDEX IF NOT EXISTS idx_minute_items_estado ON minute_items(estado);

ALTER TABLE minute_items ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier miembro del equipo ve la minuta.
DROP POLICY IF EXISTS minute_items_select ON minute_items;
CREATE POLICY minute_items_select ON minute_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = minute_items.team_id AND user_id = auth.uid())
  );

-- INSERT/UPDATE/DELETE: solo admin/jefatura (rol global de confianza, igual que el resto).
DROP POLICY IF EXISTS minute_items_insert ON minute_items;
CREATE POLICY minute_items_insert ON minute_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = minute_items.team_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'jefatura'))
  );

DROP POLICY IF EXISTS minute_items_update ON minute_items;
CREATE POLICY minute_items_update ON minute_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = minute_items.team_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'jefatura'))
  );

DROP POLICY IF EXISTS minute_items_delete ON minute_items;
CREATE POLICY minute_items_delete ON minute_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = minute_items.team_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'jefatura'))
  );
