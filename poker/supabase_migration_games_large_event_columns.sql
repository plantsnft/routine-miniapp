-- Migration: Add game_type and registration_close_minutes columns to poker.games
-- Idempotent: Safe to rerun multiple times
-- Purpose: Support large_event game type with time-based registration windows

-- Add game_type column if it doesn't exist
ALTER TABLE poker.games 
  ADD COLUMN IF NOT EXISTS game_type text NOT NULL DEFAULT 'standard';

-- Add registration_close_minutes column if it doesn't exist
ALTER TABLE poker.games 
  ADD COLUMN IF NOT EXISTS registration_close_minutes integer NOT NULL DEFAULT 0;

-- Add check constraint for game_type (only allow 'standard' or 'large_event')
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'games_game_type_check' 
    AND conrelid = 'poker.games'::regclass
  ) THEN
    ALTER TABLE poker.games 
      ADD CONSTRAINT games_game_type_check 
      CHECK (game_type IN ('standard', 'large_event'));
  END IF;
END $$;

-- Add check constraint for registration_close_minutes (must be >= 0)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'games_registration_close_minutes_check' 
    AND conrelid = 'poker.games'::regclass
  ) THEN
    ALTER TABLE poker.games 
      ADD CONSTRAINT games_registration_close_minutes_check 
      CHECK (registration_close_minutes >= 0);
  END IF;
END $$;

-- Refresh PostgREST schema cache so the new columns are immediately available
-- This is safe to run multiple times
SELECT pg_notify('pgrst', 'reload schema');

-- Verify columns were added (optional, for manual verification)
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'poker' AND table_name = 'games'
--   AND column_name IN ('game_type', 'registration_close_minutes')
-- ORDER BY ordinal_position;

