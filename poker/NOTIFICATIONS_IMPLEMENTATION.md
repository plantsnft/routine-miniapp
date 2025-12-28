# Push Notifications Implementation

## Overview
This document describes the push notification implementation for Hellfire Poker mini app.

## Features Implemented

### 1. Database Schema
- **`poker.notification_subscriptions`**: Stores user subscription preferences
  - `fid` (primary key): Farcaster user ID
  - `enabled`: Boolean flag for subscription status
  - `provider`: Notification provider ('neynar', 'farcaster', etc.)
  - `payload`: JSONB field for provider-specific subscription data
  - `created_at`, `updated_at`: Timestamps

- **`poker.notification_events`**: Logs all notification events for idempotency
  - `id`: UUID primary key
  - `event_type`: 'game_created' or 'game_full'
  - `game_id`: UUID of the game
  - `recipient_fid`: FID of notification recipient
  - `status`: 'queued', 'sent', or 'failed'
  - `error`: Error message if failed
  - Unique constraint on `(event_type, game_id, recipient_fid)` for idempotency

### 2. Notification Types

#### A. Game Created Notification
- **Trigger**: When a new game is created
- **Recipients**: All enabled subscribers
- **Message**: 
  - Title: "New Hellfire Poker game"
  - Body: "Buy-in: {amount} {currency}. Players: {current}/{max}."
  - Deep link: `/games/{gameId}` (opens pay/join UI)

#### B. Game Full Notification
- **Trigger**: When a game reaches max participants (after payment confirmation)
- **Recipients**: Only paid participants of that game
- **Message**:
  - Title: "Game is starting"
  - Body: "Your Hellfire Poker game is full and starting now. Password: {password}" (if password exists)
  - Alternative: "Open the app to view the password." (if no password)
  - Deep link: `/games/{gameId}` (opens game page with ClubGG join button)

### 3. API Endpoints

#### POST /api/notifications/subscribe
- Subscribes a user to push notifications
- Requires authentication (FID from JWT)
- Stores subscription in `notification_subscriptions` table
- Accepts `provider` and `payload` (optional SDK notification details)

#### DELETE /api/notifications/subscribe
- Unsubscribes a user (sets `enabled = false`)
- Requires authentication

### 4. Implementation Details

#### Notification Sender Utility (`src/lib/notifications.ts`)
- **`sendNotificationToFid()`**: Sends notification to single FID
- **`sendBulkNotifications()`**: Sends to multiple FIDs with batching (100 FIDs per batch)
- **`logNotificationEvent()`**: Logs events to database for idempotency
- **`notificationEventExists()`**: Checks if event was already sent

#### Hooks

**Game Creation Hook** (`src/app/api/games/route.ts`):
- Runs asynchronously after game is successfully created
- Fetches all enabled subscribers
- Sends bulk notifications
- Logs events for idempotency
- Does NOT block game creation if notifications fail

**Game Full Hook** (`src/app/api/payments/confirm/route.ts`):
- Runs asynchronously after payment is confirmed
- Checks if game reached max participants
- Fetches all paid participants
- Decrypts password (if exists) using `decryptCreds()`
- Sends notifications only to participants
- Uses idempotency check to prevent duplicate sends
- Does NOT block payment confirmation if notifications fail

### 5. Frontend Component

**NotificationSettings** (`src/components/NotificationSettings.tsx`):
- Toggle UI for enabling/disabling notifications
- Appears on clubs games page
- Requests Farcaster SDK notification permission when enabling
- Calls subscribe/unsubscribe API endpoints
- Handles errors gracefully

### 6. Feature Flagging

All notification sending is gated behind `ENABLE_PUSH_NOTIFICATIONS` environment variable:
- Set `ENABLE_PUSH_NOTIFICATIONS=true` to enable
- When disabled, notifications are skipped (no API calls made)

### 7. Idempotency

- Notification events are logged to `notification_events` table
- Unique constraint on `(event_type, game_id, recipient_fid)` prevents duplicates
- Before sending, code checks if event already exists
- Prevents duplicate notifications from retries or concurrent requests

### 8. Error Handling

- Notification failures never break game creation or payment flows
- All errors are logged using `safeLog()`
- Failed notifications are logged to `notification_events` with `status='failed'`
- Batching handles rate limits (100 FIDs per batch with 100ms delay)

### 9. Environment Variables Required

- `ENABLE_PUSH_NOTIFICATIONS`: Feature flag (set to 'true' to enable)
- `NEYNAR_API_KEY`: Neynar API key for sending notifications
- `APP_URL` or `NEXT_PUBLIC_BASE_URL`: Base URL for deep links

### 10. Testing Checklist

- [ ] Create a game: Verify all enabled subscribers receive notification
- [ ] Join/pay until full: Verify only participants receive "game starting" notification
- [ ] Verify password is included in notification (if game has password)
- [ ] Verify deep links open correct game page
- [ ] Verify no duplicate notifications on retries
- [ ] Verify cancel/refund/settle flows unaffected
- [ ] Verify subscription toggle works correctly
- [ ] Verify notifications are disabled when feature flag is off

## Migration

Run the SQL migration file:
```sql
-- Run supabase_migration_notifications.sql in Supabase SQL Editor
```

This creates the `notification_subscriptions` and `notification_events` tables with proper indexes and triggers.

