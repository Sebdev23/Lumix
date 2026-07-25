-- Migration 023: la jefatura/admin de un equipo puede gestionar la membresia de SU equipo
-- (agregar/quitar miembros, mover su equipo activo), aunque su rol GLOBAL sea colaborador.
-- Habilita la jerarquia: un "sub-jefe" administra su propio equipo.

-- INSERT: creador del equipo (alta inicial como admin) o un manager del equipo.
DROP POLICY IF EXISTS team_members_insert ON team_members;
CREATE POLICY team_members_insert ON team_members
  FOR INSERT WITH CHECK (
    (
      auth.uid() = user_id
      AND role = 'admin'
      AND EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND created_by = auth.uid())
    )
    OR is_team_manager(team_members.team_id)
  );

-- DELETE: un manager del equipo puede quitar miembros de su equipo.
DROP POLICY IF EXISTS team_members_delete ON team_members;
CREATE POLICY team_members_delete ON team_members
  FOR DELETE USING (is_team_manager(team_members.team_id));

-- Trigger de escalacion: permitir cambiar team_id si es el propio switch (ya miembro) o si
-- quien edita es manager del equipo destino (ej. al invitar a alguien y dejarlo activo ahi).
CREATE OR REPLACE FUNCTION prevent_role_team_escalation()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF caller_role IS DISTINCT FROM 'admin' AND caller_role IS DISTINCT FROM 'jefatura' THEN
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
