-- Migration 042: 'proyecto' como tercer valor de minute_items.tipo.
-- Mismo patron que 'minuta'/'ingesta' (migracion 033): misma tabla, mismo hook, listas
-- separadas por tipo. Un proyecto NO es un tema de la reunion semanal -no comparte la
-- cadencia de Minuta-, asi que necesita su propio valor de tipo, no un flag dentro de minuta.

ALTER TABLE minute_items DROP CONSTRAINT IF EXISTS minute_items_tipo_check;
ALTER TABLE minute_items
  ADD CONSTRAINT minute_items_tipo_check CHECK (tipo = ANY (ARRAY['minuta', 'ingesta', 'proyecto']));
