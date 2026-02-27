-- STEAL OR NO STEAL - Add bye_player_fid to rounds table
-- Run after supabase_migration_steal_no_steal.sql
-- Tracks which player got a bye (advances to next round without playing)

ALTER TABLE poker.steal_no_steal_rounds
ADD COLUMN IF NOT EXISTS bye_player_fid bigint;

COMMENT ON COLUMN poker.steal_no_steal_rounds.bye_player_fid IS 'FID of player who got a bye this round (advances to next round without playing). NULL if no bye.';
