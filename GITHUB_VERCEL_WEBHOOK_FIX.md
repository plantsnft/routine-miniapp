# GitHub → Vercel Webhook Integration Fix

## 🔍 Problem Identified

**Issue:** Commits are on GitHub but Vercel isn't receiving webhook events to trigger deployments.

**Status:**
- ✅ Commits pushed to GitHub: `2255df9`, `36f78e8`, `4510466`, `f35f421`
- ❌ Vercel not receiving webhook events
- ❌ No deployments triggered

**This is NOT a build failure - it's a webhook/integration issue.**

## 🚀 Fix Steps (Do NOT Edit Code Yet)

### Step 1: Check Vercel GitHub Integration

**Action:** Verify the GitHub integration is connected

1. Go to **Vercel Dashboard** → Your Project (`routine`)
2. Navigate to **Settings** → **Git**
3. Check:
   - ✅ GitHub repository is connected
   - ✅ Repository shows: `plantsnft/routine-miniapp`
   - ✅ Production branch is set to: `master`
   - ✅ Auto-deploy is **enabled**

**If integration is missing or disconnected:**
- Click "Connect Git Repository" or "Reconnect"
- Re-authorize GitHub access
- Select the correct repository: `plantsnft/routine-miniapp`
- Ensure `master` branch is selected for production

### Step 2: Check GitHub Webhook Configuration

**Action:** Verify GitHub webhooks are configured correctly

1. Go to **GitHub** → `plantsnft/routine-miniapp` repository
2. Navigate to **Settings** → **Webhooks**
3. Look for webhook from Vercel (should show `vercel.com` in URL)
4. Check webhook status:
   - ✅ Should show "Active" (green)
   - ✅ Recent deliveries should show successful (200 status)
   - ❌ If showing errors, note the error message

**If webhook is missing or failing:**
- Vercel should auto-create webhooks when you connect the repo
- If missing, reconnect the GitHub integration in Vercel (Step 1)
- If failing, check the error message in webhook deliveries

### Step 3: Check Vercel Activity Log

**Action:** See if Vercel is receiving any events

1. Go to **Vercel Dashboard** → Your Project
2. Navigate to **Settings** → **Git** → Scroll down to **Activity Log**
3. Look for recent events:
   - Should show "push" events from GitHub
   - Should show timestamps matching your commits
   - ❌ If empty or old, webhooks aren't being received

**What to look for:**
- Recent push events (should show commits `2255df9`, `36f78e8`, etc.)
- Any error messages
- Last successful webhook delivery time

### Step 4: Manual Redeploy (Quick Fix)

**Action:** Force a deployment from the latest commit

1. Go to **Vercel Dashboard** → **Deployments**
2. Find the latest deployment (commit `43ff1d3`)
3. Click the **"..."** menu (three dots)
4. Select **"Redeploy"**
5. OR click **"Redeploy"** button if visible

**Alternative:** Deploy from specific commit
1. In Vercel Dashboard → Deployments
2. Click **"Create Deployment"** or **"Deploy"**
3. Select branch: `master`
4. Select commit: `2255df9` or `36f78e8` (latest)
5. Click **"Deploy"**

### Step 5: Reconnect GitHub Integration (If Steps 1-3 Fail)

**Action:** Disconnect and reconnect the GitHub integration

1. Go to **Vercel Dashboard** → **Settings** → **Git**
2. Click **"Disconnect"** or **"Remove"** (if available)
3. Click **"Connect Git Repository"**
4. Select **GitHub**
5. Authorize Vercel to access your repositories
6. Select repository: `plantsnft/routine-miniapp`
7. Configure:
   - Production branch: `master`
   - Auto-deploy: **Enabled**
8. Click **"Connect"** or **"Save"**

**This will:**
- Recreate the webhook in GitHub
- Re-establish the connection
- Trigger a deployment from the latest commit

### Step 6: Verify Webhook Delivery (After Reconnect)

**Action:** Confirm webhooks are working

1. Go to **GitHub** → Repository → **Settings** → **Webhooks**
2. Click on the Vercel webhook
3. Scroll to **"Recent Deliveries"**
4. Look for recent push events:
   - Should show `2255df9` commit
   - Status should be **200** (success)
   - Response should show deployment triggered

**If still failing:**
- Check the error message in webhook delivery
- Verify repository permissions in GitHub
- Check if repository is private (may need different permissions)

## 🎯 Most Likely Causes

### Cause 1: GitHub Integration Disconnected
**Symptom:** Vercel Settings → Git shows no connected repository  
**Fix:** Reconnect GitHub integration (Step 5)

### Cause 2: Webhook Missing or Inactive
**Symptom:** GitHub Settings → Webhooks shows no Vercel webhook or inactive  
**Fix:** Reconnect GitHub integration (Step 5) - this recreates webhooks

### Cause 3: Auto-Deploy Disabled
**Symptom:** Vercel Settings → Git shows "Auto-deploy" disabled  
**Fix:** Enable auto-deploy in Vercel Settings → Git

### Cause 4: Wrong Branch Selected
**Symptom:** Vercel is watching a different branch (e.g., `main` instead of `master`)  
**Fix:** Change production branch to `master` in Vercel Settings → Git

### Cause 5: Repository Permissions Issue
**Symptom:** Webhook deliveries show 403 or 401 errors  
**Fix:** Re-authorize Vercel in GitHub → Settings → Applications → Authorized OAuth Apps

## ✅ Quick Test After Fix

Once you've fixed the integration:

1. **Make a small change** (or push the empty commit again):
   ```bash
   git commit --allow-empty -m "test: verify webhook connection"
   git push origin master
   ```

2. **Watch Vercel Dashboard:**
   - Should see new deployment appear within 1-2 minutes
   - Should show commit hash from the push
   - Build should start automatically

3. **Check GitHub Webhooks:**
   - Go to GitHub → Settings → Webhooks
   - Should see new delivery with 200 status
   - Should show deployment triggered

## 📋 Summary

**The issue is NOT with your code or build - it's the GitHub → Vercel webhook connection.**

**Recommended Fix Order:**
1. ✅ Check Vercel Settings → Git (verify integration)
2. ✅ Check GitHub Settings → Webhooks (verify webhook exists)
3. ✅ Manual redeploy (quick fix to get latest code deployed)
4. ✅ Reconnect integration (if steps 1-2 show issues)

**After fixing, all your commits (`36f78e8`, `4510466`, `f35f421`, `2255df9`) should deploy automatically.**
