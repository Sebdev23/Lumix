-- Migration 025: propagacion de completado en la cadena de delegacion.
-- Cuando una actividad delegada (con parent_activity_id) se completa, si TODAS las
-- actividades hijas de ese padre estan completadas, el padre se marca completado.
-- El UPDATE del padre vuelve a disparar el trigger => se propaga hacia arriba en toda la cadena.
-- (trg_completed_at, BEFORE UPDATE, se encarga de setear completed_at.)

CREATE OR REPLACE FUNCTION propagate_activity_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completado'
     AND OLD.status IS DISTINCT FROM 'completado'
     AND NEW.parent_activity_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM activities
      WHERE parent_activity_id = NEW.parent_activity_id AND status <> 'completado'
    ) THEN
      UPDATE activities
        SET status = 'completado'
        WHERE id = NEW.parent_activity_id AND status <> 'completado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_propagate_completion ON activities;
CREATE TRIGGER trg_propagate_completion
  AFTER UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION propagate_activity_completion();
