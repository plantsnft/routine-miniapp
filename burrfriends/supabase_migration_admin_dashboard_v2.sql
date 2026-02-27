-- Admin Dashboard v2 - Broadcast history table
-- Run in Supabase SQL Editor. Creates poker.admin_broadcasts.
-- Migration #41 for Phase 18.1 Admin Dashboard v2.

-- ============================================================================
-- poker.admin_broadcasts – Broadcast history for admin dashboard
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_fid bigint NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  target_url text,
  staking_min_amount bigint,
  participation_filter text,
  recipients_count int NOT NULL DEFAULT 0,
  sent_at timestamptz DEFAULT now()
);

ALTER TABLE poker.admin_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_broadcasts" ON poker.admin_broadcasts;
CREATE POLICY "no_direct_access_broadcasts"
  ON poker.admin_broadcasts
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_sent_at ON poker.admin_broadcasts(sent_at DESC);

COMMENT ON TABLE poker.admin_broadcasts IS 'Broadcast history for admin dashboard (Phase 18.1)';
