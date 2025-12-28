# Refund Hardening Changes (Post-509abd2)

## Summary

This document describes the hardening changes made to prevent double refund broadcasts and improve payment verification reliability.

## Files Changed

1. **`poker/src/lib/payment-verifier.ts`**
   - Improved USDC Transfer log parsing (parses ALL transfers, better diagnostics)
   - Decimal-safe amount conversion (no JS float math)
   - Enhanced diagnostics with `parsedTransferCount` and `matchingTransfersCount`

2. **`poker/src/app/api/games/[id]/cancel/route.ts`**
   - Added atomic lock mechanism BEFORE broadcast (prevents double refunds)
   - Improved error handling and diagnostics

## Key Changes

### 1. Atomic Lock Before Broadcast

**Problem**: Two concurrent cancel calls could both broadcast refund transactions before either updates the DB, leading to double refunds.

**Solution**: Implemented atomic lock using `refund_lock_id` and `refund_locked_at` fields:
- Lock is acquired BEFORE broadcasting the refund transaction
- Lock expires after 5 minutes to handle stuck locks
- Only one process can acquire the lock per participant
- Lock is cleared after `refund_tx_hash` is persisted

**Lock Flow**:
1. Check for expired locks and clear them
2. Attempt to acquire lock (conditional update: `refund_tx_hash IS NULL AND refund_lock_id IS NULL`)
3. If lock acquired → broadcast refund tx
4. After broadcast → persist `refund_tx_hash` and clear lock
5. If lock not acquired → skip refund, return diagnostics

**DB Schema Requirements**:
```sql
ALTER TABLE poker.participants 
ADD COLUMN IF NOT EXISTS refund_lock_id TEXT,
ADD COLUMN IF NOT EXISTS refund_locked_at TIMESTAMPTZ;

-- Optional: Add index for lock queries
CREATE INDEX IF NOT EXISTS idx_participants_refund_lock 
ON poker.participants(game_id, fid) 
WHERE refund_lock_id IS NOT NULL;
```

### 2. Improved USDC Transfer Log Matching

**Changes**:
- Parses ALL Transfer logs from USDC contract (not just first match)
- Collects all matching transfers (escrow + amount)
- If multiple matches, uses first but includes `matchingTransfersCount` in diagnostics
- Enhanced failure diagnostics with:
  - `parsedTransferCount`: Total USDC Transfer logs found
  - `matchingTransfersCount`: Number that matched escrow+amount
  - `foundTransfersSummary`: First 10 transfers for debugging

**Example Failure Response**:
```json
{
  "success": false,
  "code": "PAYMENT_VERIFICATION_FAILED",
  "error": "No matching USDC Transfer found. Expected: 5000000 to 0xEscrow, but found 3 Transfer(s) from USDC contract (0 matched escrow+amount).",
  "diagnostics": {
    "parsedTransferCount": 3,
    "matchingTransfersCount": 0,
    "foundTransfersSummary": [...]
  }
}
```

### 3. Decimal-Safe Amount Conversion

**Problem**: JavaScript floating-point math can introduce precision errors (e.g., `5.0 * 1e6` might not equal `5000000` exactly).

**Solution**: String-based conversion:
```typescript
const expectedAmountStr = expectedAmount.toString();
const decimalParts = expectedAmountStr.split('.');
const wholePart = decimalParts[0] || '0';
const decimalPart = (decimalParts[1] || '').padEnd(6, '0').slice(0, 6);
const expectedAmountRaw = BigInt(wholePart) * BigInt(1e6) + BigInt(decimalPart);
```

This ensures exact conversion without floating-point errors.

## Escrow Contract Protection

**Question**: Does the escrow contract prevent double refunds?

**Answer**: The contract tracks `hasRefunded` per participant (see `participants(gameId, address)` view in ABI), but this check happens **on-chain AFTER broadcast**. 

**Conclusion**: The contract provides protection against double refunds once transactions are mined, but we still need the lock mechanism to prevent:
1. Two concurrent calls from both broadcasting refunds
2. Race conditions where both calls pass the DB check before either updates

**Lock is mandatory** because:
- Contract check happens after broadcast (too late to prevent double broadcast)
- DB conditional update happens after broadcast (race condition window exists)
- Lock BEFORE broadcast ensures only one process can proceed

## Testing Recommendations

1. **Concurrent Cancel Test**:
   - Create a paid game with 1 participant
   - Call cancel endpoint twice simultaneously
   - Verify: Only one refund transaction is broadcast
   - Verify: Second call returns diagnostics showing lock held

2. **Payment Verification Test**:
   - Test with payment tx that has multiple USDC transfers
   - Verify: Correct transfer is selected (escrow + amount match)
   - Verify: Diagnostics include all parsed transfers

3. **Decimal Precision Test**:
   - Test with amounts like `5.123456`, `10.000001`
   - Verify: Conversion is exact (no floating-point errors)

## Migration Required

**Before deploying**, run this SQL migration:

```sql
-- Add lock columns to participants table
ALTER TABLE poker.participants 
ADD COLUMN IF NOT EXISTS refund_lock_id TEXT,
ADD COLUMN IF NOT EXISTS refund_locked_at TIMESTAMPTZ;

-- Optional: Index for lock queries
CREATE INDEX IF NOT EXISTS idx_participants_refund_lock 
ON poker.participants(game_id, fid) 
WHERE refund_lock_id IS NOT NULL;

-- Optional: Add comment
COMMENT ON COLUMN poker.participants.refund_lock_id IS 'Lock ID for preventing concurrent refund broadcasts';
COMMENT ON COLUMN poker.participants.refund_locked_at IS 'Lock expiration timestamp (5 minutes from acquisition)';
```

## Key Diffs

### payment-verifier.ts

```diff
- const expectedAmountRaw = BigInt(Math.floor(expectedAmount * 1e6));
+ // Decimal-safe conversion using string math
+ const expectedAmountStr = expectedAmount.toString();
+ const decimalParts = expectedAmountStr.split('.');
+ const wholePart = decimalParts[0] || '0';
+ const decimalPart = (decimalParts[1] || '').padEnd(6, '0').slice(0, 6);
+ const expectedAmountRaw = BigInt(wholePart) * BigInt(1e6) + BigInt(decimalPart);

- let matchingTransfer: {...} | null = null;
+ const matchingTransfers: Array<{...}> = [];
+ // ... collect all matches ...
+ const matchingTransfer = matchingTransfers.length > 0 ? matchingTransfers[0] : null;
```

### cancel/route.ts

```diff
+ // ATOMIC LOCK: Claim refund lock BEFORE broadcasting transaction
+ const lockId = `${correlationId}-${Date.now()}`;
+ const lockExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
+ 
+ const lockResult = await pokerDb.updateConditional<GameParticipant>(
+   'participants',
+   { game_id: gameId, fid: playerFid },
+   { refund_lock_id: lockId, refund_locked_at: lockExpiresAt },
+   { refund_tx_hash: null, refund_lock_id: null }
+ );
+ 
+ if (lockResult.rowsAffected === 0) {
+   // Lock not acquired - skip refund
+   return diagnostics;
+ }

  const tx = await contract.refundPlayer(onchainGameId, playerAddress);
  const refundTxHash = tx.hash;

- const updateResult = await pokerDb.updateConditional<GameParticipant>(
-   'participants',
-   { game_id: gameId, fid: playerFid },
-   { refund_tx_hash: refundTxHash },
-   { refund_tx_hash: null }
- );
+ // Update locked row (verify we hold the lock)
+ const updateResult = await pokerDb.updateConditional<GameParticipant>(
+   'participants',
+   { game_id: gameId, fid: playerFid, refund_lock_id: lockId },
+   { refund_tx_hash: refundTxHash, refund_lock_id: null, refund_locked_at: null },
+   {}
+ );
```

## Acceptance Criteria

✅ Lock acquired BEFORE broadcast (prevents double refunds)  
✅ Lock expires after 5 minutes (handles stuck locks)  
✅ All USDC Transfer logs parsed (better diagnostics)  
✅ Decimal-safe amount conversion (no float errors)  
✅ Enhanced diagnostics (parsedTransferCount, matchingTransfersCount)  
✅ Escrow contract protection documented (hasRefunded check exists but happens after broadcast)

