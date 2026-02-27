# Farcaster Native Push Notifications - Final Setup Guide

## Summary

This document provides the final setup steps for Farcaster native push notifications, ensuring reliable E2E operation without breaking existing flows.

## 1. Environment Variables

Set the following environment variables in Vercel (Production + Preview):

```bash
# Required: Neynar API key for webhook verification
NEYNAR_API_KEY=your_neynar_api_key_here

# Required: Base URL for absolute URLs in manifest and notifications
NEXT_PUBLIC_BASE_URL=https://poker-swart.vercel.app  # Or your production domain

# Optional: Override webhook URL (defaults to ${NEXT_PUBLIC_BASE_URL}/api/farcaster/webhook)
APP_WEBHOOK_URL=https://poker-swart.vercel.app/api/farcaster/webhook

# Feature flag: Enable/disable push notifications
ENABLE_PUSH_NOTIFICATIONS=true
```

**Note:** `NEXT_PUBLIC_BASE_URL` is critical - it ensures all notification `targetUrl`s are absolute URLs on the same domain as the mini app.

## 2. Database Migration

Run this SQL migration in Supabase SQL Editor:

```sql
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
  provider text, -- 'farcaster' or other provider name
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
  status text NOT NULL, -- 'queued', 'sent', 'failed'
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
```

## 3. Implementation Details

### A) Manifest & Webhook

- **Manifest served at:** `/.well-known/farcaster.json`
- **webhookUrl:** Absolute URL pointing to `/api/farcaster/webhook` (e.g., `https://poker-swart.vercel.app/api/farcaster/webhook`)
- **Verification:** Uses `@farcaster/miniapp-node` `parseWebhookEvent` + `verifyAppKeyWithNeynar`
- **Always returns 200:** Prevents Farcaster retries, but only stores tokens if verification succeeds

### B) Schema

- **Multi-token support:** `UNIQUE(fid, notification_url, token)` allows multiple tokens per FID (different clients/apps)
- **Separate columns:** `token` and `notification_url` are explicit columns (not JSON payload)
- **Idempotency:** `notification_events` table has `UNIQUE(event_type, game_id, recipient_fid)`

### C) Delivery Reliability

- **In-request execution:** Notifications run inside the request (not fire-and-forget)
- **Wrapped in try/catch:** Failures never block game creation/payment flows
- **Timeout per batch:** 5 seconds per batch (prevents hanging requests)
- **Error logging:** All failures logged to `notification_events` with `status=failed` + `error`

### D) Farcaster Spec Constraints

- **title:** Max 32 chars (truncated if needed)
- **body:** Max 128 chars (truncated if needed, password may be truncated)
- **notificationId:** Max 128 chars (generated as `eventType:gameId`)
- **tokens[]:** Max 100 per POST batch
- **targetUrl:** Always absolute URL (same domain as app)

## 4. Manual Testing Checklist (5 Steps)

### Step 1: Verify Manifest & Webhook
1. Open `https://<APP_DOMAIN>/.well-known/farcaster.json` in browser
2. Verify `miniapp.webhookUrl` is absolute URL pointing to `/api/farcaster/webhook`
3. Verify manifest is valid JSON

### Step 2: Add Mini App & Enable Notifications
1. In Warpcast, add the mini app to your account
2. Enable notifications when prompted (or via app settings)
3. Check server logs for: `[farcaster/webhook] Event received and verified` with `eventType: miniapp_added` or `notifications_enabled`
4. Verify token stored: Query `poker.notification_subscriptions` table - should see row with your FID, `enabled=true`, `token` and `notification_url` populated

### Step 3: Test Game Creation Notification
1. Create a new game as club owner
2. Check server logs for: `[games][notifications] Sending game_created notifications` with `enabledSubscriberCount`
3. Verify notification received in Warpcast (should have title "New Hellfire Poker game" and link to game page)
4. Click notification - should open game page and scroll to payment section (`?fromNotif=game_created`)

### Step 4: Test Game Full Notification
1. Create a game with max 2 participants
2. Join/pay as player 1 (yourself)
3. Join/pay as player 2 (another account)
4. Check server logs for: `[payments/confirm][notifications] Game is full, sending notifications` with `paidParticipantCount: 2`
5. Verify both players receive notification "Game is starting" (with password if set)
6. Click notification - should open game page and scroll to ClubGG section with password visible (`?fromNotif=game_full`)

### Step 5: Verify Non-Breaking
1. **Cancel flow:** Cancel a game - should work normally (no notification code executed)
2. **Refund flow:** Refund a game - should work normally (no notification code executed)
3. **Settle flow:** Settle a game - should work normally (no notification code executed)
4. **Create game without notifications:** Disable `ENABLE_PUSH_NOTIFICATIONS` - game creation should still work

## 5. Debug Logging

Server logs will include:

- **Webhook events:** `[farcaster/webhook] Event received and verified` with `fid`, `eventType`, `hasNotificationDetails`
- **Token storage:** `[farcaster/webhook] Mini app added with notifications - token stored` with `fid`, `notificationUrl`
- **Game created:** `[games][notifications] Sending game_created notifications` with `gameId`, `enabledSubscriberCount`
- **Game full:** `[payments/confirm][notifications] Game is full, sending notifications` with `gameId`, `paidParticipantCount`
- **Batch results:** `[notifications] Batch sent to notification URL` with `tokenCount`, `successful`, `invalid`, `rateLimited`

## 6. Confirm Non-Breaking Changes

All notification code is:
- ✅ Feature-flagged via `ENABLE_PUSH_NOTIFICATIONS`
- ✅ Wrapped in try/catch (never throws to block core flows)
- ✅ Separate from cancel/refund/settle routes (no code changes there)
- ✅ Uses new DB tables only (doesn't modify existing tables)
- ✅ Runs in-request with timeout (no fire-and-forget that could freeze)

**Cancel/Refund/Settle flows are completely untouched.**

