# 🚀 GO LIVE - Final Checklist

## ✅ What's Already Done
- ✅ Build passes (`npm run build` works)
- ✅ All code is production-ready
- ✅ Contract deployed: `0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D`
- ✅ Most environment variables configured in Vercel
- ✅ Sign-in correctly rejects non-mini-app access (security working!)

## 🔴 ONE THING LEFT TO DO

### Add MASTER_WALLET_PRIVATE_KEY to Vercel

1. Go to: https://vercel.com/plants-projects-156afffe/poker/settings/environment-variables
2. Click **"Add New"**
3. Fill in:
   - **Key:** `MASTER_WALLET_PRIVATE_KEY`
   - **Value:** (Your private key from `.env.local` - starts with `0x` + 64 hex chars)
   - **Environment:** Select **Production** ✅
   - Click **Save**

4. **Redeploy:**
   - Go to **Deployments** tab
   - Click **⋯** on latest deployment
   - Click **Redeploy**

## ✅ That's It! You're Live!

After redeploy, your app will be live at your Vercel URL.

---

## 🧪 Testing in Farcaster Mini App

### How to Test:
1. **Open Farcaster app** (mobile or desktop)
2. **Find your mini app** (or use the preview link if you have one)
3. **Sign in** - Should work now! ✅
4. **Test features:**
   - Create a club (if you're owner)
   - Create a paid game
   - Join and pay (test with small amounts!)
   - Refund (if you're owner)
   - Settle game (if you're owner)

### Expected Behavior:
- ✅ Sign-in works inside Farcaster mini app
- ✅ Sign-in is blocked in regular browser (this is correct!)
- ✅ All features work as designed

---

## 🎯 Iterate Feature by Feature

Once live, you can:
1. Test each feature in the real mini app
2. Find what needs improvement
3. Make changes locally
4. Push to GitHub → Auto-deploys to Vercel
5. Test again in mini app
6. Repeat!

---

## 📝 Quick Reference

**Your Vercel Project:**
- URL: https://vercel.com/plants-projects-156afffe/poker
- Deployments: https://vercel.com/plants-projects-156afffe/poker/deployments

**Contract:**
- Address: `0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D`
- Network: Base Mainnet
- View: https://basescan.org/address/0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D

**Master Wallet:**
- Address: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
- Make sure it has Base ETH for gas fees!

---

## 🆘 If Something Goes Wrong

1. **Check Vercel logs:** Deployments → Click deployment → View logs
2. **Verify env vars:** Settings → Environment Variables
3. **Check contract:** Make sure it's deployed and verified
4. **Test in mini app:** Regular browser won't work (by design!)

---

## ✅ Final Checklist

- [ ] Added `MASTER_WALLET_PRIVATE_KEY` to Vercel
- [ ] Selected "Production" environment
- [ ] Clicked "Save"
- [ ] Triggered new deployment (redeploy or push commit)
- [ ] Deployment completed successfully
- [ ] Tested sign-in in Farcaster mini app
- [ ] Ready to iterate! 🚀

## 🆕 Publish as a Mini App (Manifest)
1. Generate your Farcaster mini app `accountAssociation` (header/payload/signature) for your domain.
2. Update `public/.well-known/farcaster.json`:
   - Replace `REPLACE_WITH_YOUR_HEADER`, `REPLACE_WITH_YOUR_PAYLOAD`, `REPLACE_WITH_YOUR_SIGNATURE`
   - Ensure `homeUrl`, `iconUrl`, `imageUrl`, `splashImageUrl` point to your production URL.
3. Commit and redeploy.
4. In Warpcast/Farcaster mini app publishing flow, point to your production URL.

## 🆕 Webhook Alerts (Optional)
1. Add `ALERT_WEBHOOK_URL` in Vercel (Production):
   - Key: `ALERT_WEBHOOK_URL`
   - Value: your webhook endpoint (e.g., Slack/Discord/HTTPS endpoint)
2. Redeploy. Refund/settle/emergency-withdraw logs will post to this webhook.

