-- Migration 047: fecha de inicio para Cronograma con barras reales (Fase Proyectos rediseño).
--
-- El Cronograma (GanttModal, compartido por Minuta y Proyectos) hoy solo tiene `plazo` (una
-- fecha), asi que dibuja un punto por tarea, no una barra con duracion -inventar un ancho
-- hubiera sido peor que ser honesto sobre el dato que existe. Sebastian pidio barras reales
-- despues de ver un mockup del rediseno; hace falta una fecha de inicio propia.
--
-- Nullable y sin historial (a diferencia de `plazo`/`plazo_change_count`/`plazo_history`): el
-- inicio es informativo para el Cronograma, no algo que se renegocie con el mismo peso que la
-- fecha de compromiso. Si no esta seteada, el Cronograma sigue mostrando un punto (mismo
-- comportamiento que hoy) en vez de romperse o inventar un valor.

ALTER TABLE minute_items
  ADD COLUMN IF NOT EXISTS fecha_inicio DATE;

COMMENT ON COLUMN minute_items.fecha_inicio IS
  'Fecha de inicio (opcional) para dibujar barras reales en el Cronograma. Sin ella, se muestra como un punto en el eje (plazo), igual que antes.';
