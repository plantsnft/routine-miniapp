-- Migration: Add staking requirement columns to burrfriends_games
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- This adds staking_min_amount and staking_token_contract columns for token gating

-- Add staking requirement fields
ALTER TABLE poker.burrfriends_games
ADD COLUMN IF NOT EXISTS staking_min_amount numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS staking_token_contract text DEFAULT NULL;

-- Add index for filtering games by staking requirement
CREATE INDEX IF NOT EXISTS burrfriends_games_staking_min_amount_idx 
  ON poker.burrfriends_games (staking_min_amount) 
  WHERE staking_min_amount IS NOT NULL;

-- Comments
COMMENT ON COLUMN poker.burrfriends_games.staking_min_amount IS 'Minimum BETR staked amount required to join (1M, 5M, 25M, 50M, 200M, or NULL for none)';
COMMENT ON COLUMN poker.burrfriends_games.staking_token_contract IS 'Token contract address for staking requirement (BETR token address: 0x051024b653e8ec69e72693f776c41c2a9401fb07, or NULL if not using staking)';

-- Note: staking_pool_id is not needed since we use a single BETR staking pool
-- The staking contract address is: 0x808a12766632b456a74834f2fa8ae06dfc7482f1
