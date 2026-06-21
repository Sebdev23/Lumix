-- Migration 005: Fix teams_select to allow creator to see their new team

DROP POLICY IF EXISTS teams_select ON teams;
CREATE POLICY teams_select ON teams
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_id = teams.id AND user_id = auth.uid())
    OR created_by = auth.uid()
  );
