# Push Notifications E2E Verification Guide

## Quick Verification URLs

### 1. Manifest Check
```bash
# Verify manifest includes webhookUrl
curl https://poker-swart.vercel.app/.well-known/farcaster.json | jq '.miniapp.webhookUrl'
# Should output: "https://poker-swart.vercel.app/api/farcaster/webhook"

# Verify frame also has webhookUrl (backward compatibility)
curl https://poker-swart.vercel.app/.well-known/farcaster.json | jq '.frame.webhookUrl'
# Should output: "https://poker-swart.vercel.app/api/farcaster/webhook"
```

### 2. Webhook Endpoint Check
```bash
# Test webhook endpoint exists (should return error but with 200 status)
curl -X POST https://poker-swart.vercel.app/api/farcaster/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
# Should return: {"success":false,"error":"..."} with status 200

# GET handler also exists (prevents 405 errors when visiting in browser)
curl https://poker-swart.vercel.app/api/farcaster/webhook
# Should return: {"ok":true,"endpoint":"/api/farcaster/webhook","method":"GET"} with status 200
```

### 3. Database Check (Supabase SQL Editor)
```sql
-- Check notification_subscriptions table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'poker' AND table_name = 'notification_subscriptions'
ORDER BY ordinal_position;

-- Should show:
-- id uuid (PK)
-- fid bigint NOT NULL
-- enabled boolean NOT NULL DEFAULT true
-- notification_url text NOT NULL
-- token text NOT NULL
-- provider text (nullable)
-- created_at timestamptz NOT NULL DEFAULT now()
-- updated_at timestamptz NOT NULL DEFAULT now()

-- Check unique constraint
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'poker' AND table_name = 'notification_subscriptions';

-- Should have UNIQUE constraint on (fid, notification_url, token)
```

## Acceptance Test Checklist

### Test A: Add Mini App → Token Stored
1. **In Warpcast:**
   - Open the Hellfire Poker mini app
   - Click "Add Mini App" button (or add via Warpcast settings)
   - Enable notifications when prompted

2. **Check Server Logs (Vercel):**
   - Look for: `[farcaster/webhook] Event received and verified` with `eventType: miniapp_added` or `notifications_enabled`
   - Look for: `[farcaster/webhook] Mini app added with notifications - token stored` with `fid` and `notificationUrl`

3. **Check Database (Supabase SQL Editor):**
   ```sql
   SELECT id, fid, enabled, notification_url, token, provider, created_at
   FROM poker.notification_subscriptions
   WHERE fid = YOUR_FID;
   ```
   - Should see at least one row with:
     - `enabled = true`
     - `notification_url` populated (URL string)
     - `token` populated (token string)
     - `provider = 'farcaster'`

### Test B: Game Created → Notification Sent
1. **Create a new game** as club owner

2. **Check Server Logs:**
   - Look for: `[games][notifications] Sending game_created notifications` with `gameId` and `enabledSubscriberCount`
   - Look for: `[games][notifications] Game creation notifications completed` with `successCount`

3. **Check Database:**
   ```sql
   SELECT event_type, game_id, recipient_fid, status, error, created_at
   FROM poker.notification_events
   WHERE event_type = 'game_created' AND game_id = 'YOUR_GAME_ID'
   ORDER BY created_at DESC;
   ```
   - Should see rows with `status = 'sent'` for each subscriber

4. **Check Warpcast:**
   - Users who added the mini app should receive notification: "New Hellfire Poker game" with body showing buy-in and player count
   - Clicking notification should open game page and scroll to payment section

### Test C: Game Full → Participants Notified
1. **Create a game** with max 2 participants
2. **Join as player 1** (yourself) - pay
3. **Join as player 2** (another account) - pay

4. **Check Server Logs:**
   - Look for: `[payments/confirm][notifications] Game is full, sending notifications` with `paidParticipantCount: 2`
   - Look for: `[payments/confirm][notifications] Game full notifications completed` with `successCount: 2`

5. **Check Database:**
   ```sql
   SELECT event_type, game_id, recipient_fid, status, error, created_at
   FROM poker.notification_events
   WHERE event_type = 'game_full' AND game_id = 'YOUR_GAME_ID'
   ORDER BY created_at DESC;
   ```
   - Should see rows with `status = 'sent'` for both paid participants (their FIDs)

6. **Verify Participants (Optional - Debug):**
   ```sql
   -- Check actual participants to verify they were paid
   -- Note: Column names match actual schema (inserted_at, not created_at)
   SELECT fid, status, tx_hash, refund_tx_hash, payout_tx_hash, inserted_at
   FROM poker.participants
   WHERE game_id = 'YOUR_GAME_ID'
   ORDER BY inserted_at DESC;
   ```
   - Should see 2 rows with:
     - `status = 'paid'` OR (`status = 'joined'` AND `tx_hash IS NOT NULL`)
     - `refund_tx_hash IS NULL` (not refunded)
     - `fid` values match the `recipient_fid` values in `notification_events`
   
   **Discover table schema (if needed):**
   ```sql
   -- Find participants table name and columns using information_schema
   SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema = 'poker' AND table_name = 'participants'
   ORDER BY ordinal_position;
   ```

7. **Check Warpcast:**
   - Both players should receive notification: "Game is starting" with password (if set)
   - Clicking notification should open game page, scroll to ClubGG section, and show password

### Test D: Non-Breaking Changes
1. **Cancel flow:**
   - Create a game
   - Cancel it as club owner
   - Should work normally (no notification errors in logs)

2. **Refund flow:**
   - Create a paid game
   - Join as player
   - Cancel game (should refund)
   - Should work normally (no notification errors)

3. **Settle flow:**
   - Create a paid game
   - Fill it with players
   - Settle the game
   - Should work normally (no notification errors)

4. **Create game without notifications:**
   - Set `ENABLE_PUSH_NOTIFICATIONS=false` in Vercel env vars
   - Create a game
   - Should work normally (no errors, just no notifications sent)

## Environment Variables Required

Set in Vercel (Production + Preview):

```bash
# Required: Neynar API key for webhook verification
NEYNAR_API_KEY=your_neynar_api_key_here

# Required: Base URL for absolute URLs
NEXT_PUBLIC_BASE_URL=https://poker-swart.vercel.app

# Optional: Override webhook URL (defaults to ${NEXT_PUBLIC_BASE_URL}/api/farcaster/webhook)
APP_WEBHOOK_URL=https://poker-swart.vercel.app/api/farcaster/webhook

# Feature flag: Enable/disable push notifications
ENABLE_PUSH_NOTIFICATIONS=true
```

## Common Issues & Debugging

### Issue: 405 Method Not Allowed when visiting endpoint in browser
- **Expected:** GET requests to `/api/farcaster/webhook`, `/api/notifications/test`, or `/api/notifications/test-self` return 200 JSON with endpoint info
- **If you see 405:** The GET handler may be missing (check route file exports GET function)

### Issue: CORS errors when calling /api/notifications/test from farcaster.xyz console
- **Do not use:** `/api/notifications/test` from cross-origin (farcaster.xyz)
- **Use instead:** `/api/notifications/test-self` from within the mini app (uses authedFetch with Authorization header)
- **Reason:** `/api/notifications/test` requires manual Bearer token setup; `/api/notifications/test-self` handles auth automatically via requireAuth()

### Issue: Webhook not receiving events
- **Check:** Manifest webhookUrl is accessible: `curl https://poker-swart.vercel.app/api/farcaster/webhook`
- **Check:** NEYNAR_API_KEY is set in Vercel
- **Check:** Server logs for verification errors

### Issue: Tokens not stored
- **Check:** Webhook logs for verification failures (should still return 200)
- **Check:** Database constraints - ensure UNIQUE constraint exists
- **Check:** Server logs for DB errors

### Issue: Notifications not sent
- **Check:** `ENABLE_PUSH_NOTIFICATIONS=true` in Vercel
- **Check:** Users have `enabled=true` and valid `token`/`notification_url` in DB
- **Check:** Server logs for notification sending errors

### Issue: Deep links not scrolling
- **Check:** Browser console for JavaScript errors
- **Check:** Refs are attached to correct elements (`paymentSectionRef`, `clubggSectionRef`)
- **Check:** `fromNotif` query param is in URL

