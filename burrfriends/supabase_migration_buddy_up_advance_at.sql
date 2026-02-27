-- =============================================================================
-- RUN IN SUPABASE SQL EDITOR:
-- 1. Open this file, select ALL (Ctrl+A), then COPY.
-- 2. In Supabase: SQL Editor -> New query -> PASTE -> Run.
-- Do NOT paste the file path (e.g. burrfriends/supabase_...) into the editor.
-- =============================================================================

-- BUDDY UP: add advance_at for in-round countdown ("Advancing in X:XX")
-- Optional. When admin completes a round and chooses "In 1/2/3/5 min", we set advance_at = now() + seconds.
-- Players see "Advancing in M:SS" until it passes; then admin can click "Start Round" as usual.
-- Cleared when the next round is created (POST /api/buddy-up/games/[id]/rounds).

ALTER TABLE poker.buddy_up_games
  ADD COLUMN IF NOT EXISTS advance_at timestamptz;

COMMENT ON COLUMN poker.buddy_up_games.advance_at IS 'When to show "Advancing in X:XX" countdown; set on Complete round with delay, cleared when next round is created.';
