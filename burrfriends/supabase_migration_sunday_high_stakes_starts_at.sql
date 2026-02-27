-- Phase 42: Add optional starts_at to sunday_high_stakes.
-- When set, submissions allowed only from starts_at until 30 minutes after starts_at.
-- Run after supabase_migration_sunday_high_stakes_qc_url.sql (#90).

SET search_path = poker;

ALTER TABLE poker.sunday_high_stakes ADD COLUMN IF NOT EXISTS starts_at timestamptz;

COMMENT ON COLUMN poker.sunday_high_stakes.starts_at IS 'Optional start time (UTC); when set, submissions allowed only from starts_at until starts_at + 30 minutes';

NOTIFY pgrst, 'reload schema';
