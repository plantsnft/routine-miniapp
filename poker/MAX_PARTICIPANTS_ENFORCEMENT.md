# Max Participants Enforcement

## Overview

The `max_participants` field is **app-level only** and enforced in the application layer (database + API), not on-chain.

## Contract Support

The `GameEscrow` contract's `createGame()` function does **NOT** accept a max players parameter. It only accepts:
- `gameId` (string)
- `currency` (address)
- `entryFee` (uint256)

Therefore, `max_participants` is:
- ✅ Stored in the database (`games.max_participants`)
- ✅ Enforced in API endpoints (returns 409 if full)
- ❌ **NOT** enforced on-chain

## Enforcement Points

### 1. Free Join (`POST /api/games/[id]/join`)
- Checks capacity before allowing join
- Returns 409 "Game is full" if `joinedCount >= max_participants`
- Allows existing participants to re-join (updates eligibility)

### 2. Paid Join (`POST /api/payments/confirm`)
- Checks capacity before allowing payment confirmation
- Returns 409 "Game is full" if `joinedCount >= max_participants`
- Allows existing participants to confirm/recover

### 3. Recovery (`POST /api/payments/recover`)
- Checks capacity before recovering participant record
- Returns 409 "Game is full" if `joinedCount >= max_participants`
- Allows existing participants to recover (they may have paid but DB record missing)

## Capacity Calculation

All capacity checks use:
```typescript
const joinedParticipants = await pokerDb.fetch('participants', {
  filters: { game_id: gameId, status: 'joined' },
});
const joinedCount = joinedParticipants.length;
```

Only participants with `status='joined'` are counted.

## Edge Cases

1. **Existing Participants**: If a user is already a participant, they can:
   - Re-join (free games)
   - Confirm payment (paid games)
   - Recover payment (paid games)
   
   This prevents blocking legitimate recovery scenarios.

2. **Null/Undefined max_participants**: If `max_participants` is null or undefined, capacity is unlimited (no enforcement).

3. **On-chain State**: The contract does not know about max_participants, so:
   - Users could theoretically call `joinGame()` on-chain even if app says game is full
   - However, the app will reject confirm/recover, so they cannot complete the flow
   - This is acceptable for the current implementation (app-level enforcement is sufficient)

## Future Considerations

If on-chain enforcement is needed:
1. Contract would need to be upgraded to include `maxPlayers` parameter in `createGame()`
2. Contract's `joinGame()` would need to check capacity before allowing joins
3. Migration path for existing games would need to be handled

