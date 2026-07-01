-- Migration 015: Add estimated_hours to activities for workload calculation

ALTER TABLE activities ADD COLUMN IF NOT EXISTS estimated_hours INTEGER DEFAULT 3 CHECK (estimated_hours BETWEEN 1 AND 40);
