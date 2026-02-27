-- Clear FRAMEDL BETR (remix_betr) game history only. Super Bowl games are NOT touched.
-- Run this in Supabase SQL Editor (poker schema / same project as burrfriends).
-- Tables cleared: rounds, scores, settlements, leaderboard cache.

BEGIN;

TRUNCATE poker.remix_betr_settlements;
TRUNCATE poker.remix_betr_scores;
TRUNCATE poker.remix_betr_leaderboard_cache;
TRUNCATE poker.remix_betr_rounds;

COMMIT;
