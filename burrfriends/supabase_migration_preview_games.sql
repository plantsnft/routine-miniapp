-- Migration #52: Preview Games
-- Adds is_preview column to 7 game tables (excludes superbowl_squares_games and superbowl_props_games).
-- Default false = all existing games are unaffected (they stay live).
-- When is_preview = true, the game is hidden from the homepage and only visible in the admin dashboard.

ALTER TABLE poker.burrfriends_games ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;
ALTER TABLE poker.betr_guesser_games ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;
ALTER TABLE poker.buddy_up_games ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;
ALTER TABLE poker.jenga_games ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;
ALTER TABLE poker.mole_games ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;
ALTER TABLE poker.steal_no_steal_games ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;
ALTER TABLE poker.remix_betr_rounds ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;
