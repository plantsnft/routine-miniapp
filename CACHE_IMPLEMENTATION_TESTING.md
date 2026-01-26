# Cache Implementation Testing Guide

## ✅ Implementation Status

**Phase 2.1: Engagement Verification Cache** - ✅ COMPLETE
- Cache check with 1-hour TTL
- Webhook data usage (FREE)
- Database casts usage (FREE)
- API call optimization (max 30)
- Cache storage
- Cache invalidation on claim

**Phase 2.2: Channel Feed Cache for Auto-Engage** - ✅ COMPLETE
- Channel feed cache (5-minute TTL)
- Smart engagement tracking

**Webhook Timestamp Fix** - ✅ COMPLETE
- Uses `safeISO()` for all timestamp conversions

## 🧪 Testing Checklist

### 1. Verify Deployment
- [ ] Check Vercel dashboard: https://vercel.com/plants-projects-156afffe/routine
- [ ] Verify latest deployment succeeded (commits: `db7cfb8`, `07936c5`)
- [ ] Check runtime logs for errors
- [ ] Verify no `RangeError: Invalid time value` errors in webhook logs

### 2. Test Cache Functionality

#### Test 1: First Visit (Cache Miss)
1. Open portal as a user who hasn't visited recently
2. Navigate to engagement verification
3. **Expected:**
   - Console log: `[Engagement Verify] ⏰ Cache STALE` or no cache
   - Console log: `[Engagement Verify] ✅ Found X casts with webhook-populated engagements (FREE)`
   - Console log: `[Engagement Verify] ✅ Found X eligible casts from database (FREE)`
   - Console log: `[Engagement Verify] ✅ Stored results in cache for FID X`
   - Response includes: `cached: false`

#### Test 2: Repeat Visit (Cache Hit)
1. Wait < 1 hour
2. Visit portal again (same user)
3. **Expected:**
   - Console log: `[Engagement Verify] ✅ Cache HIT for FID X (age: Xs)`
   - Response includes: `cached: true`
   - Response time: < 100ms (instant)
   - **Zero API calls made**

#### Test 3: Cache Invalidation on Claim
1. User claims a reward
2. **Expected:**
   - Console log: `[Engagement Claim] ✅ Invalidated engagement cache for FID X`
3. User visits portal again
4. **Expected:**
   - Cache should be MISS (was deleted)
   - Fresh computation happens
   - Updated claimable rewards shown

#### Test 4: Force Refresh
1. Visit: `/api/portal/engagement/verify?force=true`
2. **Expected:**
   - Console log: `[Engagement Verify] 🔄 Force refresh requested for FID X`
   - Cache is bypassed
   - Fresh computation happens

### 3. Monitor Credit Usage

#### Daily Monitoring
- [ ] Check Neynar dashboard for daily credit usage
- [ ] Compare to previous baseline (~217k-277k/day)
- [ ] Target: ~23k-25k/day (90%+ reduction)

#### Expected Credit Patterns
- **First visit per user**: 0-30 API calls (depending on webhook coverage)
- **Repeat visits (within 1 hour)**: 0 API calls (cache hit)
- **After cache expires**: 0-30 API calls (fresh computation)

### 4. Verify Webhook Data Coverage

#### Check Database
```sql
-- Check engagements table is being populated
SELECT COUNT(*), engagement_type, source 
FROM engagements 
WHERE engaged_at >= NOW() - INTERVAL '24 hours'
GROUP BY engagement_type, source;

-- Check eligible_casts table has recent casts
SELECT COUNT(*) 
FROM eligible_casts 
WHERE created_at >= NOW() - INTERVAL '15 days';
```

**Expected:**
- `engagements` table has recent entries with `source='webhook'`
- `eligible_casts` table has casts from last 15 days
- High webhook coverage = fewer API calls needed

### 5. Test Auto-Engage Cache

#### Manual Test
1. Trigger auto-engage endpoint: `GET /api/cron/auto-engage`
2. **Expected:**
   - Console log: `[Auto-Engage Cron] ✅ Using cached channel feed` (if cache < 5 min old)
   - OR: `[Auto-Engage Cron] 📡 Fetched X casts from API` (if cache stale)
   - Console log: `[Auto-Engage Cron] ✅ Stored X casts in cache`

### 6. Monitor Runtime Logs

#### Key Log Patterns to Watch

**Good Signs:**
- `✅ Cache HIT` - Cache working
- `✅ Found X casts with webhook-populated engagements (FREE)` - Webhook data working
- `✅ Found X eligible casts from database (FREE)` - DB optimization working
- `✅ Using cached channel feed` - Auto-engage cache working

**Warning Signs:**
- `⚠️ Only X casts in DB, fetching from API` - DB might be incomplete (check webhook)
- `⏰ Cache STALE` - Normal, but frequent = high traffic
- `📡 Fetched X additional casts from API` - API fallback working (expected occasionally)

**Error Signs:**
- `RangeError: Invalid time value` - Should NOT appear (fixed with safeISO)
- `Failed to store cache` - Non-fatal, but investigate
- `Cache check failed` - Non-fatal, but investigate

## 📊 Success Metrics

### Credit Usage
- **Before**: ~217k-277k credits/day
- **Target**: ~23k-25k credits/day
- **Savings**: 90%+ reduction

### Performance
- **Cache Hit Rate**: Should be > 50% for repeat visitors
- **Response Time (Cache Hit)**: < 100ms
- **Response Time (Cache Miss)**: < 2s (depends on API calls)

### Data Quality
- **Webhook Coverage**: Should be > 80% of engagements
- **Database Completeness**: `eligible_casts` should have recent casts
- **Cache Freshness**: Cache age should be < 1 hour for active users

## 🔍 Troubleshooting

### Issue: High API Calls Still
**Check:**
1. Webhook coverage - Are engagements being populated?
2. Database completeness - Does `eligible_casts` have recent casts?
3. Cache hit rate - Are users getting cache hits?

**Solution:**
- Verify webhook is receiving events
- Check `eligible_casts` sync job is running
- Monitor cache hit/miss ratio

### Issue: Cache Not Working
**Check:**
1. Database connection - Can Supabase be reached?
2. Cache table exists - `engagement_cache` table present?
3. Cache TTL - Is cache age calculation correct?

**Solution:**
- Check Supabase connection
- Verify table schema matches
- Check cache age calculation logic

### Issue: Stale Data After Claim
**Check:**
1. Cache invalidation - Is cache being deleted on claim?
2. Next verification - Is fresh computation happening?

**Solution:**
- Verify cache deletion in claim route
- Check logs for invalidation confirmation

## 📝 Next Steps

1. **Monitor for 24-48 hours**
   - Track credit usage daily
   - Monitor cache hit rates
   - Watch for errors

2. **Optimize if needed**
   - If credit usage still high, investigate API call patterns
   - If cache hit rate low, consider increasing TTL
   - If webhook coverage low, investigate webhook setup

3. **Document findings**
   - Record actual credit savings
   - Note any edge cases
   - Update implementation if needed

## 🎯 Expected Results

After 24-48 hours of monitoring, you should see:
- ✅ 90%+ reduction in Neynar credit usage
- ✅ Fast response times for repeat visitors (cache hits)
- ✅ Webhook data covering most engagements
- ✅ Database casts reducing API calls
- ✅ No timestamp errors in webhook logs
- ✅ Cache invalidation working correctly
