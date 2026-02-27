# Tournament Staking Multiplier Deployment Guide

## Deployment Checklist

### ✅ Step 1: Database Migration (REQUIRED)

**Run in Supabase SQL Editor:**
1. Go to: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon/sql
2. Open SQL Editor
3. Copy and paste the contents of `supabase_migration_tournament_staking_multipliers.sql`
4. Click "Run" or press Ctrl+Enter
5. Verify success - should see "Success. No rows returned"

**Migration adds:**
- `apply_staking_multipliers` column (default: true)
- `double_payout_if_bb` column (default: false)
- Constraint preventing both from being true

---

### ✅ Step 2: Contract Deployment (REQUIRED)

**Option A: Deploy New Contract via Remix (Recommended)**

1. **Open Remix IDE**: https://remix.ethereum.org
2. **Create new file**: `BurrfriendsGameEscrow.sol`
3. **Copy contract code** from `burrfriends/contracts/BurrfriendsGameEscrow.sol`
4. **Set up OpenZeppelin**:
   - In Remix, go to "Solidity Compiler"
   - Enable "Auto compile"
   - Remix should auto-import OpenZeppelin contracts
5. **Compile**:
   - Select compiler version: `0.8.20`
   - Click "Compile BurrfriendsGameEscrow.sol"
6. **Deploy**:
   - Go to "Deploy & Run Transactions"
   - Environment: "Injected Provider - MetaMask"
   - Connect MetaMask to **Base Mainnet**
   - Select "BurrfriendsGameEscrow" contract
   - Click "Deploy"
   - Confirm transaction in MetaMask
7. **Save new contract address** - you'll need this for Step 3

**Option B: Verify Existing Contract**

If contract at `0x6ed7a9d7aabbd68f03d4448dc092c96225b4e920` already has `getTournamentPayouts`:
- Check on BaseScan: https://basescan.org/address/0x6ed7a9d7aabbd68f03d4448dc092c96225b4e920#readContract
- Look for `getTournamentPayouts` function
- If it exists, skip to Step 3 and use existing address
- If it doesn't exist, deploy new contract (Option A)

---

### ✅ Step 3: Update Vercel Environment Variable (If New Contract)

1. Go to: https://vercel.com/dashboard
2. Select `burrfriends` project
3. Go to **Settings** → **Environment Variables**
4. Find `GAME_ESCROW_CONTRACT`
5. Update value to new contract address (from Step 2)
6. **Redeploy** the project (or wait for auto-deploy)

---

### ✅ Step 4: Verify Vercel Auto-Deployment

**Code is already pushed to GitHub:**
- Repository: `plantsnft/burrfriends`
- Branch: `main`
- Commit: `bbe5d9d`

**Vercel should auto-deploy:**
1. Go to: https://vercel.com/dashboard
2. Check `burrfriends` project
3. Verify latest deployment includes commit `bbe5d9d`
4. If not auto-deployed, trigger manual deployment:
   - Go to **Deployments** tab
   - Click "Redeploy" on latest deployment
   - Or push an empty commit to trigger

---

### ✅ Step 5: Post-Deployment Verification

**Test Tournament Creation:**
1. Go to your deployed app URL
2. Sign in as admin
3. Create a new Scheduled game
4. Verify checkboxes appear:
   - "Apply staking payout multipliers" (checked by default)
   - "Double payout if BB" (unchecked by default)
5. Test mutual exclusivity:
   - Check one, verify other unchecks
   - Try checking both (should prevent)

**Test Tournament Settlement:**
1. Create a test tournament with winners
2. Settle the game
3. Verify contract view function is called
4. Check logs for tournament payout calculation
5. Verify BETR transfers use calculated amounts

---

## Important Notes

- **Contract is NOT upgradeable** - if deploying new contract, all existing games will need to use new address
- **Database migration is idempotent** - safe to run multiple times
- **Vercel auto-deploys** from GitHub pushes to `main` branch
- **Master wallet** must have Base ETH for contract deployment gas fees

---

## Rollback Plan

If issues occur:
1. **Database**: No rollback needed - columns have defaults
2. **Contract**: Keep using old contract address in Vercel env var
3. **Code**: Revert commit or redeploy previous version in Vercel
