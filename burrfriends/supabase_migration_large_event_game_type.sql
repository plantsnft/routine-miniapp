-- Migration: Add Large Event game type support
-- Adds game_type and registration_close_minutes columns to poker.games
-- Allows up to 99 participants for large_event games (vs 2-10 for standard)

-- Add game_type column (default 'standard' for existing games)
ALTER TABLE poker.games 
ADD COLUMN IF NOT EXISTS game_type text NOT NULL DEFAULT 'standard';

-- Add registration_close_minutes column (default 0 for existing games)
ALTER TABLE poker.games 
ADD COLUMN IF NOT EXISTS registration_close_minutes integer NOT NULL DEFAULT 0;

-- Add check constraint for game_type (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'games_game_type_check'
  ) THEN
    ALTER TABLE poker.games
    ADD CONSTRAINT games_game_type_check
    CHECK (game_type IN ('standard', 'large_event'));
  END IF;
END $$;

-- Note: We do NOT change the existing max_participants constraint at the DB level
-- The application code will enforce:
-- - standard: 2-10 participants (existing behavior)
-- - large_event: 2-99 participants
-- This avoids breaking existing games and keeps flexibility

-- Comments
COMMENT ON COLUMN poker.games.game_type IS 'Game type: standard (2-10 players, registration closes at start) or large_event (2-99 players, registration closes 15 min after start)';
COMMENT ON COLUMN poker.games.registration_close_minutes IS 'Minutes after game start when registration closes. For large_event: 15. For standard: 0 (closes at start).';

