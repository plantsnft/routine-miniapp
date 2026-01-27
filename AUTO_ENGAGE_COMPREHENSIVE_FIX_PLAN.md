# Auto-Engage Feature: Comprehensive Fix Plan (Gold Standard)

## 🔍 Deep Analysis & Validation

### Current State Assessment

**What Works:**
- ✅ Signer authorization flow (EIP-712, Neynar integration)
- ✅ User preferences storage and retrieval
- ✅ Neynar API calls (like/recast endpoints)
- ✅ Smart engagement tracking (webhook data, queue checks)
- ✅ Channel feed caching (5-minute TTL)

**Critical Blockers:**
1. ❌ **Missing `reward_amount`** - Database insert will FAIL (NOT NULL constraint)
2. ❌ **Cron not scheduled** - Feature never runs automatically
3. ❌ **Time window mismatch** - Code expects per-minute, gets hourly
4. ⚠️ **Incomplete error handling** - Silent failures possible
5. ⚠️ **Logic gap** - Creates engagement_claims even if API calls fail

### Database Schema Validation

**`engagement_claims` table:**
```sql
reward_amount NUMERIC NOT NULL, -- NO DEFAULT VALUE
```

**Impact:** Any insert without `reward_amount` will fail with constraint violation.

**Claim Route Behavior:**
- Line 188: Uses `ENGAGEMENT_REWARDS[claim.engagement_type]` (constant, not DB field)
- **Issue:** Even if DB insert somehow succeeded without reward_amount, claim route would work BUT:
  - Data inconsistency (DB has NULL/0, code uses constant)
  - Future code that reads from DB would break
  - Bad practice - database should be source of truth

**Conclusion:** MUST add `reward_amount` to all engagement_claims inserts.

### Vercel Free Tier Constraints

**Confirmed Limitations:**
- Minimum cron interval: **Hourly** (not per-minute)
- Maximum cron jobs per project: **100** (not a concern here)
- Cron execution: May vary by ±1 minute

**Current Code Expectation:**
- Comment says "runs every minute"
- Time window: 10 minutes
- **Mismatch:** If cron runs hourly, will miss 50 minutes of casts

**Solution:** Adjust time window to 70 minutes (60 min + 10 min buffer)

### Logic Flow Analysis

**Current Flow (Lines 213-297):**
1. Perform like API call
2. Perform recast API call
3. Record in queue (regardless of success)
4. Create engagement_claims for BOTH like AND recast (regardless of API success)

**Issues:**
- If like fails but recast succeeds, we still create like claim
- If both fail, we still create both claims
- No verification that API calls actually succeeded before creating claims

**Gold Standard Approach:**
- Only create engagement_claims if corresponding API call succeeded
- Track partial successes (like but not recast, or vice versa)
- Ensure data integrity: claims should match actual engagements

## 📋 Comprehensive Fix Plan

### Phase 1: Critical Fixes (Must Do - Blocks Feature)

#### Fix 1.1: Add Reward Amount Constant & Use It
**File:** `src/app/api/cron/auto-engage/route.ts`
**Location:** Top of file (after imports, before GET function)
**Reason:** Need consistent reward values matching other routes

**Change:**
```typescript
// Add after line 16 (after CHANNEL_FEED_CACHE_TTL_MS)
// Reward amounts per engagement type (must match other routes)
const ENGAGEMENT_REWARDS: Record<string, number> = {
  like: 1_000,    // 1k CATWALK per like
  recast: 2_000,  // 2k CATWALK per recast
};
```

**Validation:** Matches values in:
- `src/app/api/portal/engagement/verify/route.ts` (lines 18-22)
- `src/app/api/portal/engage/bulk/route.ts` (lines 14-17)
- `src/app/api/portal/lifetime-rewards/route.ts` (lines 19-23)

#### Fix 1.2: Fix Engagement Claims Creation Logic
**File:** `src/app/api/cron/auto-engage/route.ts`
**Location:** Lines 279-297
**Reason:** 
- Must add `reward_amount` (database constraint)
- Only create claims if API call succeeded (data integrity)
- Add proper error handling

**Current Code (WRONG):**
```typescript
// Also create engagement claims for rewards
for (const action of ["like", "recast"]) {
  await fetch(
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
        verified_at: new Date().toISOString(),
        // ❌ MISSING: reward_amount
      }),
    }
  );
}
```

**Fixed Code (GOLD STANDARD):**
```typescript
// Create engagement claims ONLY for successful API calls
// Track success separately for like and recast
const likeSuccess = likeRes.ok;
const recastSuccess = recastRes.ok;

// Create engagement claim for like (if succeeded)
if (likeSuccess) {
  try {
    const likeClaimRes = await fetch(
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
          engagement_type: "like",
          reward_amount: ENGAGEMENT_REWARDS.like, // ✅ ADD THIS
          verified_at: new Date().toISOString(),
        }),
      }
    );

    if (!likeClaimRes.ok) {
      const errorText = await likeClaimRes.text();
      console.error(`[Auto-Engage Cron] Failed to create like engagement_claim for FID ${fid}, cast ${castHash.substring(0, 10)}:`, errorText);
    } else {
      console.log(`[Auto-Engage Cron] ✅ Created like engagement_claim (${ENGAGEMENT_REWARDS.like} CATWALK)`);
    }
  } catch (claimErr) {
    console.error(`[Auto-Engage Cron] Error creating like engagement_claim:`, claimErr);
    // Non-fatal: log but don't fail the job
  }
}

// Create engagement claim for recast (if succeeded)
if (recastSuccess) {
  try {
    const recastClaimRes = await fetch(
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
          engagement_type: "recast",
          reward_amount: ENGAGEMENT_REWARDS.recast, // ✅ ADD THIS
          verified_at: new Date().toISOString(),
        }),
      }
    );

    if (!recastClaimRes.ok) {
      const errorText = await recastClaimRes.text();
      console.error(`[Auto-Engage Cron] Failed to create recast engagement_claim for FID ${fid}, cast ${castHash.substring(0, 10)}:`, errorText);
    } else {
      console.log(`[Auto-Engage Cron] ✅ Created recast engagement_claim (${ENGAGEMENT_REWARDS.recast} CATWALK)`);
    }
  } catch (claimErr) {
    console.error(`[Auto-Engage Cron] Error creating recast engagement_claim:`, claimErr);
    // Non-fatal: log but don't fail the job
  }
}
```

**Key Improvements:**
1. ✅ Adds `reward_amount` (fixes database constraint violation)
2. ✅ Only creates claims if API call succeeded (data integrity)
3. ✅ Proper error handling with logging
4. ✅ Handles partial successes (like but not recast, or vice versa)
5. ✅ Non-fatal errors (doesn't break the job)

#### Fix 1.3: Add Cron Job to vercel.json
**File:** `vercel.json`
**Location:** Inside `crons` array
**Reason:** Cron is not scheduled, so it never runs automatically

**Current:**
```json
{
  "crons": [
    {
      "path": "/api/creator-stats/sync",
      "schedule": "0 1 * * *"
    }
  ]
}
```

**Fixed:**
```json
{
  "crons": [
    {
      "path": "/api/creator-stats/sync",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/auto-engage",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Schedule Explanation:**
- `"0 * * * *"` = Every hour at minute 0 (e.g., 1:00, 2:00, 3:00)
- Matches Vercel free tier limitation (hourly minimum)
- Vercel may execute ±1 minute (acceptable)

#### Fix 1.4: Adjust Time Window for Hourly Cron
**File:** `src/app/api/cron/auto-engage/route.ts`
**Location:** Line 64 and line 144
**Reason:** Code expects per-minute cron but gets hourly - will miss casts

**Current:**
```typescript
// Line 64
const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);

// Line 144
const isRecent = timestamp >= tenMinutesAgo;
```

**Fixed:**
```typescript
// Line 64: Change to 70 minutes (60 min for hourly cron + 10 min buffer)
const seventyMinutesAgo = Math.floor(Date.now() / 1000) - (70 * 60);

// Line 144: Update filter
const isRecent = timestamp >= seventyMinutesAgo;
```

**Why 70 Minutes:**
- Hourly cron runs at :00 (e.g., 2:00 PM)
- Need to catch casts from previous hour (1:00 PM - 2:00 PM)
- 60 minutes covers the hour
- 10 minutes buffer accounts for:
  - Vercel execution variance (±1 min)
  - Clock skew
  - Cast timestamp precision
  - Safety margin

**Also Update Comment:**
```typescript
// Line 22-23: Update comment
/**
 * This runs hourly (Vercel free tier limitation) and:
 * 1. Finds new casts in /catwalk from the last 70 minutes
 * 2. For users with auto_engage_enabled = true
 * 3. Performs like + recast on those casts
 */
```

### Phase 2: Code Quality & Robustness

#### Fix 2.1: Fix Syntax Formatting
**File:** `src/app/api/cron/auto-engage/route.ts`
**Location:** Lines 43-49
**Reason:** Weird line break makes code harder to read

**Current:**
```typescript
const usersRes = await fetch(
  `${SUPABASE_URL}/rest/v1/user_engage_preferences?auto_engage_enabled=eq.true&signer_uuid=not.is.null`,
  {
    method: "GET",
    headers: SUPABASE_HEADERS,
  }
);
```

**Note:** Actually, this looks correct. The issue might be in how it was displayed. Let me check the actual file...

**After Review:** The code is actually correct. No syntax fix needed. The original plan was based on a display artifact.

#### Fix 2.2: Improve Error Handling for API Calls
**File:** `src/app/api/cron/auto-engage/route.ts`
**Location:** Lines 217-257
**Reason:** Currently only checks `if (likeRes.ok)` but doesn't log failures or handle errors

**Current:**
```typescript
if (likeRes.ok) {
  successfulEngagements++;
  console.log(`[Auto-Engage Cron] ✅ FID ${fid} liked ${castHash.substring(0, 10)}...`);
}
```

**Improved:**
```typescript
if (likeRes.ok) {
  successfulEngagements++;
  console.log(`[Auto-Engage Cron] ✅ FID ${fid} liked ${castHash.substring(0, 10)}...`);
} else {
  const errorText = await likeRes.text().catch(() => "Unknown error");
  console.error(`[Auto-Engage Cron] ❌ Failed to like for FID ${fid}, cast ${castHash.substring(0, 10)}: ${likeRes.status} ${errorText}`);
  errors.push(`FID ${fid} like failed: ${likeRes.status}`);
}

// Same for recast...
if (recastRes.ok) {
  successfulEngagements++;
  console.log(`[Auto-Engage Cron] ✅ FID ${fid} recasted ${castHash.substring(0, 10)}...`);
} else {
  const errorText = await recastRes.text().catch(() => "Unknown error");
  console.error(`[Auto-Engage Cron] ❌ Failed to recast for FID ${fid}, cast ${castHash.substring(0, 10)}: ${recastRes.status} ${errorText}`);
  errors.push(`FID ${fid} recast failed: ${recastRes.status}`);
}
```

**Benefits:**
- Better error visibility in logs
- Tracks failures in errors array
- Helps debugging when things go wrong

#### Fix 2.3: Add Signer Validation (Optional but Recommended)
**File:** `src/app/api/cron/auto-engage/route.ts`
**Location:** After line 162 (after getting signerUuid)
**Reason:** Signer might become invalid between cron runs (user revoked, expired, etc.)

**Add:**
```typescript
if (!signerUuid) continue;

// Verify signer is still approved before using it
try {
  const signerCheck = await fetch(
    `https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signerUuid}`,
    {
      headers: {
        "x-api-key": NEYNAR_API_KEY,
      },
    }
  );

  if (signerCheck.ok) {
    const signerData = await signerCheck.json() as any;
    if (signerData.status !== "approved") {
      console.log(`[Auto-Engage Cron] ⚠️ FID ${fid} signer not approved (status: ${signerData.status}), skipping`);
      // Optionally: Update user_engage_preferences to disable auto_engage_enabled
      continue;
    }
  } else {
    console.warn(`[Auto-Engage Cron] ⚠️ Could not verify signer for FID ${fid}, proceeding anyway`);
    // Non-fatal: proceed with engagement attempt
  }
} catch (signerErr) {
  console.warn(`[Auto-Engage Cron] Signer check failed for FID ${fid} (non-fatal):`, signerErr);
  // Non-fatal: proceed with engagement attempt
}
```

**Note:** This adds an API call per user per cron run. If you have many users, this could add up. Consider:
- **Option A:** Add this check (more robust, costs 1 API call per user per hour)
- **Option B:** Skip this check (less robust, but saves API calls - failures will happen at engagement time)

**Recommendation:** Add it for now (gold standard), optimize later if needed.

### Phase 3: Additional Optimizations (Future)

#### Optimization 3.1: Webhook-Triggered Auto-Engage (Future)
**Concept:** When webhook receives `cast.created` for /catwalk channel, immediately trigger auto-engage for that specific cast.

**Pros:**
- Real-time engagement (no 1-hour delay)
- More efficient (only process new casts)
- Better user experience

**Cons:**
- Requires webhook modification
- More complex error handling
- Need to handle webhook failures gracefully

**Implementation:** Would require:
1. Modify `/api/webhooks/neynar/route.ts` to detect new /catwalk casts
2. Trigger auto-engage logic for that specific cast
3. Handle rate limiting and errors
4. Fallback to cron for missed casts

**Recommendation:** Implement after Phase 1 & 2 are stable.

#### Optimization 3.2: Batch Processing (Future)
**Concept:** Process multiple users in parallel (with rate limiting).

**Current:** Sequential processing (one user at a time)
**Optimized:** Process 5-10 users in parallel batches

**Benefits:** Faster execution, especially with many users
**Risks:** Rate limiting, error handling complexity

**Recommendation:** Only if you have 50+ auto-engage users.

## 🎯 Implementation Priority

### Must Do (Blocks Feature):
1. ✅ **Fix 1.1** - Add reward amount constant
2. ✅ **Fix 1.2** - Fix engagement claims creation (add reward_amount, conditional creation)
3. ✅ **Fix 1.3** - Add cron to vercel.json
4. ✅ **Fix 1.4** - Adjust time window to 70 minutes

### Should Do (Improves Reliability):
5. ✅ **Fix 2.2** - Improve error handling for API calls
6. ⚠️ **Fix 2.3** - Add signer validation (optional but recommended)

### Nice to Have (Future):
7. Optimization 3.1 - Webhook-triggered engagement
8. Optimization 3.2 - Batch processing

## 📊 Expected Behavior After Fixes

### End-to-End Flow:

1. **User Enables Auto-Engage:**
   - User clicks "Enable Auto-Engage" in portal
   - `/api/portal/engage/authorize` creates signer
   - User approves signer in Warpcast
   - `signer_uuid` and `auto_engage_enabled=true` stored in `user_engage_preferences`

2. **Cron Job Runs (Hourly):**
   - Vercel triggers `/api/cron/auto-engage` at :00 (e.g., 2:00 PM)
   - Fetches users with `auto_engage_enabled=true` and valid `signer_uuid`
   - Optionally validates signer is still approved (Fix 2.3)
   - Gets recent casts from `/catwalk` (last 70 minutes) using cache
   - For each user + cast:
     - Skips own casts
     - Checks if already engaged (webhook data)
     - Checks if already processed (queue)
     - Performs like API call
     - Performs recast API call
     - **Only if like succeeded:** Creates like `engagement_claim` with `reward_amount=1000`
     - **Only if recast succeeded:** Creates recast `engagement_claim` with `reward_amount=2000`
     - Records in `auto_engage_queue` (regardless of success, to avoid retries)

3. **User Claims Rewards:**
   - User visits portal
   - `/api/portal/engagement/verify` shows claimable rewards
   - User clicks claim
   - `/api/portal/engagement/claim` processes claims
   - Gets CATWALK tokens:
     - Like: 1,000 CATWALK
     - Recast: 2,000 CATWALK
     - Total: 3,000 CATWALK per cast (if both succeeded)
   - Gets 10% bonus if auto-engage enabled (1.1x multiplier)

## ⚠️ Known Limitations & Trade-offs

1. **Hourly Execution:**
   - Casts engaged within 1 hour (not immediately)
   - Acceptable for most use cases
   - Future: Can optimize with webhook-triggered approach

2. **Time Window (70 minutes):**
   - May engage with casts up to 70 minutes old
   - Prevents missing casts between cron runs
   - Small overlap is acceptable

3. **Partial Success Handling:**
   - If like succeeds but recast fails, user gets 1k CATWALK (not 3k)
   - This is correct behavior (only reward for successful engagements)
   - User can manually recast later if they want

4. **Rate Limiting:**
   - 100ms delay between like and recast
   - 200ms delay between users
   - If many users enabled, may take time to process all
   - Consider batching if you have 50+ users

5. **Signer Validation:**
   - Adds 1 API call per user per hour
   - If 10 users enabled = 10 extra API calls per hour
   - Worth it for reliability (prevents failed engagements)

## ✅ Validation Checklist

After implementing fixes, verify:

- [ ] Cron job appears in Vercel dashboard
- [ ] Cron executes hourly (check logs)
- [ ] Engagement claims created with `reward_amount` (check database)
- [ ] Only creates claims for successful API calls (check logs)
- [ ] Time window catches casts from previous hour (check logs)
- [ ] Users can claim rewards (test end-to-end)
- [ ] Bonus multiplier applies (check claim route)
- [ ] Error handling logs failures (check logs)
- [ ] No database constraint violations (check logs)

## 📝 Summary

**Current Status:** Feature is 80% complete, but has critical blockers preventing it from working.

**Critical Issues:**
1. ❌ Missing `reward_amount` → Database insert fails
2. ❌ Cron not scheduled → Never runs
3. ❌ Time window mismatch → Misses casts
4. ⚠️ Logic gap → Creates claims even if API fails

**After Fixes:** Feature will work end-to-end with:
- ✅ Proper database inserts (with reward_amount)
- ✅ Hourly cron execution (Vercel free tier)
- ✅ Correct time window (70 minutes)
- ✅ Data integrity (only claims for successful engagements)
- ✅ Comprehensive error handling
- ✅ Signer validation (optional but recommended)

**Estimated Implementation Time:**
- Phase 1 (Critical): 20-30 minutes
- Phase 2 (Robustness): 15-20 minutes
- **Total: 35-50 minutes**

**Gold Standard Compliance:**
- ✅ Data integrity (claims match actual engagements)
- ✅ Error handling (comprehensive logging)
- ✅ Rate limiting (proper delays)
- ✅ Idempotency (queue checks prevent duplicates)
- ✅ Security (cron secret validation)
- ✅ Efficiency (uses cache, checks webhook data first)

This plan ensures the feature works 100% end-to-end and meets Farcaster mini app best practices.
