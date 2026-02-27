-- Phase 23.1: Add Q3 score columns for Superbowl Squares
-- Run this in Supabase SQL Editor

-- Add Q3 score columns
ALTER TABLE poker.superbowl_squares_games
ADD COLUMN IF NOT EXISTS score_q3_team1 int,
ADD COLUMN IF NOT EXISTS score_q3_team2 int;

-- Update settlement quarter CHECK constraint to include 'q3' and remove 'q2'
ALTER TABLE poker.superbowl_squares_settlements
DROP CONSTRAINT IF EXISTS superbowl_squares_settlements_quarter_check;

ALTER TABLE poker.superbowl_squares_settlements
ADD CONSTRAINT superbowl_squares_settlements_quarter_check
CHECK (quarter IN ('q1', 'halftime', 'q3', 'final'));

-- Verify columns added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'poker' 
AND table_name = 'superbowl_squares_games'
AND column_name LIKE 'score%'
ORDER BY column_name;
