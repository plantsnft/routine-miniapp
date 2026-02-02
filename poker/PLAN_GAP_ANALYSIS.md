# NFT & Wheel Feature Plan - Gap Analysis

## Critical Gaps Found

### ❌ CRITICAL GAP 1: `game_prizes` Table Not in VALID_POKER_TABLES

**Location:** `src/lib/pokerDb.ts`

**Issue:** The `game_prizes` table is not in the `VALID_POKER_TABLES` allowlist. This means `pokerDb.fetch()`, `pokerDb.insert()`, and `pokerDb.update()` will **throw errors** when trying to access this table.

**Current Code:**
```typescript
const VALID_POKER_TABLES = new Set([
  'clubs',
  'club_members',
  'games',
  'participants',
  'audit_log',
  'game_results',
  'payouts',
  'user_blocks',
  'notification_subscriptions',
  'notification_events',
  'game_requests',
] as const);
```

**Fix Required:**
```typescript
const VALID_POKER_TABLES = new Set([
  'clubs',
  'club_members',
  'games',
  'participants',
  'audit_log',
  'game_results',
  'payouts',
  'user_blocks',
  'notification_subscriptions',
  'notification_events',
  'game_requests',
  'game_prizes', // ADD THIS
] as const);
```

---

### ❌ CRITICAL GAP 2: Wheel Games Don't Have Payment Transactions

**Location:** `src/app/api/games/[id]/settle-contract/route.ts`

**Issue:** The settlement flow currently derives wallet addresses from payment transactions (`tx_hash`). For wheel games:
- They may not have entry fees (no payment transactions)
- Participants join without paying
- No `tx_hash` exists to derive wallet addresses from

**Current Code (lines 280-297):**
```typescript
// Derive address from payment transaction (same pattern as refund flow)
const paymentVerification = await verifyPaymentOnChain({
  paymentTxHash: participant.tx_hash,
  expectedEscrowAddress: GAME_ESCROW_CONTRACT!,
  expectedUsdcAddress: BASE_USDC_ADDRESS,
  expectedAmount: entryFeeAmount,
  chainId: BASE_CHAIN_ID,
});
```

**Fix Required:**
- For wheel games (or any prize-based games without entry fees), use Neynar API to fetch wallet addresses
- Check if `game.game_type === 'giveaway_wheel'` or if `game.gating_type === 'open'` and no entry fee
- Use `getAllPlayerWalletAddresses(fid)` or batched `getBulkWalletAddresses([...fids])` from `neynar-wallet.ts`

---

### ❌ CRITICAL GAP 3: Settlement Flow Doesn't Handle Wheel Winner

**Location:** `src/app/api/games/[id]/settle-contract/route.ts`

**Issue:** The settlement flow expects `winnerFids` array in the request body. For wheel games, the winner is already determined and stored in `game.wheel_winner_fid`. The plan doesn't specify how to handle this.

**Current Flow:**
- Request body contains `winnerFids: [123, 456]`
- Settlement derives addresses from payment transactions
- Distributes tokens based on `payout_bps`

**Fix Required:**
- Check if `game.game_type === 'giveaway_wheel'`
- If yes, use `game.wheel_winner_fid` as the single winner (position 1)
- Skip payment transaction verification (use Neynar API for wallet address)
- Fetch prize configuration for position 1 only

---

### ❌ CRITICAL GAP 4: Prize Configuration Mapping for Wheel Games

**Location:** Settlement flow in plan (section 3.1)

**Issue:** The plan shows mapping prizes by `winner_position`, but for wheel games:
- There's only ONE winner (always position 1)
- The plan doesn't clarify how to map `wheel_winner_fid` to position 1 in the prize configuration

**Fix Required:**
```typescript
// For wheel games
if (game.game_type === 'giveaway_wheel') {
  const winnerFid = game.wheel_winner_fid;
  if (!winnerFid) {
    return NextResponse.json({ ok: false, error: 'Wheel not spun yet' }, { status: 400 });
  }
  
  // Fetch prize configuration for position 1 only
  const prizeConfig = await pokerDb.fetch('game_prizes', {
    filters: { game_id: gameId, winner_position: 1 },
    select: '*',
  });
  
  // Get winner wallet address (Neynar API, not from payment tx)
  const winnerAddress = await getWalletAddressForFid(winnerFid);
  
  // Distribute prizes for position 1
}
```

---

### ⚠️ GAP 5: Random Selection Security

**Location:** `src/app/api/games/[id]/spin-wheel/route.ts` (plan section 2.3)

**Issue:** The plan uses `Math.floor(Math.random() * ...)` which is not cryptographically secure. Should use `crypto.randomInt()` as mentioned in Q4.

**Current Plan Code:**
```typescript
const randomIndex = Math.floor(Math.random() * eligibleParticipants.length);
winnerFid = eligibleParticipants[randomIndex].fid;
```

**Fix Required:**
```typescript
import { randomInt } from 'crypto';
const randomIndex = randomInt(0, eligibleParticipants.length);
winnerFid = eligibleParticipants[randomIndex].fid;
```

---

### ⚠️ GAP 6: Wheel Games May Not Have payout_bps

**Location:** Settlement flow

**Issue:** Wheel games are prize-based (not entry-fee based), so they may not have `payout_bps`. The settlement flow currently validates `payout_bps` and requires it to match winner count.

**Fix Required:**
- For wheel games, skip `payout_bps` validation
- Use prize configuration from `game_prizes` table directly
- Token amounts come from `game_prizes.token_amount`, not calculated from `payout_bps`

---

### ⚠️ GAP 7: Contract Integration for Token Prizes

**Location:** Settlement flow

**Issue:** The plan mentions using existing `settleGame` contract function OR new `distributeTokens` function. But:
- Existing `settleGame` requires game to be created on-chain (needs `onchain_game_id`)
- Wheel games may not have on-chain game creation (no entry fees)
- Need to clarify: use new `PrizeDistribution` contract for ALL prize distributions (tokens + NFTs)

**Fix Required:**
- For wheel games (or any prize-based games without entry fees), use `PrizeDistribution.distributeTokens()` directly
- Don't require `onchain_game_id` for wheel games
- Only use existing `GameEscrow.settleGame()` for poker games with entry fees

---

### ⚠️ GAP 8: Image Upload API Route Missing

**Location:** Game creation flow

**Issue:** The plan mentions uploading images to Supabase Storage, but doesn't specify:
- Where the upload happens (client-side or server-side)
- API route for handling image uploads
- How to handle upload errors

**Fix Required:**
- Create API route: `src/app/api/games/[id]/wheel-images/route.ts` (POST)
- Or handle uploads in game creation route before inserting game
- Return image URLs to store in `game.wheel_image_urls`

---

### ⚠️ GAP 9: Prize Configuration Validation

**Location:** Game creation API route

**Issue:** The plan shows storing prize configuration, but doesn't validate:
- Position numbers are sequential (1, 2, 3, ...)
- Token amounts are positive numbers
- NFT contract addresses are valid Ethereum addresses
- Token IDs are positive integers
- Prize type matches what's actually configured

**Fix Required:**
- Add validation in `POST /api/games` route
- Ensure `prize_configuration` array is sorted by position
- Validate Ethereum addresses using `ethers.isAddress()`
- Validate token IDs are positive integers

---

### ⚠️ GAP 10: Wheel Games Don't Need On-Chain Game Creation

**Location:** Game creation flow

**Issue:** The plan doesn't clarify whether wheel games need to be created on-chain. Currently, poker games with entry fees create games on-chain via `createGameOnContract()`. Wheel games may not need this.

**Fix Required:**
- Skip on-chain game creation for wheel games (no entry fees, no escrow needed)
- Only create on-chain if `entry_fee_amount > 0` AND `game_type !== 'giveaway_wheel'`
- Document this in the plan

---

## Verification Checklist

### Database
- [ ] Add `game_prizes` to `VALID_POKER_TABLES` in `pokerDb.ts`
- [ ] Verify migration script creates table with correct schema
- [ ] Verify indexes are created

### Settlement Flow
- [ ] Handle wheel games differently (use `wheel_winner_fid`, not `winnerFids` from request)
- [ ] Use Neynar API for wallet addresses when no payment transactions exist
- [ ] Skip `payout_bps` validation for wheel games
- [ ] Use `PrizeDistribution` contract for all prize distributions (not `GameEscrow.settleGame`)

### Game Creation
- [ ] Validate prize configuration before storing
- [ ] Handle image uploads (API route or inline)
- [ ] Skip on-chain game creation for wheel games without entry fees

### Wheel Spin
- [ ] Use `crypto.randomInt()` instead of `Math.random()`
- [ ] Verify participants are fetched correctly (status='joined')
- [ ] Handle removed participants correctly

### Contract
- [ ] Deploy `PrizeDistribution` contract
- [ ] Add contract address to environment variables
- [ ] Add ABI to `contracts.ts`
- [ ] Test NFT transfers from master wallet

---

## Updated Plan Sections Needed

1. **Section 1.5 (API Route Updates):** Add validation for prize configuration
2. **Section 2.3 (Wheel Spin API):** Use `crypto.randomInt()` instead of `Math.random()`
3. **Section 3.1 (Settlement API Updates):** Add logic to handle wheel games differently
4. **Section 3.1 (Settlement API Updates):** Use Neynar API for wallet addresses when no payment transactions
5. **Section 1.5 (API Route Updates):** Add image upload handling
6. **Section 1.2 (Smart Contract):** Clarify when to use `PrizeDistribution` vs `GameEscrow`

---

## Summary

**Critical Fixes Required:**
1. Add `game_prizes` to `VALID_POKER_TABLES`
2. Handle wheel games in settlement (different winner source, different wallet fetching)
3. Use Neynar API for wallet addresses when no payment transactions
4. Use `crypto.randomInt()` for secure random selection
5. Clarify contract usage (when to use which contract)

**Medium Priority:**
- Image upload API route
- Prize configuration validation
- Skip on-chain game creation for wheel games

Once these gaps are addressed, the plan will work end-to-end.
