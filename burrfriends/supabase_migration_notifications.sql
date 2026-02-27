-- Migration: Add push notification tables with multi-token support
-- Run this in Supabase SQL Editor
--
-- IMPORTANT: This schema supports multiple tokens per FID (different clients/apps can have different tokens)
-- Each subscription is uniquely identified by (fid, notification_url, token)

-- Table for user notification subscriptions
CREATE TABLE IF NOT EXISTS poker.notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fid bigint NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  notification_url text NOT NULL,
  token text NOT NULL,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fid, notification_url, token)
);

COMMENT ON TABLE poker.notification_subscriptions IS 'User notification subscription preferences and tokens - supports multiple tokens per FID';
COMMENT ON COLUMN poker.notification_subscriptions.fid IS 'Farcaster user ID';
COMMENT ON COLUMN poker.notification_subscriptions.enabled IS 'Whether notifications are enabled for this subscription';
COMMENT ON COLUMN poker.notification_subscriptions.notification_url IS 'Notification endpoint URL (unique per client/app)';
COMMENT ON COLUMN poker.notification_subscriptions.token IS 'Notification token for this subscription';
COMMENT ON COLUMN poker.notification_subscriptions.provider IS 'Notification provider (farcaster, etc.)';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_fid ON poker.notification_subscriptions(fid);
CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_enabled ON poker.notification_subscriptions(enabled) WHERE enabled = true;

-- Table for notification event logging (idempotency and audit)
CREATE TABLE IF NOT EXISTS poker.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  game_id uuid NOT NULL,
  recipient_fid bigint NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_type, game_id, recipient_fid)
);

COMMENT ON TABLE poker.notification_events IS 'Notification event log for idempotency and auditing';
COMMENT ON COLUMN poker.notification_events.event_type IS 'Type of notification event (game_created, game_full)';
COMMENT ON COLUMN poker.notification_events.game_id IS 'Game ID this notification is about';
COMMENT ON COLUMN poker.notification_events.recipient_fid IS 'FID of notification recipient';
COMMENT ON COLUMN poker.notification_events.status IS 'Status: queued, sent, or failed';
COMMENT ON COLUMN poker.notification_events.error IS 'Error message if status is failed';

-- Indexes for notification_events
CREATE INDEX IF NOT EXISTS idx_notification_events_game_id ON poker.notification_events(game_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_recipient_fid ON poker.notification_events(recipient_fid);
CREATE INDEX IF NOT EXISTS idx_notification_events_status ON poker.notification_events(status);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION poker.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_notification_subscriptions_updated_at ON poker.notification_subscriptions;
CREATE TRIGGER set_notification_subscriptions_updated_at
  BEFORE UPDATE ON poker.notification_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();
