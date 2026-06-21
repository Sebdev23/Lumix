-- Migration 010: Add resolved_at to errors

ALTER TABLE errors ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_resolved_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('resuelto', 'cerrado') AND OLD.status NOT IN ('resuelto', 'cerrado') THEN
    NEW.resolved_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resolved_at ON errors;
CREATE TRIGGER trg_resolved_at
  BEFORE UPDATE ON errors
  FOR EACH ROW EXECUTE FUNCTION set_resolved_at();
