-- Migration #69: Kill or Keep — current_turn_ends_at + skip action
-- Run in Supabase SQL editor.

-- Add current_turn_ends_at to kill_or_keep_games
ALTER TABLE poker.kill_or_keep_games
  ADD COLUMN IF NOT EXISTS current_turn_ends_at timestamptz NULL;

-- Extend action CHECK constraint on kill_or_keep_actions to include 'skip'
-- PostgreSQL auto-names inline CHECK constraints as <table>_<column>_check
ALTER TABLE poker.kill_or_keep_actions
  DROP CONSTRAINT IF EXISTS kill_or_keep_actions_action_check;
ALTER TABLE poker.kill_or_keep_actions
  ADD CONSTRAINT kill_or_keep_actions_action_check
  CHECK (action IN ('keep', 'kill', 'roulette', 'skip'));

NOTIFY pgrst, 'reload schema';
