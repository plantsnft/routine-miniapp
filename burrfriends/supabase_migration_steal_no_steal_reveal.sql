-- Phase 17 (YOU WIN variant): Add outcome_revealed_at for admin-controlled reveal.
-- When briefcase_label = 'YOU WIN', outcome is hidden until admin reveals.
-- Run after supabase_migration_steal_no_steal_special.sql (94).

ALTER TABLE poker.steal_no_steal_matches
  ADD COLUMN IF NOT EXISTS outcome_revealed_at timestamptz;

COMMENT ON COLUMN poker.steal_no_steal_matches.outcome_revealed_at IS
  'Phase 17 YOU WIN: When set, outcome is shown to players. When NULL and briefcase_label = YOU WIN, outcome hidden until admin reveals.';
