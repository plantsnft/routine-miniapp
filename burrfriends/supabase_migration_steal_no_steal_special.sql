-- Phase 17 special: STEAL OR NO STEAL — briefcase label, 24h decision window
-- Migration #94. Run after supabase_migration_steal_no_steal_whitelist.sql.

-- Add optional briefcase label to matches (e.g. "YOU LOSE"); when set, amount may be 0
ALTER TABLE poker.steal_no_steal_matches
  ADD COLUMN IF NOT EXISTS briefcase_label text;

COMMENT ON COLUMN poker.steal_no_steal_matches.briefcase_label IS
  'Optional label shown instead of amount (Phase 17 special); when set, holder may see custom image (e.g. youlose.png).';

-- Relax decision_time_seconds: allow 0 (no negotiation) and up to 24h (86400)
ALTER TABLE poker.steal_no_steal_games
  DROP CONSTRAINT IF EXISTS steal_no_steal_games_decision_time_seconds_check;

ALTER TABLE poker.steal_no_steal_games
  ADD CONSTRAINT steal_no_steal_games_decision_time_seconds_check
  CHECK (decision_time_seconds >= 0 AND decision_time_seconds <= 86400);

-- Relax decision_window_seconds: allow up to 24h (86400)
ALTER TABLE poker.steal_no_steal_games
  DROP CONSTRAINT IF EXISTS steal_no_steal_games_decision_window_seconds_check;

ALTER TABLE poker.steal_no_steal_games
  ADD CONSTRAINT steal_no_steal_games_decision_window_seconds_check
  CHECK (decision_window_seconds >= 60 AND decision_window_seconds <= 86400);
