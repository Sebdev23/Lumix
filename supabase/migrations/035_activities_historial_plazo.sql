-- Migration 035: trazabilidad de plazo en las actividades.
--
-- La minuta guarda cuantas veces se movio la fecha de un tema y cuando (plazo_change_count
-- y plazo_history, desde la 018). Las actividades -que son lo que de verdad hay que
-- entregar- no guardaban nada. La capacidad valiosa estaba en el objeto equivocado.
--
-- Importa por la reunion semanal: la pregunta no es solo "¿cumpliste?" sino "¿cuantas veces
-- has movido esto?". Un compromiso movido cuatro veces no es un atraso, es otra
-- conversacion. Hay un tema de minuta con la fecha movida SEIS veces; de las actividades no
-- se sabia nada equivalente.
--
-- Se hace con TRIGGER y no desde la app a proposito: la fecha se cambia desde el chat, desde
-- el listado, desde la tarjeta de actividad, desde la hoja de compromisos y desde la minuta.
-- Contarlo en cada lugar seria olvidarlo en alguno. En la base es un solo sitio y no se
-- escapa nada, venga de donde venga.
--
-- No destructivo: columnas nuevas con default. Las 200+ actividades existentes arrancan en
-- cero, sin historial previo -no se puede inventar lo que no se registro-.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS plazo_change_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plazo_history JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.activities.plazo_change_count IS
  'Cuantas veces se movio la fecha de entrega despues de creada. Lo mantiene un trigger.';
COMMENT ON COLUMN public.activities.plazo_history IS
  'Historial de fechas: [{ "date": "YYYY-MM-DD", "at": "ISO" }]. Lo mantiene un trigger.';

CREATE OR REPLACE FUNCTION public.registrar_cambio_de_plazo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo si la fecha cambia de verdad. IS DISTINCT FROM y no <> para que un NULL cuente.
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    NEW.plazo_change_count := coalesce(OLD.plazo_change_count, 0) + 1;
    NEW.plazo_history := coalesce(OLD.plazo_history, '[]'::jsonb) || jsonb_build_object(
      'date', to_char(NEW.due_date, 'YYYY-MM-DD'),
      'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plazo_actividad ON public.activities;
CREATE TRIGGER trg_plazo_actividad
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_de_plazo();
