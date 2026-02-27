-- Phase 42: Add optional qc_url to sunday_high_stakes.
-- If set at contest creation, submission is valid only when submitted cast is a quote of this reference cast (parent_hash match).
-- Run after supabase_migration_sunday_high_stakes_contest.sql (#89).

SET search_path = poker;

ALTER TABLE poker.sunday_high_stakes ADD COLUMN IF NOT EXISTS qc_url text;

COMMENT ON COLUMN poker.sunday_high_stakes.qc_url IS 'Optional reference cast URL; when set, POST submit accepts only when submitted cast is a quote of this reference cast (parent_hash equals reference hash)';

NOTIFY pgrst, 'reload schema';
