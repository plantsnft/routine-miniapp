-- Admin Dashboard - Notification preferences table
-- Run in Supabase SQL Editor. Creates poker.admin_notification_prefs.
-- Migration #40 for Phase 18 Admin Dashboard.

-- ============================================================================
-- poker.admin_notification_prefs – Admin self-notification settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.admin_notification_prefs (
  fid bigint PRIMARY KEY,
  notify_ready_to_settle boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE poker.admin_notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_admin_prefs" ON poker.admin_notification_prefs;
CREATE POLICY "no_direct_access_admin_prefs"
  ON poker.admin_notification_prefs
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.admin_notification_prefs IS 'Admin notification preferences for self-alerts (Phase 18)';
