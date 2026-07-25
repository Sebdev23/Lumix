-- Migration 021: permitir actualizar team_members (rol y permisos) a admin global o
-- jefatura del equipo. Se usa una funcion SECURITY DEFINER para consultar team_members
-- sin disparar recursion de RLS (la policy no puede leer team_members directamente).

CREATE OR REPLACE FUNCTION is_team_manager(t UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = t AND user_id = auth.uid() AND role IN ('admin', 'jefatura')
    );
$$;

GRANT EXECUTE ON FUNCTION is_team_manager(UUID) TO authenticated;

DROP POLICY IF EXISTS team_members_update ON team_members;
CREATE POLICY team_members_update ON team_members
  FOR UPDATE
  USING (is_team_manager(team_id))
  WITH CHECK (is_team_manager(team_id));
