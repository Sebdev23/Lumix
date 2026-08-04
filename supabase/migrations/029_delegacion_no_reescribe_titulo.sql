-- Migration 029: en la cadena de delegacion se sincroniza la DESCRIPCION, no el titulo.
--
-- La 026 propagaba titulo Y descripcion por todo el arbol de delegacion, y ademas reescribia
-- el tema de la minuta con el titulo de la actividad. Efecto no deseado: cada equipo le
-- pone a su copia el titulo que le sirve, y al primer cambio de texto se le sobrescribia
-- con el de otro equipo. El titulo ahora es de cada actividad; el comentario (descripcion)
-- sigue viajando por la cadena, que es lo que hay que mantener alineado.
--
-- Se reemplaza propagate_activity_text (solo descripcion) y se elimina el trigger inverso
-- propagate_minute_tema, que reescribia el titulo de las actividades con el tema de la minuta.
-- Su funcion se deja creada pero sin trigger, para poder reactivarla si se decide lo contrario.

CREATE OR REPLACE FUNCTION propagate_activity_text()
RETURNS TRIGGER AS $$
DECLARE
  root_id UUID;
  par UUID;
BEGIN
  -- Solo reacciona a cambios de descripcion. El titulo ya no dispara ni se propaga.
  IF NEW.description IS DISTINCT FROM OLD.description THEN
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
      SET description = NEW.description
      WHERE id IN (SELECT id FROM tree)
        AND description IS DISTINCT FROM NEW.description;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- El trigger sigue siendo AFTER UPDATE sobre activities (se recrea por claridad).
DROP TRIGGER IF EXISTS trg_propagate_activity_text ON activities;
CREATE TRIGGER trg_propagate_activity_text
  AFTER UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION propagate_activity_text();

-- Minuta -> actividad: dejaba el titulo de la actividad igual al tema del tema de minuta.
-- Tambien es reescritura de titulo, asi que se desactiva.
DROP TRIGGER IF EXISTS trg_propagate_minute_tema ON minute_items;
