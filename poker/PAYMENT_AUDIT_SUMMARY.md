# Payment Verification Audit & Hardening Summary

## Security Audit Results ✅

### Allowlist Enforcement
**Status**: ✅ **SECURE** - All code paths enforce allowlist

**Verified Code Paths**:
1. **`/api/payments/confirm`** (`src/app/api/payments/confirm/route.ts`):
   - ✅ Calls `getAllPlayerWalletAddresses(fid)` to get allowlist
   - ✅ Passes allowlist to `verifyJoinGameTransaction()`
   - ✅ `verifyJoinGameTransaction()` **rejects** if `tx.from` not in allowlist (returns `403`)
   - ✅ Contract state check only checks addresses **in allowlist**
   - ✅ **No code path accepts address mismatch**

2. **`/api/payments/recover`** (`src/app/api/payments/recover/route.ts`):
   - ✅ Calls `getAllPlayerWalletAddresses(fid)` to get allowlist
   - ✅ If `txHash` provided: verifies `tx.from` is in allowlist before checking contract
   - ✅ Fallback address check only iterates through **allowed addresses**
   - ✅ **No code path accepts address mismatch**

3. **`verifyJoinGameTransaction()`** (`src/lib/blockchain-verify.ts`):
   - ✅ **Strict enforcement**: Checks `tx.from` against `allowedAddresses` array
   - ✅ Returns `valid: false, error: "Payment sent from wallet not linked..."` if not in allowlist
   - ✅ **No fallback or "accept mismatch" logic**

**Conclusion**: ✅ **No code path accepts address mismatch without allowlist check**. All payment verification enforces `tx.from ∈ getAllPlayerWalletAddresses(fid)`.

## Amount Verification Improvements ✅

### USDC Transfer Log Parsing
**Implementation**: `src/lib/blockchain-verify.ts`

**Changes**:
- ✅ Parses ERC20 `Transfer(address indexed from, address indexed to, uint256 value)` event logs
- ✅ Verifies:
  - `from` = `tx.from` (payer address, already verified in allowlist)
  - `to` = `GAME_ESCROW_CONTRACT`
  - `amount` = `expectedAmount` (in base units)
- ✅ Sets `transferLogVerified: true` if Transfer log confirms correct amount
- ✅ Sets `amountMismatch: true` if Transfer log amount doesn't match or log not found

**Fallback Behavior**:
- ✅ If amount mismatch but user is joined on-chain (via `contract.participants`), payment is accepted
- ✅ Warning logged: `[payments/confirm] Amount mismatch but user joined on-chain - accepting payment`
- ✅ Monitoring log: `[payments/confirm] USDC Transfer log verification not performed - monitoring` (if logs can't be verified)

**Logging Fields Added**:
- `transferLogVerified: boolean` - Whether amount was verified via Transfer log (USDC) or tx.value (ETH)
- `actualAmount: string` - Actual amount from transaction (ETH: tx.value, USDC: Transfer log)
- `amountMismatch: boolean` - Whether amount doesn't match expected
- `checkedContractState: boolean` - Whether contract participants mapping was checked
- `isJoinedOnChain: boolean` - Whether user is marked as joined in contract

## Noise Cleanup ✅

### Credentials Endpoint
**File**: `src/app/api/games/[id]/credentials/route.ts`

**Change**: Returns `200 { ok: true, data: { hasCredentials: false } }` instead of `404`

**Response Format**:
```typescript
// No credentials:
{ ok: true, data: { hasCredentials: false } }

// Has credentials:
{ ok: true, data: { hasCredentials: true, clubggUsername: "...", clubggPassword: "..." } }
```

**Frontend**: Updated `src/app/games/[id]/page.tsx` to check `data.hasCredentials === false` instead of handling 404

### Announcements Endpoint
**File**: `src/app/api/clubs/[id]/announcements/route.ts`

**Changes**:
- ✅ GET: Returns `200 { ok: true, data: [] }` if club not found or no announcements (instead of 404/500)
- ✅ POST: Returns `200 { ok: true, data: null, error: "Club not found" }` if club not found (instead of 404)

**Result**: No more 404 console errors for expected "not found" scenarios

## Documentation Updates ✅

**File**: `PAYMENT_SECURITY_FIX.md`

**Updates**:
- ✅ Clarified that allowlist is **strictly enforced** (no "accept mismatch" behavior)
- ✅ Added note about USDC Transfer log parsing
- ✅ Updated to reflect that `getAllPlayerWalletAddresses()` includes custody + verified addresses

## Logging Fields for Vercel Runtime Validation

All logs include `correlationId` for request tracing. Key log events:

### Payment Confirm Success
```json
{
  "level": "info",
  "message": "[payments/confirm] Payment confirmed successfully",
  "correlationId": "<uuid>",
  "gameId": "<uuid>",
  "onchainGameId": "<string>",
  "fid": 123456,
  "txHash": "0x...",
  "participantId": "<uuid>",
  "addressInAllowlist": true,
  "verifiedPlayerAddress": "0x...",
  "allowedAddressesCount": 2,
  "expectedAmount": "30000",
  "actualAmount": "30000",
  "amountMismatch": false,
  "transferLogVerified": true,
  "checkedContractState": false,
  "isJoinedOnChain": false,
  "dbUpsertOccurred": true
}
```

### Amount Mismatch (But Joined On-Chain)
```json
{
  "level": "warn",
  "message": "[payments/confirm] Amount mismatch but user joined on-chain - accepting payment",
  "correlationId": "<uuid>",
  "gameId": "<uuid>",
  "onchainGameId": "<string>",
  "fid": 123456,
  "txHash": "0x...",
  "expectedAmount": "30000",
  "actualAmount": "25000",
  "transferLogVerified": false,
  "currency": "USDC",
  "checkedContractState": true,
  "isJoinedOnChain": true
}
```

### USDC Transfer Log Not Verified (Monitoring)
```json
{
  "level": "warn",
  "message": "[payments/confirm] USDC Transfer log verification not performed - monitoring",
  "correlationId": "<uuid>",
  "gameId": "<uuid>",
  "onchainGameId": "<string>",
  "fid": 123456,
  "txHash": "0x...",
  "expectedAmount": "30000",
  "currency": "USDC"
}
```

### Allowlist Rejection (403)
```json
{
  "level": "warn",
  "message": "[blockchain-verify] Address not in allowlist",
  "payerAddress": "0x...",
  "allowedAddressesCount": 2
}
```

## Files Changed

1. `src/lib/blockchain-verify.ts` - Added USDC Transfer log parsing, added `transferLogVerified` field
2. `src/app/api/payments/confirm/route.ts` - Added monitoring logs, improved logging fields
3. `src/app/api/games/[id]/credentials/route.ts` - Returns 200 with `hasCredentials: false` instead of 404
4. `src/app/api/clubs/[id]/announcements/route.ts` - Returns 200 for "not found" scenarios
5. `src/app/games/[id]/page.tsx` - Updated to handle `hasCredentials` field
6. `PAYMENT_SECURITY_FIX.md` - Updated to reflect strict allowlist enforcement

## Testing Checklist

- [ ] Verify allowlist rejection: Send payment from address not in `getAllPlayerWalletAddresses(fid)` → Should return 403
- [ ] Verify USDC Transfer log parsing: Check logs for `transferLogVerified: true` on successful USDC payments
- [ ] Verify amount mismatch fallback: If amount mismatch but joined on-chain → Should see warning log but payment accepted
- [ ] Verify credentials 200: No credentials → Should return 200 with `hasCredentials: false` (not 404)
- [ ] Verify announcements 200: Club not found → Should return 200 with empty array (not 404)

## Security Guarantees

✅ **Address Binding**: `tx.from` MUST be in `getAllPlayerWalletAddresses(fid)` (custody + verified addresses)
✅ **GameId Binding**: Transaction MUST call `joinGame(expectedGameId)` with correct gameId
✅ **Amount Verification**: USDC payments verified via Transfer logs, ETH via tx.value
✅ **Fallback Safety**: Amount mismatch only accepted if user is confirmed joined on-chain (via allowlist-verified contract check)

