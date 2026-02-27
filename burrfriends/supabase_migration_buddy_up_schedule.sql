-- =============================================================================
-- RUN IN SUPABASE SQL EDITOR:
-- 1. Open this file, select ALL (Ctrl+A), then COPY.
-- 2. In Supabase: SQL Editor -> New query -> PASTE -> Run.
-- Do NOT paste the file path into the editor.
-- =============================================================================

-- BUDDY UP: scheduled-game countdown ("Next BUDDY UP in 2h")
-- Single-row table. Admins set next_run_at via POST /api/buddy-up/schedule.
-- Games page shows "Next BUDDY UP in Xh Xm" when next_run_at is in the future.
-- GET /api/buddy-up/next-run returns nextRunAt (or null if in the past, and clears it).

CREATE TABLE IF NOT EXISTS poker.buddy_up_schedule (
  id int PRIMARY KEY DEFAULT 1,
  next_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_fid bigint
);

INSERT INTO poker.buddy_up_schedule (id, next_run_at, updated_at, updated_by_fid)
VALUES (1, NULL, now(), NULL)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE poker.buddy_up_schedule IS 'Singleton (id=1) for "Next BUDDY UP" scheduled time. Cleared when in the past or via admin.';
