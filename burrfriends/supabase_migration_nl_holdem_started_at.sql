-- Phase 40 (NL HOLDEM): Add started_at to nl_holdem_games for time-based blind levels.
-- Set when status becomes 'in_progress'. Run after supabase_migration_nl_holdem_play.sql (#87).
-- Migration #95.

SET search_path = poker;

ALTER TABLE poker.nl_holdem_games ADD COLUMN IF NOT EXISTS started_at timestamptz;

COMMENT ON COLUMN poker.nl_holdem_games.started_at IS 'Phase 40: Set when status becomes in_progress; used for blind level and nextBlindRaiseAt';

NOTIFY pgrst, 'reload schema';
