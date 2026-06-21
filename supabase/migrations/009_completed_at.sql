-- Migration 009: Add completed_at to activities

ALTER TABLE activities ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Auto-set completed_at when status changes to completado via a trigger
CREATE OR REPLACE FUNCTION set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completado' AND OLD.status != 'completado' THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_completed_at ON activities;
CREATE TRIGGER trg_completed_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_completed_at();
