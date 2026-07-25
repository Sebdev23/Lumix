-- Migration 024: delegacion de actividades entre equipos (jerarquia).
-- Una actividad puede "bajarse" al equipo que uno lidera: se crea una nueva actividad en
-- ese equipo, asignada a un miembro, vinculada a la original via parent_activity_id.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS parent_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activities_parent ON activities(parent_activity_id);
