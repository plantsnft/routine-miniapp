-- JENGA V2 Phase 1: last_placement_at for 10s-after-placement handoff
-- Run in Supabase SQL Editor.

ALTER TABLE poker.jenga_games
  ADD COLUMN IF NOT EXISTS last_placement_at timestamptz;

COMMENT ON COLUMN poker.jenga_games.last_placement_at IS 'Set on each successful place (v2). Used for 10s handoff: next player may touch or 10s elapse to start their turn.';
