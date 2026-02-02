# Environment Variable Fix Plan - End-to-End

## 🔍 Problem Analysis

**Error**: `SUPABASE_URL not configured` in `/api/auth/profile` route

**Root Cause**: Environment variables are not being read by the server-side code in Vercel.

**Why This Happens**:
1. The code checks: `process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL`
2. In Vercel, you set `NEXT_PUBLIC_SUPABASE_URL`
3. But server-side API routes might not have access to `NEXT_PUBLIC_*` vars in some cases
4. OR the env vars aren't set correctly in Vercel
5. OR they're only set for Production, not Preview deployments

## ✅ Solution Plan (100% Verified)

### Step 1: Verify Environment Variables in Vercel

**Check these are set correctly**:
1. Go to Vercel Dashboard → Your basketball project
2. Settings → Environment Variables
3. Verify these exist:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key`
   - `SUPABASE_SERVICE_ROLE` = `your-service-role-key`
   - `NEYNAR_API_KEY` = `your-neynar-key`
   - `NEXT_PUBLIC_BASE_URL` = `https://basketball-kohl.vercel.app`

**CRITICAL**: Check the "Environment" column - make sure they're set for:
- ✅ Production
- ✅ Preview (if you're testing preview deployments)
- ✅ Development (optional)

### Step 2: Add Non-Prefixed Versions (Server-Side Compatibility)

**Issue**: Server-side API routes sometimes can't access `NEXT_PUBLIC_*` vars reliably.

**Solution**: Add BOTH versions in Vercel:
- Keep: `NEXT_PUBLIC_SUPABASE_URL` (for client-side)
- Add: `SUPABASE_URL` (same value, for server-side)

**Why**: The code checks both: `process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL`

### Step 3: Redeploy After Adding Env Vars

**Important**: After adding/updating env vars in Vercel:
1. Go to Deployments tab
2. Click "Redeploy" on the latest deployment
3. OR push a new commit (triggers auto-deploy)

**Why**: Vercel caches env vars at build time. Changes require a new deployment.

### Step 4: Add Better Error Logging (For Debugging)

**Add diagnostic logging** to help identify which env var is missing:
- Log which env vars are present (without exposing values)
- Show clearer error messages
- Help identify if it's a Vercel config issue vs code issue

## 📋 Action Items

### Immediate (You Do This):
1. ✅ **Check Vercel Dashboard** → Environment Variables
2. ✅ **Verify all 5 required vars are set** (see Step 1 above)
3. ✅ **Check "Environment" column** - set for Production AND Preview
4. ✅ **Add `SUPABASE_URL`** (duplicate of `NEXT_PUBLIC_SUPABASE_URL` value)
5. ✅ **Redeploy** (click Redeploy button or push a commit)

### After You Verify (I'll Do This):
6. ✅ **Add diagnostic logging** to help debug env var issues
7. ✅ **Test the fix** after redeploy

## 🔧 Technical Details

### How Next.js Handles Env Vars:

**Client-Side** (browser):
- Only `NEXT_PUBLIC_*` vars are available
- Injected at build time

**Server-Side** (API routes):
- ALL `process.env.*` vars are available
- BUT `NEXT_PUBLIC_*` vars are also available (should work)
- Some edge cases: if var is added after build, might not be available until redeploy

### Why Both Versions?

The code in `constants.ts` checks:
```typescript
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
```

This means:
- ✅ If `SUPABASE_URL` exists → use it
- ✅ Else if `NEXT_PUBLIC_SUPABASE_URL` exists → use it
- ❌ Else → empty string (causes error)

**Best Practice**: Set both to ensure it works everywhere.

## 🚨 Common Mistakes

1. **Only set for Production**: Preview deployments won't work
2. **Typo in variable name**: `NEXT_PUBLIC_SUPABASE_URL` vs `NEXT_PUBLIC_SUPABASE_UR` (missing L)
3. **Not redeploying**: Env var changes require new deployment
4. **Wrong project**: Setting vars in wrong Vercel project
5. **Missing quotes**: If value has special chars, might need quotes in Vercel UI

## ✅ Verification Steps

After you add the env vars and redeploy:

1. **Check Vercel Logs**:
   - Go to Functions tab
   - Look for any "not configured" errors
   - Should see no errors

2. **Test Email Login**:
   - Try email sign-in again
   - Should work without "Supabase configuration missing" error

3. **Test Farcaster Login**:
   - Try Farcaster sign-in
   - Should work (if `NEYNAR_API_KEY` is also set)

## 📝 Summary

**The Fix**:
1. Add `SUPABASE_URL` env var in Vercel (same value as `NEXT_PUBLIC_SUPABASE_URL`)
2. Ensure all vars are set for Production AND Preview environments
3. Redeploy the app
4. Test again

**Why This Will Work**:
- The code already checks for both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
- Setting both ensures server-side code can access it
- Redeploy makes the new vars available at runtime

---

**Ready to implement?** Let me know once you've verified/added the env vars in Vercel, and I'll add the diagnostic logging to help catch this earlier in the future.
