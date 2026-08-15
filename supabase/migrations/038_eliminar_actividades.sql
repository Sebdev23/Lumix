-- Migration 038: se pueden eliminar actividades, desde el listado y con permiso.
--
-- Hasta ahora no existia politica de DELETE sobre activities: la base las rechazaba todas.
-- Eso dejaba la basura sin forma de limpiarse -actividades creadas por un malentendido de la
-- IA, duplicados, pruebas- y obligaba a completarlas de mentira para sacarlas de en medio.
--
-- QUIEN PUEDE
--
--   * admin global
--   * admin y jefatura del equipo
--   * quien tenga el permiso 'actividades.eliminar' concedido en ESE equipo
--
-- El tercer caso es el que pidieron: poder habilitarlo a un colaborador puntual sin
-- convertirlo en jefatura. Se concede desde Equipos, como los demas permisos.
--
-- NO desde el chat. Ahi sigue existiendo solo "deshaz eso" (migracion 037), que es una
-- puerta mucho mas estrecha: lo tuyo, reciente, sin empezar y sin delegadas. Borrar de
-- verdad exige ir al listado y confirmar: una frase mal entendida por la IA no puede
-- terminar en trabajo ajeno eliminado.
--
-- LO QUE ARRASTRA
--
-- Un DELETE a secas dejaria cabos sueltos que se ven despues como errores raros: temas de
-- minuta apuntando a una actividad que no existe -y calculando mal su estado-, y
-- notificaciones sobre algo inexistente. El trigger lo limpia, venga el borrado de donde
-- venga. Las actividades delegadas NO se borran: el FK ya las deja huerfanas con
-- ON DELETE SET NULL, que es lo correcto -es trabajo de otra persona-.

DROP POLICY IF EXISTS activities_delete ON public.activities;
CREATE POLICY activities_delete ON public.activities
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = activities.team_id
        AND tm.user_id = auth.uid()
        AND (
          tm.role IN ('admin', 'jefatura')
          OR (tm.permissions->>'actividades.eliminar')::boolean IS TRUE
        )
    )
  );

CREATE OR REPLACE FUNCTION public.limpiar_al_borrar_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- El tema de minuta no puede quedar apuntando a algo que ya no existe.
  UPDATE minute_items
     SET linked_activity_ids = array_remove(linked_activity_ids, OLD.id)
   WHERE OLD.id = ANY(linked_activity_ids);

  DELETE FROM notifications WHERE (metadata->>'activity_id')::uuid = OLD.id;

  -- La telemetria pierde el vinculo, no la fila: sirve saber que se predijo y se borro.
  UPDATE ai_decisions SET entity_id = NULL WHERE entity_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpiar_actividad ON public.activities;
CREATE TRIGGER trg_limpiar_actividad
  BEFORE DELETE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.limpiar_al_borrar_actividad();
