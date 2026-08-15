-- Migration 036: el umbral de sobrecarga lo decide cada equipo.
--
-- POR QUE
--
-- El umbral estaba fijo en el codigo: Lumix avisaba cuando alguien ya tenia 2 actividades
-- para el mismo dia, o sea a partir de la tercera. Medido en uso real, eso hacia saltar la
-- alerta en 1 de cada 5 actividades creadas por chat -una persona recibio tres en un minuto-.
--
-- Un umbral demasiado bajo no protege: la gente aprende a despachar la alerta sin leerla y
-- deja de ser una señal. Pero el numero correcto no es el mismo para todos: un equipo de
-- analistas con tareas largas no se parece a uno de operaciones con muchas cosas cortas.
--
-- Por eso lo decide la jefatura de cada equipo. La politica teams_update ya limita la
-- escritura a admin/jefatura de ese equipo, asi que no hace falta nada nuevo de permisos.
--
-- SEMANTICA: es cuantas actividades puede tener UNA persona para UN mismo dia antes de que
-- Lumix avise. Con 2 -el valor de siempre- la alerta salta al crear la tercera.
-- Con 0 la alerta queda desactivada para ese equipo.
--
-- No destructivo: columna nueva con default 2, que es exactamente el comportamiento actual.
-- Ningun equipo cambia de conducta hasta que alguien decida moverlo.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS umbral_sobrecarga INTEGER NOT NULL DEFAULT 2
  CHECK (umbral_sobrecarga >= 0 AND umbral_sobrecarga <= 20);

COMMENT ON COLUMN public.teams.umbral_sobrecarga IS
  'Cuantas actividades puede tener una persona para un mismo dia antes de que Lumix avise. 0 = sin aviso.';
