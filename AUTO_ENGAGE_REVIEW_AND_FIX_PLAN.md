# Auto-Engage Feature Review & Fix Plan

## 🔍 Current Implementation Review

### ✅ What's Working

1. **Signer Authorization Flow** - ✅ Working
   - `/api/portal/engage/authorize` creates signer correctly
   - EIP-712 signing implemented
   - Approval URL generation works
   - Database storage works

2. **User Preferences** - ✅ Working
   - `/api/portal/engage/preferences` stores signer_uuid and auto_engage_enabled
   - Frontend UI for enabling/disabling works
   - Signer status polling works

3. **Neynar API Integration** - ✅ Working
   - Like/recast API calls are correct
   - Signer UUID usage is correct
   - API endpoints are valid

4. **Smart Engagement Tracking** - ✅ Working
   - Checks `engagements` table before engaging
   - Checks `auto_engage_queue` to avoid duplicates
   - Channel feed cache integration works

### ❌ Critical Issues Found

#### Issue 1: Missing `reward_amount` in Engagement Claims (CRITICAL)
**Location**: `src/app/api/cron/auto-engage/route.ts` lines 279-297

**Problem**:
```typescript
// Current code (WRONG):
body: JSON.stringify({
  fid,
  cast_hash: castHash,
  engagement_type: action,
  verified_at: new Date().toISOString(),
  // ❌ MISSING: reward_amount
}),
```

**Database Schema**:
```sql
reward_amount NUMERIC NOT NULL, -- No default value!
```

**Impact**: 
- Database insert will FAIL (NOT NULL constraint violation)
- OR if it somehow succeeds, reward_amount will be NULL/0
- Users won't be able to claim rewards properly
- Claim route expects reward_amount to exist

**Fix**: Add `reward_amount` to engagement_claims creation

#### Issue 2: Cron Job Not Scheduled (CRITICAL)
**Location**: `vercel.json`

**Problem**: Auto-engage cron is NOT in `vercel.json`, so it never runs automatically.

**Current vercel.json**:
```json
{
  "crons": [
    {
      "path": "/api/creator-stats/sync",
      "schedule": "0 1 * * *"
    }
    // ❌ MISSING: auto-engage cron
  ]
}
```

**Impact**: 
- Auto-engage never runs automatically
- Users enable it but nothing happens
- Feature appears broken

**Fix**: Add cron job to vercel.json (with Vercel free tier limitations)

#### Issue 3: Vercel Free Tier Limitation (CRITICAL)
**Location**: Code comment says "runs every minute" but Vercel free tier only supports hourly

**Problem**:
- Code comment: "This runs every minute"
- Vercel free tier: Only hourly cron jobs (minimum interval)
- Code looks for casts from "last 10 minutes" but cron runs hourly

**Impact**:
- If scheduled hourly, will miss many casts
- Auto-engage will be slow/unreliable
- Users might not get timely engagements

**Fix Options**:
- Option A: Accept hourly limitation, adjust time window
- Option B: Use external cron service (cron-job.org, etc.)
- Option C: Trigger on-demand via webhook when new casts arrive

#### Issue 4: Syntax Issue (Minor)
**Location**: Line 43-44

**Problem**: Weird line break in fetch call
```typescript
const usersRes = await fetch
  `${SUPABASE_URL}/rest/v1/...`,
  {
```

**Impact**: Should work but looks wrong
**Fix**: Clean up formatting

#### Issue 5: Error Handling Missing (Medium)
**Location**: Lines 280-297

**Problem**: No error handling for engagement_claims creation failures

**Impact**: If database insert fails, no error logged, user doesn't get reward

**Fix**: Add try-catch and error logging

#### Issue 6: Reward Amount Mismatch (Medium)
**Location**: Multiple files

**Problem**: 
- Auto-engage doesn't set reward_amount
- Claim route uses `ENGAGEMENT_REWARDS` from its own file
- If reward_amount is missing, claim will fail or use wrong amount

**Fix**: Use same reward constants, ensure reward_amount is set

## 📋 Fix Plan

### Phase 1: Critical Fixes (Must Do)

#### Fix 1.1: Add reward_amount to Engagement Claims
**File**: `src/app/api/cron/auto-engage/route.ts`
**Lines**: 289-294

**Change**:
```typescript
// Add reward amounts constant at top
const ENGAGEMENT_REWARDS: Record<string, number> = {
  like: 1_000,    // 1k CATWALK
  recast: 2_000,  // 2k CATWALK
};

// Update engagement_claims creation:
body: JSON.stringify({
  fid,
  cast_hash: castHash,
  engagement_type: action,
  reward_amount: ENGAGEMENT_REWARDS[action], // ✅ ADD THIS
  verified_at: new Date().toISOString(),
}),
```

#### Fix 1.2: Add Cron Job to vercel.json
**File**: `vercel.json`

**Change**:
```json
{
  "crons": [
    {
      "path": "/api/creator-stats/sync",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/auto-engage",
      "schedule": "0 * * * *"  // Every hour (Vercel free tier limitation)
    }
  ]
}
```

**Note**: Vercel free tier only supports hourly, not per-minute

#### Fix 1.3: Adjust Time Window for Hourly Cron
**File**: `src/app/api/cron/auto-engage/route.ts`
**Line**: 64

**Change**:
```typescript
// Current: 10 minutes (for per-minute cron)
const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);

// Change to: 70 minutes (to catch casts from last hour + buffer)
const seventyMinutesAgo = Math.floor(Date.now() / 1000) - (70 * 60);
```

**Also update filter**:
```typescript
// Line 142: Update filter
const recentCasts = allCasts.filter((cast: any) => {
  const timestamp = new Date(cast.timestamp).getTime() / 1000;
  const isRecent = timestamp >= seventyMinutesAgo; // ✅ Change this
  const isInChannel = cast.parent_url === CATWALK_CHANNEL_PARENT_URL;
  return isRecent && isInChannel;
});
```

### Phase 2: Error Handling & Robustness

#### Fix 2.1: Add Error Handling for Engagement Claims
**File**: `src/app/api/cron/auto-engage/route.ts`
**Lines**: 279-297

**Change**:
```typescript
// Wrap in try-catch
try {
  for (const action of ["like", "recast"]) {
    const claimRes = await fetch(
      `${SUPABASE_URL}/rest/v1/engagement_claims`,
      {
        method: "POST",
        headers: {
          ...SUPABASE_HEADERS,
          Prefer: "resolution=ignore-duplicates",
        },
        body: JSON.stringify({
          fid,
          cast_hash: castHash,
          engagement_type: action,
          reward_amount: ENGAGEMENT_REWARDS[action],
          verified_at: new Date().toISOString(),
        }),
      }
    );
    
    if (!claimRes.ok) {
      const errorText = await claimRes.text();
      console.error(`[Auto-Engage Cron] Failed to create engagement_claim for ${action}:`, errorText);
    } else {
      console.log(`[Auto-Engage Cron] ✅ Created engagement_claim for ${action} (${ENGAGEMENT_REWARDS[action]} CATWALK)`);
    }
  }
} catch (claimErr) {
  console.error(`[Auto-Engage Cron] Error creating engagement_claims:`, claimErr);
  // Don't fail the whole job, just log the error
}
```

#### Fix 2.2: Fix Syntax Issue
**File**: `src/app/api/cron/auto-engage/route.ts`
**Lines**: 43-49

**Change**:
```typescript
// Current (weird formatting):
const usersRes = await fetch
  `${SUPABASE_URL}/rest/v1/...`,
  {

// Fix to:
const usersRes = await fetch(
  `${SUPABASE_URL}/rest/v1/user_engage_preferences?auto_engage_enabled=eq.true&signer_uuid=not.is.null`,
  {
    method: "GET",
    headers: SUPABASE_HEADERS,
  }
);
```

### Phase 3: Alternative Solutions (If Hourly Isn't Good Enough)

#### Option A: External Cron Service
- Use cron-job.org or similar
- Call `/api/cron/auto-engage` every minute
- Pass `CRON_SECRET` in Authorization header
- **Pros**: True per-minute execution
- **Cons**: External dependency, additional setup

#### Option B: Webhook-Triggered Engagement
- When webhook receives `cast.created` from AUTHOR_FID
- Immediately trigger auto-engage for that specific cast
- **Pros**: Real-time, no cron needed
- **Cons**: Requires webhook modification

#### Option C: Accept Hourly Limitation
- Run hourly, check last 70 minutes
- Users get engaged within 1 hour of cast
- **Pros**: Simple, works with free tier
- **Cons**: Not real-time

## 🎯 Recommended Fix Priority

### Must Fix (Blocks Feature):
1. ✅ Add `reward_amount` to engagement_claims (Fix 1.1)
2. ✅ Add cron to vercel.json (Fix 1.2)
3. ✅ Adjust time window for hourly cron (Fix 1.3)

### Should Fix (Improves Reliability):
4. ✅ Add error handling (Fix 2.1)
5. ✅ Fix syntax (Fix 2.2)

### Nice to Have (Future Optimization):
6. Consider external cron or webhook-triggered approach

## 📊 Expected Behavior After Fixes

### End-to-End Flow:

1. **User Enables Auto-Engage**:
   - User clicks "Enable Auto-Engage"
   - Signer created via `/api/portal/engage/authorize`
   - User approves signer in Warpcast
   - `signer_uuid` and `auto_engage_enabled=true` stored in DB

2. **Cron Job Runs (Hourly)**:
   - Vercel triggers `/api/cron/auto-engage` every hour
   - Fetches users with `auto_engage_enabled=true` and valid `signer_uuid`
   - Gets recent casts from `/catwalk` (last 70 minutes)
   - For each user + cast:
     - Checks if already engaged (webhook data)
     - Checks if already processed (queue)
     - Performs like + recast via Neynar API
     - Creates `engagement_claims` with `reward_amount` ✅
     - Records in `auto_engage_queue`

3. **User Claims Rewards**:
   - User visits portal
   - Sees claimable rewards (from `engagement_claims`)
   - Claims rewards via `/api/portal/engagement/claim`
   - Gets CATWALK tokens (like: 1k, recast: 2k = 3k total per cast)
   - Gets 10% bonus if auto-engage enabled

## ⚠️ Known Limitations

1. **Hourly Execution**: Due to Vercel free tier, cron runs hourly, not per-minute
   - Casts will be engaged within 1 hour (not immediately)
   - Acceptable for most use cases

2. **Time Window**: Checks last 70 minutes to catch casts from previous hour
   - May engage with slightly older casts
   - Prevents missing casts between cron runs

3. **Rate Limiting**: 200ms delay between users
   - If many users enabled, may take time to process all
   - Consider batching if needed

## 🚀 Next Steps

1. **Apply Critical Fixes** (Fix 1.1, 1.2, 1.3)
2. **Apply Error Handling** (Fix 2.1, 2.2)
3. **Test End-to-End**:
   - Enable auto-engage for test user
   - Wait for cron to run (or trigger manually)
   - Verify like + recast happened
   - Verify `engagement_claims` created with `reward_amount`
   - Verify user can claim rewards
4. **Monitor**:
   - Check cron execution logs
   - Verify engagements are happening
   - Verify rewards are claimable

## 📝 Summary

**Current Status**: Feature is 80% complete, but has critical blockers:
- ❌ Missing `reward_amount` (database will reject)
- ❌ Cron not scheduled (never runs)
- ❌ Time window mismatch (expects per-minute, gets hourly)

**After Fixes**: Feature will work end-to-end:
- ✅ Users can enable auto-engage
- ✅ Cron runs hourly (Vercel free tier limitation)
- ✅ Engagements happen automatically
- ✅ Rewards are claimable
- ✅ Users get CATWALK tokens

**Estimated Fix Time**: 15-20 minutes for critical fixes
