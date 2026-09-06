-- Migration 041: permiso puntual 'equipo.gestionar_miembros' (agregar/quitar/invitar),
-- SIN abrir cambio de rol ni de permisos -esas dos siguen siendo exclusivas de jefatura/admin,
-- tanto en la UI como aca-.
--
-- Limites de seguridad, a proposito:
--   * Insertar: solo con role='colaborador' (igual que ya hace addMember hoy). Nadie con
--     solo este flag puede agregar a alguien como jefatura o admin.
--   * Eliminar: solo filas cuyo role sea 'colaborador' o 'invitado'. Nadie con solo este
--     flag puede remover a un jefe.
--   * team_members_update (cambiar role o permissions) NO se toca: sigue exigiendo
--     is_team_manager como hasta ahora.
--   * El trigger anti-escalacion de profiles (migracion 022) se extiende para permitir que
--     quien tiene el flag actualice el team_id de OTRO usuario -paso 2 de invitar-, pero
--     SOLO si esa misma fila no cambia ademas el role (evita usarlo como atajo para escalar).

CREATE OR REPLACE FUNCTION puede_gestionar_miembros(t uuid)
RETURNS boolean AS $$
  SELECT
    is_team_manager(t)
    OR EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = t AND user_id = auth.uid()
        AND (permissions->>'equipo.gestionar_miembros')::boolean IS TRUE
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS team_members_insert ON team_members;
CREATE POLICY team_members_insert ON team_members
  FOR INSERT WITH CHECK (
    (
      auth.uid() = user_id
      AND role = 'admin'
      AND EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND created_by = auth.uid())
    )
    OR is_team_manager(team_id)
    OR (puede_gestionar_miembros(team_id) AND role = 'colaborador')
  );

DROP POLICY IF EXISTS team_members_delete ON team_members;
CREATE POLICY team_members_delete ON team_members
  FOR DELETE USING (
    is_team_manager(team_id)
    OR (puede_gestionar_miembros(team_id) AND role IN ('colaborador', 'invitado'))
  );

-- Extiende (no reemplaza) el trigger de la migracion 022: agrega UN camino mas para
-- permitir el cambio de team_id -quien tiene 'equipo.gestionar_miembros' en el equipo
-- DESTINO, invitando a alguien mas, sin tocar su role a la vez-. El cambio de role sigue
-- exactamente igual de restringido que antes.
CREATE OR REPLACE FUNCTION prevent_role_team_escalation()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
  puede_por_permiso BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- conexiones service_role (edge functions)
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  -- Cambio de ROLE global: solo admin/jefatura. Sin cambios respecto a la migracion 022.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF caller_role IS DISTINCT FROM 'admin' AND caller_role IS DISTINCT FROM 'jefatura' THEN
      RAISE EXCEPTION 'No autorizado para modificar role';
    END IF;
  END IF;

  -- Cambio de TEAM_ID: los caminos de la 022 (uno mismo a un equipo propio, o admin/jefatura
  -- global) siguen igual. Se suma un camino: alguien con 'equipo.gestionar_miembros' en el
  -- equipo destino, invitando a otra persona, SIEMPRE que esta misma fila no cambie el role.
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    puede_por_permiso :=
      NEW.role IS NOT DISTINCT FROM OLD.role
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE user_id = auth.uid() AND team_id = NEW.team_id
          AND (permissions->>'equipo.gestionar_miembros')::boolean IS TRUE
      );

    IF NOT (
      NEW.id = auth.uid()
      AND EXISTS (SELECT 1 FROM team_members WHERE user_id = NEW.id AND team_id = NEW.team_id)
    ) AND caller_role IS DISTINCT FROM 'admin' AND caller_role IS DISTINCT FROM 'jefatura'
      AND NOT puede_por_permiso THEN
      RAISE EXCEPTION 'No autorizado para modificar team_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
