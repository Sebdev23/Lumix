-- Migration 040: candado de equipo para sub-temas.
-- Nada en la app permite hoy crear un sub-tema en un equipo distinto al de su tema padre,
-- pero tampoco habia nada en la base que lo impidiera si alguien insertara directo (API,
-- bug futuro). Mismo criterio que la migracion 017: la integridad de team_id no deberia
-- depender solo de que el frontend se porte bien.

CREATE OR REPLACE FUNCTION prevent_parent_team_mismatch()
RETURNS TRIGGER AS $$
DECLARE
  parent_team UUID;
BEGIN
  IF NEW.parent_item_id IS NOT NULL THEN
    SELECT team_id INTO parent_team FROM minute_items WHERE id = NEW.parent_item_id;
    IF parent_team IS NOT NULL AND parent_team IS DISTINCT FROM NEW.team_id THEN
      RAISE EXCEPTION 'Un sub-tema debe pertenecer al mismo equipo que su tema padre';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_parent_team_mismatch ON minute_items;
CREATE TRIGGER trg_prevent_parent_team_mismatch
  BEFORE INSERT OR UPDATE ON minute_items
  FOR EACH ROW EXECUTE FUNCTION prevent_parent_team_mismatch();
