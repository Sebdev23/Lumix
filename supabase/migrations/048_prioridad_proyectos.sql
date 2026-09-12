-- Migration 048: prioridad para actividades de Proyectos (rediseño completo del modulo).
--
-- Se agrega prioridad (1-3, mismo criterio y colores que ya usa `activities.priority`:
-- 1=alta/roja, 2=media/ambar, 3=baja/esmeralda) para que una "actividad" dentro de un
-- Proyecto tenga paridad con lo que ya existe en la hoja de Actividades.
--
-- NO se agrega una columna de "avance" (% de progreso): se calcula en vivo a partir de las
-- subtareas resueltas (mismo dato que ya usa `contarSubtareas`/`AnilloProgreso`) en vez de
-- guardar un numero aparte que se podria desincronizar de la realidad -mismo criterio de toda
-- la sesion (reusar antes que duplicar).

ALTER TABLE minute_items
  ADD COLUMN IF NOT EXISTS prioridad SMALLINT CHECK (prioridad IS NULL OR prioridad BETWEEN 1 AND 3);

COMMENT ON COLUMN minute_items.prioridad IS
  'Prioridad 1-3 (1=alta/roja, 2=media/ambar, 3=baja/esmeralda, mismo criterio que activities.priority). Solo tiene sentido para tipo=proyecto; null en Minuta/Ingesta.';
