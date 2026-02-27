-- Phase 39 quote-cast import: visibility on art_contest_submissions ('gallery' | 'backup').
-- Gallery/leaderboard and winner picker return only visibility = 'gallery'.
-- Run after supabase_migration_art_contest.sql.

SET search_path = poker;

ALTER TABLE poker.art_contest_submissions
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'gallery'
  CHECK (visibility IN ('gallery', 'backup'));

COMMENT ON COLUMN poker.art_contest_submissions.visibility IS 'gallery = shown in public gallery and winner picker; backup = stored only';

NOTIFY pgrst, 'reload schema';
