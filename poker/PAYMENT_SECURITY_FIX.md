# Payment Security Fix - Production-Safe Implementation

## Changes Summary

### 1. Security Binding Fix (Address Allowlist)

**Problem**: Previously, verification only logged address mismatches but didn't reject them, allowing payments from unlinked wallets.

**Solution**: Implemented strict address allowlist verification (enforced in all code paths):

- **New Function**: `getAllPlayerWalletAddresses(fid)` in `src/lib/neynar-wallet.ts`
  - Returns deduped list of all addresses "owned" by the user
  - Includes: custody address (`user.custody_address`) and verified Ethereum addresses (`user.verified_addresses?.eth_addresses`)
  - **Note**: Connected/smart wallet addresses are not available in Neynar API responses. If needed, these would need to come from the auth session or client-side wallet connection.

- **Verification Update**: `verifyJoinGameTransaction()` in `src/lib/blockchain-verify.ts`
  - **REQUIRES** `tx.from` to be in the `allowedAddresses` array (strict enforcement)
  - Returns `403` with error "Payment sent from wallet not linked to this Farcaster account" if address not in allowlist
  - **No code path accepts address mismatch** - allowlist is always checked before accepting payment
  - GameId binding check remains as primary security measure
  - Amount verification: Parses USDC Transfer event logs for token payments, verifies tx.value for ETH payments

### 2. Idempotency & Self-Healing

**Confirm Endpoint** (`src/app/api/payments/confirm/route.ts`):
- ✅ Checks txHash in DB first - if exists for (gameId, fid), returns 200 immediately with participant + password
- ✅ If already paid (status 'joined' or 'paid'), returns success immediately (doesn't say "game does not require payment")
- ✅ Error message fix: Only says "game does not require payment" if `entryFee === 0` and user hasn't paid

**Recover Endpoint** (`src/app/api/payments/recover/route.ts`):
- ✅ Supports optional `txHash` parameter for direct recovery
- ✅ If txHash provided: verifies transaction, extracts `tx.from`, verifies it's in allowlist, then checks contract participants mapping
- ✅ If no txHash: checks contract participants mapping for each allowed address (custody + verified addresses)
- ✅ Only backfills DB if address is in allowlist

### 3. UI Cache Fixes

**API Routes**:
- Added `export const dynamic = 'force-dynamic'` to:
  - `src/app/api/games/route.ts`
  - `src/app/api/games/[id]/route.ts`
  - `src/app/api/games/[id]/participants/route.ts`
- Added `Cache-Control: no-store, must-revalidate` headers to:
  - `/api/payments/confirm` responses
  - `/api/payments/recover` responses (when recovered)

**Frontend**:
- Added `cache: 'no-store'` to all `authedFetch` calls in:
  - `src/app/games/[id]/page.tsx` (participants, game, credentials)
  - `src/app/clubs/[slug]/games/page.tsx` (games list)

### 4. Testing

**Test Script**: `scripts/test-payment-verification.ts`
- Tests payment confirmation with real transaction: `0xf6fb8bf2cb5bf58c5d5e7d2074b724ceb7b43cc29a69ebb23202d2e8876f8818`
- Verifies:
  1. Confirm returns 200
  2. Participant appears in `/api/games/:id/participants`
  3. Participant data is correct

## How to Test

### 1. Test Payment Confirmation

```bash
# Set environment variables
export AUTH_TOKEN="<your-jwt-token-from-farcaster>"
export NEXT_PUBLIC_BASE_URL="https://your-app.vercel.app"

# Run test script
cd poker
npx tsx scripts/test-payment-verification.ts
```

### 2. Manual API Testing

```bash
# Get auth token from browser console:
# await sdk.quickAuth.getToken()

# Test confirm endpoint
curl -X POST https://your-app.vercel.app/api/payments/confirm \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "f12b1fa1-c882-4741-afcd-17c0fac1419a",
    "txHash": "0xf6fb8bf2cb5bf58c5d5e7d2074b724ceb7b43cc29a69ebb23202d2e8876f8818"
  }'

# Expected: 200 OK with { ok: true, data: { participant: {...}, game_password: "..." } }

# Test participants endpoint
curl https://your-app.vercel.app/api/games/f12b1fa1-c882-4741-afcd-17c0fac1419a/participants \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Expected: 200 OK with { ok: true, data: [{ id: "...", status: "joined", tx_hash: "0xf6fb..." }] }
```

### 3. Test Recovery

```bash
# Test recover endpoint (with txHash)
curl -X POST https://your-app.vercel.app/api/payments/recover \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "f12b1fa1-c882-4741-afcd-17c0fac1419a",
    "txHash": "0xf6fb8bf2cb5bf58c5d5e7d2074b724ceb7b43cc29a69ebb23202d2e8876f8818"
  }'

# Expected: 200 OK with { ok: true, data: { recovered: true/false, participant: {...}, game_password: "..." } }
```

## Address Sources from Neynar

The `getAllPlayerWalletAddresses()` function pulls addresses from:
1. **Custody Address**: `user.custody_address` (if available)
2. **Verified Addresses**: `user.verified_addresses?.eth_addresses[]` (all verified Ethereum addresses)

**Not Available from Neynar**:
- Connected wallet addresses (requires client-side wallet connection)
- Smart wallet addresses (requires additional lookup)

**What happens if none exist**: Function returns empty array `[]`, which causes endpoints to return `400` with error "Could not retrieve player wallet address. Please ensure your wallet is connected."

## Files Changed

1. `src/lib/neynar-wallet.ts` - Added `getAllPlayerWalletAddresses()` function
2. `src/lib/blockchain-verify.ts` - Updated verification to require address in allowlist
3. `src/app/api/payments/confirm/route.ts` - Uses allowlist, improved idempotency, better error messages
4. `src/app/api/payments/recover/route.ts` - Uses allowlist, supports txHash recovery
5. `src/app/api/games/route.ts` - Added `dynamic = 'force-dynamic'`
6. `src/app/api/games/[id]/route.ts` - Added `dynamic = 'force-dynamic'`
7. `src/app/api/games/[id]/participants/route.ts` - Added `dynamic = 'force-dynamic'`
8. `src/app/games/[id]/page.tsx` - Added `cache: 'no-store'` to fetch calls
9. `src/app/clubs/[slug]/games/page.tsx` - Added `cache: 'no-store'` to games fetch
10. `scripts/test-payment-verification.ts` - New test script

## Security Notes

- **Address Binding**: Transactions are only accepted if `tx.from` is in the user's allowed addresses list (custody + verified addresses)
- **GameId Binding**: Primary security check - transaction must call `joinGame(gameId)` with the correct gameId
- **Idempotency**: Same txHash can be confirmed multiple times safely (returns existing participant)
- **Error Codes**: 
  - `403` for address not in allowlist ("Payment sent from wallet not linked to this Farcaster account")
  - `400` for other verification failures
  - `200` for successful confirmations (even if already confirmed)

