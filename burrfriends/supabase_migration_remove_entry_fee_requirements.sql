-- Migration: Remove entry fee requirements from burrfriends_games
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- This sets buy_in_amount default to 0 and updates existing games to have no entry fees

-- Make buy_in_amount default to 0 (games have no entry fees)
ALTER TABLE poker.burrfriends_games
ALTER COLUMN buy_in_amount SET DEFAULT 0;

-- Update existing games to have buy_in_amount = 0 (if any exist)
UPDATE poker.burrfriends_games
SET buy_in_amount = 0
WHERE buy_in_amount IS NULL OR buy_in_amount > 0;

-- Set gating_type to 'open' for all games (no entry fees)
UPDATE poker.burrfriends_games
SET gating_type = 'open'
WHERE gating_type = 'entry_fee';
