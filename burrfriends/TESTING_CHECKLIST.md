# Pre-Flight Testing Checklist

## ✅ Before Testing Live

### 1. Database Migration
- [ ] Run `supabase_migration_onchain_game_fields.sql` in Supabase SQL Editor
- [ ] Verify migration succeeded (check for new columns: `onchain_status`, `onchain_game_id`, `onchain_tx_hash`, `onchain_error`)
- [ ] Verify indexes were created

### 2. Environment Variables in Vercel
Set these in Vercel Project Settings → Environment Variables:

#### Required Server-Side (Private):
- [ ] `MASTER_WALLET_PRIVATE_KEY` - Private key for wallet `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
  - Format: Can be with or without `0x` prefix (both work)
  - ⚠️ **CRITICAL**: Must correspond to the master wallet address above

#### Required (Can be Server or Public):
- [ ] `GAME_ESCROW_CONTRACT` - Contract address (or use `NEXT_PUBLIC_GAME_ESCROW_CONTRACT`)
- [ ] `BASE_RPC_URL` - Base network RPC URL (or use `NEXT_PUBLIC_BASE_RPC_URL`)
  - Default: `https://mainnet.base.org` if not set

#### Optional (Already Set):
- `NEXT_PUBLIC_GAME_ESCROW_CONTRACT` - Used as fallback if `GAME_ESCROW_CONTRACT` not set
- `NEXT_PUBLIC_BASE_RPC_URL` - Used as fallback if `BASE_RPC_URL` not set

### 3. Verify Master Wallet Setup
- [ ] Confirm `MASTER_WALLET_PRIVATE_KEY` corresponds to address `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
- [ ] The code will automatically assert this on first contract operation (fail-fast if mismatch)

### 4. Contract Verification
- [ ] Verify `GAME_ESCROW_CONTRACT` address is correct and deployed
- [ ] Verify the contract has `createGame(string, address, uint256)` function
- [ ] Verify the master wallet has `onlyMasterOrOwner` permissions on the contract

### 5. Testing Flow

#### Test 1: Create a Paid Game
1. [ ] As admin (Plants/Tormental), navigate to create game page
2. [ ] Create a game with entry fee (e.g., 0.021 USDC)
3. [ ] Verify game is created in database
4. [ ] Check logs/console for:
   - `[games] Registering paid game on-chain`
   - `[contract-ops] createGame transaction sent`
   - `[contract-ops] createGame transaction confirmed`
   - `[games] Game registered on-chain successfully`
5. [ ] Verify database: `onchain_status = 'active'`, `onchain_game_id` set, `onchain_tx_hash` set

#### Test 2: Join Game (Player)
1. [ ] As a regular user, navigate to the game page
2. [ ] Click "Join Game"
3. [ ] Verify join succeeds (game should be active on-chain)
4. [ ] Click "Pay & Join"
5. [ ] Verify payment transaction succeeds
6. [ ] Verify credentials are revealed after payment

#### Test 3: Error Handling (If Contract Call Fails)
1. [ ] If contract registration fails, verify:
   - Database shows `onchain_status = 'failed'`
   - `onchain_error` contains redacted error message
   - Game creation returns error to admin UI
   - Recovery endpoints are available for manual fix

#### Test 4: Recovery Endpoints (Admin)
If a game fails to register automatically:
1. [ ] `GET /api/admin/games/[id]/onchain-payload` - Returns Remix payload
2. [ ] Use payload to manually call `createGame()` in Remix
3. [ ] `POST /api/admin/games/[id]/mark-onchain-active` with tx_hash
4. [ ] Verify game status updates to `active`

### 6. Monitoring
- [ ] Check Vercel logs for any errors
- [ ] Monitor contract transactions on Base explorer
- [ ] Verify no private key exposure in logs (use `safeLog`)

## 🚨 Common Issues & Solutions

### Issue: "Master wallet address mismatch"
- **Cause**: `MASTER_WALLET_PRIVATE_KEY` doesn't correspond to expected address
- **Solution**: Verify private key is correct for `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`

### Issue: "Game not active on-chain yet"
- **Cause**: Contract registration failed or still pending
- **Solution**: Check database `onchain_status` field, use recovery endpoints if needed

### Issue: "Transaction failed" when creating game
- **Cause**: Contract call failed (gas, permissions, etc.)
- **Solution**: Check contract logs, verify master wallet has permissions, check gas settings

### Issue: Game created but status is 'failed'
- **Cause**: Contract call failed but game creation continued (as designed)
- **Solution**: Use recovery endpoints to manually register game on-chain

## 📝 Notes

- Free games (no entry fee) automatically get `onchain_status = 'active'` (no contract registration needed)
- Paid games require on-chain registration before players can join/pay
- The system is idempotent: if game already exists on contract, it's treated as success
- All errors are redacted for security (addresses/keys are masked in logs)

