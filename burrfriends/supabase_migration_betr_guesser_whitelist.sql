-- Migration #81: BETR GUESSER invite-only (whitelist 6 FIDs)
-- Phase 13.9. When whitelist_fids is set, only these 6 FIDs can submit; they bypass registration and staking.
-- Run after supabase_migration_betr_guesser.sql. Existing rows remain NULL.

ALTER TABLE poker.betr_guesser_games
  ADD COLUMN IF NOT EXISTS whitelist_fids bigint[];

-- Enforce exactly 6 FIDs when set (NULL allowed)
ALTER TABLE poker.betr_guesser_games
  DROP CONSTRAINT IF EXISTS betr_guesser_games_whitelist_fids_length;
ALTER TABLE poker.betr_guesser_games
  ADD CONSTRAINT betr_guesser_games_whitelist_fids_length
  CHECK (whitelist_fids IS NULL OR array_length(whitelist_fids, 1) = 6);
