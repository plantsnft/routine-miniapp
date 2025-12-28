-- Migration: Add miniapp_added column and make token/url nullable
-- Run this in Supabase SQL Editor
--
-- This column tracks whether the user has installed the mini app,
-- separate from whether notifications are enabled.
-- Making token and notification_url nullable allows us to track
-- miniapp_added=true even when user hasn't enabled notifications yet.
--
-- INVARIANT: enabled=true MUST have token and notification_url (enforced by CHECK constraint).

-- First, make token and notification_url nullable (to support miniapp_added without token)
ALTER TABLE poker.notification_subscriptions
ALTER COLUMN notification_url DROP NOT NULL,
ALTER COLUMN token DROP NOT NULL;

-- Add miniapp_added column
ALTER TABLE poker.notification_subscriptions
ADD COLUMN IF NOT EXISTS miniapp_added boolean NOT NULL DEFAULT false;

-- Add comment
COMMENT ON COLUMN poker.notification_subscriptions.miniapp_added IS 'Whether the user has added/installed the mini app (separate from notification enabled state)';

-- Add CHECK constraint: enabled=true requires token and notification_url to be non-null
-- This enforces the invariant: enabled=true -> token IS NOT NULL AND notification_url IS NOT NULL
-- Use DO block to make idempotent (check if constraint exists before adding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_subscriptions_enabled_requires_token'
  ) THEN
    ALTER TABLE poker.notification_subscriptions
    ADD CONSTRAINT notification_subscriptions_enabled_requires_token
    CHECK (enabled = false OR (token IS NOT NULL AND notification_url IS NOT NULL));
  END IF;
END $$;

-- Note: The UNIQUE constraint (fid, notification_url, token) still exists
-- but allows NULLs in notification_url and token, so we can have
-- multiple rows with NULL token/url per fid (one per provider)
-- 
-- Note: We do NOT create an index on miniapp_added as it's unlikely to be queried at scale

