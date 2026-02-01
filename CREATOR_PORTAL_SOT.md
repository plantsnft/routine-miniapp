# Creator Portal - Source of Truth

**Last Updated:** 2026-02-01

## Overview

The Creator Portal rewards users for engaging with casts from approved creators in the /catwalk channel.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENGAGEMENT REWARD FLOW                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. CAST CREATION (by any AUTHOR_FIDS creator)                          │
│     Webhook → eligible_casts table                                      │
│                                                                         │
│  2. USER ENGAGES (like/recast/reply)                                    │
│     ├─ Manual: Webhook → engagements + engagement_claims (immediate)    │
│     └─ Auto: Cron job → Neynar API → engagement_claims                  │
│                                                                         │
│  3. USER VISITS PORTAL                                                  │
│     /api/portal/engagement/verify                                       │
│     ├─ Check engagement_cache (1hr TTL)                                 │
│     ├─ Check engagements table (webhook data)                           │
│     ├─ Check eligible_casts table                                       │
│     └─ Fallback: Neynar API (limited to 30 casts)                       │
│                                                                         │
│  4. USER CLAIMS REWARD                                                  │
│     /api/portal/engagement/claim                                        │
│     → Send ERC20 tokens → Mark claimed_at                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CATWALK_AUTHOR_FIDS` | Comma-separated list of creator FIDs | ✅ Yes |
| `NEYNAR_API_KEY` | Neynar API key | ✅ Yes |
| `NEYNAR_WEBHOOK_SECRETS` | Webhook signature verification | ✅ Yes |
| `REWARD_SIGNER_PRIVATE_KEY` | Wallet for sending rewards | ✅ Yes |
| `CRON_SECRET` | Auth for cron endpoints | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | ✅ Yes |
| `SUPABASE_SERVICE_ROLE` | Supabase service key | ✅ Yes |

## Database Tables

| Table | Purpose |
|-------|---------|
| `eligible_casts` | Casts from creators eligible for rewards |
| `engagements` | Real-time engagement tracking (from webhook) |
| `engagement_claims` | Reward claims (verified + claimed status) |
| `engagement_cache` | 1hr cache for verification results |
| `channel_feed_cache` | 5min cache for auto-engage cron |
| `user_engage_preferences` | Auto-engage user settings |
| `auto_engage_queue` | Prevents duplicate auto-engagements |
| `reply_map` | Comment/reply tracking |

## Reward Amounts

| Engagement Type | Reward |
|-----------------|--------|
| Like | 1,000 CATWALK |
| Recast | 2,000 CATWALK |
| Comment | 5,000 CATWALK |

## Key Endpoints

### Webhook
- **Path:** `/api/webhooks/neynar`
- **Events:** `cast.created`, `cast.deleted`, `reaction.created`, `reaction.deleted`
- **Function:** 
  - Saves creator casts to `eligible_casts`
  - Saves user engagements to `engagements`
  - Creates `engagement_claims` for manual users (immediate)

### Engagement Verification
- **Path:** `/api/portal/engagement/verify`
- **Method:** POST
- **Body:** `{ fid: number }`
- **Function:** Returns claimable rewards with 1hr caching

### Engagement Claim
- **Path:** `/api/portal/engagement/claim`
- **Method:** POST
- **Body:** `{ fid: number, castHash: string, engagementTypes: string[] }`
- **Function:** Sends CATWALK tokens, marks as claimed

### Auto-Engage Cron
- **Path:** `/api/cron/auto-engage`
- **Schedule:** Hourly (`0 * * * *`)
- **Function:** Auto like/recast for users with auto_engage_enabled

### Seed Eligible Casts
- **Path:** `/api/cron/seed-eligible-casts`
- **Method:** GET or POST
- **Auth:** Requires `CRON_SECRET` header or Vercel cron
- **Function:** Backfills last 15 days of creator casts

### Health Check
- **Path:** `/api/ops/portal-health`
- **Method:** GET
- **Function:** Diagnostic endpoint showing system status

## Recent Changes

### 2026-02-01: Multiple Author FIDs Support
- Changed from `CATWALK_AUTHOR_FID` (singular) to `CATWALK_AUTHOR_FIDS` (plural)
- Webhook now saves casts from ALL 47 creators
- Seed cron now backfills casts from ALL creators
- Portal health check updated

### Files Changed:
- `src/app/api/webhooks/neynar/route.ts` - Use AUTHOR_FIDS array
- `src/app/api/cron/seed-eligible-casts/route.ts` - Use AUTHOR_FIDS array, add GET handler
- `src/app/api/ops/portal-health/route.ts` - Check AUTHOR_FIDS

## Troubleshooting

### No eligible_casts
1. Check `CATWALK_AUTHOR_FIDS` is configured
2. Run `/api/cron/seed-eligible-casts` to backfill
3. Check webhook is receiving events

### No engagement_claims created
1. Verify casts exist in `eligible_casts`
2. Check webhook is processing `reaction.created` events
3. Verify webhook signature is valid

### Claims failing
1. Check `REWARD_SIGNER_PRIVATE_KEY` is set
2. Verify signer wallet has CATWALK tokens
3. Check Base RPC is responding

## Verification Commands

```bash
# Check system health
curl https://catwalk-smoky.vercel.app/api/ops/portal-health

# Seed eligible casts (requires auth)
curl -H "x-cron-secret: YOUR_SECRET" https://catwalk-smoky.vercel.app/api/cron/seed-eligible-casts

# Check engagement for a user
curl -X POST https://catwalk-smoky.vercel.app/api/portal/engagement/verify \
  -H "Content-Type: application/json" \
  -d '{"fid": 318447}'
```
