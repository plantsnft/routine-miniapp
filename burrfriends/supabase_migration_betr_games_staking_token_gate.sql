-- Staking token gate for BETR games (BETR GUESSER, BUDDY UP, JENGA)
-- Run after supabase_migration_the_mole.sql
-- Adds staking_min_amount so admins can optionally require minimum BETR staked to join/play.
-- Use VALID_STAKING_THRESHOLDS (1M, 5M, 25M, 50M, 200M BETR) or NULL for no requirement.

ALTER TABLE poker.betr_guesser_games
  ADD COLUMN IF NOT EXISTS staking_min_amount numeric DEFAULT NULL;

COMMENT ON COLUMN poker.betr_guesser_games.staking_min_amount IS 'Minimum BETR staked to join/play; null = no requirement. Use VALID_STAKING_THRESHOLDS.';

ALTER TABLE poker.buddy_up_games
  ADD COLUMN IF NOT EXISTS staking_min_amount numeric DEFAULT NULL;

COMMENT ON COLUMN poker.buddy_up_games.staking_min_amount IS 'Minimum BETR staked to join/play; null = no requirement. Use VALID_STAKING_THRESHOLDS.';

ALTER TABLE poker.jenga_games
  ADD COLUMN IF NOT EXISTS staking_min_amount numeric DEFAULT NULL;

COMMENT ON COLUMN poker.jenga_games.staking_min_amount IS 'Minimum BETR staked to join/play; null = no requirement. Use VALID_STAKING_THRESHOLDS.';
