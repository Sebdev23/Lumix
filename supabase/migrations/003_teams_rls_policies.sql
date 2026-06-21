-- Migration 003: Add missing RLS policies

-- TEAMS policies (only SELECT existed, missing INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS teams_select ON teams;
CREATE POLICY teams_select ON teams
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = teams.id AND user_id = auth.uid())
  );

CREATE POLICY teams_insert ON teams
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY teams_update ON teams
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = teams.id AND user_id = auth.uid() AND role IN ('admin', 'jefatura')
    )
  );

-- TEAM MEMBERS policies (RLS was enabled but NO policies existed!)
DROP POLICY IF EXISTS team_members_select ON team_members;
CREATE POLICY team_members_select ON team_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY team_members_insert ON team_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = team_members.team_id AND user_id = auth.uid() AND role IN ('admin', 'jefatura')
    )
    OR auth.uid() = team_members.user_id
  );

CREATE POLICY team_members_delete ON team_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = team_members.team_id AND user_id = auth.uid() AND role IN ('admin', 'jefatura')
    )
    OR user_id = auth.uid()
  );
