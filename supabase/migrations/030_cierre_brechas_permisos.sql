-- Migration 030: cierre de dos brechas de permisos verificadas contra la API real.
--
-- BRECHA 1 (critica): una jefatura se ascendia a admin global desde el navegador.
--   El trigger dejaba cambiar `role` a quien ya era admin O JEFATURA. Como profiles_update
--   solo permite tocar la fila propia, esa cláusula no habilitaba a gestionar a otros:
--   solo a auto-promoverse. Probado: PATCH /profiles {role:'admin'} devolvia 204.
--   Ahora solo un admin global puede cambiar el campo `role` desde una sesion de usuario.
--   El alta y cambio de roles legitimo pasa por la Edge Function admin-users, que usa
--   service_role: ahi auth.uid() es NULL y el trigger retorna antes de validar, asi que
--   ese camino no se ve afectado. Verificado que el cliente nunca escribe profiles.role.
--
-- BRECHA 2 (alta): cualquier miembro reescribia y se apropiaba de actividades ajenas.
--   activities_update solo exigia pertenecer al equipo, sin mirar rol ni responsable.
--   Probado con un colaborador: cambio titulo, prioridad y se puso como responsable de
--   una actividad de otro. La app decia "Solo puedes modificar tus propias actividades",
--   pero eso vivia unicamente en el JavaScript.
--   Ahora la base exige: ser el responsable, o ser jefatura/admin del equipo.
--
--   Se aplica tambien a WITH CHECK (implicito al omitirlo en UPDATE, pero se declara
--   explicito para que quede a la vista): un colaborador no puede regalarle su actividad
--   a otro, que es justo lo que la app ya impide en el cliente.
--
--   Los triggers de la cadena de delegacion (propagate_activity_completion y
--   propagate_activity_text) son SECURITY DEFINER, asi que siguen propagando a la madre
--   en otro equipo sin chocar con esta politica.

-- --- BRECHA 1 ---
CREATE OR REPLACE FUNCTION prevent_role_team_escalation()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- service_role (Edge Functions) no tiene auth.uid(): ese camino ya valida por su cuenta.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Solo admin global. Antes tambien pasaba 'jefatura', que era la brecha.
    IF caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'No autorizado para modificar role';
    END IF;
  END IF;

  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    IF NOT (
      (NEW.id = auth.uid()
        AND EXISTS (SELECT 1 FROM team_members WHERE user_id = NEW.id AND team_id = NEW.team_id))
      OR is_team_manager(NEW.team_id)
    ) THEN
      RAISE EXCEPTION 'No autorizado para modificar team_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- --- BRECHA 2 ---
DROP POLICY IF EXISTS activities_update ON activities;

CREATE POLICY activities_update ON activities
  FOR UPDATE
  USING (responsible_id = auth.uid() OR is_team_manager(team_id))
  WITH CHECK (responsible_id = auth.uid() OR is_team_manager(team_id));
