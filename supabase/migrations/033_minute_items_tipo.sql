-- Migration 033: la hoja de ingesta reusa el modelo de la minuta.
--
-- POR QUE NO UNA TABLA NUEVA
--
-- "Ingesta" hoy no es una entidad: son actividades cuyo titulo empieza con "[Ingesta]" y la
-- pagina es un filtro sobre activities. No tiene estado propio, ni plazo con historial, ni
-- responsables multiples, ni comentarios: todo eso solo existe en minute_items.
--
-- Duplicar la tabla serian dos esquemas, dos hooks y dos paginas que hay que mantener
-- iguales a mano, y que se van a separar con el tiempo. Una columna discriminadora deja una
-- sola logica, que es justamente lo que se pidio ("practicamente igual que la minuta").
--
-- LAS 12 INGESTAS QUE YA EXISTEN NO SE MIGRAN. Decision tomada: la hoja parte vacia y esas
-- siguen siendo actividades, visibles donde se ven hoy. Por eso aca no hay backfill: las 69
-- filas actuales son todas de minuta y el DEFAULT las deja como estan.

ALTER TABLE public.minute_items
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'minuta'
  CHECK (tipo IN ('minuta', 'ingesta'));

COMMENT ON COLUMN public.minute_items.tipo IS
  'Que hoja es: minuta semanal o ingesta. Misma estructura, listados separados.';

-- Las consultas siempre filtran por equipo Y tipo.
DROP INDEX IF EXISTS idx_minute_items_team;
CREATE INDEX IF NOT EXISTS idx_minute_items_team_tipo ON public.minute_items(team_id, tipo);

-- PERMISOS POR HOJA
--
-- Escribir la minuta pide 'minuta.gestionar'; escribir la hoja de ingesta pide
-- 'ingestas.gestionar'. Son dos permisos distintos que ya existen en el catalogo de la app
-- (core/auth/capabilities.ts), y no tendria sentido que quien administra ingestas necesite
-- permiso de minuta para hacerlo.
--
-- OJO CON 'invitado': en ROLE_DEFAULTS la app le concede 'ingestas.gestionar' por defecto,
-- asi que aca tambien se le permite. No es un descuido: es lo que la app ya cree hoy en la
-- pagina de Ingestas. Si la politica fuera mas estricta que la app, la UI mostraria botones
-- que la base rechaza — exactamente el tipo de desalineacion que arreglo la migracion 028,
-- pero al reves. Si se decide que un invitado NO deba escribir la hoja, hay que cambiarlo en
-- los dos lados a la vez: ROLE_DEFAULTS y esta politica.

CREATE OR REPLACE FUNCTION public.puede_escribir_hoja(t uuid, p_tipo text, p_accion text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin global: override total, igual que en el resto del sistema.
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = t
        AND tm.user_id = auth.uid()
        AND (
          tm.role IN ('admin', 'jefatura')
          OR (p_tipo = 'ingesta' AND (
                tm.role = 'invitado'
                OR (tm.permissions->>'ingestas.gestionar')::boolean IS TRUE))
          OR (p_tipo <> 'ingesta' AND p_accion = 'eliminar'
                AND (tm.permissions->>'minuta.eliminar')::boolean IS TRUE)
          OR (p_tipo <> 'ingesta' AND p_accion <> 'eliminar'
                AND (tm.permissions->>'minuta.gestionar')::boolean IS TRUE)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.puede_escribir_hoja(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_escribir_hoja(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS minute_items_insert ON public.minute_items;
CREATE POLICY minute_items_insert ON public.minute_items
  FOR INSERT WITH CHECK (puede_escribir_hoja(team_id, tipo, 'gestionar'));

DROP POLICY IF EXISTS minute_items_update ON public.minute_items;
CREATE POLICY minute_items_update ON public.minute_items
  FOR UPDATE USING (puede_escribir_hoja(team_id, tipo, 'gestionar'))
  WITH CHECK (puede_escribir_hoja(team_id, tipo, 'gestionar'));

DROP POLICY IF EXISTS minute_items_delete ON public.minute_items;
CREATE POLICY minute_items_delete ON public.minute_items
  FOR DELETE USING (puede_escribir_hoja(team_id, tipo, 'eliminar'));

-- SELECT no cambia: cualquier miembro del equipo ve ambas hojas.
