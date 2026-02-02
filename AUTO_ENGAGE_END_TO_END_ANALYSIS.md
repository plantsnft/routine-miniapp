# Auto-Engage Feature: End-to-End Analysis & Current State

## 🔍 Current State Assessment

### ✅ What Should Work Now (After Fixes)

#### Flow 1: User WITH Auto-Engage Enabled

**Step-by-Step:**
1. **User Enables Auto-Engage:**
   - User clicks "Enable Auto-Engage" in portal
   - `/api/portal/engage/authorize` creates signer
   - User approves signer in Warpcast
   - `signer_uuid` and `auto_engage_enabled=true` stored in `user_engage_preferences` ✅

2. **Cron Job Runs (Hourly):**
   - Vercel triggers `/api/cron/auto-engage` every hour at :00
   - Validates signers are still approved ✅
   - Gets recent casts from `/catwalk` (last 70 minutes) using cache ✅
   - For each user + cast:
     - Skips own casts ✅
     - Checks if already engaged (webhook data) ✅
     - Checks if already processed (queue) ✅
     - Performs like API call ✅
     - Performs recast API call ✅
     - **Only if like succeeded:** Creates like `engagement_claim` with `reward_amount=1000` ✅
     - **Only if recast succeeded:** Creates recast `engagement_claim` with `reward_amount=2000` ✅
     - Records in `auto_engage_queue` (separate records for 'like' and 'recast') ✅

3. **User Claims Rewards:**
   - User visits portal
   - `/api/portal/engagement/verify` shows claimable rewards (from `engagement_claims` table)
   - User clicks claim
   - `/api/portal/engagement/claim` processes claims
   - Gets CATWALK tokens:
     - Like: 1,000 CATWALK
     - Recast: 2,000 CATWALK
     - Total: 3,000 CATWALK per cast (if both succeeded)
   - Gets 10% bonus if auto-engage enabled (1.1x multiplier = 3,300 total) ✅

**Status:** ✅ Should work end-to-end

---

#### Flow 2: User WITHOUT Auto-Engage (Manual Engagement)

**Step-by-Step:**
1. **User Manually Engages:**
   - User manually likes/recasts a cast in Warpcast (via Farcaster app)
   - Neynar webhook receives `reaction.created` event
   - `/api/webhooks/neynar` processes event ✅

2. **Webhook Processing:**
   - Checks if cast is in `eligible_casts` (last 15 days) ✅
   - If eligible, writes to `engagements` table:
     - `user_fid`, `cast_hash`, `engagement_type` ('like' or 'recast')
     - `engaged_at` (timestamp)
     - `source='webhook'` ✅
   - **Does NOT create `engagement_claims`** (this is correct - verify route does this)

3. **User Visits Portal:**
   - User opens portal
   - Frontend calls `/api/portal/engagement/verify`
   - Verify route:
     - Checks `engagements` table (finds manual engagement from webhook) ✅
     - Checks `engagement_claims` table (doesn't exist yet)
     - **Creates `engagement_claims` with `reward_amount`** ✅
     - Returns claimable rewards to frontend ✅

4. **User Claims Rewards:**
   - User sees claimable rewards in portal
   - User clicks claim
   - `/api/portal/engagement/claim` processes claims
   - Gets CATWALK tokens:
     - Like: 1,000 CATWALK
     - Recast: 2,000 CATWALK
     - Total: 3,000 CATWALK per cast (if both done)
   - **No bonus** (auto-engage not enabled) ✅

**Status:** ✅ Should work, but with one dependency (see below)

---

## ⚠️ Potential Issues & Gaps

### Issue 1: Manual Users Must Visit Portal to Get Claims Created

**Problem:**
- Manual engagements are recorded in `engagements` table immediately (via webhook) ✅
- But `engagement_claims` are only created when user visits portal and calls `/api/portal/engagement/verify`
- If user never visits portal, they won't get claims created, so they can't claim rewards

**Impact:**
- Manual users must visit portal to "activate" their rewards
- This is acceptable UX (user needs to visit portal to claim anyway)
- But it means rewards aren't "ready" until portal visit

**Question for You:**
- Is this acceptable? (User must visit portal to see/claim rewards anyway)
- OR should we create `engagement_claims` directly in webhook? (More efficient, but adds complexity)

### Issue 2: Verify Route Creates Claims - But When?

**Current Behavior:**
- `/api/portal/engagement/verify` creates `engagement_claims` when:
  1. User has engaged (found in `engagements` table or detected via API)
  2. Claim doesn't already exist
  3. Cast is within last 15 days

**Potential Gap:**
- If user manually engages but webhook fails to record it in `engagements` table
- Verify route will still detect it via Neynar API (viewer_context)
- But this costs API credits

**Question:**
- Is webhook coverage good? (Most manual engagements should be captured by webhook)
- If webhook misses some, verify route will catch them (but costs credits)

### Issue 3: Auto-Engage vs Manual - Different Timing

**Auto-Engage:**
- Claims created immediately when cron runs (hourly)
- User can claim as soon as they visit portal

**Manual:**
- Claims created when user visits portal (on-demand)
- User must visit portal to "activate" rewards

**Impact:**
- Slight UX difference, but both work
- Manual users might not see rewards until they visit portal

**Question:**
- Is this acceptable? (Both flows work, just different timing)

---

## 📊 Expected Behavior Summary

### Auto-Engage Users:
1. ✅ Enable auto-engage → Signer approved
2. ✅ Cron runs hourly → Auto likes/recasts → Creates claims immediately
3. ✅ Visit portal → See claimable rewards (already in DB)
4. ✅ Claim → Get tokens + 10% bonus

### Manual Users:
1. ✅ Manually like/recast in Warpcast
2. ✅ Webhook records in `engagements` table
3. ✅ Visit portal → Verify route creates `engagement_claims`
4. ✅ See claimable rewards
5. ✅ Claim → Get tokens (no bonus)

---

## ❓ Questions for You

### Question 1: Manual Engagement Claims Creation
**Current:** Claims created when user visits portal (via verify route)
**Alternative:** Create claims directly in webhook when engagement happens

**Which do you prefer?**
- **Option A:** Current (on-demand when user visits portal)
  - Pros: Simpler, no webhook changes needed
  - Cons: User must visit portal to "activate" rewards
- **Option B:** Create in webhook (immediate)
  - Pros: Rewards ready immediately, no portal visit needed
  - Cons: More complex, webhook needs reward_amount logic

### Question 2: Webhook Coverage
**Current:** Webhook records manual engagements in `engagements` table
**Verify Route:** Falls back to Neynar API if webhook data missing

**Is webhook coverage good?**
- If webhook captures 90%+ of manual engagements → Current approach is fine
- If webhook misses many → Verify route will catch them (but costs credits)

### Question 3: User Experience Expectations
**Auto-Engage:**
- Rewards ready within 1 hour (cron runs hourly)
- User gets 10% bonus

**Manual:**
- Rewards ready when user visits portal
- No bonus

**Is this acceptable?**
- Both flows work, just different timing
- Manual users get same rewards (just no bonus)

---

## 🔍 What Needs Review (Not Fixes, Just Verification)

### 1. Webhook Coverage
**Check:**
```sql
-- How many manual engagements are captured by webhook?
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN source = 'webhook' THEN 1 END) as webhook_count,
  COUNT(CASE WHEN source != 'webhook' THEN 1 END) as other_count
FROM engagements
WHERE engaged_at >= NOW() - INTERVAL '24 hours';
```

**Expected:** High webhook coverage (>80%)

### 2. Verify Route Claim Creation
**Check:** Does verify route properly create claims for manual engagements?
- Code shows it does (lines 813-829 in verify route)
- Creates `engagement_claims` with `reward_amount` ✅
- Only creates if doesn't exist ✅

### 3. Claim Route Bonus Logic
**Check:** Does claim route properly apply bonus?
- Code shows it checks `auto_engage_enabled` (line 205)
- Applies 1.1x multiplier if enabled ✅
- Manual users get no bonus (correct) ✅

---

## ✅ What Should Work Now

### Auto-Engage Flow:
1. ✅ User enables → Signer approved
2. ✅ Cron runs hourly → Auto engages → Creates claims
3. ✅ User visits portal → Sees rewards
4. ✅ User claims → Gets tokens + bonus

### Manual Flow:
1. ✅ User manually engages
2. ✅ Webhook records engagement
3. ✅ User visits portal → Verify creates claims
4. ✅ User sees rewards
5. ✅ User claims → Gets tokens (no bonus)

---

## 🎯 Summary

**Current State:**
- ✅ Auto-engage flow should work end-to-end
- ✅ Manual engagement flow should work end-to-end
- ⚠️ Manual users must visit portal to "activate" rewards (claims created on-demand)
- ⚠️ Both flows work, just different timing

**No Critical Issues Found:**
- All code paths look correct
- Database constraints satisfied
- Reward amounts set correctly
- Bonus logic works correctly

**Potential Improvements (Optional):**
- Create `engagement_claims` in webhook for manual users (immediate rewards)
- But current approach works fine (on-demand creation)

---

## 📝 Next Steps

1. **Test Auto-Engage Flow:**
   - Enable for test user
   - Wait for cron or trigger manually
   - Verify claims created
   - Verify user can claim

2. **Test Manual Flow:**
   - Manually like/recast a cast
   - Verify webhook recorded it
   - Visit portal
   - Verify claims created
   - Verify user can claim

3. **Monitor:**
   - Check webhook coverage
   - Check claim creation success rate
   - Check user experience

**Ready to test!** Both flows should work. The main difference is timing (auto-engage = immediate via cron, manual = on-demand via portal visit).
