-- Migration 011: Add type and observations to errors

ALTER TABLE errors ADD COLUMN IF NOT EXISTS error_type TEXT DEFAULT 'funcional';
ALTER TABLE errors ADD COLUMN IF NOT EXISTS observations TEXT DEFAULT '';
