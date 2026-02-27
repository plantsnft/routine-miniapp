-- Phase 33 (BULLIED): Add room_timer_ends_at for neon countdown clock (admin-adjustable).
-- Migration #58. Run after supabase_migration_bullied_vote_reasons.sql (#57).
-- Run before deploying room-timer code. Includes pg_notify so PostgREST sees the new column.

ALTER TABLE poker.bullied_games ADD COLUMN IF NOT EXISTS room_timer_ends_at timestamptz;

-- Refresh PostgREST schema cache so the new column is immediately available
SELECT pg_notify('pgrst', 'reload schema');
