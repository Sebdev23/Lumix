-- Migration 026: sincronizacion de texto (titulo/descripcion) en toda la cadena de
-- delegacion, y entre el tema de minuta y su actividad vinculada. Bidireccional.
-- Guards con IS DISTINCT para cortar la recursion de triggers.

-- Al cambiar titulo/descripcion de una actividad: propagar a TODO el arbol de delegacion
-- (raiz + descendientes) y reflejar el titulo en los temas de minuta vinculados.
CREATE OR REPLACE FUNCTION propagate_activity_text()
RETURNS TRIGGER AS $$
DECLARE
  root_id UUID;
  par UUID;
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description THEN
    -- raiz de la cadena
    root_id := NEW.id;
    LOOP
      SELECT parent_activity_id INTO par FROM activities WHERE id = root_id;
      EXIT WHEN par IS NULL;
      root_id := par;
    END LOOP;

    WITH RECURSIVE tree AS (
      SELECT id FROM activities WHERE id = root_id
      UNION
      SELECT a.id FROM activities a JOIN tree t ON a.parent_activity_id = t.id
    )
    UPDATE activities
      SET title = NEW.title, description = NEW.description
      WHERE id IN (SELECT id FROM tree)
        AND (title IS DISTINCT FROM NEW.title OR description IS DISTINCT FROM NEW.description);

    UPDATE minute_items
      SET tema = NEW.title
      WHERE NEW.id = ANY (linked_activity_ids) AND tema IS DISTINCT FROM NEW.title;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_propagate_activity_text ON activities;
CREATE TRIGGER trg_propagate_activity_text
  AFTER UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION propagate_activity_text();

-- Al cambiar el tema de la minuta: reflejarlo en el titulo de sus actividades vinculadas
-- (que a su vez propaga por la cadena via el trigger anterior).
CREATE OR REPLACE FUNCTION propagate_minute_tema()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tema IS DISTINCT FROM OLD.tema AND COALESCE(array_length(NEW.linked_activity_ids, 1), 0) > 0 THEN
    UPDATE activities
      SET title = NEW.tema
      WHERE id = ANY (NEW.linked_activity_ids) AND title IS DISTINCT FROM NEW.tema;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_propagate_minute_tema ON minute_items;
CREATE TRIGGER trg_propagate_minute_tema
  AFTER UPDATE ON minute_items
  FOR EACH ROW EXECUTE FUNCTION propagate_minute_tema();
