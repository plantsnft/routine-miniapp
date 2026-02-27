# Farcaster Mini App Discovery Plan - Burrfriends

## 🎯 Goal
Make burrfriends mini app discoverable in Farcaster's mini app directory and search.

---

## 📋 Pre-Flight Checks (Do First)

### Step 1: Verify Your Production URL
1. Go to Vercel dashboard: https://vercel.com/dashboard
2. Select **burrfriends** project
3. Check the **Production** deployment URL
4. **Note the exact URL** (e.g., `https://burrfriends.vercel.app` or `https://burrfriends-xyz.vercel.app`)

**Expected:** Should be `https://burrfriends.vercel.app` (or similar)

---

### Step 2: Verify Manifest is Accessible
1. Open your production URL in a browser
2. Navigate to: `https://YOUR-URL/.well-known/farcaster.json`
   - Replace `YOUR-URL` with your actual Vercel URL
3. **Check the response:**
   - ✅ Should return JSON (not 404)
   - ✅ Should show `"name": "Burrfriends"` (or fallback if env vars not set)
   - ✅ Should show correct `homeUrl` matching your Vercel URL
   - ⚠️ **Warning expected:** `accountAssociation` domain mismatch (this is what we'll fix)

**If manifest doesn't load:** Check that `NEXT_PUBLIC_BASE_URL` is set in Vercel env vars.

---

### Step 3: Verify Environment Variables
In Vercel → burrfriends → Settings → Environment Variables, confirm:
- ✅ `APP_NAME=Burrfriends`
- ✅ `APP_DESCRIPTION=play poker with burr and friends`
- ✅ `NEXT_PUBLIC_BASE_URL=https://YOUR-ACTUAL-VERCEL-URL` (must match production URL exactly)
- ❌ `FARCASTER_ASSOC_HEADER` (not set yet - we'll add this)
- ❌ `FARCASTER_ASSOC_PAYLOAD` (not set yet - we'll add this)
- ❌ `FARCASTER_ASSOC_SIGNATURE` (not set yet - we'll add this)

---

## 🔐 Step 4: Generate AccountAssociation Signature (Developer Portal)

### Option A: Farcaster Developer Tools (Recommended)

1. **Go to Developer Portal:**
   - URL: https://warpcast.com/~/developers/mini-apps
   - Or: Open Warpcast → Profile → Settings → Developers → Mini Apps

2. **Use Manifest Tool:**
   - Look for "Manifest Tool" or "Sign Manifest" section
   - Enter your domain: `burrfriends.vercel.app` (use your actual Vercel URL)
   - Select your Farcaster account (FID: 318447 or your FID)
   - Click "Generate" or "Sign"

3. **Copy the Signature Components:**
   - You'll get three values:
     - `header` (base64 string)
     - `payload` (base64 string - should decode to `{"domain":"burrfriends.vercel.app"}`)
     - `signature` (base64 string)

4. **Verify Payload Domain:**
   - Decode the `payload` using: https://www.base64decode.org/
   - Should show: `{"domain":"burrfriends.vercel.app"}` (or your actual Vercel URL)
   - ⚠️ **Critical:** Domain in payload MUST match your `NEXT_PUBLIC_BASE_URL` exactly

---

### Option B: Base Docs Signing Tool (Alternative)

If Developer Portal doesn't have the tool:

1. **Follow Base Documentation:**
   - URL: https://docs.base.org/mini-apps/features/sign-manifest
   - Use their signing tool or CLI
   - Domain: `burrfriends.vercel.app` (your actual Vercel URL)
   - FID: `318447` (or your FID)

2. **Get Signature Components:**
   - Same three values: `header`, `payload`, `signature`

---

## 🔧 Step 5: Update Vercel Environment Variables

1. **Go to Vercel Dashboard:**
   - Project: **burrfriends**
   - Settings → Environment Variables

2. **Add Three New Variables:**

   **Variable 1:**
   - Name: `FARCASTER_ASSOC_HEADER`
   - Value: `[paste header from Step 4]`
   - Environment: Production (and Preview if you want)
   - Mark as "Sensitive" (optional but recommended)

   **Variable 2:**
   - Name: `FARCASTER_ASSOC_PAYLOAD`
   - Value: `[paste payload from Step 4]`
   - Environment: Production (and Preview if you want)
   - Mark as "Sensitive" (optional but recommended)

   **Variable 3:**
   - Name: `FARCASTER_ASSOC_SIGNATURE`
   - Value: `[paste signature from Step 4]`
   - Environment: Production (and Preview if you want)
   - Mark as "Sensitive" (optional but recommended)

3. **Save All Variables**

4. **Redeploy:**
   - Go to Deployments tab
   - Click "..." on latest deployment → "Redeploy"
   - Or: Push a commit to trigger auto-deploy

---

## ✅ Step 6: Verify Manifest After Update

1. **Wait for deployment to complete** (usually 1-2 minutes)

2. **Check Manifest Again:**
   - Visit: `https://YOUR-URL/.well-known/farcaster.json`
   - **Verify:**
     - ✅ `"name": "Burrfriends"` (from `APP_NAME`)
     - ✅ `"description": "play poker with burr and friends"` (from `APP_DESCRIPTION`)
     - ✅ `"homeUrl": "https://YOUR-ACTUAL-URL"` (matches `NEXT_PUBLIC_BASE_URL`)
     - ✅ `accountAssociation.payload` decodes to your domain
     - ✅ No domain mismatch warnings in response

3. **Test Domain Validation:**
   - The manifest route validates domain match in production
   - If domain doesn't match, you'll get an error (this is good - it means validation is working)
   - If you see the error, double-check:
     - `FARCASTER_ASSOC_PAYLOAD` domain matches `NEXT_PUBLIC_BASE_URL`
     - Both use same protocol (`https://`)
     - Both use same domain (no trailing slashes)

---

## 📝 Step 7: Fix Hosted Manifest in Developer Portal

**IMPORTANT:** The Developer Portal may be using a hosted manifest that has incorrect image URLs. You need to either use the domain manifest or update the hosted manifest.

### Option A: Use Domain Manifest (Recommended)

1. **Go to Developer Portal:**
   - URL: https://warpcast.com/~/developers/mini-apps/manifest?domain=burrfriends.vercel.app

2. **Look for "Use Domain Manifest" or "Disable Hosted Manifest":**
   - There should be a toggle or option to use the domain manifest directly
   - Enable it so it uses `https://burrfriends.vercel.app/.well-known/farcaster.json`
   - This ensures the portal always uses your live domain manifest (which is correct)

3. **Verify:**
   - The portal should fetch from your domain
   - Should show green checkmark ✅ if manifest is valid
   - Should show app name: "Burrfriends"
   - Should show `splashImageUrl: icon.png` (not `splash.png`)

### Option B: Update Hosted Manifest Manually

If Option A isn't available, update the hosted manifest:

1. **Go to Developer Portal:**
   - URL: https://warpcast.com/~/developers/mini-apps/manifest?domain=burrfriends.vercel.app

2. **Copy Domain Manifest:**
   - Visit: `https://burrfriends.vercel.app/.well-known/farcaster.json`
   - Copy the entire JSON

3. **Paste into Hosted Manifest Editor:**
   - Find the hosted manifest editor in the Developer Portal
   - Paste the JSON from step 2
   - **Important:** Ensure it includes:
     - `splashImageUrl: "https://burrfriends.vercel.app/icon.png"` (NOT `splash.png`)
     - NO `imageUrl` field (remove it if present)
     - NO `castShareUrl` field (remove it if present)

4. **Save:**
   - Click "Save" or "Update"
   - Portal will validate the manifest

5. **Verify:**
   - Should show green checkmark ✅
   - Preview should show correct icon (not old poker logo)
   - No errors about missing image files

---

## 📝 Step 7.5: Register in Farcaster Developer Portal (If Not Already Done)

1. **Go to Developer Portal:**
   - URL: https://warpcast.com/~/developers/mini-apps

2. **Verify Registration:**
   - Check if `burrfriends.vercel.app` is already registered
   - If not, look for "Register Mini App" or "Add Mini App" button

3. **Enter Your Domain:**
   - Domain: `burrfriends.vercel.app` (your actual Vercel URL, no `https://`)

4. **Verify Manifest Loads:**
   - Portal should fetch `https://burrfriends.vercel.app/.well-known/farcaster.json`
   - Should show green checkmark ✅ if manifest is valid
   - Should show app name: "Burrfriends"
   - Should show description: "play poker with burr and friends"
   - Should show `splashImageUrl: icon.png` (correct)

5. **Submit/Register:**
   - Click "Register" or "Submit" or "Save"
   - Portal will validate:
     - Manifest is accessible
     - Required fields present (name, iconUrl, homeUrl, description, splashImageUrl)
     - accountAssociation signature is valid
     - Domain matches signature payload

6. **Wait for Verification:**
   - Usually instant (automated validation)
   - You should see a green checkmark ✅ next to your domain
   - Status should show "Verified" or "Active"

---

## 🔍 Step 8: Verify Discovery (After Registration)

### Immediate Checks:
1. **Manifest Debug Endpoint (if available):**
   - Visit: `https://YOUR-URL/api/debug/farcaster-manifest`
   - Should show:
     - ✅ Domain match: `true`
     - ✅ accountAssociation source: `FARCASTER_ASSOC_* (separate vars)`
     - ✅ All required fields present

2. **Farcaster Search (may take time):**
   - Open Warpcast app
   - Search for "burrfriends" or "Burrfriends"
   - **Note:** May take 24-48 hours to appear in search results

3. **Mini App Directory:**
   - Check Farcaster's mini app directory (if available)
   - Look for "Burrfriends" listing
   - **Note:** Directory indexing happens periodically (daily)

---

## 🧹 Step 9: Cleanup Uncommitted Changes

### Commit Pending Changes

You have some uncommitted changes that should be cleaned up:

1. **Commit Static Manifest Deletion:**
   ```powershell
   cd c:\miniapps\routine\burrfriends
   git add public/.well-known/farcaster.json
   git commit -m "Remove static farcaster.json (using dynamic route)"
   ```

2. **Handle icon.png Changes:**
   - If you want to keep the new icon:
     ```powershell
     git add public/icon.png
     git commit -m "Update burrfriends icon"
     ```
   - If you want to keep the old icon:
     ```powershell
     git restore public/icon.png
     ```

3. **Optional: Commit Discovery Plan:**
   ```powershell
   git add FARCASTER_DISCOVERY_PLAN.md
   git commit -m "Add Farcaster discovery plan documentation"
   ```

4. **Push All Changes:**
   ```powershell
   git push origin burrfriends
   ```

**Why:** Keeps your repository clean and ensures all changes are tracked in version control.

---

## ⚠️ Troubleshooting

### Problem: Manifest shows domain mismatch error
**Solution:**
- Verify `FARCASTER_ASSOC_PAYLOAD` domain matches `NEXT_PUBLIC_BASE_URL` exactly
- Both should be `https://burrfriends.vercel.app` (or your actual URL)
- No trailing slashes, same protocol

### Problem: Manifest shows "Poker Lobby" instead of "Burrfriends"
**Solution:**
- Check `APP_NAME` env var in Vercel is set to `Burrfriends`
- Redeploy after updating env vars

### Problem: Developer Portal can't fetch manifest
**Solution:**
- Verify manifest is accessible: `https://YOUR-URL/.well-known/farcaster.json`
- Check Vercel deployment is live (not failed)
- Check `NEXT_PUBLIC_BASE_URL` is set correctly

### Problem: accountAssociation signature invalid
**Solution:**
- Regenerate signature in Developer Portal
- Ensure you're signing for the correct domain (matches `NEXT_PUBLIC_BASE_URL`)
- Ensure you're using the correct FID (318447 or your FID)

### Problem: App not appearing in search after 48 hours
**Solution:**
- Verify manifest is registered and shows green checkmark in Developer Portal
- Check manifest has all required fields (name, iconUrl, homeUrl, description)
- Verify icon loads: `https://YOUR-URL/icon.png`
- Ensure app is on production domain (not localhost/tunnel)
- Wait longer (indexing can take time)

---

## 📊 Success Criteria

You'll know it's working when:

1. ✅ Manifest loads at `/.well-known/farcaster.json` with correct branding
2. ✅ Domain validation passes (no mismatch errors)
3. ✅ Developer Portal shows green checkmark ✅ for your domain
4. ✅ Manifest shows "Burrfriends" name and correct description
5. ✅ accountAssociation payload domain matches your Vercel URL
6. ✅ (Eventually) App appears in Farcaster search/directory

---

## 🎯 Next Steps After Discovery Setup

Once the app is discoverable:

1. **Test Full Flow:**
   - Open app from Farcaster search/directory
   - Verify authentication works
   - Create a test game
   - Test payment flow with BETR

2. **Monitor:**
   - Check Vercel logs for any errors
   - Monitor Supabase for game creation/participation
   - Test cancel/refund flow (after SQL migration is run)

3. **Share:**
   - Share the app with test users
   - Get feedback on UX
   - Iterate based on usage

---

## 📝 Notes

- **No Human Review:** Farcaster uses automated validation only (no app store review)
- **Indexing Time:** Search/directory indexing happens periodically (usually daily)
- **Domain Changes:** If you change Vercel URL, you'll need to regenerate accountAssociation signature
- **Multiple Domains:** Each domain needs its own accountAssociation signature

---

## 🔗 Useful Links

- Farcaster Mini Apps Docs: https://miniapps.farcaster.xyz/docs
- Publishing Guide: https://miniapps.farcaster.xyz/docs/guides/publishing
- Manifest Spec: https://miniapps.farcaster.xyz/docs/specification
- Base Manifest Signing: https://docs.base.org/mini-apps/features/sign-manifest
- Developer Portal: https://warpcast.com/~/developers/mini-apps

---

**Last Updated:** 2026-01-16
**Status:** Ready for implementation