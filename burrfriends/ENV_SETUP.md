# Environment Variables Setup - Contract Deployment Complete! ✅

## Your Contract Address
```
0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D
```

---

## Step 1: Update Local Environment Variables

### Create/Update `.env.local` file

1. In your project: `C:\miniapps\routine\poker\`
2. Create or open `.env.local` file
3. Add these lines:

```env
NEXT_PUBLIC_GAME_ESCROW_CONTRACT=0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

**If you already have a `.env.local` file**, just add/update these two lines.

---

## Step 2: Update Vercel Environment Variables

1. Go to your Vercel project dashboard
2. Click on your project
3. Go to **Settings** → **Environment Variables**
4. Add or update these variables:

### For Production:
- **Key**: `NEXT_PUBLIC_GAME_ESCROW_CONTRACT`
- **Value**: `0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D`
- **Environment**: Production (and Preview if you want)

### Also add:
- **Key**: `NEXT_PUBLIC_BASE_RPC_URL`
- **Value**: `https://mainnet.base.org`
- **Environment**: Production (and Preview)

5. Click **Save**
6. **Redeploy your app** for changes to take effect

---

## Step 3: Verify Everything

After updating environment variables:

1. **Restart your local dev server** (if running):
   ```bash
   # Stop current server (Ctrl+C)
   # Then restart:
   cd C:\miniapps\routine\poker
   npm run dev
   ```

2. **Verify in browser console** (optional):
   - Open your app
   - Open DevTools Console (F12)
   - Type: `console.log(process.env.NEXT_PUBLIC_GAME_ESCROW_CONTRACT)`
   - Should show: `0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D`

---

## Step 4: Test Contract on BaseScan

Visit your contract:
**https://basescan.org/address/0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D**

You should see:
- ✅ Contract verified
- ✅ All functions visible
- ✅ Read/Write contract options

---

## ✅ Deployment Complete!

Your contract is now:
- ✅ Deployed to Base Mainnet
- ✅ Verified on Sourcify & Routescan
- ✅ Ready to use!

Next steps:
1. Update environment variables (above)
2. Redeploy your Next.js app to Vercel
3. Test the payment flow!

