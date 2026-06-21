-- Migration 008: Add missing insert policy for notifications

CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (true);
