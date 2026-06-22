-- Migration 013: Ensure default team exists and fix trigger to be resilient

-- Re-insert default team if it was deleted
INSERT INTO teams (id, name, description, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Equipo de Desarrollo',
  'Equipo principal de OPERA AI',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- Fix handle_new_user to fall back to NULL if default team doesn't exist
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_team_id UUID := '00000000-0000-0000-0000-000000000001';
  target_team_id UUID;
  team_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM teams WHERE id = default_team_id) INTO team_exists;

  IF team_exists THEN
    target_team_id := default_team_id;
  ELSE
    target_team_id := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, team_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    target_team_id,
    'colaborador'
  );

  IF target_team_id IS NOT NULL THEN
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (target_team_id, NEW.id, 'colaborador')
    ON CONFLICT (team_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
