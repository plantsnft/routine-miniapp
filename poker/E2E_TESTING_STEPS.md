# End-to-End Testing Steps

## Prerequisites Checklist

Before testing, ensure:

- [ ] **Database Migration**: Run `supabase_migration_onchain_game_fields.sql` in Supabase SQL Editor
- [ ] **Environment Variables**: Verify in Vercel:
  - `MASTER_WALLET_PRIVATE_KEY` is set (private key for `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`)
  - `GAME_ESCROW_CONTRACT` or `NEXT_PUBLIC_GAME_ESCROW_CONTRACT` is set
  - `BASE_RPC_URL` or `NEXT_PUBLIC_BASE_RPC_URL` is set (or uses default)

## Testing Flow

### Step 1: Create a New Paid Game (Admin)

1. **Open the app** in Warpcast Mini App Preview
2. **Sign in** as Plants or Tormental (global admin)
3. **Navigate to**: `/clubs/hellfire/games/new`
4. **Fill out the form**:
   - ClubGG URL: `https://clubgg.com/game/...` (optional)
   - Entry Fee Amount: `0.021` (or any small test amount)
   - Game Currency: `USDC`
   - Number of Players: `10` (optional)
   - Click "Create Game"

5. **Expected Results**:
   - ✅ Game is created in database
   - ✅ Game automatically registers on-chain (check Vercel logs)
   - ✅ Game status shows `onchain_status: 'active'` in database
   - ✅ `onchain_tx_hash` is set in database
   - ✅ Game appears in games list with "✅ On-chain" badge

6. **If Registration Fails**:
   - Game will still be created in database
   - Status will be `onchain_status: 'failed'`
   - You'll see an error message in the UI
   - Use recovery buttons in manage page to fix manually

### Step 2: Verify On-Chain Status (Admin)

1. **Navigate to**: `/games/[game-id]/manage`
2. **Check for**:
   - ✅ Green banner: "Game Active On-Chain" (if successful)
   - ✅ Shows truncated tx hash
   - ✅ Shows on-chain game ID
   - ⚠️ Yellow banner with recovery buttons (if failed)

### Step 3: Join Game (Player)

1. **Open the app** as a different user (not admin)
2. **Navigate to**: `/games/[game-id]`
3. **Click "Join Game"**
4. **Expected Results**:
   - ✅ Join succeeds (if game is active on-chain)
   - ❌ Error: "Game not active on-chain yet" (if status is pending/failed)

### Step 4: Pay & Get Credentials (Player)

1. **On the game page**, click **"Pay [amount] USDC & Join"**
2. **Expected Flow**:
   - ✅ Wallet popup appears with correct amount
   - ✅ Transaction is sent to contract
   - ✅ Transaction is confirmed
   - ✅ Credentials are revealed (ClubGG link + password)
   - ✅ Participant status updates to "paid"

3. **If Payment Fails**:
   - Check error message
   - Verify game is active on-chain
   - Check Vercel logs for correlation ID

### Step 5: Monitor Logs

**In Vercel Logs**, look for:
- `[games] Registering paid game on-chain` - Game creation started
- `[contract-ops] createGame transaction sent` - Contract call initiated
- `[contract-ops] createGame transaction confirmed` - Contract call succeeded
- `[payments][confirm] Payment confirmation started` - Payment flow started
- Correlation IDs in all logs for tracing

## Troubleshooting

### Issue: "Game not active on-chain yet"
**Cause**: Contract registration failed or still pending  
**Solution**: 
1. Check `/games/[id]/manage` page
2. If status is "failed", use "Show Remix Payload" button
3. Manually call `createGame()` in Remix
4. Use "Mark Active from Tx Hash" button with the transaction hash

### Issue: "Master wallet address mismatch"
**Cause**: `MASTER_WALLET_PRIVATE_KEY` doesn't match expected address  
**Solution**: Verify private key corresponds to `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`

### Issue: Payment transaction fails with "Game not active"
**Cause**: Game not registered on contract  
**Solution**: Use recovery endpoints to register game manually

### Issue: Payment succeeds but credentials not revealed
**Cause**: Transaction verification failed  
**Solution**: Check Vercel logs with correlation ID, verify transaction on Base explorer

## Success Criteria

✅ **Game Creation**:
- Paid game created successfully
- Automatically registered on-chain
- Status shows "active" in database and UI

✅ **Player Flow**:
- Player can join game
- Player can pay entry fee
- Transaction is verified on-chain
- Credentials are revealed after payment

✅ **Admin Tools**:
- On-chain status visible in manage page
- Recovery buttons work (if needed)
- Game list shows on-chain status badges

## Next Steps After Testing

If everything works:
1. ✅ Document any edge cases found
2. ✅ Note any UX improvements needed
3. ✅ Ready for production use!

If issues found:
1. Check Vercel logs with correlation IDs
2. Use recovery endpoints to fix stuck games
3. Report specific errors for debugging

