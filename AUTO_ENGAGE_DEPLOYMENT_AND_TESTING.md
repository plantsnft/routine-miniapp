# Auto-Engage Feature: Deployment & Testing Guide

## 🚀 Deployment Steps

### Step 1: Push Changes to Repository

The changes have been committed. Push to trigger Vercel deployment:

```bash
git push origin master
```

**Or if you prefer to review first:**
```bash
git log -1  # Review the commit
git push origin master
```

### Step 2: Verify Vercel Deployment

1. Go to Vercel Dashboard: https://vercel.com/plants-projects-156afffe/routine
2. Check latest deployment status
3. Verify build succeeded
4. Check that cron job appears in "Cron Jobs" section

**Expected:** New cron job `/api/cron/auto-engage` with schedule `0 * * * *` (hourly)

## 🧪 Testing Guide

### Option 1: Manual Trigger (Recommended for Initial Testing)

You can manually trigger the cron job to test immediately:

**Method A: Via Browser/curl**
```bash
# Replace YOUR_CRON_SECRET with your actual CRON_SECRET env var
curl -X GET "https://catwalk-smoky.vercel.app/api/cron/auto-engage" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Method B: Via Vercel Dashboard**
1. Go to Vercel Dashboard → Your Project → Functions
2. Find `/api/cron/auto-engage`
3. Click "Invoke" (if available) or wait for next scheduled run

**Method C: Create Test Endpoint (Temporary)**
Add this to test without auth (remove after testing):

```typescript
// Add to src/app/api/cron/auto-engage/route.ts (temporary)
export async function POST(request: Request) {
  // Same logic as GET, but without auth check for testing
  return GET(request);
}
```

Then call: `POST /api/cron/auto-engage` (no auth needed)

### Option 2: Wait for Scheduled Run

- Cron runs hourly at :00 (e.g., 2:00 PM, 3:00 PM)
- Vercel may execute ±1 minute
- Check logs after next hour

## ✅ Verification Checklist

### 1. Deployment Verification

- [ ] Git push successful
- [ ] Vercel deployment succeeded
- [ ] Cron job appears in Vercel dashboard
- [ ] Build logs show no errors

### 2. Cron Execution Verification

**Check Vercel Logs:**
1. Go to Vercel Dashboard → Your Project → Logs
2. Filter by `/api/cron/auto-engage`
3. Look for execution logs

**Expected Log Patterns:**
```
[Auto-Engage Cron] Starting auto-engagement job...
[Auto-Engage Cron] Found X users with auto-engage enabled
[Auto-Engage Cron] ✅ Using cached channel feed (age: Xs, Y casts)
[Auto-Engage Cron] Found Z recent casts to potentially engage with
[Auto-Engage Cron] ✅ FID X liked cast_hash...
[Auto-Engage Cron] ✅ FID X recasted cast_hash...
[Auto-Engage Cron] ✅ Created like engagement_claim (1000 CATWALK)
[Auto-Engage Cron] ✅ Created recast engagement_claim (2000 CATWALK)
[Auto-Engage Cron] Complete! X/Y successful
```

**Error Patterns to Watch For:**
- ❌ `Failed to create engagement_claim` → Check database connection
- ❌ `Failed to like/recast` → Check signer validity, Neynar API
- ❌ `signer not approved` → User needs to re-approve signer
- ❌ Database constraint violations → Should not happen (reward_amount now included)

### 3. Database Verification

**Check `engagement_claims` table:**
```sql
-- Run in Supabase SQL Editor
SELECT 
  fid,
  cast_hash,
  engagement_type,
  reward_amount,
  verified_at,
  claimed_at
FROM engagement_claims
WHERE verified_at >= NOW() - INTERVAL '2 hours'
ORDER BY verified_at DESC
LIMIT 20;
```

**Expected:**
- ✅ `reward_amount` is NOT NULL (should be 1000 or 2000)
- ✅ `engagement_type` is 'like' or 'recast'
- ✅ `verified_at` is recent (within last hour)
- ✅ `claimed_at` is NULL (not yet claimed)

**Check `auto_engage_queue` table:**
```sql
SELECT 
  fid,
  cast_hash,
  action_type,
  executed_at,
  success
FROM auto_engage_queue
WHERE executed_at >= NOW() - INTERVAL '2 hours'
ORDER BY executed_at DESC
LIMIT 20;
```

**Expected:**
- ✅ Records exist for processed casts
- ✅ `executed_at` is recent
- ✅ `success` is true

### 4. End-to-End User Testing

**Prerequisites:**
- Test user with auto-engage enabled
- Recent cast in /catwalk channel (within last 70 minutes)

**Steps:**
1. **Enable Auto-Engage (if not already):**
   - Go to portal
   - Click "Enable Auto-Engage"
   - Approve signer in Warpcast
   - Verify `auto_engage_enabled=true` in database

2. **Trigger Cron (or wait for scheduled run):**
   - Manually trigger via curl/endpoint
   - OR wait for next hourly run

3. **Verify Engagement Happened:**
   - Check Warpcast - user should have liked and recasted the cast
   - Check `engagements` table (webhook should record it)
   - Check `auto_engage_queue` (cron should record it)

4. **Verify Claims Created:**
   - Check `engagement_claims` table
   - Should see 2 records: one for like (1000), one for recast (2000)
   - Both should have `reward_amount` set

5. **Verify User Can Claim:**
   - User visits portal
   - Should see claimable rewards
   - Click claim
   - Verify transaction succeeds
   - Verify tokens received (3000 CATWALK + 10% bonus = 3300 if auto-engage enabled)

## 🔍 Monitoring & Debugging

### Key Metrics to Monitor

1. **Cron Execution:**
   - Frequency: Should run hourly
   - Success rate: Should be high (>95%)
   - Execution time: Should be <30 seconds for typical load

2. **Engagement Success Rate:**
   - Like success rate
   - Recast success rate
   - Claims creation success rate

3. **Error Patterns:**
   - Signer validation failures
   - Neynar API failures
   - Database insert failures

### Common Issues & Solutions

#### Issue: Cron Not Running
**Symptoms:** No logs, cron job not in dashboard
**Solutions:**
- Check vercel.json is deployed
- Verify cron schedule syntax
- Check Vercel project settings

#### Issue: "No users with auto-engage enabled"
**Symptoms:** Log shows 0 users
**Solutions:**
- Check `user_engage_preferences` table
- Verify `auto_engage_enabled=true`
- Verify `signer_uuid` is not null

#### Issue: "No recent casts to engage with"
**Symptoms:** Log shows 0 casts
**Solutions:**
- Check if casts exist in /catwalk
- Verify time window (70 minutes)
- Check channel feed cache

#### Issue: "Failed to like/recast"
**Symptoms:** API calls failing
**Solutions:**
- Check signer is approved
- Verify Neynar API key is valid
- Check rate limiting

#### Issue: "Failed to create engagement_claim"
**Symptoms:** Database insert fails
**Solutions:**
- Check database connection
- Verify `reward_amount` is included (should be fixed now)
- Check for constraint violations

### Log Analysis Queries

**Check recent cron executions:**
```sql
-- This requires log aggregation, but you can check:
-- Vercel Dashboard → Logs → Filter by "/api/cron/auto-engage"
```

**Check engagement claims created:**
```sql
SELECT 
  COUNT(*) as total_claims,
  SUM(CASE WHEN engagement_type = 'like' THEN 1 ELSE 0 END) as likes,
  SUM(CASE WHEN engagement_type = 'recast' THEN 1 ELSE 0 END) as recasts,
  AVG(reward_amount) as avg_reward
FROM engagement_claims
WHERE verified_at >= NOW() - INTERVAL '24 hours';
```

**Check auto-engage queue activity:**
```sql
SELECT 
  COUNT(*) as total_processed,
  COUNT(DISTINCT fid) as unique_users,
  COUNT(DISTINCT cast_hash) as unique_casts
FROM auto_engage_queue
WHERE executed_at >= NOW() - INTERVAL '24 hours';
```

## 📊 Success Criteria

### Immediate (After First Run)
- ✅ Cron executes successfully
- ✅ No database constraint violations
- ✅ Engagement claims created with reward_amount
- ✅ Logs show successful engagements

### Short-term (24 hours)
- ✅ Cron runs hourly consistently
- ✅ Users receiving rewards
- ✅ No recurring errors
- ✅ Engagement success rate >90%

### Long-term (1 week)
- ✅ Feature stable
- ✅ Users claiming rewards successfully
- ✅ No data integrity issues
- ✅ Performance acceptable

## 🚨 Rollback Plan (If Needed)

If issues arise, you can quickly rollback:

```bash
# Revert the commit
git revert HEAD
git push origin master
```

Or restore specific files:
```bash
git checkout HEAD~1 -- src/app/api/cron/auto-engage/route.ts vercel.json
git commit -m "Revert auto-engage changes"
git push origin master
```

## 📝 Next Steps After Successful Deployment

1. **Monitor for 24-48 hours:**
   - Watch logs for errors
   - Verify users are receiving rewards
   - Check engagement success rate

2. **Optimize if needed:**
   - Consider webhook-triggered engagement (faster than hourly)
   - Batch processing if many users
   - Additional error handling if patterns emerge

3. **Document for users:**
   - Update user-facing docs
   - Explain how auto-engage works
   - Set expectations (hourly execution)

## ✅ Final Checklist Before Going Live

- [ ] All code changes committed and pushed
- [ ] Vercel deployment successful
- [ ] Cron job appears in dashboard
- [ ] Manual test run successful
- [ ] Database verification passed
- [ ] End-to-end user test passed
- [ ] Monitoring set up
- [ ] Rollback plan ready

---

**Ready to deploy?** Push the changes and follow this guide to verify everything works! 🚀
