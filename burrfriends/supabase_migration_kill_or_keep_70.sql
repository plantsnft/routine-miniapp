-- Migration #70: Kill or Keep — safe_fids (first-in-line marked safe on game start only)
-- Run in Supabase SQL editor.

ALTER TABLE poker.kill_or_keep_games
  ADD COLUMN IF NOT EXISTS safe_fids bigint[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
