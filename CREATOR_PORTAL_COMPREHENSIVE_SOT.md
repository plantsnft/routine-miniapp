# Creator Portal - Comprehensive Source of Truth

**Last Updated:** 2026-02-02  
**Status:** ✅ LIVE AND WORKING  
**Document Version:** 2.0

---

## Table of Contents

1. [Overview](#overview)
2. [How It Fits Into The App](#how-it-fits-into-the-app)
3. [Architecture Diagrams](#architecture-diagrams)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Cron Jobs](#cron-jobs)
7. [Environment Variables](#environment-variables)
8. [Reward System](#reward-system)
9. [Auto-Engage Feature](#auto-engage-feature)
10. [Caching Strategy](#caching-strategy)
11. [Token Transfer Mechanics](#token-transfer-mechanics)
12. [Frontend Components](#frontend-components)
13. [Webhook System](#webhook-system)
14. [File Structure](#file-structure)
15. [Troubleshooting](#troubleshooting)
16. [Recent Changes](#recent-changes)

---

## Overview

The Creator Portal is a reward system built into the Catwalk mini app that:

1. **Rewards Creators** - Creators who post in the `/catwalk` Farcaster channel earn 1,000,000 CATWALK tokens per cast
2. **Rewards Engagers** - Users who like, recast, or comment on creator posts earn CATWALK tokens
3. **Auto-Engage** - Users can enable automatic like/recast on new creator posts

### Key Metrics
- **47 approved creators** in `CATWALK_AUTHOR_FIDS` env var (backend/webhook)
- **31 creators** in `constants.ts` `CATWALK_CREATOR_FIDS` array (frontend detection)
- **15 auto-engage users** with approved signers
- **Hourly cron job** for auto-engagement
- **1-hour cache TTL** for engagement verification
- **5-minute cache TTL** for channel feed

> **Note:** The frontend uses `CATWALK_CREATOR_FIDS` from `constants.ts` to detect if the current user is a creator. The backend webhook uses `CATWALK_AUTHOR_FIDS` env var to determine which casts are eligible. These may differ - the env var is the authoritative source for reward eligibility.

---

## How It Fits Into The App

### App Architecture
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CATWALK MINI APP                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │    HOME      │  │  LEADERBOARD │  │     FEED     │  │   PORTAL     │    │
│  │    TAB       │  │     TAB      │  │     TAB      │  │    TAB ⭐     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│        │                  │                  │                │             │
│        │                  │                  │                │             │
│  Check-in         Streak         /catwalk        Reward System              │
│  System          Rankings         Feed           (This Document)            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tab System
The app uses a tab-based navigation defined in `src/components/App.tsx`:

```typescript
export enum Tab {
  Home = "home",        // Daily check-in, streak tracking
  Leaderboard = "leaderboard", // User rankings
  Feed = "feed",        // /catwalk channel content
  Actions = "actions",  // Cast/react actions
  Context = "context",  // Debug info
  Wallet = "wallet",    // Wallet management
  Portal = "portal",    // ⭐ CREATOR PORTAL (reward system)
}
```

### Entry Points
- **URL:** `https://catwalk-smoky.vercel.app/portal`
- **Route:** `src/app/portal/page.tsx` → Renders `PortalTab` component
- **Component:** `src/components/ui/tabs/PortalTab.tsx` (~1650 lines)

---

## Architecture Diagrams

### Complete Data Flow
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CREATOR PORTAL DATA FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    1. CAST CREATION                                  │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  Creator posts in /catwalk channel                                  │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  Neynar sends webhook (cast.created)                                │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  /api/webhooks/neynar                                               │   │
│  │         │                                                           │   │
│  │         ├──► Is author in AUTHOR_FIDS? ──No──► Ignore               │   │
│  │         │           │                                               │   │
│  │         │          Yes                                              │   │
│  │         │           │                                               │   │
│  │         │           ├──► Is top-level cast? ──No──► Process reply   │   │
│  │         │           │           │                                   │   │
│  │         │           │          Yes                                  │   │
│  │         │           │           │                                   │   │
│  │         │           │           ├──► In /catwalk channel? ──No──► Ignore │
│  │         │           │           │           │                       │   │
│  │         │           │           │          Yes                      │   │
│  │         │           │           │           │                       │   │
│  │         │           │           │           ▼                       │   │
│  │         │           │           │   CREATE: eligible_casts          │   │
│  │         │           │           │   CREATE: creator_claims          │   │
│  │         │           │           │                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    2. USER ENGAGEMENT                                │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  MANUAL ENGAGEMENT:                                                 │   │
│  │  User likes/recasts a creator post                                  │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  Neynar sends webhook (reaction.created)                            │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  /api/webhooks/neynar                                               │   │
│  │         │                                                           │   │
│  │         ├──► Is cast in eligible_casts? ──No──► Ignore              │   │
│  │         │           │                                               │   │
│  │         │          Yes                                              │   │
│  │         │           │                                               │   │
│  │         │           ▼                                               │   │
│  │         │   CREATE: engagements (tracking)                          │   │
│  │         │   CREATE: engagement_claims (reward ready!)               │   │
│  │         │                                                           │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │                                                                     │   │
│  │  AUTO-ENGAGEMENT (hourly cron):                                     │   │
│  │  /api/cron/auto-engage                                              │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  Get users with auto_engage_enabled = true                          │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  Get recent casts from /catwalk (last 70 min)                       │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  For each user: like + recast each cast via Neynar API              │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  CREATE: engagement_claims (reward ready!)                          │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    3. REWARD CLAIMING                                │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  User opens Portal tab                                              │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  Frontend calls /api/portal/engagement/verify                       │   │
│  │         │                                                           │   │
│  │         ├──► Check engagement_cache (1hr TTL)                       │   │
│  │         │           │                                               │   │
│  │         │    Hit? ──► Return cached results                         │   │
│  │         │           │                                               │   │
│  │         │    Miss? ──► Query engagement_claims                      │   │
│  │         │           │   + Neynar API (fallback)                     │   │
│  │         │           │                                               │   │
│  │         │           ▼                                               │   │
│  │         │   Return: claimableRewards array                          │   │
│  │         │                                                           │   │
│  │         │                                                           │   │
│  │  User clicks "Claim" button                                         │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  Frontend calls /api/portal/engagement/claim                        │   │
│  │  OR /api/portal/creator/claim (for creators)                        │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  1. Get user's wallet from Neynar (verified ETH address)            │   │
│  │  2. Send ERC20 transfer via viem (Base chain)                       │   │
│  │  3. Wait for transaction confirmation                               │   │
│  │  4. Update claimed_at + transaction_hash in DB                      │   │
│  │  5. Invalidate engagement_cache                                     │   │
│  │         │                                                           │   │
│  │         ▼                                                           │   │
│  │  Return: { success, transactionHash, basescanUrl }                  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables Overview

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `eligible_casts` | Casts from creators in /catwalk | `cast_hash`, `author_fid`, `author_username`, `created_at` |
| `creator_claims` | Creator posting rewards | `fid`, `cast_hash`, `reward_amount`, `claimed_at`, `transaction_hash` |
| `engagement_claims` | User engagement rewards | `fid`, `cast_hash`, `engagement_type`, `reward_amount`, `verified_at`, `claimed_at` |
| `engagements` | Real-time engagement tracking | `user_fid`, `cast_hash`, `engagement_type`, `engaged_at`, `source` |
| `engagement_cache` | 1hr cache for verification | `fid`, `channel_id`, `as_of`, `payload` |
| `channel_feed_cache` | 5min cache for auto-engage | `channel_id`, `as_of`, `payload` |
| `user_engage_preferences` | Auto-engage settings | `fid`, `signer_uuid`, `auto_engage_enabled`, `bonus_multiplier` |
| `auto_engage_queue` | Prevents duplicate auto-engages | `fid`, `cast_hash`, `action_type`, `executed_at` |
| `reply_map` | Comment/reply tracking | `reply_hash`, `user_fid`, `parent_cast_hash` |
| `app_state` | System state (webhook health) | `key`, `value`, `updated_at` |

### Table Definitions

#### eligible_casts
```sql
CREATE TABLE public.eligible_casts (
  cast_hash TEXT PRIMARY KEY,
  author_fid BIGINT NOT NULL,
  author_username TEXT,           -- Added via ALTER TABLE (not in original migration)
  created_at TIMESTAMPTZ NOT NULL,
  parent_url TEXT NOT NULL,       -- Should be 'https://warpcast.com/~/channel/catwalk'
  text TEXT,                      -- nullable
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: author_username column was added manually:
-- ALTER TABLE eligible_casts ADD COLUMN author_username TEXT;
```

#### creator_claims
```sql
CREATE TABLE public.creator_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL,
  cast_hash TEXT NOT NULL,
  reward_amount NUMERIC NOT NULL DEFAULT 1000000,  -- 1M CATWALK
  transaction_hash TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,         -- NULL until claimed (no default!)
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fid, cast_hash)          -- One claim per creator per cast
);
```

#### engagement_claims
```sql
CREATE TABLE public.engagement_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL,
  cast_hash TEXT NOT NULL,
  engagement_type TEXT NOT NULL CHECK (engagement_type IN ('like', 'comment', 'recast')),
  reward_amount NUMERIC NOT NULL,
  transaction_hash TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,         -- NULL until claimed (no default!)
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fid, cast_hash, engagement_type)
);
```

#### user_engage_preferences
```sql
CREATE TABLE public.user_engage_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL UNIQUE,     -- One record per user
  signer_uuid TEXT,               -- Neynar signer for auto-engage
  auto_engage_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_engage_enabled_at TIMESTAMPTZ,
  bonus_multiplier NUMERIC NOT NULL DEFAULT 1.0,  -- 1.1 = 10% bonus for auto-engage users
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## API Endpoints

### Portal Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/portal/status` | GET | Get user's claim status (creator + engagement) |
| `/api/portal/engagement/verify` | POST | Verify & list claimable engagement rewards |
| `/api/portal/engagement/claim` | POST | Claim engagement rewards (sends tokens) |
| `/api/portal/creator/claim` | POST | Claim creator posting reward (sends tokens) |
| `/api/portal/lifetime-rewards` | GET | Get total rewards earned (7d/30d/1y/lifetime) |
| `/api/portal/engage/preferences` | GET/POST | Get/set auto-engage preferences |
| `/api/portal/engage/authorize` | POST | Start signer authorization flow |
| `/api/portal/engage/bulk` | POST | Bulk like/recast multiple casts |

### Webhook Endpoint

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks/neynar` | POST | Receive Farcaster events from Neynar |

### Cron Endpoints

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/auto-engage` | `0 * * * *` (hourly) | Auto like/recast for enabled users |
| `/api/cron/seed-eligible-casts` | Manual | Backfill eligible_casts from API |
| `/api/cron/refresh-channel-feed` | Manual | Refresh channel_feed_cache |
| `/api/cron/refresh-engagement-cache` | Manual | Refresh engagement_cache |
| `/api/cron/webhook-health` | Manual | Check webhook is receiving events |

### Ops/Diagnostic Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ops/portal-health` | GET | Comprehensive system health check |
| `/api/ops/webhook-metrics` | GET | Basic health check (metrics tracked in-memory, logged in dev only) |

---

## Cron Jobs

### vercel.json Configuration
```json
{
  "crons": [
    {
      "path": "/api/cron/auto-engage",
      "schedule": "0 * * * *"
    }
  ]
}
```

### Auto-Engage Cron (`/api/cron/auto-engage`)

**Schedule:** Every hour at minute 0  
**Auth:** Requires `Authorization: Bearer {CRON_SECRET}` header  
**Location:** `src/app/api/cron/auto-engage/route.ts`

> **Note:** Different cron endpoints use different auth:
> - `auto-engage`: `Authorization: Bearer {secret}`
> - `seed-eligible-casts`, `webhook-health`: `x-cron-secret: {secret}` header

**What it does:**
1. Fetches users with `auto_engage_enabled = true` and valid `signer_uuid`
2. Gets recent casts from /catwalk (last 70 minutes)
3. For each user + cast combination:
   - Checks if already engaged (via `engagements` or `auto_engage_queue`)
   - Sends like reaction via Neynar API
   - Sends recast reaction via Neynar API
   - Creates `engagement_claims` records

**Important:** Auto-engage creates claims but does NOT send tokens automatically. Users must still manually claim.

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CATWALK_AUTHOR_FIDS` | Comma-separated creator FIDs | `8926,11632,14511,...` |
| `NEYNAR_API_KEY` | Neynar API key | `9C979716-...` |
| `NEYNAR_WEBHOOK_SECRETS` | Webhook signature verification | `secret1,secret2` |
| `REWARD_SIGNER_PRIVATE_KEY` | Wallet private key for sending tokens | `0x...` |
| `CRON_SECRET` | Auth token for cron endpoints | `random-secret` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE` | Supabase service role key | `eyJhbG...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_RPC_URL` | Base chain RPC endpoint | `https://mainnet.base.org` |
| `PRIVATE_KEY` | Fallback for REWARD_SIGNER_PRIVATE_KEY | - |

---

## Reward System

### Reward Amounts

#### Engagement Rewards (for users who engage with creator posts)
| Action | Reward | Notes |
|--------|--------|-------|
| Like | 1,000 CATWALK | Per cast |
| Recast | 2,000 CATWALK | Per cast |
| Comment/Reply | 5,000 CATWALK | Per cast (stored as 'reply' in DB, displayed as 'comment' in UI) |
| **Total possible per cast** | **8,000 CATWALK** | If all 3 actions |

> **Note:** The `engagements` table stores the type as 'reply', but the code maps this to 'comment' for user-facing displays and reward calculations.

#### Creator Rewards (for creators who post in /catwalk)
| Action | Reward | Notes |
|--------|--------|-------|
| Post in /catwalk | 1,000,000 CATWALK | Per top-level cast |

#### Auto-Engage Bonus
| Feature | Multiplier | Notes |
|---------|------------|-------|
| Auto-engage enabled | 1.1x (10% bonus) | Applied at claim time |

### Eligibility Rules

1. **Casts must be:**
   - From a creator in `CATWALK_AUTHOR_FIDS`
   - Top-level (not a reply)
   - In the `/catwalk` channel (`parent_url = 'https://warpcast.com/~/channel/catwalk'`)
   - Within the last 15 days

2. **Engagements must be:**
   - On an eligible cast
   - Not previously claimed for the same action

---

## Auto-Engage Feature

### How Users Enable Auto-Engage

1. User opens Portal tab
2. Clicks "Enable Auto-Engage" button
3. Frontend calls `/api/portal/engage/authorize` to create Neynar signer
4. User is redirected to Warpcast to approve the signer
5. Frontend polls signer status until approved
6. Once approved, frontend calls `/api/portal/engage/preferences` to save signer_uuid
7. Auto-engage is now enabled

### Signer Flow
```
User clicks "Enable"
       │
       ▼
/api/portal/engage/authorize (creates signer, returns approval URL)
       │
       ▼
User opens Warpcast → Approves signer
       │
       ▼
Frontend polls signer status
       │
       ▼
/api/portal/engage/preferences (saves signer_uuid, enables auto_engage)
       │
       ▼
Hourly cron uses signer to like/recast
```

### Database State for Auto-Engage Users

```sql
-- Check auto-engage status
SELECT fid, signer_uuid, auto_engage_enabled, bonus_multiplier
FROM user_engage_preferences
WHERE auto_engage_enabled = true;
```

---

## Caching Strategy

### Two Cache Tables

| Cache | TTL | Purpose |
|-------|-----|---------|
| `engagement_cache` | 1 hour | User-specific verification results |
| `channel_feed_cache` | 5 minutes | Channel content for auto-engage cron |

### engagement_cache

**When populated:** After `/api/portal/engagement/verify` computes results  
**When invalidated:**
- After 1 hour (TTL expiry)
- When new engagements detected (smart invalidation)
- After claim succeeds

**Schema:**
```sql
CREATE TABLE engagement_cache (
  fid BIGINT NOT NULL,
  channel_id TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  payload JSONB,
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (fid, channel_id)
);
```

### channel_feed_cache

**When populated:** By auto-engage cron when fetching channel feed  
**When invalidated:** After 5 minutes (TTL expiry)

**Schema:**
```sql
CREATE TABLE channel_feed_cache (
  channel_id TEXT PRIMARY KEY,
  as_of TIMESTAMPTZ NOT NULL,
  payload JSONB,  -- { casts: [...] }
  updated_at TIMESTAMPTZ
);
```

---

## Token Transfer Mechanics

### Token Details
- **Token:** CATWALK
- **Address:** `0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07`
- **Chain:** Base (mainnet)
- **Decimals:** 18

### Transfer Flow (in claim endpoints)

```typescript
// 1. Get user's wallet from Neynar
const user = await getNeynarUser(fid);
const walletAddress = user.verified_addresses.eth_addresses[0] 
                   || user.custody_address;

// 2. Create wallet client with signer
const account = privateKeyToAccount(REWARD_SIGNER_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(BASE_RPC_URL),
});

// 3. Send ERC20 transfer
const transactionHash = await walletClient.sendTransaction({
  to: TOKEN_ADDRESS,
  data: encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipientAddress, rewardAmount],
  }),
});

// 4. Wait for confirmation
const receipt = await publicClient.waitForTransactionReceipt({
  hash: transactionHash,
  timeout: 60_000,
});

// 5. Update database ONLY after confirmed
if (receipt.status !== 'reverted') {
  await updateClaim({
    claimed_at: new Date().toISOString(),
    transaction_hash: transactionHash,
  });
}
```

### Important Notes
- `claimed_at` is ONLY set after successful token transfer
- `transaction_hash` is stored as proof of payment
- If transaction reverts, database is NOT updated
- Engagement cache is invalidated after successful claim

---

## Frontend Components

### Main Component: PortalTab

**Location:** `src/components/ui/tabs/PortalTab.tsx`  
**Lines:** ~1650  
**Framework:** React with Neynar SDK

### State Management

```typescript
// Claim status
const [creatorClaimStatus, setCreatorClaimStatus] = useState<CreatorClaimStatus | null>(null);
const [engagementOpportunities, setEngagementOpportunities] = useState<EngagementOpportunity[]>([]);
const [claimableRewards, setClaimableRewards] = useState<ClaimableReward[]>([]);

// Auto-engage
const [autoEngageEnabled, setAutoEngageEnabled] = useState(false);
const [signerUuid, setSignerUuid] = useState<string | null>(null);
const [bonusMultiplier, setBonusMultiplier] = useState(1.0);

// Lifetime rewards
const [lifetimeRewards, setLifetimeRewards] = useState<LifetimeRewards | null>(null);
const [lifetimePeriod, setLifetimePeriod] = useState<"7d" | "30d" | "1y" | "lifetime">("lifetime");
```

### API Calls

```typescript
// On mount
fetchClaimStatus();     // GET /api/portal/status
fetchAutoEngagePrefs(); // GET /api/portal/engage/preferences
fetchLifetimeRewards(); // GET /api/portal/lifetime-rewards

// On refresh
verifyEngagements();    // POST /api/portal/engagement/verify

// On claim
claimEngagementReward(); // POST /api/portal/engagement/claim
claimCreatorReward();    // POST /api/portal/creator/claim
```

### Creator Detection

```typescript
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";

// Frontend uses hardcoded array (31 FIDs in constants.ts)
const isCreator = userFid && CATWALK_CREATOR_FIDS.includes(userFid);
```

> **Important:** The frontend `CATWALK_CREATOR_FIDS` (31 FIDs) may differ from the backend `CATWALK_AUTHOR_FIDS` env var (47 FIDs). If a creator is in the env var but not in constants.ts, they can still earn rewards, but the frontend won't show the "Creator" UI elements.

---

## Webhook System

### Neynar Webhook Configuration

The webhook should be configured in Neynar dashboard to send:
- `cast.created` - For new casts
- `cast.deleted` - For deleted casts
- `reaction.created` - For likes/recasts
- `reaction.deleted` - For unlike/un-recast

### Webhook URL
```
https://catwalk-smoky.vercel.app/api/webhooks/neynar
```

### Signature Verification

```typescript
// Verify HMAC SHA-512 signature
const secrets = getWebhookSecrets(); // From NEYNAR_WEBHOOK_SECRETS
const isValid = verifyNeynarWebhookSignature(rawBody, signature, secrets);
```

### Event Processing

```typescript
// cast.created from a creator
if (AUTHOR_FIDS.includes(authorFid) && isTopLevelCast && isInCatwalkChannel) {
  // Create eligible_casts record
  // Create creator_claims record
}

// reaction.created (like/recast)
if (eligibleCast exists) {
  // Create engagements record
  // Create engagement_claims record (immediate reward!)
}
```

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── portal/
│   │   │   ├── status/route.ts              # GET claim status
│   │   │   ├── engagement/
│   │   │   │   ├── verify/route.ts          # POST verify engagements
│   │   │   │   └── claim/route.ts           # POST claim engagement reward
│   │   │   ├── creator/
│   │   │   │   └── claim/route.ts           # POST claim creator reward
│   │   │   ├── engage/
│   │   │   │   ├── preferences/route.ts     # GET/POST auto-engage prefs
│   │   │   │   ├── authorize/route.ts       # POST start signer flow
│   │   │   │   └── bulk/route.ts            # POST bulk engage
│   │   │   └── lifetime-rewards/route.ts    # GET lifetime earnings
│   │   ├── cron/
│   │   │   ├── auto-engage/route.ts         # Hourly auto-engage
│   │   │   ├── seed-eligible-casts/route.ts # Backfill eligible_casts
│   │   │   └── ...
│   │   ├── webhooks/
│   │   │   └── neynar/route.ts              # Webhook receiver
│   │   └── ops/
│   │       ├── portal-health/route.ts       # Health check
│   │       └── ...
│   └── portal/
│       └── page.tsx                          # Portal page entry point
├── components/
│   └── ui/
│       └── tabs/
│           └── PortalTab.tsx                # Main portal UI (~1650 lines)
└── lib/
    ├── constants.ts                          # CATWALK_CREATOR_FIDS
    ├── neynar.ts                             # Neynar API helpers
    ├── supabaseAdmin.ts                      # Supabase client
    └── ...
```

---

## Troubleshooting

### Health Check

```bash
curl https://catwalk-smoky.vercel.app/api/ops/portal-health
```

**Response includes:**
- CATWALK_AUTHOR_FIDS status
- NEYNAR_API_KEY status
- REWARD_SIGNER_PRIVATE_KEY status
- eligible_casts count
- engagements_recent count
- pending_claims count
- webhook_health (last received)
- auto_engage_users count

### Common Issues

#### "No eligible casts" Error
**Cause:** `eligible_casts` table is empty  
**Fix:** Run seed cron:
```bash
curl -H "x-cron-secret: YOUR_SECRET" \
  https://catwalk-smoky.vercel.app/api/cron/seed-eligible-casts
```

#### Claims Not Showing
**Cause:** `engagement_claims` not created  
**Check:** Webhook is receiving events
```sql
SELECT * FROM app_state WHERE key = 'last_webhook_at';
```

#### Token Transfer Failing
**Cause:** Signer wallet has no CATWALK tokens  
**Check:** BaseScan for signer wallet balance

#### Cache Serving Stale Data
**Fix:** Force refresh:
```bash
curl -X POST https://catwalk-smoky.vercel.app/api/portal/engagement/verify?force=true \
  -H "Content-Type: application/json" \
  -d '{"fid": 318447}'
```

### Diagnostic Queries

```sql
-- Check eligible casts
SELECT COUNT(*), MAX(created_at) FROM eligible_casts;

-- Check pending claims
SELECT COUNT(*), engagement_type FROM engagement_claims 
WHERE claimed_at IS NULL GROUP BY engagement_type;

-- Check auto-engage users
SELECT COUNT(*) FROM user_engage_preferences 
WHERE auto_engage_enabled = true AND signer_uuid IS NOT NULL;

-- Check recent webhook activity
SELECT COUNT(*) FROM engagements 
WHERE engaged_at > NOW() - INTERVAL '1 hour';
```

---

## Recent Changes

### 2026-02-02: Creator Claims Fix
- **Problem:** Creators couldn't claim posting rewards - `creator_claims` never created
- **Root Cause:** Webhook created `eligible_casts` but NOT `creator_claims`
- **Fix:**
  1. Webhook now creates `creator_claims` when creator posts
  2. Backfilled 92 missing records
  3. Fixed display amount (500K → 1M)

### 2026-02-01: Engagement Claims Fix
- **Problem:** Users couldn't claim rewards - `claimed_at` had `DEFAULT now()`
- **Root Cause:** Database column default auto-marked claims as claimed
- **Fix:**
  1. `ALTER TABLE engagement_claims ALTER COLUMN claimed_at DROP DEFAULT`
  2. Reset fake-claimed records: `UPDATE ... SET claimed_at = NULL WHERE transaction_hash IS NULL`

### 2026-02-01: Multiple Author FIDs Support
- Changed from `CATWALK_AUTHOR_FID` (singular) to `CATWALK_AUTHOR_FIDS` (plural)
- All 47 creator FIDs now tracked

### 2026-02-01: Author Username Storage
- Added `author_username` column to `eligible_casts`
- Fixed "Unknown" author display in portal

### 2026-02-01: Cast URL Fix
- Changed URL format to `https://warpcast.com/~/conversations/{castHash}`
- Works regardless of author username availability

---

## Verification Commands

```bash
# System health
curl https://catwalk-smoky.vercel.app/api/ops/portal-health | jq

# Seed eligible casts
curl -H "x-cron-secret: $CRON_SECRET" \
  https://catwalk-smoky.vercel.app/api/cron/seed-eligible-casts

# Verify engagement for a user
curl -X POST https://catwalk-smoky.vercel.app/api/portal/engagement/verify \
  -H "Content-Type: application/json" \
  -d '{"fid": 318447}'

# Check status for a user
curl "https://catwalk-smoky.vercel.app/api/portal/status?fid=318447"
```

---

## Contact

For issues with the Creator Portal, check:
1. `/api/ops/portal-health` endpoint
2. Vercel runtime logs
3. Supabase database
4. This document

---

*Last verified working: 2026-02-02*
