# Creator Portal Testing Guide

## Prerequisites

### Environment Variables (Vercel/Local)
Make sure these are set:
- `NEYNAR_API_KEY` - Required for fetching casts
- `REWARD_SIGNER_PRIVATE_KEY` - Private key of wallet that will send tokens
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE` - Supabase service role key
- `BASE_RPC_URL` (optional) - Defaults to `https://mainnet.base.org`

### Test Wallet Setup
1. The wallet with `REWARD_SIGNER_PRIVATE_KEY` must have:
   - Enough CATWALK tokens to cover test claims (500,000 per claim)
   - Some ETH/Base for gas fees

### Test User Setup
1. You need a Farcaster account that:
   - Is in the `CATWALK_CREATOR_FIDS` list (check `src/lib/constants.ts`)
   - Has posted to `/catwalk` channel in the last 30 days (or will post during testing)

## Testing Steps

### 1. Local Development Setup

**Terminal A** - Start the dev server:
```bash
npm run dev
```

**Terminal B** - Monitor logs:
```bash
# Watch for API calls and errors
# The dev server will show logs in Terminal A
```

### 2. Test Verification Flow

#### A. Manual Verification Test
1. Open the app in browser: `http://localhost:3000`
2. Sign in with Farcaster (if not already)
3. Navigate to Portal tab (📤 icon in bottom nav)
4. Click "Verify Creator Cast" button
5. **Expected Result:**
   - Button shows "Verifying..." then changes
   - Success message appears
   - "Claim" button becomes available
   - Shows "You're eligible to claim 500,000 CATWALK tokens!"

#### B. Check Database
```sql
-- In Supabase SQL Editor, check the claim was created:
SELECT * FROM creator_claims 
WHERE fid = YOUR_FID 
ORDER BY verified_at DESC 
LIMIT 1;
```

**Expected:**
- `fid` matches your FID
- `cast_hash` is populated
- `reward_amount` = 500000
- `verified_at` is recent timestamp
- `claimed_at` is NULL (not claimed yet)
- `transaction_hash` is NULL (not claimed yet)

### 3. Test Auto-Detection (5-Minute Polling)

#### A. Post a New Cast
1. Go to Warpcast and post a new cast to `/catwalk` channel
2. Note the exact time you posted

#### B. Wait and Observe
1. Keep the Portal tab open in your browser
2. Wait up to 5 minutes (polling interval)
3. **Expected Result:**
   - No manual action needed
   - Success message appears: "New cast detected! You can now claim your reward."
   - Claim button becomes available automatically

#### C. Check Console Logs
Open browser DevTools (F12) → Console tab
**Expected logs:**
```
[PortalTab] Auto-polling for new claims...
[PortalTab] No claim found, attempting auto-verify...
[PortalTab] Auto-verified new cast!
```

### 4. Test 30-Day Window

#### A. Test Recent Cast (Should Work)
1. Post a cast to `/catwalk` channel (within last 30 days)
2. Verify it gets detected
3. **Expected:** Verification succeeds

#### B. Test Old Cast (Should Fail)
1. Find a cast you posted more than 30 days ago
2. Try to verify manually
3. **Expected:** Error message: "No cast found in /catwalk channel from the last 30 days"

### 5. Test Claim Flow (Token Transfer)

#### A. Prerequisites Check
```bash
# Verify your signer wallet has tokens
# Check in BaseScan or use this query in Supabase:
```

**Before claiming, verify:**
- `REWARD_SIGNER_PRIVATE_KEY` is set correctly
- Signer wallet has CATWALK tokens (check on BaseScan)
- Signer wallet has ETH for gas

#### B. Execute Claim
1. In Portal tab, click "Claim 500,000 CATWALK" button
2. **Expected Result:**
   - Button shows "Claiming..." 
   - Success message appears
   - Shows transaction hash
   - BaseScan link appears

#### C. Verify Transaction
1. Click the BaseScan link in the UI
2. **Expected on BaseScan:**
   - Transaction shows ERC20 transfer
   - From: Your signer wallet address
   - To: Your Farcaster wallet address (custody or verified)
   - Amount: 500,000 CATWALK tokens
   - Status: Success (confirmed)

#### D. Check Database After Claim
```sql
SELECT * FROM creator_claims 
WHERE fid = YOUR_FID 
ORDER BY claimed_at DESC 
LIMIT 1;
```

**Expected:**
- `claimed_at` is populated (recent timestamp)
- `transaction_hash` matches the BaseScan transaction
- All other fields remain the same

#### E. Verify Wallet Balance
1. Check your Farcaster wallet on BaseScan
2. **Expected:** Balance increased by 500,000 CATWALK tokens

### 6. Test Already Claimed State

1. Try to claim again (after already claiming)
2. **Expected:** 
   - Error message: "Reward already claimed"
   - Shows existing transaction hash
   - BaseScan link still works

### 7. Test Edge Cases

#### A. No Wallet Address
1. Use a FID that has no custody or verified addresses
2. Try to claim
3. **Expected:** Error: "No wallet address found for this user. Please connect a wallet."

#### B. Signer Not Configured
1. Temporarily remove `REWARD_SIGNER_PRIVATE_KEY` from env
2. Try to claim
3. **Expected:** Error: "Reward signer not configured. Please contact support."

#### C. Insufficient Tokens
1. Use a signer wallet with 0 CATWALK tokens
2. Try to claim
3. **Expected:** Transaction fails with error message

### 8. Test Engagement Rewards (Bonus)

1. Like/comment/recast a post in `/catwalk` channel
2. Go to Portal tab → Engagement Rewards section
3. Click "Verify Engagement"
4. **Expected:** Eligible engagements are found
5. Click "Claim" for each engagement
6. **Expected:** Each engagement gets its own transaction

## Testing Checklist

### Verification
- [ ] Manual verification works
- [ ] Auto-verification works (within 5 minutes)
- [ ] 30-day window enforced (old casts rejected)
- [ ] Database record created correctly

### Claim Flow
- [ ] Claim button appears after verification
- [ ] Transaction is sent successfully
- [ ] Transaction hash stored in database
- [ ] BaseScan link works and shows correct transaction
- [ ] Tokens appear in user's wallet
- [ ] Already-claimed state prevents duplicate claims

### UI/UX
- [ ] Auto-polling works (check console logs)
- [ ] Success messages appear correctly
- [ ] Error messages are clear
- [ ] Loading states work
- [ ] BaseScan links are clickable

### Edge Cases
- [ ] No wallet address handled gracefully
- [ ] Missing signer key handled gracefully
- [ ] Network errors handled gracefully

## Debugging Tips

### Check API Logs
```bash
# In Terminal A (dev server), watch for:
[Creator Verify] ... logs
[Creator Claim] ... logs
[PortalTab] ... logs
```

### Check Browser Console
- Open DevTools (F12)
- Check Console for errors
- Check Network tab for API calls

### Check Supabase
- Go to Supabase Dashboard → Table Editor
- Check `creator_claims` table
- Verify data matches expectations

### Check BaseScan
- Search for your signer wallet address
- Check token transfers
- Verify transaction details

## Common Issues

### Issue: "No cast found"
**Solution:**
- Verify you posted to `/catwalk` channel (not just mentioned it)
- Check the cast is within last 30 days
- Verify your FID is in `CATWALK_CREATOR_FIDS`

### Issue: "Transaction failed"
**Solution:**
- Check signer wallet has CATWALK tokens
- Check signer wallet has ETH for gas
- Verify `REWARD_SIGNER_PRIVATE_KEY` is correct
- Check BaseScan for transaction error details

### Issue: "Auto-polling not working"
**Solution:**
- Keep Portal tab active (don't switch tabs)
- Check browser console for errors
- Verify `userFid` is set correctly
- Check network tab for API calls

### Issue: "Tokens not received"
**Solution:**
- Check transaction on BaseScan (verify it succeeded)
- Verify recipient address matches your wallet
- Check wallet address in Neynar user data
- Wait for transaction confirmation (may take a few seconds)

## Production Testing

Before deploying to production:

1. **Test on Staging/Preview:**
   ```bash
   # Deploy to Vercel preview
   vercel --prod
   ```

2. **Verify Environment Variables:**
   - Check Vercel dashboard → Settings → Environment Variables
   - All required vars are set

3. **Test with Real Tokens:**
   - Use a test wallet with limited tokens first
   - Verify transactions work end-to-end
   - Check BaseScan for all transactions

4. **Monitor:**
   - Watch Vercel function logs
   - Monitor Supabase for new claims
   - Check BaseScan for transaction activity

## Quick Test Script

```bash
# 1. Start dev server
npm run dev

# 2. In another terminal, test API directly:
curl -X POST http://localhost:3000/api/portal/creator/verify \
  -H "Content-Type: application/json" \
  -d '{"fid": YOUR_FID}'

# 3. Check status:
curl http://localhost:3000/api/portal/status?fid=YOUR_FID

# 4. Test claim (if verified):
curl -X POST http://localhost:3000/api/portal/creator/claim \
  -H "Content-Type: application/json" \
  -d '{"fid": YOUR_FID}'
```

## Success Criteria

✅ Verification works for casts in last 30 days  
✅ Auto-detection works within 5 minutes  
✅ Claims trigger actual token transfers  
✅ Transaction hashes are stored and displayed  
✅ BaseScan links work correctly  
✅ UI updates automatically  
✅ Edge cases are handled gracefully  

