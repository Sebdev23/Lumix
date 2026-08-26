-- Migration 039: sub-temas dentro de un tema de minuta.
-- Un tema grande (ej. "Revisar capacidad") puede descomponerse en sub-temas (ej. "Ver
-- etiquetado", "Ver faena"), y cada sub-tema sigue exactamente el mismo ciclo de vida que
-- un tema normal: se le pone responsable y, al asignarse, se transforma en actividad
-- (createActivitiesFromItem no distingue raiz de sub-tema). ON DELETE CASCADE porque un
-- sub-tema no tiene sentido sin su tema padre -igual que hoy no tiene sentido un tema sin
-- su equipo-.

ALTER TABLE minute_items
  ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES minute_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_minute_items_parent ON minute_items(parent_item_id);
