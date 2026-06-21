-- Migration 002: Auto-assign new users to default team

-- Drop FK constraint temporarily
ALTER TABLE teams DROP CONSTRAINT IF EXISTS fk_teams_created_by;

-- Make created_by nullable for default team
ALTER TABLE teams ALTER COLUMN created_by DROP NOT NULL;

-- Create default team
INSERT INTO teams (id, name, description, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Equipo de Desarrollo',
  'Equipo principal de OPERA AI',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- Re-add FK constraint
ALTER TABLE teams
  ADD CONSTRAINT fk_teams_created_by
  FOREIGN KEY (created_by) REFERENCES profiles(id);

-- Update handle_new_user to also add to default team
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_team_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Create profile with default team
  INSERT INTO public.profiles (id, email, full_name, team_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    default_team_id,
    'colaborador'
  );

  -- Add to default team members
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (default_team_id, NEW.id, 'colaborador')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  -- Set default team created_by to first real user
  UPDATE teams SET created_by = NEW.id
  WHERE id = default_team_id AND created_by IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
