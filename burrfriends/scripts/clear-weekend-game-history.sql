-- Clear WEEKEND GAME (3D Remix / REMIX 3D Tunnel Racer) history only.
-- No other games are touched (FRAMEDL, poker, BUDDY UP, etc. are unchanged).
-- Run this in Supabase SQL Editor (poker schema / same project as burrfriends).
-- Tables cleared: winner_picks, settlements, rounds, scores, leaderboard cache.

BEGIN;

-- Order: child tables first (winner_picks references rounds), then rounds, then others.
TRUNCATE poker.weekend_game_winner_picks;
TRUNCATE poker.weekend_game_settlements;
TRUNCATE poker.weekend_game_rounds;
TRUNCATE poker.weekend_game_scores;
TRUNCATE poker.weekend_game_leaderboard_cache;

COMMIT;
