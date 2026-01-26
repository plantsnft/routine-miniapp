# Next Steps: Monitoring & Testing

## 🎯 Immediate Next Step (Do Now)

### Step 1: Verify Deployment Status

1. **Check Vercel Dashboard**
   - Go to: https://vercel.com/plants-projects-156afffe/routine
   - Verify latest deployment succeeded
   - Check for any build/runtime errors
   - Look for commits: `48e311a`, `037bb3e`, `db7cfb8`, `07936c5`

2. **Check Runtime Logs**
   - In Vercel dashboard → Logs tab
   - Look for webhook errors (should be gone after `db7cfb8`)
   - Verify no `RangeError: Invalid time value` errors
   - Check for any new errors

### Step 2: Test Cache Functionality (5-10 minutes)

#### Test A: First Visit (Cache Miss)
1. Open your portal as a test user
2. Navigate to engagement verification page
3. Open browser DevTools → Network tab
4. **Check console logs for:**
   - `[Engagement Verify] ⏰ Cache STALE` or no cache message
   - `[Engagement Verify] ✅ Found X casts with webhook-populated engagements (FREE)`
   - `[Engagement Verify] ✅ Found X eligible casts from database (FREE)`
   - `[Engagement Verify] ✅ Stored results in cache for FID X`
5. **Check response:**
   - Should include `cached: false`
   - Response time: ~1-2 seconds (first time)

#### Test B: Repeat Visit (Cache Hit)
1. Wait 1-2 minutes (don't need to wait full hour for testing)
2. Visit portal again (same user)
3. **Check console logs for:**
   - `[Engagement Verify] ✅ Cache HIT for FID X (age: Xs)`
4. **Check response:**
   - Should include `cached: true`
   - Response time: < 100ms (instant!)
   - **Zero API calls in Network tab**

#### Test C: Cache Invalidation
1. Claim a reward (if you have claimable rewards)
2. **Check console logs for:**
   - `[Engagement Claim] ✅ Invalidated engagement cache for FID X`
3. Visit portal again
4. **Expected:**
   - Cache should be MISS (was deleted)
   - Fresh computation happens
   - Updated claimable rewards shown

### Step 3: Monitor Credit Usage (Daily)

1. **Check Neynar Dashboard**
   - Go to your Neynar dashboard
   - Check daily credit usage
   - Compare to previous baseline (~217k-277k/day)
   - **Target: ~23k-25k/day (90%+ reduction)**

2. **Track for 24-48 hours**
   - Monitor daily usage
   - Note any spikes or anomalies
   - Document actual savings

## 📊 What to Look For

### ✅ Good Signs (Everything Working)
- Cache HIT messages in logs
- Fast response times (< 100ms) for repeat visits
- Webhook data being used (FREE)
- Database casts being used (FREE)
- Low API call counts
- No timestamp errors

### ⚠️ Warning Signs (Investigate)
- Frequent cache STALE messages (high traffic, but normal)
- API fallback being used often (check webhook coverage)
- Cache storage failures (non-fatal, but investigate)

### ❌ Error Signs (Fix Needed)
- `RangeError: Invalid time value` (should NOT appear)
- Cache not working (check Supabase connection)
- High API calls still (check webhook/DB coverage)

## 🔍 Quick Database Checks

Run these in Supabase SQL Editor to verify data:

```sql
-- Check webhook coverage (should have recent entries)
SELECT COUNT(*), engagement_type, source 
FROM engagements 
WHERE engaged_at >= NOW() - INTERVAL '24 hours'
GROUP BY engagement_type, source;

-- Check eligible_casts (should have recent casts)
SELECT COUNT(*) as recent_casts
FROM eligible_casts 
WHERE created_at >= NOW() - INTERVAL '15 days';

-- Check cache entries (should have some for active users)
SELECT COUNT(*) as cached_users, 
       AVG(EXTRACT(EPOCH FROM (NOW() - as_of))) as avg_cache_age_seconds
FROM engagement_cache
WHERE channel_id = 'catwalk';
```

## 📝 Expected Results After 24 Hours

- ✅ 90%+ reduction in Neynar credit usage
- ✅ Cache hit rate > 50% for repeat visitors
- ✅ Fast response times (< 100ms) for cached requests
- ✅ Webhook data covering most engagements
- ✅ No timestamp errors in webhook logs
- ✅ Cache invalidation working correctly

## 🚀 After Initial Testing

Once you've verified everything works:

1. **Continue monitoring daily** for credit usage
2. **Document findings** - actual savings, any issues
3. **Optimize if needed** - adjust TTL, limits, etc.
4. **Share results** - let me know how it's performing!

---

**Start with Step 1 (Verify Deployment) - that's your immediate next action!**
