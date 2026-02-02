# Definitive GitHub → Vercel Webhook Fix Plan

## ✅ What We Know For Certain

1. **GitHub Integration Connected**: ✅ Confirmed
   - Vercel Settings → Git shows `plantsnft/routine-miniapp` connected
   - Connected on 10/31/25

2. **Commits on GitHub**: ✅ Confirmed
   - Latest: `2255df9` (trigger commit)
   - `36f78e8`, `4510466`, `f35f421` (auto-engage fixes)
   - All on `master` branch

3. **Vercel Deployment Status**: ❌ Confirmed Issue
   - Latest deployment: `43ff1d3` (6 hours ago)
   - Missing 4 commits: `2255df9`, `36f78e8`, `4510466`, `f35f421`
   - Redeploy modal shows old commit `43ff1d3`

4. **Branch Structure**: ✅ Confirmed
   - Local: `master` branch
   - Remote: `origin/master` branch
   - All commits are on `master`

## 🔍 Root Cause Analysis

**The Issue:** Vercel is not receiving webhook events from GitHub for new commits.

**Possible Causes (in order of likelihood):**

### Cause 1: Production Branch Mismatch (MOST LIKELY)
**Symptom:** Vercel might be watching a different branch or branch setting is incorrect
**Evidence:** Integration connected but no deployments triggered

### Cause 2: Webhook Not Receiving Events
**Symptom:** GitHub webhook exists but not receiving push events
**Evidence:** Need to check GitHub repository webhook settings

### Cause 3: Auto-Deploy Disabled
**Symptom:** Integration connected but auto-deploy is off
**Evidence:** Need to check Vercel Git settings for auto-deploy toggle

## 🎯 Definitive Fix Steps

### Step 1: Check Production Branch in Vercel (CRITICAL)

**Action:** Verify Vercel is watching the `master` branch

1. Go to **Vercel Dashboard** → Your Project (`routine`)
2. Navigate to **Settings** → **Git**
3. **Scroll down** to find "Production Branch" or "Branch" settings
4. **Verify:**
   - Production branch is set to: `master` (NOT `main`)
   - If it shows `main`, change it to `master`

**If Production Branch is Wrong:**
- Change it to `master`
- Save the settings
- This should trigger a deployment from the latest commit

### Step 2: Check GitHub Repository Webhooks (NOT Profile)

**Action:** Check webhook settings in the actual repository

**IMPORTANT:** You were looking at your GitHub profile page. You need to go to the **repository** settings:

1. Go to: `https://github.com/plantsnft/routine-miniapp`
2. Click **"Settings"** tab (top of repository page)
3. Click **"Webhooks"** in left sidebar
4. Look for webhook from Vercel (URL should contain `vercel.com`)

**What to Check:**
- ✅ Webhook exists and shows "Active" (green)
- ✅ URL contains `vercel.com` or `vercel.app`
- ✅ Recent deliveries show push events
- ✅ Last delivery should be recent (within last few hours)
- ✅ Status codes should be 200 (success)

**If Webhook Missing or Inactive:**
- Go back to Vercel → Settings → Git
- Click "Disconnect" then "Connect Git Repository"
- Reconnect to `plantsnft/routine-miniapp`
- This will recreate the webhook

### Step 3: Check Vercel Activity Log

**Action:** See if Vercel is receiving any events

1. Go to **Vercel Dashboard** → Your Project
2. Navigate to **Settings** → **Git**
3. **Scroll down** to find "Activity Log" or "Events"
4. Look for recent events:
   - Should show "push" events from GitHub
   - Should show timestamps matching your commits (`2255df9`, `36f78e8`, etc.)
   - ❌ If empty or old, webhooks aren't being received

**What This Tells Us:**
- If Activity Log shows recent push events → Vercel is receiving webhooks but not deploying
- If Activity Log is empty → Webhooks aren't reaching Vercel

### Step 4: Manual Deploy from Latest Commit (IMMEDIATE FIX)

**Action:** Deploy the latest commit manually to get code live NOW

1. Go to **Vercel Dashboard** → **Deployments**
2. Click **"Create Deployment"** button (top right, NOT "Redeploy")
3. Configure:
   - **Git Repository:** `plantsnft/routine-miniapp`
   - **Branch:** `master`
   - **Commit:** Select `2255df9` (or latest commit)
   - **Environment:** Production
4. Click **"Deploy"**

**This will:**
- Deploy the latest code immediately
- Include all your auto-engage fixes
- Get you unblocked while we fix the webhook

### Step 5: Reconnect GitHub Integration (If Steps 1-3 Show Issues)

**Action:** Disconnect and reconnect to fix webhook issues

1. Go to **Vercel Dashboard** → **Settings** → **Git**
2. Click **"Disconnect"** button
3. Click **"Connect Git Repository"**
4. Select **GitHub**
5. Authorize Vercel (if prompted)
6. Select repository: `plantsnft/routine-miniapp`
7. **IMPORTANT:** Set Production Branch to `master` (verify this!)
8. Enable **Auto-deploy** (should be enabled by default)
9. Click **"Connect"**

**This will:**
- Recreate the webhook in GitHub
- Re-establish the connection
- Trigger a deployment from the latest commit
- Fix any configuration issues

## ✅ Verification Checklist

After applying fixes, verify:

- [ ] Vercel Settings → Git shows Production Branch = `master`
- [ ] GitHub Repository → Settings → Webhooks shows active Vercel webhook
- [ ] GitHub webhook "Recent Deliveries" shows recent push events with 200 status
- [ ] Vercel Activity Log shows recent push events
- [ ] New deployment appears in Vercel with commit `2255df9` or `36f78e8`
- [ ] Deployment succeeds and shows "Ready" status

## 🎯 Most Likely Fix

Based on the evidence, **the most likely issue is Production Branch mismatch**.

**Recommended Action Order:**
1. **Step 1** - Check Production Branch (most likely fix)
2. **Step 4** - Manual deploy (get code live immediately)
3. **Step 2** - Check GitHub webhooks (verify webhook is working)
4. **Step 3** - Check Activity Log (see if events are received)
5. **Step 5** - Reconnect (if nothing else works)

## 📋 What to Report Back

After checking Steps 1-3, report:
1. What does Production Branch show in Vercel? (`master` or `main`?)
2. What does GitHub webhook "Recent Deliveries" show? (Last delivery time? Status codes?)
3. What does Vercel Activity Log show? (Recent events? Empty?)

This will tell us exactly what's wrong and how to fix it definitively.
