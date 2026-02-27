# Game Settlement Feature - Status & Implementation Guide

## Project Overview

**App Name:** Hellfire Poker (Farcaster Mini-App)  
**Repo:** https://github.com/plantsnft/poker  
**Deployment:** Vercel (poker-swart.vercel.app)  
**Current Commit:** `463760f` - "Remove payment_status from debug logs (column doesn't exist)"  
**Stack:** Next.js 15 (App Router), TypeScript, Supabase (PostgreSQL), Base Network (Ethereum L2), Neynar (Farcaster auth), Vercel

---

## 1. Current State

### ✅ What Works

1. **Game Creation** - Club owners can create paid games with entry fees (USDC)
2. **Payment Flow** - Players can join and pay via on-chain USDC transfers to escrow contract
3. **Cancel/Refund Flow** - Fully working with robust payment verification:
   - Uses `verifyPaymentOnChain()` to extract payer address from USDC Transfer logs
   - Atomic locking to prevent double-refunds
   - Idempotent cancel logic
   - Comprehensive diagnostics

4. **Settle UI (Frontend)** - Modal shows paid participants and allows winner selection
5. **Participants API** - Returns all participants for owners (fixed to not filter by fid)

### ❌ What's Broken

1. **Settlement End-to-End** - Two critical blockers:
   - **Blocker #1:** Frontend tries to fetch wallet addresses from `/api/users?fid=${fid}` which doesn't have `wallet_address` field populated
   - **Blocker #2:** Contract settlement fails with "Payout exceeds collected" error
   
2. **Winner Selection** - UI shows clickable participant list, but address lookup fails

### 🔄 Recent Rollbacks

- Rolled back from attempts to create `/api/games/[id]/participants/[fid]/payment-address` endpoint (caused sign-in issues)
- Currently at stable commit `463760f` where everything except settlement works

---

## 2. Smart Contract Details

### Contract: GameEscrow.sol (on Base Network)

**Contract Address:** Stored in env var `GAME_ESCROW_CONTRACT` or `NEXT_PUBLIC_GAME_ESCROW_CONTRACT`

**Key Functions (from ABI in `src/lib/contracts.ts`):**

```solidity
// Settlement function - THIS IS WHAT WE NEED TO CALL
function settleGame(
    string memory gameId,
    address[] memory recipients,
    uint256[] memory amounts
) external;

// View functions
function getGame(string memory gameId) external view returns (
    string memory gameId,
    address currency,
    uint256 entryFee,
    uint256 totalCollected,  // Total USDC collected from all players
    bool isActive,
    bool isSettled
);

function participants(string memory gameId, address player) external view returns (
    address player,
    uint256 amountPaid,
    bool hasPaid,
    bool hasRefunded
);
```

**Contract Interaction Pattern:**
- Uses `ethers.js` (v6) for contract calls
- Master wallet (controlled by `MASTER_WALLET_PRIVATE_KEY` env var) signs transactions
- RPC: Base mainnet via `BASE_RPC_URL` (defaults to `https://mainnet.base.org`)

**Critical Contract Logic:**
- Contract tracks `totalCollected` per game (sum of all entry fees paid)
- `settleGame()` distributes payouts and must not exceed `totalCollected`
- Error "Payout exceeds collected" means sum of `amounts[]` > contract's `totalCollected` for that game

**USDC Details:**
- Token Address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base USDC)
- Decimals: 6 (not 18!)
- Amount conversion: `amount * 1e6` (handled by `amountToUnits()` helper)

---

## 3. Database Schema

### Tables

#### `poker.games`
```sql
CREATE TABLE poker.games (
  id uuid PRIMARY KEY,
  club_id uuid REFERENCES poker.clubs(id),
  name text NOT NULL,
  buy_in_amount numeric,  -- Entry fee (human-readable, e.g., 5.0 for $5)
  buy_in_currency text DEFAULT 'ETH',  -- 'ETH' or 'USDC'
  game_date timestamptz,
  max_participants integer,
  status text DEFAULT 'open',  -- 'open', 'full', 'in_progress', 'completed', 'cancelled', 'settled'
  num_payouts integer,  -- Number of winners (1 = winner-take-all, 2+ = split)
  settle_tx_hash text,  -- Transaction hash when settled
  -- ... other fields
);
```

**Note:** API normalizes `buy_in_*` → `entry_fee_*` for consistency (see `normalizeGame()` in `src/lib/games.ts`)

#### `poker.participants`
```sql
CREATE TABLE poker.participants (
  id uuid PRIMARY KEY,
  game_id uuid REFERENCES poker.games(id),
  fid bigint NOT NULL,  -- Farcaster ID
  status text DEFAULT 'joined',  -- 'joined', 'paid', 'refunded'
  tx_hash text,  -- Payment transaction hash (CRITICAL: this is how we verify payment)
  paid_at timestamptz,
  refund_tx_hash text,
  refunded_at timestamptz,
  payout_tx_hash text,  -- Settlement payout transaction hash
  payout_amount numeric,  -- Amount received in settlement
  paid_out_at timestamptz,
  refund_lock_id text,  -- For atomic locking (prevents double-refunds)
  refund_locked_at timestamptz,
  UNIQUE(game_id, fid)
);
```

**Key Fields:**
- `tx_hash` - **AUTHORITATIVE** payment transaction hash (used by `verifyPaymentOnChain()`)
- `status` - Can be `'joined'` with `tx_hash` present (means paid, just not explicitly marked 'paid')
- NO `wallet_address` column (doesn't exist - was removed due to schema mismatch)

---

## 4. Payment Verification (Critical for Settlement)

### How We Verify Payments (Same Pattern Needed for Settlement)

**File:** `src/lib/payment-verifier.ts`

**Function:** `verifyPaymentOnChain(input: PaymentVerificationInput)`

**What it does:**
1. Fetches transaction + receipt from Base RPC
2. Requires `receipt.status === 1` (success)
3. Parses ALL USDC Transfer event logs from receipt
4. Finds Transfer log where:
   - `log.address === USDC_ADDRESS` (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
   - `Transfer.to === ESCROW_ADDRESS`
   - `Transfer.value === expectedAmountRaw` (6 decimals)
5. Returns `payerAddress = Transfer.from` (this is the AUTHORITATIVE wallet address)

**Why this matters:**
- `tx.from` can be a paymaster/bundler (account abstraction)
- `Transfer.from` is the actual wallet that transferred USDC
- This is what we use for refunds (same pattern needed for settlement payouts)

---

## 5. Settlement API Endpoint

### Endpoint: `POST /api/games/[id]/settle-contract`

**Location:** `src/app/api/games/[id]/settle-contract/route.ts`

**Authorization:**
- Requires JWT auth via `requireAuth()` (Farcaster token)
- Must be club owner OR global admin

**Request Body:**
```typescript
{
  recipients: string[];  // Array of wallet addresses
  amounts: string[];     // Array of amounts (human-readable, e.g., "5.0")
  allowUnpaid?: boolean; // Optional: allow settlement with unpaid participants (admin only)
}
```

**Current Flow:**
1. Validates auth + ownership
2. Checks for unpaid participants (blocks if any unpaid)
3. Converts amounts to BigInt using `amountToUnits()` (handles USDC 6 decimals)
4. Calls contract: `contract.settleGame(gameId, recipients, amounts)`
5. Waits for receipt
6. Updates DB: sets `game.settle_tx_hash`, `participant.payout_tx_hash`, etc.

**Current Issues:**
1. Frontend can't get wallet addresses (tries `/api/users?fid=${fid}` which doesn't have `wallet_address`)
2. Contract call fails with "Payout exceeds collected" (amount calculation mismatch?)

---

## 6. Frontend Settlement Flow

### File: `src/app/games/[id]/page.tsx`

**Current Implementation:**
1. Owner clicks "Settle Game" button
2. Modal opens showing paid participants (filtered correctly: `status='joined' && tx_hash` exists)
3. User selects winner(s) based on `game.num_payouts`:
   - `num_payouts === 1`: Winner-take-all (select 1 winner)
   - `num_payouts > 1`: Split pot equally (select N winners)
4. On confirm, calls `handleSettleGame()`:
   - **PROBLEM HERE:** Tries `fetch('/api/users?fid=${fid}')` to get `wallet_address`
   - Should instead use payment transaction to derive address (like refund flow does)

**UI State:**
- `selectedWinnerFid` (string) - for winner-take-all
- `selectedWinnerFids` (number[]) - for multiple winners
- `allParticipants` - filtered paid participants

---

## 7. Authentication & Authorization

### Auth Flow

**Neynar Integration:**
- Uses Farcaster QuickAuth SDK
- JWT tokens validated server-side via `requireAuth()` in `src/lib/auth.ts`
- Token contains `fid` (Farcaster ID) - this is the user identity

**Permission Checks:**
- `requireClubOwner(fid, clubId)` - checks if user is owner of club
- `isGlobalAdmin(fid)` - checks if user is super admin (FID 318447 or TORMENTAL_FID env var)

**Users API:**
- `GET /api/users?fid=${fid}` - Returns Neynar user data
- Does NOT include `wallet_address` field (that was the problem)
- Only returns: `fid`, `username`, `pfp_url`, etc. (Farcaster profile data)

---

## 8. The Core Problem & Solution Approach

### Problem Statement

**Current State:**
1. Participants pay via USDC transfer (transaction stored in `participants.tx_hash`)
2. Settlement needs wallet addresses to pay out winners
3. Frontend tries `/api/users?fid=${fid}` but that doesn't have wallet addresses
4. Need to derive wallet addresses from payment transactions (same pattern as refunds)

### Solution Pattern (Already Working in Refund Flow)

**Refund flow** (`src/app/api/games/[id]/cancel/route.ts`) does this correctly:
```typescript
// For each participant with tx_hash:
const paymentVerification = await verifyPaymentOnChain({
  paymentTxHash: participant.tx_hash,
  expectedEscrowAddress: GAME_ESCROW_CONTRACT,
  expectedUsdcAddress: BASE_USDC_ADDRESS,
  expectedAmount: entryFeeAmount,
  chainId: BASE_CHAIN_ID,
});

// Use the authoritative payer address
const refundAddress = paymentVerification.payerAddress;  // From Transfer.from
```

**Settlement needs the same pattern:**
- Instead of `/api/users?fid=${fid}`, use `verifyPaymentOnChain()` for each winner's `tx_hash`
- Extract `payerAddress` from the payment verification
- Use that address in the `recipients[]` array for `settleGame()`

---

## 9. Contract Settlement Logic

### Amount Calculation

**Current Code:**
```typescript
// Frontend calculates:
const totalPot = entryFee * paidParticipants.length;
const amountPerWinner = totalPot / selectedWinnerFids.length;

// Backend converts:
const amountBigInts = amounts.map(amt => {
  const rawUnits = amountToUnits(amt, currency);  // amt * 1e6 for USDC
  return BigInt(rawUnits);
});
```

**Contract Validation:**
- Contract has `totalCollected` (sum of all entry fees paid)
- `settleGame()` checks: `sum(amounts[]) <= totalCollected`
- Error "Payout exceeds collected" means this check fails

**Potential Issues:**
1. Frontend might be calculating wrong `totalPot` (using wrong entry fee source?)
2. Contract's `totalCollected` might be different than expected
3. Rounding errors in amount conversion?

**Debugging Approach:**
- Before calling `settleGame()`, call `contract.getGame(gameId)` to see actual `totalCollected`
- Compare with expected (entry_fee_amount × number of paid participants)
- Log both values for diagnostics

---

## 10. What Needs to Be Fixed

### Priority 1: Wallet Address Derivation

**Fix:** Update `handleSettleGame()` in `src/app/games/[id]/page.tsx` to:
- Instead of `fetch('/api/users?fid=${fid}')`, use payment verification
- Option A: Create helper endpoint `/api/games/[id]/participants/[fid]/payment-address` that calls `verifyPaymentOnChain()`
- Option B: Move address lookup to backend (pass FIDs, backend derives addresses)

**Recommended:** Option B (backend derives addresses) - cleaner, safer, less API calls

### Priority 2: Amount Calculation Verification

**Fix:** Add contract state check before settlement:
```typescript
// Before calling settleGame(), verify amounts:
const gameState = await contract.getGame(gameId);
const contractTotalCollected = gameState.totalCollected;
const requestedTotal = amountBigInts.reduce((sum, amt) => sum + amt, 0n);

if (requestedTotal > contractTotalCollected) {
  return error(`Requested payout (${requestedTotal}) exceeds collected (${contractTotalCollected})`);
}
```

### Priority 3: Enhanced Diagnostics

**Add to settle-contract response:**
- Contract's `totalCollected` value
- Requested payout total
- Per-participant payment verification details
- Clear error messages if mismatch

---

## 11. Environment Variables

**Required for Settlement:**
```bash
# Base Network
BASE_RPC_URL=https://mainnet.base.org
GAME_ESCROW_CONTRACT=0x...  # Escrow contract address

# Master wallet (signs settlement transactions)
MASTER_WALLET_PRIVATE_KEY=0x...  # Private key (NEVER expose to client)
MASTER_WALLET_ADDRESS=0x...  # Derived address (for verification)

# Database
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE=...

# Auth
NEYNAR_API_KEY=...
```

---

## 12. Testing Checklist

**To verify settlement works:**

1. ✅ Create a paid game (entry fee, e.g., 5 USDC)
2. ✅ Have 2+ players join and pay (verify `participants.tx_hash` populated)
3. ✅ As owner, open settle modal (should show all paid participants)
4. ✅ Select winner(s) based on `num_payouts`
5. ✅ Click "Settle Game"
6. ✅ Verify:
   - No "Failed to fetch winner wallet address" error
   - No "Payout exceeds collected" error
   - Transaction succeeds on-chain
   - `game.settle_tx_hash` populated
   - `participant.payout_tx_hash` populated for winners
   - Winners receive USDC in their wallets

---

## 13. Key Files Reference

### Core Settlement Files
- `src/app/api/games/[id]/settle-contract/route.ts` - Settlement API endpoint
- `src/app/games/[id]/page.tsx` - Settlement UI + `handleSettleGame()` function
- `src/lib/payment-verifier.ts` - Payment verification (extracts wallet addresses)
- `src/lib/contracts.ts` - Contract ABI definitions
- `src/lib/amounts.ts` - Amount conversion helpers (`amountToUnits()`)

### Related Files
- `src/lib/games.ts` - `normalizeGame()`, `isPaidGame()` helpers
- `src/lib/pokerDb.ts` - Database access layer
- `src/lib/constants.ts` - Contract addresses, RPC URLs
- `src/app/api/games/[id]/cancel/route.ts` - Refund flow (reference implementation)

---

## 14. Next Steps for Implementation

1. **Fix wallet address lookup:**
   - Update `handleSettleGame()` to derive addresses from payment transactions
   - Use `verifyPaymentOnChain()` pattern (same as refunds)

2. **Add contract state verification:**
   - Query `contract.getGame(gameId)` before settlement
   - Compare requested amounts vs `totalCollected`
   - Return clear error if mismatch

3. **Improve error handling:**
   - Catch "Payout exceeds collected" and provide diagnostics
   - Log contract state vs requested amounts
   - Suggest fixes (e.g., "Contract has X USDC, but trying to pay Y USDC")

4. **Test end-to-end:**
   - Create test game with 2 players
   - Settle and verify on-chain state matches DB state
   - Verify winners receive correct amounts

---

## 15. Contract in Remix

**If you need to interact with/debug the contract:**

1. **Network:** Base Mainnet (Chain ID: 8453)
2. **Contract Address:** `GAME_ESCROW_CONTRACT` env var
3. **ABI:** See `src/lib/contracts.ts` (GAME_ESCROW_ABI)
4. **Key Functions to Test:**
   - `getGame(string gameId)` - Check `totalCollected` value
   - `settleGame(string gameId, address[] recipients, uint256[] amounts)` - Execute settlement
   - `participants(string gameId, address player)` - Check if player has paid

**Debugging Settlement Failures:**
- Call `getGame(gameId)` to see actual `totalCollected`
- Compare with sum of `amounts[]` being sent
- Check each `participants(gameId, playerAddress)` to verify `hasPaid == true`

---

This summary should give another AI assistant everything needed to understand the settlement feature and fix the remaining issues.


