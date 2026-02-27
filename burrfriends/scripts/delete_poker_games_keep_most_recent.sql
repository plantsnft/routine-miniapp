-- Delete all poker games (burrfriends) from history/homepage EXCEPT the most recent one
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon/sql
--
-- What this does:
-- 1. Keeps the single most recent game (by inserted_at DESC).
-- 2. Deletes all other rows from poker.burrfriends_games.
-- 3. Cascades automatically remove related rows in:
--    - poker.burrfriends_participants (ON DELETE CASCADE)
--    - poker.burrfriends_game_results (ON DELETE CASCADE)
--    - poker.poker_sunday_high_stakes_signups (ON DELETE CASCADE)
--
-- Step 1: Preview which game will be KEPT (run this first to verify)
-- SELECT id, name, status, inserted_at
-- FROM poker.burrfriends_games
-- ORDER BY inserted_at DESC
-- LIMIT 1;

-- Step 2: Delete all games except the most recent (by inserted_at)
DELETE FROM poker.burrfriends_games
WHERE id NOT IN (
  SELECT id
  FROM poker.burrfriends_games
  ORDER BY inserted_at DESC
  LIMIT 1
);

-- Note: poker.notification_events has game_id with no FK; it can reference any game type.
-- Orphan events for deleted burrfriends games are harmless. Do not delete by "NOT IN burrfriends_games"
-- or you would remove events for Buddy Up, Mole, etc.
