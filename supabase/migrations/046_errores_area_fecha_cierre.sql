-- Migration 046: Bitacora de Errores - responsable por area y fecha de cierre real.
--
-- POR QUE UNA COLUMNA NUEVA PARA EL RESPONSABLE
--
-- Hoy `responsible_id` es un FK duro a profiles: el responsable de un error solo puede ser un
-- miembro del equipo. Sebastian pidio que el responsable sea una categoria (Planta / TI / Otro
-- con texto libre) -no tiene sentido forzar eso en una columna que exige un UUID de usuario.
-- Mismo patron que 'responsables_text' en minute_items (Fase 13 de Ingesta): columna de texto
-- libre nueva, sin CHECK (permite cualquier texto para "Otro"), y `responsible_id` se deja
-- intacta -sigue existiendo, ya no se muestra como "Responsable" en la UI.
--
-- POR QUE UNA COLUMNA NUEVA PARA LA FECHA DE CIERRE (Y NO REUSAR resolved_at)
--
-- resolved_at hoy se sella la PRIMERA vez que el estado entra a 'resuelto' o 'cerrado' (ver
-- migracion 010) - o sea, mide cuando se RESOLVIO, no cuando se CERRO. Si un error pasa
-- resuelto -> cerrado, resolved_at NO se actualiza en el segundo paso (OLD.status ya estaba en
-- el set). La UI hoy lo mostraba igual como "Cerrado", lo cual era impreciso. Se agrega
-- `closed_at`, que se sella especificamente al entrar a 'cerrado' (sin importar de que estado
-- venga), y resolved_at se deja como esta (sigue siendo la fecha de "Resuelto", usada en
-- "dias para resolver" del Excel).

ALTER TABLE errors
  ADD COLUMN IF NOT EXISTS responsable_area TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

COMMENT ON COLUMN errors.responsable_area IS
  'Area responsable en texto libre (Planta/TI/Otro). Reemplaza a responsible_id como "Responsable" visible; responsible_id se deja intacta.';
COMMENT ON COLUMN errors.closed_at IS
  'Fecha real de cierre (entra a estado cerrado), distinta de resolved_at (fecha de resuelto).';

CREATE OR REPLACE FUNCTION set_error_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('resuelto', 'cerrado') AND OLD.status NOT IN ('resuelto', 'cerrado') THEN
    NEW.resolved_at = now();
  END IF;
  IF NEW.status = 'cerrado' AND OLD.status <> 'cerrado' THEN
    NEW.closed_at = now();
  END IF;
  -- Reabrir (vuelve a 'en_revision'/'abierto' desde resuelto/cerrado): limpia closed_at para
  -- que no quede una fecha de cierre vieja en un error que volvio a estar activo.
  IF NEW.status NOT IN ('resuelto', 'cerrado') AND OLD.status IN ('resuelto', 'cerrado') THEN
    NEW.closed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resolved_at ON errors;
CREATE TRIGGER trg_resolved_at
  BEFORE UPDATE ON errors
  FOR EACH ROW EXECUTE FUNCTION set_error_dates();
