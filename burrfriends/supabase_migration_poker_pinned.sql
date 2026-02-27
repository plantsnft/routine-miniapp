-- Migration #79: Pinned poker games
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- Adds is_pinned to burrfriends_games so admins can pin games to show first in BETR POKER list

ALTER TABLE poker.burrfriends_games
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

COMMENT ON COLUMN poker.burrfriends_games.is_pinned IS 'When true, game appears first in BETR POKER section on homepage. Admin-only toggle.';
