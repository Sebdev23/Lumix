-- Migration 007: Fix handle_new_user trigger (remove problematic UPDATE)

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_team_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.profiles (id, email, full_name, team_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    default_team_id,
    'colaborador'
  );

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (default_team_id, NEW.id, 'colaborador')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
