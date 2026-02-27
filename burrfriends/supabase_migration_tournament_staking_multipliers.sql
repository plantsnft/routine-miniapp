-- Migration: Add tournament staking multiplier flags to burrfriends_games
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- This adds apply_staking_multipliers and double_payout_if_bb columns for tournament prize payouts

-- Add tournament staking multiplier flags to burrfriends_games
ALTER TABLE poker.burrfriends_games
ADD COLUMN IF NOT EXISTS apply_staking_multipliers boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS double_payout_if_bb boolean DEFAULT false;

-- Add constraint: both flags cannot be true simultaneously
ALTER TABLE poker.burrfriends_games
ADD CONSTRAINT check_multiplier_exclusivity 
CHECK (NOT (apply_staking_multipliers = true AND double_payout_if_bb = true));

-- Comments
COMMENT ON COLUMN poker.burrfriends_games.apply_staking_multipliers IS 'Apply staking tier multipliers (1x-5x) for tournament prize payouts. Default: true. Mutually exclusive with double_payout_if_bb.';
COMMENT ON COLUMN poker.burrfriends_games.double_payout_if_bb IS 'Double payout if Betr Believer (50M+ staked) for tournament prize payouts. Default: false. Mutually exclusive with apply_staking_multipliers.';
