-- Migration 022: permitir el cambio de EQUIPO ACTIVO en el modelo multi-equipo.
-- El trigger de la migracion 017 bloqueaba que un colaborador cambiara su team_id
-- (anti-escalacion). Pero ahora un usuario puede pertenecer a varios equipos y necesita
-- cambiar su equipo activo. Se permite cambiar team_id SOLO a un equipo del que ya es
-- miembro (no es escalacion). El cambio de ROLE global sigue restringido a admin/jefatura.

CREATE OR REPLACE FUNCTION prevent_role_team_escalation()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- conexiones service_role (edge functions)
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  -- Cambio de ROLE global: solo admin/jefatura.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF caller_role IS DISTINCT FROM 'admin' AND caller_role IS DISTINCT FROM 'jefatura' THEN
      RAISE EXCEPTION 'No autorizado para modificar role';
    END IF;
  END IF;

  -- Cambio de TEAM_ID: permitido si el usuario cambia SU PROPIO equipo activo a uno
  -- del que ya es miembro. En cualquier otro caso, solo admin/jefatura.
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    IF NOT (
      NEW.id = auth.uid()
      AND EXISTS (SELECT 1 FROM team_members WHERE user_id = NEW.id AND team_id = NEW.team_id)
    ) AND caller_role IS DISTINCT FROM 'admin' AND caller_role IS DISTINCT FROM 'jefatura' THEN
      RAISE EXCEPTION 'No autorizado para modificar team_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
