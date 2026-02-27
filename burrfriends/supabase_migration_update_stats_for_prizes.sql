-- Migration: Update stats table for prize-based games (remove entry fees)
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- This removes total_entry_fees column since games have no entry fees

-- Remove total_entry_fees column (games have no entry fees)
-- Keep net_profit but it will just equal total_winnings (no fees to subtract)
ALTER TABLE poker.burrfriends_stats
DROP COLUMN IF EXISTS total_entry_fees;

-- Update net_profit calculation: net_profit = total_winnings (no entry fees)
-- This is already the case, but we can add a comment
COMMENT ON COLUMN poker.burrfriends_stats.net_profit IS 'Net profit (equals total_winnings since there are no entry fees)';
