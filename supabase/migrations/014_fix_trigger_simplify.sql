-- Migration 014: Fix trigger to avoid SELECT query on public schema inside GoTrue context

-- The SELECT EXISTS query on teams table inside the trigger causes 500 error
-- when executed in GoTrue's auth context. Simplified to use hardcoded team ID.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_team_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, team_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'colaborador',
    default_team_id
  );

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (default_team_id, NEW.id, 'colaborador')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
