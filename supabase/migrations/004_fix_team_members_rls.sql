-- Migration 004: Fix infinite recursion in team_members RLS

DROP POLICY IF EXISTS team_members_select ON team_members;
DROP POLICY IF EXISTS team_members_insert ON team_members;
DROP POLICY IF EXISTS team_members_delete ON team_members;

-- Simple policies without self-references
-- All authenticated users can view team members
CREATE POLICY team_members_select ON team_members
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admins can add members (checks via profiles role)
CREATE POLICY team_members_insert ON team_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'jefatura')
    )
  );

-- Admins can remove, users can leave themselves
CREATE POLICY team_members_delete ON team_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'jefatura')
    )
    OR user_id = auth.uid()
  );
