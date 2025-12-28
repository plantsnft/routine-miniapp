# Vercel Deployment Checklist

## ✅ Environment Variables Status

Based on your current Vercel environment variables, here's what you have and what's missing:

### ✅ Already Configured:
- ✅ NEXT_PUBLIC_GAME_ESCROW_CONTRACT
- ✅ NEXT_PUBLIC_BASE_RPC_URL
- ✅ NEXT_PUBLIC_SUPABASE_URL
- ✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
- ✅ SUPABASE_SERVICE_ROLE
- ✅ NEYNAR_API_KEY
- ✅ HELLFIRE_OWNER_FID
- ✅ BURRFRIENDS_OWNER_FID

### 🔴 MISSING - REQUIRED:

**1. MASTER_WALLET_PRIVATE_KEY** ⚠️ CRITICAL
   - **Required for:** Refund and settlement operations
   - **Value:** The private key for wallet `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
   - **Where to get it:** From your local `.env.local` file
   - **Security:** Make sure this is set to "Production" environment only

### 🟡 OPTIONAL (Recommended):

**2. ALERT_WEBHOOK_URL**
   - **Purpose:** Receives alerts for refund/settlement/emergency withdraw events
   - **Example:** `https://your-webhook-url.com/alerts`
   - **Can skip:** App will work without this (logs to console only)

---

## 📋 Manual Steps to Complete

### Step 1: Add Missing Environment Variable

1. Go to your Vercel project: https://vercel.com/plants-projects-156afffe/poker/deployments
2. Click **Settings** → **Environment Variables**
3. Click **Add New**
4. Add:
   - **Key:** `MASTER_WALLET_PRIVATE_KEY`
   - **Value:** (Copy from your local `.env.local` file - the private key for `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`)
   - **Environment:** Select **Production** (and optionally Preview/Development if you want)
   - Click **Save**

### Step 2: Verify Build Settings

1. Go to **Settings** → **General**
2. Verify:
   - **Root Directory:** Should be `poker` (if your repo is at root level)
   - **Build Command:** `npm run build` (should auto-detect)
   - **Output Directory:** `.next` (should auto-detect)
   - **Install Command:** `npm install` (should auto-detect)

### Step 3: Trigger a New Deployment

1. Go to **Deployments** tab
2. Click **⋯** (three dots) on the latest deployment
3. Click **Redeploy**
4. Or push a commit to trigger automatic deployment

### Step 4: Verify Deployment

After deployment completes:
1. Check the deployment logs for any errors
2. Visit your deployment URL
3. Test sign-in
4. Test creating a game
5. Test payment flow (if possible)

---

## ✅ Pre-Deployment Checklist

- [x] Build passes locally (`npm run build`)
- [x] All TypeScript errors resolved
- [x] Environment variables configured (except MASTER_WALLET_PRIVATE_KEY - needs manual add)
- [x] Contract deployed to Base: `0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D`
- [ ] MASTER_WALLET_PRIVATE_KEY added to Vercel
- [ ] New deployment triggered
- [ ] Deployment verified

---

## 🚨 Important Notes

1. **MASTER_WALLET_PRIVATE_KEY** is critical - without it, refund and settlement operations will fail
2. Make sure the wallet has Base ETH for gas fees
3. The private key should match the wallet that deployed the contract (`0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`)
4. Never share or commit private keys

---

## 🧪 Post-Deployment Testing

After deployment, test:
1. **Sign In:** Should work with Farcaster
2. **Create Game:** Club owner can create paid games
3. **Join & Pay:** Players can join and pay entry fees
4. **Refund:** Owner can refund players (requires MASTER_WALLET_PRIVATE_KEY)
5. **Settle:** Owner can settle games and distribute payouts (requires MASTER_WALLET_PRIVATE_KEY)

---

## 📞 If Something Goes Wrong

- Check Vercel deployment logs
- Verify all environment variables are set correctly
- Check that MASTER_WALLET_PRIVATE_KEY is correct
- Verify contract address matches deployed contract
- Check Base network RPC is accessible

