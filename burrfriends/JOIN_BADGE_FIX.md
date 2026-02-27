# Join Badge Fix - Implementation Summary

## Problem
Games list UI sometimes showed "not joined" even after users had paid. The root causes were:
1. N+1 participant queries causing performance issues
2. Recovery endpoint returning 400 errors instead of graceful responses
3. Status inconsistency between 'joined' and 'paid'
4. Missing on-chain state synchronization

## Solution Overview

### A) Participants Endpoint (`/api/games/[id]/participants`)
- **Status**: Already returns all participants without status filtering
- **Enhancement**: Added debug logging with distinct statuses when `NEXT_PUBLIC_DEBUG_PARTICIPANTS=1`
- **Behavior**: Returns participants with any status, including both 'joined' and 'paid' for backward compatibility

### B) Payment Confirm (`/api/payments/confirm`)
- **Change**: Standardized on `status: 'joined'` for successful payments (replaces 'paid')
- **Backward Compatibility**: Checks accept both 'joined' and 'paid' statuses
- **Behavior**: On successful payment confirmation, upserts participant with `status: 'joined'`

### C) Recovery Endpoint (`/api/payments/recover`)
- **Change 1**: Returns `200` with `{ recovered: false, hasPaidOnChain: false }` when user hasn't paid (NOT 400)
- **Change 2**: Uses `status: 'joined'` when backfilling participant records
- **Change 3**: Uses `onchain_game_id` if present, otherwise falls back to `gameId`
- **Behavior**: 
  - If on-chain check shows paid → backfills DB with `status: 'joined'` and returns `{ recovered: true }`
  - If on-chain check shows not paid → returns `{ recovered: false, hasPaidOnChain: false }` (200 OK)

### D) Games List Endpoint (`/api/games`)
- **New Field**: Added `viewer_has_joined` boolean field for each game
- **Logic**: Checks for participant record with `status IN ('joined', 'paid')` for current user
- **Performance**: Computed once per request, eliminating N+1 queries

### E) Games List UI (`/clubs/[slug]/games`)
- **Change**: Uses `viewer_has_joined` from `/api/games` response instead of N+1 participant queries
- **Removed**: Per-game participant fetching and automatic recovery calls on page load
- **Behavior**: 
  - Badge shows "✓ You've joined" when `viewer_has_joined === true`
  - No automatic recovery attempts (can be added as manual button if needed)

### F) CORS Image Errors
- **Status**: External issue from wallet.farcaster.xyz / wrpcd.net proxy
- **Impact**: Console errors only, does not affect application state
- **Action**: No code changes needed (external SDK/wallet code)

## Join Status Logic

A game shows as "joined" if **ANY** of these conditions are true:

1. **Database Check**: Participant row exists with `(game_id, fid)` and `status IN ('joined', 'paid')`
2. **On-chain Check**: User has paid on-chain (checked via recovery endpoint) → backfills DB with `status: 'joined'`

The primary signal is `viewer_has_joined` from `/api/games`, which performs the database check efficiently.

## Status Standardization

- **`status: 'joined'`**: Standard status for successful payment/participation (new payments)
- **`status: 'paid'`**: Legacy status, accepted for backward compatibility
- **API Behavior**: All checks accept both statuses, but new records use 'joined'

## Debug Logging

Enable detailed debug logging by setting:
```bash
NEXT_PUBLIC_DEBUG_PARTICIPANTS=1
```

This will log:
- Distinct statuses per game in participants endpoint
- Viewer join status for each game in games list endpoint
- UI badge display decisions

## Acceptance Criteria ✅

- [x] If a user has paid successfully, the game shows "✓ Joined" after refresh
- [x] Recover endpoint never returns 400 for "not paid"; only 400 for malformed input / auth failures
- [x] `/api/games` returns `viewer_has_joined` flags and UI uses them
- [x] Minimal debug logs behind `NEXT_PUBLIC_DEBUG_PARTICIPANTS=1`
- [x] No N+1 participant queries on games list page
- [x] Status standardized to 'joined' for new payments, backward compatible with 'paid'

## Files Changed

1. `src/app/api/games/[id]/participants/route.ts` - Added debug logging
2. `src/app/api/payments/confirm/route.ts` - Changed status to 'joined', accept both statuses
3. `src/app/api/payments/recover/route.ts` - Return 200 for not paid, use 'joined' status, use onchain_game_id
4. `src/app/api/games/route.ts` - Added `viewer_has_joined` field computation
5. `src/app/clubs/[slug]/games/page.tsx` - Use `viewer_has_joined` instead of N+1 queries
6. `src/lib/types.ts` - Added `viewer_has_joined` to Game interface

