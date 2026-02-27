-- WEEKEND GAME: picks editable until game ended
-- Add picks_locked_at to weekend_game_rounds. When set, winner picks are read-only.
-- Run in Supabase SQL Editor after supabase_migration_weekend_game.sql.

ALTER TABLE poker.weekend_game_rounds
  ADD COLUMN IF NOT EXISTS picks_locked_at timestamptz NULL;

COMMENT ON COLUMN poker.weekend_game_rounds.picks_locked_at IS 'When set, winner picks for this round are read-only (game ended).';

-- Backfill: existing settled rounds are treated as locked
UPDATE poker.weekend_game_rounds
SET picks_locked_at = COALESCE(settled_at, closed_at, now())
WHERE status = 'settled' AND picks_locked_at IS NULL;
