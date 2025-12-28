# Refund Feasibility Analysis

## Task 1: Current Cancel Flow End-to-End

### Call Graph
```
UI (Host clicks cancel)
  ↓
POST /api/games/[id]/cancel
  ↓
1. Auth check (requireAuth + club owner/admin)
  ↓
2. Fetch game from DB
  ↓
3. Check game status (idempotent if already cancelled)
  ↓
4. Filter participants (BUG: filtering for wrong status - see below)
  ↓
5. For each participant:
   - Get wallet address from Neynar
   - Check if already refunded (DB status check)
   - Call contract.refundPlayer(gameId, playerAddress)
   - Wait for tx receipt
   - Update DB: status='refunded', tx_hash=refundTxHash
   - Log refund event
  ↓
6. Update game.status='cancelled' in DB
  ↓
Return success
```

### Where USDC Goes
- **Payment Flow**: When players join via `joinGame()`, USDC is transferred to the **GameEscrow contract** (`GAME_ESCROW_CONTRACT`)
- **Escrow Contract**: The contract holds USDC until either:
  - `refundPlayer()` is called → refunds USDC to player
  - `settleGame()` is called → distributes USDC to winners
- **No EOA/Master Wallet**: Funds are NOT sent to an EOA or master wallet. They stay in the escrow contract.

## Task 2: Refund Feasibility

### Contract Analysis

**Contract**: `GameEscrow` (deployed at address in `GAME_ESCROW_CONTRACT` env var)

**Refund Function**: `refundPlayer(string gameId, address player)`
- **Access Control**: `onlyMasterOrOwner` modifier (master wallet OR contract owner)
- **Safety Checks**:
  - Requires `participant.hasPaid == true`
  - Requires `participant.hasRefunded == false` (prevents double refunds)
  - Requires `!game.isSettled` (cannot refund after settlement)
- **Refund Mechanism**:
  - For ETH: Direct transfer via `call{value: amount}("")`
  - For ERC20 (USDC): `token.safeTransfer(player, amount)`
- **State Updates**:
  - Sets `participant.hasRefunded = true`
  - Decrements `game.totalCollected` by refunded amount
  - Emits `RefundIssued` event

### Contract Tracking
The contract tracks:
- Per-game deposits: `games[gameId].totalCollected`
- Per-participant deposits: `participants[gameId][player].amountPaid`
- Refund status: `participants[gameId][player].hasRefunded`

### Decision: ✅ REFUNDS ARE POSSIBLE

**No contract changes needed!** The contract already fully supports refunds:
1. ✅ `refundPlayer()` function exists
2. ✅ Prevents double refunds via `hasRefunded` flag
3. ✅ Tracks per-game/per-participant deposits
4. ✅ Can be called by master wallet (server signs via `MASTER_WALLET_PRIVATE_KEY`)

## Task 3: The Bug

### Root Cause
The cancel route filters participants incorrectly:
- **Current (buggy)**: Filters for `status === 'paid'` OR `payment_status === 'paid'`
- **Actual**: When participants pay, status is set to `'joined'` (see `payments/confirm/route.ts:482`)

**Result**: Filter returns 0 participants → no refunds are attempted → game is cancelled but participants never refunded.

### Fix
Change filter to check:
1. `status === 'joined'` OR `status === 'paid'` (backward compatibility)
2. `tx_hash` is present (indicates payment was confirmed)
3. `status !== 'refunded'` (skip already refunded)

### Implementation Details

**Files Changed**:
- `poker/src/app/api/games/[id]/cancel/route.ts` (line 110-112)

**Contract Call**:
- `contract.refundPlayer(gameId, playerAddress)` - already implemented correctly
- Uses master wallet private key from env (`MASTER_WALLET_PRIVATE_KEY`)
- Waits for transaction receipt before updating DB

**DB Updates**:
- Sets participant `status='refunded'` and `tx_hash=refundTxHash`
- Sets game `status='cancelled'`
- Logs refund event to audit log

## Task 4: Guardrails & Testing

### Existing Guardrails
✅ Contract-level:
- Prevents double refunds (`hasRefunded` flag)
- Prevents refunds after settlement
- Requires participant has paid

✅ Server-level:
- Checks participant status before attempting refund
- Validates wallet address before calling contract
- Logs all refund attempts (success/failure)
- Returns error if any refund fails (prevents partial cancellation)

✅ Idempotency:
- Checks if already refunded before attempting
- Returns success if game already cancelled

### Improvements Needed
1. ✅ **FIXED**: Participant status filter (was checking 'paid' instead of 'joined')
2. Add more detailed logging (participant count, refund amounts)
3. Add on-chain verification check before refund (optional but recommended)

### Testing Recommendations
1. **E2E Test**:
   - Create paid game with entry fee
   - Join game with 1-3 accounts (confirm payments)
   - Cancel game as host
   - Verify each participant receives USDC refund on-chain
   - Verify DB shows `status='refunded'` for each participant
   - Verify game shows `status='cancelled'`

2. **Idempotency Test**:
   - Cancel game twice → second call should return success (already cancelled)
   - Attempt to refund already refunded participant → should skip

3. **Error Handling Test**:
   - Cancel game with participant missing wallet address → should fail gracefully
   - Cancel game with contract call failure → should not cancel game

## Summary

✅ **Contract supports refunds** - No changes needed  
✅ **Bug identified** - Participant status filter was wrong  
✅ **Fix implemented** - Filter now checks for 'joined' status + tx_hash  
✅ **Guardrails exist** - Contract and server-level checks prevent double refunds  

**Next Steps**: Deploy fix and test E2E with real game cancellation.

