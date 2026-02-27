-- Migration: Add prize configuration columns to burrfriends_games
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- This adds prize_amounts, prize_currency, number_of_winners, and Last Person Standing Award columns for prize-based games

-- Add prize configuration fields to burrfriends_games
ALTER TABLE poker.burrfriends_games
ADD COLUMN IF NOT EXISTS prize_amounts numeric[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS prize_currency text DEFAULT 'BETR',
ADD COLUMN IF NOT EXISTS number_of_winners integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_person_standing_fid bigint DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_person_standing_award_amount numeric DEFAULT NULL;

-- Add index for filtering by prize configuration
CREATE INDEX IF NOT EXISTS burrfriends_games_number_of_winners_idx 
  ON poker.burrfriends_games (number_of_winners);

-- Comments
COMMENT ON COLUMN poker.burrfriends_games.prize_amounts IS 'Array of prize amounts in BETR (e.g., [3000000, 2000000, 1000000] for top 3)';
COMMENT ON COLUMN poker.burrfriends_games.prize_currency IS 'Currency for prizes (default: BETR)';
COMMENT ON COLUMN poker.burrfriends_games.number_of_winners IS 'Number of winners (must match prize_amounts array length)';
COMMENT ON COLUMN poker.burrfriends_games.last_person_standing_fid IS 'FID of player who won Betr Believer Last Person Standing Award (Scheduled games only)';
COMMENT ON COLUMN poker.burrfriends_games.last_person_standing_award_amount IS 'Amount of Last Person Standing Award in BETR';
