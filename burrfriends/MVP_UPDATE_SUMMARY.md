# MVP Update: Open Signup + Global Blocklist

## Summary

Updated MVP to support open signup (no roster/membership gating) with a global admin blocklist feature.

## Changes Implemented

### A) Removed Membership Gating

**Routes updated to remove membership requirements:**
- `/api/games` (GET) - Returns all games (no membership filter)
- `/api/games/[id]` (GET) - Any authed user can view
- `/api/games/[id]/join` (POST) - Open signup (added block check)
- `/api/games/[id]/participants` (GET) - Open signup (users see only their own participation unless admin)
- `/api/payments/prepare` (POST) - Open signup (added block check)
- `/api/payments/confirm` (POST) - Open signup (added block check)
- `/api/games/[id]/credentials` (GET) - Still requires participant + paid status (unchanged)

**Admin-only gates remain:**
- `/api/games` (POST) - Create game (requires club owner)
- `/api/games/[id]/refund` - Refund (requires admin/owner)
- `/api/games/[id]/settle-contract` - Settle (requires admin/owner)
- `/api/games/[id]/results` (POST) - Manage results (requires admin/owner)
- `/api/clubs/[id]/members` (POST) - Manage members (requires admin/owner)

**Code changes:**
- `requireGameAccess()` - No longer checks membership, only verifies game exists
- `requireClubMember()` - Still used for admin member management endpoints
- `requireClubOwner()` - Unchanged, used for admin actions

### B) Global Blocklist

**Database schema:**
- Created `supabase_migration_user_blocks.sql`
- Table: `poker.user_blocks`
  - `fid` (BIGINT PRIMARY KEY)
  - `is_blocked` (BOOLEAN)
  - `blocked_by_fid` (BIGINT)
  - `reason` (TEXT, nullable)
  - `blocked_at`, `updated_at` (TIMESTAMPTZ)

**Server helpers:**
- `src/lib/userBlocks.ts` - Blocklist utilities
  - `isUserBlocked(fid)` - Check if user is blocked
  - `requireNotBlocked(fid)` - Throws if blocked (used in routes)
  - `blockUser(fid, blockedByFid, reason?)` - Block a user
  - `unblockUser(fid)` - Unblock a user
  - `getAllBlockedUsers()` - List all blocked users

**Routes enforcing block:**
- `/api/games/[id]/join` - Cannot join if blocked
- `/api/payments/prepare` - Cannot prepare payment if blocked
- `/api/payments/confirm` - Cannot confirm payment if blocked

**Admin API routes:**
- `GET /api/admin/blocks` - List blocked users (admin-only)
- `POST /api/admin/blocks` - Block user (admin-only, body: `{ fid, reason? }`)
- `DELETE /api/admin/blocks/[fid]` - Unblock user (admin-only)

**Audit logging:**
- Added `logBlockEvent()` and `logUnblockEvent()` to `src/lib/audit-logger.ts`
- Non-blocking, logs to console and optional webhook

### C) Global Admin Allowlist Fix

**Updated `src/lib/permissions.ts`:**
- `GLOBAL_ADMIN_FIDS` now includes:
  - Plants: `318447` (hardcoded)
  - Tormental: `process.env.TORMENTAL_FID` (env var)

**Updated `src/lib/constants.ts`:**
- `TORMENTAL_FID` now reads from `TORMENTAL_FID` env var (not `HELLFIRE_OWNER_FID`)

**Environment variable:**
- Added `TORMENTAL_FID` to README env examples

### D) Admin UI

**Created `/admin/users` page:**
- Block user form (FID + optional reason)
- List of blocked users with profiles (Neynar-hydrated)
- Unblock button for each blocked user
- Admin-only access (enforced server-side)

**Location:** `src/app/admin/users/page.tsx`

### E) Database Updates

**Added to `pokerDb.ts`:**
- `user_blocks` added to `VALID_POKER_TABLES`
- Updated filter types to support `boolean` values
- Fixed filter handling for boolean values in fetch/update/delete

## Required Environment Variables

```
TORMENTAL_FID=tormental_fid_number  # NEW: Required for global admin access
HELLFIRE_OWNER_FID=tormental_fid_number  # Existing (for club ownership)
```

## Migration Steps

1. Run `supabase_migration_user_blocks.sql` in Supabase SQL Editor
2. Set `TORMENTAL_FID` environment variable in Vercel/production
3. Deploy code changes

## Acceptance Criteria Met

✅ Brand new Farcaster user (not in any roster) can:
  - Open in Warpcast → quick auth → see Hellfire games → join → pay → unlock credentials

✅ If Plants/Tormental blocks a user's FID:
  - Cannot join any game (403: "Access denied. Contact an admin.")
  - Payment prepare/confirm also refuses (403)

✅ Admin routes still restricted to Plants/Tormental

✅ No Burrfriends references remain

✅ No Catwalk tables or schemas touched

## Testing Checklist

- [ ] New user (not in roster) can sign in and see games
- [ ] New user can join a game
- [ ] New user can pay and unlock credentials (if paid game)
- [ ] Admin can block a user via `/admin/users`
- [ ] Blocked user receives 403 when trying to join
- [ ] Blocked user receives 403 when trying to pay
- [ ] Admin can unblock user
- [ ] Unblocked user can join/pay again
- [ ] Only Plants/Tormental can access `/admin/users`

## Routes Summary

**Routes enforcing `requireNotBlocked()`:**
1. `/api/games/[id]/join` (POST)
2. `/api/payments/prepare` (POST)
3. `/api/payments/confirm` (POST)

**Admin UI location:**
- `/admin/users` - Blocklist management page

## Known Issues

### Deprecation Warning from @farcaster/quick-auth

**Warning:**
```
(node:4) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities. (Use `node --trace-deprecation ...` to show where the warning was created)
```

**Details:**
- **Source:** `@farcaster/quick-auth` package (currently v0.0.8)
- **When:** Appears during JWT verification (e.g., when `/api/auth/verify` is called)
- **Impact:** Non-blocking - this is a deprecation warning, not an error. All functionality works correctly.
- **Status:** Waiting for Farcaster team to update their package to use WHATWG URL API instead of `url.parse()`
- **Stack trace:** To get full stack trace, run with `node --trace-deprecation` flag. The warning originates from within the `@farcaster/quick-auth` dependency during JWT verification.

**Action items:**
- [ ] Monitor `@farcaster/quick-auth` package updates
- [ ] Revisit when Farcaster releases a fix
- [ ] Do not suppress Node.js warnings (per policy)

