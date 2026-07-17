-- Migration 019: temas colectivos / de seguimiento en la minuta
-- Algunos temas son "para todos" (sin responsable individual) y NO son una actividad:
-- viven en la minuta y se retoman cada semana (ej. "usar una herramienta"). No generan
-- actividad ni se asignan a nadie; persisten hasta marcarse Resuelto manualmente.

ALTER TABLE minute_items
  ADD COLUMN IF NOT EXISTS para_todos BOOLEAN NOT NULL DEFAULT false;
