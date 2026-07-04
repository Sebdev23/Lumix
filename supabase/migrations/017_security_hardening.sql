-- Migration 017: Security hardening
-- Cierra 4 vias de escalacion de privilegios / fuga de datos encontradas en revision:
--   1. profiles_update permitia auto-asignarse role/team_id (auto-escalacion a admin)
--   2. team_members_insert permitia auto-asignarse cualquier role en cualquier equipo
--   3. notifications_insert (WITH CHECK true) permitia notificar a cualquier usuario
--   4. profiles_select (USING true) exponia todos los perfiles de todos los equipos
--
-- No cambia el modelo de roles: admin/jefatura siguen siendo roles globales de confianza,
-- igual que ya lo asumian las policies de team_members desde la migracion 004.

-- ============================================================
-- 1. profiles: bloquear auto-escalacion de role / team_id
-- ============================================================
-- RLS no puede comparar OLD vs NEW en una sola policy de UPDATE, asi que se usa un
-- trigger. auth.uid() IS NULL identifica conexiones service_role (usadas por la
-- edge function admin-users, que ahora valida el rol del caller por su cuenta),
-- asi que esas quedan exentas de esta regla.

CREATE OR REPLACE FUNCTION prevent_role_team_escalation()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.team_id IS DISTINCT FROM OLD.team_id) THEN
    SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role IS DISTINCT FROM 'admin' AND caller_role IS DISTINCT FROM 'jefatura' THEN
      RAISE EXCEPTION 'No autorizado para modificar role o team_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_role_team_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_team_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_team_escalation();

-- ============================================================
-- 2. profiles_select: restringir a perfil propio + mismo equipo
-- ============================================================
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm1
      JOIN team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = profiles.id
    )
  );

-- El flujo de "agregar miembro por email" (teams.service.ts) necesita resolver el id
-- de un usuario que todavia no comparte equipo con quien invita. Se expone solo el id
-- via una funcion SECURITY DEFINER, sin abrir el resto de la tabla profiles.
CREATE OR REPLACE FUNCTION find_user_id_by_email(lookup_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM profiles WHERE email = lookup_email LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION find_user_id_by_email(TEXT) TO authenticated;

-- ============================================================
-- 3. team_members_insert: auto-insert solo como admin del equipo que uno mismo creo
-- ============================================================
DROP POLICY IF EXISTS team_members_insert ON team_members;
CREATE POLICY team_members_insert ON team_members
  FOR INSERT WITH CHECK (
    (
      auth.uid() = user_id
      AND role = 'admin'
      AND EXISTS (SELECT 1 FROM teams WHERE id = team_members.team_id AND created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'jefatura')
    )
  );

-- ============================================================
-- 4. notifications_insert: solo a uno mismo o a alguien del mismo equipo
-- ============================================================
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm1
      JOIN team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = notifications.user_id
    )
  );
