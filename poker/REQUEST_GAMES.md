# Game Request Flow Documentation

## Overview

This feature allows non-admin users to request games that require admin approval. Admins (Tormental + plantsnft) can review and approve/reject requests, which then creates games using the same logic as normal game creation.

## Architecture

### Database

- **Table**: `poker.game_requests`
  - Stores game requests from non-admin users
  - Status: `pending`, `approved`, `rejected`
  - Includes `prefund_tx_hash` (required before submission)
  - Links to created game via `created_game_id`

### API Endpoints

1. **POST /api/game-requests** (non-admin only)
   - Creates a new game request
   - Requires `prefund_tx_hash` and `payload` (game fields)
   - Rejects if user is admin (they should use New Game)

2. **GET /api/game-requests** (admin only)
   - Lists game requests
   - Query param: `?status=pending` (default: pending)
   - Returns array of requests

3. **POST /api/game-requests/[id]/approve** (admin only)
   - Approves a request and creates the game
   - Uses shared `createGameFromPayload` logic
   - Triggers normal game creation side effects (notifications, etc.)

4. **POST /api/game-requests/[id]/reject** (admin only)
   - Rejects a request
   - Optional `rejection_reason` in body

5. **GET /api/admin/status** (authenticated)
   - Returns `{ fid, isAdmin }` for the authenticated user

### Frontend Components

1. **RequestGameModal** (`src/components/RequestGameModal.tsx`)
   - Modal for non-admins to request games
   - Two-step process:
     - Step 1: Prefund (enter tx hash)
     - Step 2: Game details (mirrors create game form)
   - Submit creates request (not game)

2. **AdminRequests** (`src/components/AdminRequests.tsx`)
   - Admin-only modal to review pending requests
   - Shows request details and prefund tx hash
   - Approve/Reject actions
   - Badge count on games page header

3. **Games Page Updates** (`src/app/clubs/[slug]/games/page.tsx`)
   - Conditional button rendering:
     - Admin: "New Game" button (existing behavior)
     - Non-admin: "Request Game" button (opens modal)
   - Admin: "Requests (N)" button if pending requests exist

## Testing Instructions

### As Non-Admin User

1. **Navigate to club games page** (e.g., `/clubs/hellfire/games`)
2. **Verify button**: Should see "Request Game" button (yellow) instead of "New Game"
3. **Click "Request Game"**: Modal opens
4. **Step 1 - Prefund**:
   - Enter a transaction hash (must start with `0x` and be at least 10 chars)
   - Click "Confirm Prefund"
   - Should see green checkmark
5. **Step 2 - Game Details**:
   - Fill in game fields (ClubGG URL, entry fee, etc.)
   - Submit request
6. **Success**: Should see "Request sent to Tormental." toast and modal closes

### As Admin User

1. **Navigate to club games page**
2. **Verify button**: Should see "New Game" button (primary color) - existing behavior preserved
3. **Check for requests badge**: If pending requests exist, should see "Requests (N)" button
4. **Click "Requests (N)"**: Admin requests modal opens
5. **Review request**:
   - See requester FID, prefund tx hash, game details
6. **Approve request**:
   - Click "Approve" button
   - Should create game and navigate to game page
   - Verify game was created with correct fields
   - Verify push notification was sent (if enabled)
7. **Reject request**:
   - Click "Reject" button
   - Request status changes to rejected
   - Badge count decreases

### Database Verification

```sql
-- Check pending requests
SELECT id, requester_fid, status, prefund_tx_hash, created_at
FROM poker.game_requests
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Check approved requests with created games
SELECT gr.id, gr.requester_fid, gr.created_game_id, g.name, g.status
FROM poker.game_requests gr
LEFT JOIN poker.games g ON gr.created_game_id = g.id
WHERE gr.status = 'approved'
ORDER BY gr.created_at DESC;
```

### API Testing

#### Create Request (Non-Admin)
```bash
curl -X POST https://your-domain.com/api/game-requests \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "prefund_tx_hash": "0x1234567890abcdef...",
    "payload": {
      "club_id": "club-uuid",
      "title": "Test Game",
      "gating_type": "entry_fee",
      "entry_fee_amount": 5,
      "entry_fee_currency": "USDC"
    }
  }'
```

#### List Requests (Admin)
```bash
curl https://your-domain.com/api/game-requests?status=pending \
  -H "Authorization: Bearer ADMIN_JWT"
```

#### Approve Request (Admin)
```bash
curl -X POST https://your-domain.com/api/game-requests/REQUEST_ID/approve \
  -H "Authorization: Bearer ADMIN_JWT"
```

## Migrations

Run the migration SQL files in order:

1. **`supabase_migration_game_requests.sql`**
   - Creates `poker.game_requests` table
   - Indexes for efficient queries
   - Trigger for `updated_at` timestamp

2. **`supabase_migration_game_requests_approval_claim.sql`** (recommended)
   - Adds `approval_claim_id` column for idempotent tracking
   - Adds unique constraint on `created_game_id` (prevents duplicate game creation)

3. **`supabase_migration_game_requests_rls.sql`** (optional, defense-in-depth)
   - Enables RLS policies
   - Note: API uses service role which bypasses RLS, so policies are defense-in-depth only

## Environment Variables

### Admin Configuration

Admins are defined by the `NOTIFICATIONS_BROADCAST_ADMIN_FIDS` environment variable (comma-separated FIDs).

Example:
```
NOTIFICATIONS_BROADCAST_ADMIN_FIDS=318447,123456
```

### Prefund Transaction Verification (Optional)

- **`VERIFY_PREFUND_TX=true`**: Enables onchain verification of prefund transaction hashes
- **`EXPECTED_PREFUND_TO=<address>`**: (Optional) Expected recipient address for prefund transactions
  - If set, validates `receipt.to` matches this address
  - If not set, only checks transaction existence (logs warning)

## Security & Hardening

### Atomic Approval (Prevents Double-Approval)

The approve endpoint uses atomic conditional updates to prevent double-approval:
- Uses `updateConditional` with `status='pending'` condition
- Only one admin can claim a pending request
- If 0 rows affected → returns 409 "Already processed"
- **Idempotency**: If same admin retries approval, returns existing `game_id` (safe retry)
- **Rollback safety**: Only rollbacks to 'pending' if `created_game_id IS NULL`
  - Prevents rollback after partial success (e.g., game created but notification failed)
  - Notifications are wrapped in try/catch and never throw (best-effort)
- **Approval claim tracking**: Uses `approval_claim_id` (UUID) for idempotent retries

### Payload Validation & Whitelist

- **Whitelist validation**: Only allowed fields from create-game API are accepted
- **Forbidden fields**: Requesters cannot control `club_id`, `created_by_fid`, `status`, `onchain_*`, etc.
- **Server-controlled**: All sensitive fields are set by the server during approval
- **Unknown fields**: Silently stripped from payload (defensive approach)

### Database Migrations

After deploying code that references new database columns, you must run the corresponding SQL migrations in the Supabase SQL Editor.

### Large Event Game Type Support

**Migration file:** `supabase_migration_games_large_event_columns.sql`

**What it does:**
- Adds `game_type` column (text, default 'standard', constraint: 'standard' | 'large_event')
- Adds `registration_close_minutes` column (integer, default 0, constraint: >= 0)
- Refreshes PostgREST schema cache

**To apply:**
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `supabase_migration_games_large_event_columns.sql`
3. Run the migration
4. Verify columns exist:
   ```sql
   SELECT column_name, data_type, column_default, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'poker' AND table_name = 'games'
     AND column_name IN ('game_type', 'registration_close_minutes')
   ORDER BY ordinal_position;
   ```
5. Test game creation: `/api/games` should no longer return PGRST204 errors

**Note:** This migration is idempotent and safe to rerun multiple times.

## Transaction Hash Validation

- **Strict format**: Must be `0x` followed by exactly 64 hexadecimal characters (66 total)
- **Optional onchain verification**: Enabled via `VERIFY_PREFUND_TX=true` env var
  - Fetches transaction receipt from Base RPC
  - Validates `receipt.status == 1` (success)
  - Validates `receipt.blockNumber` exists (confirmed)
  - Validates `receipt.to` matches `EXPECTED_PREFUND_TO` (if set via env var)
  - Validates chain is Base (chain ID 8453)
  - If `EXPECTED_PREFUND_TO` not set, logs warning but continues (existence-only check)
  - If validation fails → 400 error

### Authorization & Data Leakage Prevention

- **GET /api/game-requests**: Admin-only (403 for non-admin)
- **POST /api/game-requests**: Rejects admins with clear message
- **Safe logging**: Never logs full payloads; only metadata (counts, IDs, truncated hashes)

### Database Access Control

- **RLS policies**: Optional defense-in-depth (see `supabase_migration_game_requests_rls.sql`)
- **Service role**: API endpoints use service role key (bypasses RLS)
- **Server-side enforcement**: Authorization checks are done server-side, not relying on RLS alone

## Notes

- **Non-breaking**: Existing game creation flow for admins is unchanged
- **Isolated**: Request flow is additive and doesn't affect join/pay/cancel/refund/settle
- **Notifications**: When admin approves, normal "game_created" notification is sent (if enabled)
- **Prefund requirement**: Users must provide a valid tx hash before submitting request
- **Idempotency**: Request approval uses shared game creation logic, ensuring consistency

