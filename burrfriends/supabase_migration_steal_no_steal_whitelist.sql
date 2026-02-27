-- Phase 17 (STEAL OR NO STEAL): Invite-only — whitelist 1–99 FIDs
-- Migration #93. When whitelist_fids is set, only these FIDs can sign up; they bypass registration and staking.
-- Run after supabase_migration_feedback.sql (92). Existing rows remain NULL.

ALTER TABLE poker.steal_no_steal_games
  ADD COLUMN IF NOT EXISTS whitelist_fids bigint[];

ALTER TABLE poker.steal_no_steal_games
  DROP CONSTRAINT IF EXISTS steal_no_steal_games_whitelist_fids_length;
ALTER TABLE poker.steal_no_steal_games
  ADD CONSTRAINT steal_no_steal_games_whitelist_fids_length
  CHECK (whitelist_fids IS NULL OR (array_length(whitelist_fids, 1) >= 1 AND array_length(whitelist_fids, 1) <= 99));

COMMENT ON COLUMN poker.steal_no_steal_games.whitelist_fids IS 'Invite-only: only these FIDs can sign up; they bypass registration and staking. Length 1–99 when set.';
