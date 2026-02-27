-- JENGA V2 Phase 6: game_ended_reason — add 'collapse' and 'tower_fell' for physics-driven game over
-- Run in Supabase SQL Editor. Requires last_placement_at (supabase_migration_jenga_v2_phase1.sql).
--
-- If DROP fails (constraint named differently), find it: SELECT conname FROM pg_constraint c
-- JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'jenga_games' AND c.contype = 'c';
-- Then: ALTER TABLE poker.jenga_games DROP CONSTRAINT <conname>;

-- Drop existing CHECK so we can extend allowed values (collapse = replace would-fall or physics; tower_fell = move caused fall)
ALTER TABLE poker.jenga_games DROP CONSTRAINT IF EXISTS jenga_games_game_ended_reason_check;

ALTER TABLE poker.jenga_games
  ADD CONSTRAINT jenga_games_game_ended_reason_check
  CHECK (
    game_ended_reason IS NULL
    OR game_ended_reason IN (
      'last_player_standing',
      'all_eliminated',
      'admin_settled',
      'collapse',
      'tower_fell'
    )
  );

COMMENT ON COLUMN poker.jenga_games.game_ended_reason IS 'Why the game ended: last_player_standing, all_eliminated, admin_settled, collapse (physics/replace would-fall), tower_fell (move caused fall).';
