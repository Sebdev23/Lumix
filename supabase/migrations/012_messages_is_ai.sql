-- Migration 012: Add is_ai flag to messages

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT false;
