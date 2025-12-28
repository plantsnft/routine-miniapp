# Next Steps - Payment Integration Complete! 🎉

## ✅ What's Done

1. **✅ Smart Contract Deployed**
   - Contract Address: `0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D`
   - Network: Base Mainnet
   - Verified on Sourcify & Routescan
   - All functions ready: `createGame`, `joinGame`, `refundPlayer`, `settleGame`

2. **✅ Environment Variables Set**
   - Contract address configured
   - Base RPC URL configured

3. **✅ Database Schema Ready**
   - Payment tracking fields in place
   - Transaction hashes can be stored

4. **✅ UI Components Ready**
   - Payment button component created
   - Game page shows payment info
   - Password reveal after payment

---

## 🚧 What's Next (Priority Order)

### Step 1: Complete Payment Flow Integration ⚡ ✅ COMPLETED!

**Status**: ✅ Payment button now uses Farcaster SDK transaction API!

**What was done:**

1. ✅ **Installed ethers.js** for proper ABI encoding
2. ✅ **Created transaction encoding utilities** (`src/lib/transaction-encoding.ts`)
   - `encodeJoinGame()` - Encodes joinGame function call
   - `encodeApprove()` - Encodes ERC20 approve function call
3. ✅ **Updated PaymentButton.tsx** to use Farcaster SDK
   - Uses `sdk.actions.sendTransaction()` from `@farcaster/miniapp-sdk`
   - Handles both ETH and USDC payments
   - USDC flow: approve first, then joinGame
   - ETH flow: direct joinGame with value
   - Proper error handling for user rejections

**Files Updated:**
1. ✅ `poker/src/components/PaymentButton.tsx` - Now sends real transactions via Farcaster SDK
2. ✅ `poker/src/lib/transaction-encoding.ts` - New file for ABI encoding
3. ✅ `poker/package.json` - Added ethers@^6.0.0 dependency

**How it works:**
1. User clicks "Pay & Join" button
2. For USDC: Approve transaction sent first via `sdk.actions.sendTransaction()`
3. Payment transaction sent (joinGame) via `sdk.actions.sendTransaction()`
4. Transaction hash received from Farcaster SDK
5. Backend confirms payment with on-chain verification
6. Password revealed to player

---

### Step 2: Implement Backend Contract Calls 🔧 ✅ COMPLETED!

**Status**: ✅ Both routes now make real contract calls!

**What was done:**

1. ✅ **Refund Route** (`/api/games/[id]/refund`)
   - Uses ethers.js to connect to Base network
   - Calls `contract.refundPlayer(gameId, playerAddress)`
   - Fetches player wallet address from Neynar if not provided
   - Waits for transaction confirmation
   - Updates database with refund status

2. ✅ **Settle Route** (`/api/games/[id]/settle-contract`)
   - Uses ethers.js to connect to Base network
   - Calls `contract.settleGame(gameId, recipients, amounts)`
   - Validates addresses and converts amounts to BigInt
   - Waits for transaction confirmation
   - Updates game status to 'completed'

**Files Updated:**
1. ✅ `poker/src/app/api/games/[id]/refund/route.ts` - Real contract refund call
2. ✅ `poker/src/app/api/games/[id]/settle-contract/route.ts` - Real contract settlement call

**⚠️ REQUIRED: Add Environment Variable**
- Add `MASTER_WALLET_PRIVATE_KEY` to `.env.local` and Vercel
- This is the private key for wallet `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
- See `BACKEND_CONTRACT_CALLS_COMPLETE.md` for details

---

### Step 3: Add Contract Creation on Game Setup 🎮

**Status**: Not implemented yet

**What needs to be done:**

When a club owner creates a paid game, automatically call `createGame()` on the escrow contract.

**Files to Update:**
1. `poker/src/app/api/games/route.ts` - After creating game in DB, call contract
2. Store `escrow_contract_address` in database (already a field exists)

**Requirements:**
- Convert entry fee amount to proper units (wei/token units)
- Call `GameEscrow.createGame()` with game ID, currency, and entry fee
- Handle errors gracefully

---

### Step 4: Test End-to-End Flow 🧪

**Test Scenarios:**

1. **Create Paid Game** (Club Owner)
   - Create game with entry fee
   - Verify contract `createGame()` is called
   - Verify game stored in DB with contract address

2. **Player Joins & Pays** (Player)
   - Click "Pay & Join" button
   - Transaction sent successfully
   - Password revealed after payment
   - Participant status updated to "paid"

3. **Owner Issues Refund** (Club Owner) ✅
   - Click refund button for a participant
   - Contract `refundPlayer()` called ✅
   - Participant status updated to "refunded" ✅

4. **Owner Settles Game** (Club Owner) ✅
   - Enter results with payouts
   - Contract `settleGame()` called with winner addresses ✅
   - Payouts distributed from escrow ✅

---

### Step 5: Error Handling & Edge Cases 🛡️

**Things to handle:**

- Transaction failures (revert, out of gas, etc.)
- Network errors
- Contract not deployed
- Insufficient balance for payment
- USDC approval failures
- Refund failures
- Settlement failures

---

## 📚 Resources

### Farcaster Transaction API
- Farcaster Mini App SDK: `@farcaster/miniapp-sdk`
- Check docs: https://docs.farcaster.xyz/miniapps

### Contract Address
- `0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D`
- View on BaseScan: https://basescan.org/address/0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D

### Base Network
- Chain ID: 8453
- RPC: `https://mainnet.base.org`
- Explorer: https://basescan.org

### USDC Token
- Address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Decimals: 6

---

## 🎯 Immediate Action Items

1. **Research Farcaster Transaction API**
   - Check if `@farcaster/miniapp-sdk` has transaction methods
   - Look at existing transaction examples in codebase

2. **Implement Payment Button Transaction Sending**
   - Replace placeholder in `PaymentButton.tsx`
   - Test with real transaction

3. **Add Contract Creation on Game Setup**
   - Update `/api/games` POST route
   - Call contract after DB insert

4. **Implement Backend Contract Calls**
   - Add ethers.js contract interaction
   - Test refund and settlement

---

## ❓ Questions to Answer

1. **Transaction API**: Does Farcaster SDK have a transaction API, or should we use wagmi?
2. **Wallet Connection**: Do players need to explicitly connect wallets, or is it automatic in Farcaster?
3. **Gas Fees**: Who pays gas? Players or contract owner?
4. **USDC Approval**: How do we handle the two-step USDC flow (approve + join)?

---

## 📝 Notes

- Master wallet private key should be stored securely (never commit to git)
- All contract calls should have proper error handling
- Transaction verification is already implemented in `/api/payments/confirm`
- Database tracking is ready for all transaction types

