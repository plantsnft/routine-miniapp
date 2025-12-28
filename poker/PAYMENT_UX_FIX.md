# Payment Flow UX Improvements

## Summary

Fixed UX issues that required extra clicks/refresh after payment. The flow now automatically recovers from confirm failures and handles edge cases gracefully. Updated payment flow to use 1-2 wallet confirmations (check allowance, approve if needed, then pay) instead of requiring extra in-app clicks.

## Changes

### 1. Confirm Endpoint Robustness ✅

**File**: `src/app/api/payments/confirm/route.ts`

**Changes**:
- If amount mismatch occurs but user is joined on-chain (checked via `contract.participants`), accept the payment anyway
- Added `actualAmount` logging to debug amount mismatches
- Added contract state check when amount mismatch is detected
- Returns `{ ok: true, warning: "amount_mismatch_but_joined_onchain" }` if amount mismatch but joined on-chain

**Security**: 
- ✅ Allowlist requirement still enforced
- ✅ GameId binding still enforced (must match)
- ✅ Only accepts if contract shows user is actually joined

### 2. Client Auto-Heal ✅

**File**: `src/components/PaymentButton.tsx`

**Changes**:
- If `/api/payments/confirm` returns 400/409, automatically calls `/api/payments/recover` with `txHash`
- After recovery, polls `/api/games/:id/participants` up to 3 times (1 second delays) until status becomes 'joined'
- Calls `onSuccess` with recovered password once participant status is confirmed

**Flow**:
1. Payment tx sent → Wallet confirms
2. `/api/payments/confirm` called
3. If 400/409 → Auto-call `/api/payments/recover` with `txHash`
4. Poll participants endpoint until `status: 'joined'` found
5. Call `onSuccess` → UI updates automatically

### 2b. Payment Flow (1-2 Wallet Confirmations) ✅

**File**: `src/components/PaymentButton.tsx`

**Changes**:
- Removed arbitrary 2-second wait after approval
- Implemented deterministic sequencing: wait for approval confirmation OR poll allowance until sufficient

**Flow Details**:
1. User clicks "Pay & Join" button
2. System checks USDC allowance automatically (logs: `allowanceBefore`, `entryFee`, `needsApproval`)
3. If allowance insufficient:
   - **Wallet Confirmation #1**: Approve USDC spending (automatically triggered)
   - **Deterministic Sequencing**: Wait for approval transaction to be confirmed (1 confirmation via `approveTx.wait(1)`) OR poll allowance until >= entryFee (max 10s timeout, polls every 500ms)
   - Logs: `allowanceAfter` after approval is confirmed
   - **Wallet Confirmation #2**: Pay/join transaction (automatically triggered after approval is confirmed)
4. If allowance already sufficient:
   - **Wallet Confirmation #1**: Pay/join transaction only (no approval needed)

**No in-app confirmation modals** - all confirmations are wallet-native approvals.

**Deterministic Approval Sequencing**:
- **Primary Method**: After approval transaction hash is received, wait for 1 confirmation using `approveTx.wait(1)`
- **Fallback Method**: If `wait(1)` fails (e.g., transaction not found), poll the allowance contract function every 500ms until `allowance >= entryFee` or 10s timeout
- **Final Verification**: Before proceeding to payment, verify allowance is sufficient
- **Debug Logging**: Logs `allowanceBefore`, `allowanceAfter`, and `entryFee` for observability

This ensures the payment transaction only proceeds after the approval is actually confirmed on-chain, preventing race conditions and failed transactions.

### 3. Silence Non-Critical 404s ✅

**File**: `src/app/games/[id]/page.tsx`

**Changes**:
- Credentials 404: Treated as "no credentials set" (not an error)
- UI shows appropriate message: "Host hasn't set password yet"
- No console error for 404 on credentials endpoint

**Note**: Announcements endpoint wasn't being called from the game detail page, so no changes needed there.

### 4. SVG Cleanup ✅

**Note**: No SVG width/height="small" attributes found in the codebase. No changes needed.

## Logging Improvements

Added structured logging with correlation IDs:
- `actualAmount` logged when amount mismatch occurs
- `checkedContractState` and `isJoinedOnChain` flags in confirm logs
- Warning log when amount mismatch but joined on-chain accepted

## Testing Checklist

Use this checklist to verify the improved flow:

### Before Payment
- [ ] Navigate to game detail page
- [ ] Verify "Pay X USDC & Join" button is visible
- [ ] Check browser console for any errors

### During Payment
- [ ] Click "Pay & Join" button
- [ ] Approve USDC in wallet popup
- [ ] Confirm joinGame transaction
- [ ] **Expected**: No manual refresh needed

### After Payment (Immediate)
- [ ] UI should show "✓ You've joined" or "✓ Paid" badge within 1-2 seconds
- [ ] ClubGG link and password (if available) should appear automatically
- [ ] "Players Paid/Signed Up" count should increment
- [ ] **No console errors** for credentials 404 (if no password set)

### After Payment (Auto-Heal Test)
- [ ] If confirm returns 400 (amount mismatch):
  - [ ] Browser console shows "Confirm failed, attempting recovery..."
  - [ ] Recovery succeeds
  - [ ] Polling logs show participant status checks
  - [ ] UI updates automatically (no manual refresh)
- [ ] Check Vercel logs for correlation ID:
  - [ ] Should see "[payments/confirm] Amount mismatch but user joined on-chain - accepting payment" OR
  - [ ] Should see "[payments][recover] Participant record recovered"

### Persistence Test
- [ ] Refresh page (F5)
- [ ] Status should persist (still shows "✓ Joined")
- [ ] Credentials still visible

## Manual Verification Steps

1. **Create a test game** with entry fee (e.g., 0.01 USDC)
2. **Join the game** using the payment flow
3. **Verify automatic updates**:
   - No manual refresh needed
   - Status badge appears automatically
   - Credentials displayed automatically (if set)
4. **Check logs** (Vercel):
   - Search for correlation ID from payment confirm
   - Verify `actualAmount` is logged
   - Verify `amountMismatch` flag if applicable
   - Verify `checkedContractState: true` if contract check occurred

## Files Changed

1. `src/lib/blockchain-verify.ts` - Added `actualAmount` and `amountMismatch` to `TransactionVerification` interface
2. `src/app/api/payments/confirm/route.ts` - Added contract state check for amount mismatches, improved logging
3. `src/components/PaymentButton.tsx` - Added auto-heal with recover + polling
4. `src/app/games/[id]/page.tsx` - Handle credentials 404 gracefully

## Breaking Changes

None - all changes are backward compatible.

