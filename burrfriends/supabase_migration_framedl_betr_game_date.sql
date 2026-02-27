-- Phase 12.1: FRAMEDL BETR rebrand - add game_date to rounds
-- Migration #44
-- Run AFTER all previous migrations (see Infrastructure → Supabase → Running migrations)

-- Add game_date column to rounds table (the Framedl puzzle date for this round)
ALTER TABLE poker.remix_betr_rounds
  ADD COLUMN IF NOT EXISTS game_date DATE;

COMMENT ON COLUMN poker.remix_betr_rounds.game_date IS
  'The Framedl puzzle date for this round (YYYY-MM-DD). Submissions must match this date.';

-- Clear existing scores since scoring logic is inverting (high→low becomes low→high best)
-- Old REMIX BETR scores are not compatible with new FRAMEDL BETR scoring
TRUNCATE poker.remix_betr_scores;
TRUNCATE poker.remix_betr_leaderboard_cache;
