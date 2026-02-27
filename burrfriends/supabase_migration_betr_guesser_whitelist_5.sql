-- Migration: BETR GUESSER invite-only whitelist — change from 6 to 5 FIDs
-- Run after supabase_migration_betr_guesser_whitelist.sql (#81). Drops the length-6 constraint and enforces exactly 5 FIDs when set.

ALTER TABLE poker.betr_guesser_games
  DROP CONSTRAINT IF EXISTS betr_guesser_games_whitelist_fids_length;
ALTER TABLE poker.betr_guesser_games
  ADD CONSTRAINT betr_guesser_games_whitelist_fids_length
  CHECK (whitelist_fids IS NULL OR array_length(whitelist_fids, 1) = 5);
