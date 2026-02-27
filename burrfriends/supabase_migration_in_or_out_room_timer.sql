-- Phase 35 (IN OR OUT): Add room_timer_ends_at for display countdown (admin-adjustable).
-- Migration #62. Run after supabase_migration_in_or_out.sql (#61).
-- Run before deploying room-timer code. Includes pg_notify so PostgREST sees the new column.

ALTER TABLE poker.in_or_out_games ADD COLUMN IF NOT EXISTS room_timer_ends_at timestamptz;

-- Refresh PostgREST schema cache so the new column is immediately available
SELECT pg_notify('pgrst', 'reload schema');
