-- Migration #64: Multi-community support (Phase 36)
-- Adds `community` column to all game tables and registration/tournament tables.
-- BETR is the default — all existing rows remain unaffected.
--
-- ⚠️  Run this migration BEFORE deploying Phase 36 code.
--     If code is deployed first, active-game routes will return PostgREST 400 errors.
--
-- Valid values: 'betr' (default) | 'minted_merch'

SET search_path = poker;

-- === Game tables ===

ALTER TABLE poker.burrfriends_games
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.betr_guesser_games
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.buddy_up_games
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.jenga_games
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.mole_games
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.steal_no_steal_games
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.remix_betr_rounds
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.weekend_game_rounds
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.bullied_games
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

ALTER TABLE poker.in_or_out_games
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

-- === Registration table ===
-- Drop the old unique-on-fid constraint (if it exists) so we can have one row per (fid, community).
-- Then add community column and new unique constraint.

ALTER TABLE poker.betr_games_registrations
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

-- Drop old unique constraint on fid alone (name may vary; use IF EXISTS variants)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'poker'
      AND table_name = 'betr_games_registrations'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'betr_games_registrations_fid_key'
  ) THEN
    ALTER TABLE poker.betr_games_registrations
      DROP CONSTRAINT betr_games_registrations_fid_key;
  END IF;
END $$;

-- Add new unique constraint on (fid, community)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'poker'
      AND table_name = 'betr_games_registrations'
      AND constraint_name = 'betr_games_registrations_fid_community_key'
  ) THEN
    ALTER TABLE poker.betr_games_registrations
      ADD CONSTRAINT betr_games_registrations_fid_community_key UNIQUE (fid, community);
  END IF;
END $$;

-- === Tournament players table ===

ALTER TABLE poker.betr_games_tournament_players
  ADD COLUMN IF NOT EXISTS community TEXT NOT NULL DEFAULT 'betr'
    CHECK (community IN ('betr', 'minted_merch'));

-- Indexes for performance on community-filtered queries
CREATE INDEX IF NOT EXISTS idx_buddy_up_games_community ON poker.buddy_up_games (community);
CREATE INDEX IF NOT EXISTS idx_betr_guesser_games_community ON poker.betr_guesser_games (community);
CREATE INDEX IF NOT EXISTS idx_mole_games_community ON poker.mole_games (community);
CREATE INDEX IF NOT EXISTS idx_jenga_games_community ON poker.jenga_games (community);
CREATE INDEX IF NOT EXISTS idx_steal_no_steal_games_community ON poker.steal_no_steal_games (community);
CREATE INDEX IF NOT EXISTS idx_remix_betr_rounds_community ON poker.remix_betr_rounds (community);
CREATE INDEX IF NOT EXISTS idx_weekend_game_rounds_community ON poker.weekend_game_rounds (community);
CREATE INDEX IF NOT EXISTS idx_bullied_games_community ON poker.bullied_games (community);
CREATE INDEX IF NOT EXISTS idx_in_or_out_games_community ON poker.in_or_out_games (community);
CREATE INDEX IF NOT EXISTS idx_burrfriends_games_community ON poker.burrfriends_games (community);
CREATE INDEX IF NOT EXISTS idx_betr_games_registrations_community ON poker.betr_games_registrations (community);
CREATE INDEX IF NOT EXISTS idx_betr_games_tournament_players_community ON poker.betr_games_tournament_players (community);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
