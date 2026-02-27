-- Migration #80: THE MOLE reserved spots (tournament players only)
-- Adds eligible_players_source to mole_games.
-- NULL = open to all registered (current behavior); 'tournament_alive' = only current tournament players for the game's community.
-- Run after supabase_migration_community.sql (64). Existing rows remain NULL.

ALTER TABLE poker.mole_games ADD COLUMN IF NOT EXISTS eligible_players_source text;
