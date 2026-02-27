-- Migration: Allow NULL game_date for "start when table is full" games
-- This allows games to be created without a scheduled start time
-- Games without a start time will start automatically when the table is full

-- Make game_date nullable in poker.games table
ALTER TABLE poker.games 
  ALTER COLUMN game_date DROP NOT NULL;

-- Add a comment to document the change
COMMENT ON COLUMN poker.games.game_date IS 'Game start time. NULL means game starts when table is full (no scheduled time).';
