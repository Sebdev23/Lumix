-- OPERA AI - Database Schema
-- Migration 001: Initial schema

-- Teams (created first to avoid circular FK)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'colaborador' CHECK (role IN ('admin', 'jefatura', 'supervisor', 'colaborador', 'invitado')),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK on teams.created_by after profiles exists
ALTER TABLE teams
  ADD CONSTRAINT fk_teams_created_by
  FOREIGN KEY (created_by) REFERENCES profiles(id);

-- Team members (many-to-many with role at team level)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'colaborador' CHECK (role IN ('admin', 'jefatura', 'supervisor', 'colaborador', 'invitado')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Activities
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'en_proceso', 'bloqueado', 'falta_informacion', 'esperando_aprobacion', 'completado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date TIMESTAMPTZ,
  dependencies UUID[] DEFAULT '{}',
  observations TEXT DEFAULT '',
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Errors (bitacora)
CREATE TABLE errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('baja', 'media', 'alta', 'critica')),
  responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'en_revision', 'resuelto', 'cerrado')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time TIME NOT NULL DEFAULT CURRENT_TIME,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meetings
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  audio_url TEXT,
  transcript TEXT,
  minutes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meeting participants
CREATE TABLE meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attended BOOLEAN DEFAULT false,
  UNIQUE(meeting_id, user_id)
);

-- Messages (chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT CHECK (category IN ('actividad', 'error', 'reunion', 'recordatorio', 'nota', 'consulta')),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('activity_blocked', 'missing_info', 'critical_error', 'deadline_soon', 'overload')),
  read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_activities_team ON activities(team_id);
CREATE INDEX idx_activities_responsible ON activities(responsible_id);
CREATE INDEX idx_activities_status ON activities(status);
CREATE INDEX idx_errors_team ON errors(team_id);
CREATE INDEX idx_errors_severity ON errors(severity);
CREATE INDEX idx_errors_status ON errors(status);
CREATE INDEX idx_messages_team ON messages(team_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id, read);
CREATE INDEX idx_meetings_team ON meetings(team_id);

-- RLS Policies (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own profile, team members can read each other
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (true);

CREATE POLICY profiles_insert ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Teams: members can read their own teams
CREATE POLICY teams_select ON teams
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = teams.id AND user_id = auth.uid())
  );

-- Messages: team members can read and send messages
CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = messages.team_id AND user_id = auth.uid())
  );

CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (SELECT 1 FROM team_members WHERE team_id = messages.team_id AND user_id = auth.uid())
  );

-- Activities: team members can read, members with roles can manage
CREATE POLICY activities_select ON activities
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = activities.team_id AND user_id = auth.uid())
  );

CREATE POLICY activities_insert ON activities
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = activities.team_id AND user_id = auth.uid())
  );

CREATE POLICY activities_update ON activities
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = activities.team_id AND user_id = auth.uid())
  );

-- Errors: team members can read and create
CREATE POLICY errors_select ON errors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = errors.team_id AND user_id = auth.uid())
  );

CREATE POLICY errors_insert ON errors
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = errors.team_id AND user_id = auth.uid())
  );

CREATE POLICY errors_update ON errors
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = errors.team_id AND user_id = auth.uid())
  );

-- Meetings: team members can read and create
CREATE POLICY meetings_select ON meetings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = meetings.team_id AND user_id = auth.uid())
  );

CREATE POLICY meetings_insert ON meetings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = meetings.team_id AND user_id = auth.uid())
  );

-- Notifications: users can only see their own
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
