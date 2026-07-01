-- Migration 016: Remove default team, new users start without team

-- Update trigger to not assign default team
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, team_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'colaborador',
    NULL
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete default team if it exists
DELETE FROM team_members WHERE team_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM teams WHERE id = '00000000-0000-0000-0000-000000000001';
