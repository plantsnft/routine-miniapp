-- Start conditions for BETR games (THE MOLE, BUDDY UP, BETR GUESSER)
-- Run after supabase_migration_betr_games_staking_token_gate.sql
-- Adds min_players_to_start, signup_closes_at, start_condition so games can start when N sign up and/or at a time (whichever first).

-- mole_games
ALTER TABLE poker.mole_games
  ADD COLUMN IF NOT EXISTS min_players_to_start int DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS signup_closes_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS start_condition text DEFAULT NULL;

ALTER TABLE poker.mole_games
  DROP CONSTRAINT IF EXISTS mole_games_start_condition_check;
ALTER TABLE poker.mole_games
  ADD CONSTRAINT mole_games_start_condition_check
  CHECK (start_condition IS NULL OR start_condition IN ('min_players', 'at_time', 'whichever_first'));

COMMENT ON COLUMN poker.mole_games.min_players_to_start IS 'Start when this many signups (see start_condition).';
COMMENT ON COLUMN poker.mole_games.signup_closes_at IS 'At this time signups close / game can auto-start (see start_condition).';
COMMENT ON COLUMN poker.mole_games.start_condition IS 'min_players | at_time | whichever_first.';

-- buddy_up_games
ALTER TABLE poker.buddy_up_games
  ADD COLUMN IF NOT EXISTS min_players_to_start int DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS signup_closes_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS start_condition text DEFAULT NULL;

ALTER TABLE poker.buddy_up_games
  DROP CONSTRAINT IF EXISTS buddy_up_games_start_condition_check;
ALTER TABLE poker.buddy_up_games
  ADD CONSTRAINT buddy_up_games_start_condition_check
  CHECK (start_condition IS NULL OR start_condition IN ('min_players', 'at_time', 'whichever_first'));

COMMENT ON COLUMN poker.buddy_up_games.min_players_to_start IS 'Start when this many signups (see start_condition).';
COMMENT ON COLUMN poker.buddy_up_games.signup_closes_at IS 'At this time signups close / game can auto-start (see start_condition).';
COMMENT ON COLUMN poker.buddy_up_games.start_condition IS 'min_players | at_time | whichever_first.';

-- betr_guesser_games (guesses_close_at already exists; add min_players_to_start and start_condition)
ALTER TABLE poker.betr_guesser_games
  ADD COLUMN IF NOT EXISTS min_players_to_start int DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS start_condition text DEFAULT NULL;

ALTER TABLE poker.betr_guesser_games
  DROP CONSTRAINT IF EXISTS betr_guesser_games_start_condition_check;
ALTER TABLE poker.betr_guesser_games
  ADD CONSTRAINT betr_guesser_games_start_condition_check
  CHECK (start_condition IS NULL OR start_condition IN ('at_time', 'min_players', 'whichever_first'));

COMMENT ON COLUMN poker.betr_guesser_games.min_players_to_start IS 'Close when this many guesses (see start_condition).';
COMMENT ON COLUMN poker.betr_guesser_games.start_condition IS 'at_time | min_players | whichever_first.';
