# Catwalk Mini App - Full Source of Truth

**Last Updated:** 2026-02-02  
**Status:** ✅ LIVE  
**Production URL:** https://catwalk-smoky.vercel.app

---

## Table of Contents

1. [Overview](#overview)
2. [App Features](#app-features)
3. [Tech Stack](#tech-stack)
4. [App Architecture](#app-architecture)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [Environment Variables](#environment-variables)
8. [Authentication](#authentication)
9. [Token Information](#token-information)
10. [UI Components](#ui-components)
11. [Cron Jobs](#cron-jobs)
12. [Feature: Daily Check-In](#feature-daily-check-in)
13. [Feature: Creator Portal](#feature-creator-portal)
14. [Feature: Leaderboard](#feature-leaderboard)
15. [Feature: Channel Feed](#feature-channel-feed)
16. [Monorepo Structure](#monorepo-structure)
17. [Deployment](#deployment)
18. [Troubleshooting](#troubleshooting)

---

## Overview

**Catwalk** is a Farcaster mini app for the `/catwalk` channel community - a community of cat owners sharing content about their cats.

### Core Purpose
- Daily check-in gamification ("walks") with streak tracking
- Reward creators for posting in the channel
- Reward users for engaging with creator content
- Display channel feed and leaderboards
- Track CATWALK token price and holder info

### Key Metrics
- **31 creators** in frontend `CATWALK_CREATOR_FIDS` array
- **47 creators** in backend `CATWALK_AUTHOR_FIDS` env var
- **9 AM Pacific** daily check-in reset time
- **15-day** engagement eligibility window

---

## App Features

| Feature | Description | Tab |
|---------|-------------|-----|
| **Daily Check-In** | Streak-based daily walks with token rewards | Home |
| **Leaderboard** | Top users by streak, total walks, token holdings | Leaderboard |
| **Channel Feed** | Browse /catwalk channel posts | Feed |
| **Creator Portal** | Earn tokens for posting/engaging | Portal |
| **Token Ticker** | Live CATWALK price, 24h change | Header |
| **Wallet** | View connected wallets, send tokens | Wallet |
| **Actions** | Cast, react, view notifications | Actions |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript |
| **UI** | React 19, Tailwind CSS |
| **Database** | Supabase (PostgreSQL) |
| **Blockchain** | Base (EVM), viem |
| **Farcaster** | Neynar API, @farcaster/miniapp-sdk |
| **Hosting** | Vercel |

---

## App Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CATWALK MINI APP                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  HOME TAB    │  │ LEADERBOARD  │  │     FEED TAB         │   │
│  │  - Check-in  │  │ - Streaks    │  │  - Channel posts     │   │
│  │  - Creators  │  │ - Holdings   │  │  - Like/Recast       │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ PORTAL TAB   │  │ WALLET TAB   │  │    ACTIONS TAB       │   │
│  │ - Rewards    │  │ - Balances   │  │  - Cast              │   │
│  │ - Auto-engage│  │ - Send       │  │  - Notifications     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                          API LAYER                               │
│  /api/checkin    /api/leaderboard    /api/channel-feed          │
│  /api/portal/*   /api/token-price    /api/siwn                  │
├─────────────────────────────────────────────────────────────────┤
│                       DATA LAYER                                 │
│  Supabase (checkins, eligible_casts, engagement_claims, etc.)   │
│  Neynar API (users, channel, reactions)                         │
│  Base RPC (token balances, transfers)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

#### checkins
Primary table for daily check-in tracking.
```sql
CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL UNIQUE,
  last_checkin TIMESTAMPTZ,
  streak INTEGER DEFAULT 0,
  total_checkins INTEGER DEFAULT 0,
  reward_claimed_at TIMESTAMPTZ,
  total_walk_rewards NUMERIC DEFAULT 0,
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### portal_users
Tracks portal access.
```sql
CREATE TABLE portal_users (
  fid BIGINT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### app_state
Key-value store for app state.
```sql
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### price_history
Token price snapshots for 24h change calculation.
```sql
CREATE TABLE price_history (
  id SERIAL PRIMARY KEY,
  price NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);
```

### Portal Tables

See **[CREATOR_PORTAL_COMPREHENSIVE_SOT.md](./CREATOR_PORTAL_COMPREHENSIVE_SOT.md)** for complete documentation of:
- `eligible_casts`
- `engagements`
- `engagement_claims`
- `creator_claims`
- `engagement_cache`
- `channel_feed_cache`
- `user_engage_preferences`
- `auto_engage_queue`
- `reply_map`

---

## API Endpoints

### Check-In

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/checkin` | GET | Get user's check-in status |
| `/api/checkin` | POST | Perform daily check-in |
| `/api/checkin/reward` | POST | Claim check-in reward |

### Leaderboard

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/leaderboard` | GET | Get top users by streak, walks, or holdings |

### Channel & Feed

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/channel-feed` | GET | Get /catwalk channel posts |
| `/api/channel-stats` | GET | Get channel follower count |
| `/api/cast-comments` | GET | Get comments on a cast |
| `/api/cast-react` | POST | Like/recast a cast |

### Token & Price

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/token-price` | GET | Get CATWALK price, 24h change, market cap |
| `/api/recent-purchases` | GET | Get recent token transfer events |

### Authentication

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/siwn` | POST | Sign In With Neynar (verify Farcaster auth) |
| `/api/users` | GET | Get user profiles by FID |
| `/api/auth/signer` | GET | Get managed signer status |
| `/api/auth/validate` | POST | Validate auth token |

### Creator Stats

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/creator-stats` | GET | Get creator statistics |
| `/api/creator-stats/sync` | POST | Sync creator stats (cron) |
| `/api/creator-fids` | GET | Get list of creator FIDs |

### Portal Endpoints

See **[CREATOR_PORTAL_COMPREHENSIVE_SOT.md](./CREATOR_PORTAL_COMPREHENSIVE_SOT.md)** for:
- `/api/portal/status`
- `/api/portal/engagement/verify`
- `/api/portal/engagement/claim`
- `/api/portal/creator/claim`
- `/api/portal/engage/*`
- `/api/portal/lifetime-rewards`

### Ops/Diagnostics

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ops/portal-health` | GET | Full portal health check |
| `/api/ops/auth-health` | GET | Auth system health |
| `/api/ops/wiring-check` | GET | Verify env var wiring |
| `/api/ops/webhook-metrics` | GET | Basic webhook status |

### Webhooks

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks/neynar` | POST | Receive Neynar webhook events |
| `/api/webhook` | POST | Legacy webhook endpoint |

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_URL` | App URL (https://catwalk-smoky.vercel.app) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE` | Supabase service role key |
| `NEYNAR_API_KEY` | Neynar API key |
| `NEYNAR_WEBHOOK_SECRETS` | Webhook signature secrets (comma-separated) |
| `CATWALK_AUTHOR_FIDS` | Comma-separated creator FIDs (47 total) |
| `REWARD_SIGNER_PRIVATE_KEY` | Wallet for sending token rewards |
| `CRON_SECRET` | Auth secret for cron endpoints |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_NAME` | App display name | "Catwalk" |
| `NEXT_PUBLIC_APP_DESCRIPTION` | App description | - |
| `BASESCAN_API_KEY` | BaseScan API for token stats | - |
| `BASE_RPC_URL` | Base chain RPC | https://mainnet.base.org |
| `NEYNAR_CLIENT_ID` | Neynar client ID | - |

---

## Authentication

### Sign In With Neynar (SIWN)

The app uses Farcaster authentication via Neynar's SIWN flow:

1. User opens mini app in Warpcast
2. Farcaster SDK provides context with user FID
3. App calls `/api/siwn` to verify the signature
4. SIWE message is parsed and verified
5. FID extracted from message resources

```typescript
// Context from Farcaster SDK
const { context } = useMiniApp();
const fid = context?.user?.fid;

// Verify with backend
const response = await fetch('/api/siwn', {
  method: 'POST',
  body: JSON.stringify({ message, signature })
});
```

### No Session Storage

The app relies on Farcaster SDK context - no separate session management needed.

---

## Token Information

### CATWALK Token

| Property | Value |
|----------|-------|
| **Name** | CATWALK |
| **Symbol** | CATWALK |
| **Chain** | Base (mainnet) |
| **Address** | `0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07` |
| **Decimals** | 18 |
| **Uniswap Pair** | `0xAcf65dDaF08570076D1Dfba9539f21ae5A30b8Bc` |

### Price Sources

1. **DexScreener** (primary) - Real-time price from DEX
2. **Price History Table** - For 24h change calculation

---

## UI Components

### Main App Structure

```
src/components/
├── App.tsx                    # Main app container, tab routing
├── ui/
│   ├── Header.tsx             # App header
│   ├── Footer.tsx             # Tab navigation
│   ├── TokenTicker.tsx        # Price display in header
│   └── tabs/
│       ├── HomeTab.tsx        # Check-in, creator info
│       ├── LeaderboardTab.tsx # Rankings
│       ├── FeedTab.tsx        # Channel posts
│       ├── PortalTab.tsx      # Rewards portal (~1650 lines)
│       ├── WalletTab.tsx      # Wallet functions
│       ├── ActionsTab.tsx     # Cast, notifications
│       └── ContextTab.tsx     # Debug/context info
├── CheckinButton.tsx          # Daily check-in button
├── CheckinAnimation.tsx       # Check-in success animation
├── ConfettiCelebration.tsx    # Celebration effects
├── CreatorCard.tsx            # Creator profile cards
├── CreatorGreeting.tsx        # Creator welcome message
├── WelcomePopup.tsx           # First-time user popup
└── ErrorBoundary.tsx          # Error handling wrapper
```

### Tab Enum

```typescript
export enum Tab {
  Home = "home",
  Leaderboard = "leaderboard",
  Feed = "feed",
  Actions = "actions",
  Context = "context",
  Wallet = "wallet",
  Portal = "portal",
}
```

---

## Cron Jobs

### vercel.json Configuration

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

| Cron | Schedule | Purpose |
|------|----------|---------|
| `/api/creator-stats/sync` | Daily 1 AM UTC | Sync creator statistics |
| `/api/cron/auto-engage` | Hourly | Auto like/recast for enabled users |

### Manual Cron Endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `/api/cron/seed-eligible-casts` | Backfill eligible casts | `x-cron-secret` header |
| `/api/cron/webhook-health` | Check webhook status | `x-cron-secret` header |
| `/api/cron/refresh-channel-feed` | Refresh feed cache | `x-cron-secret` header |
| `/api/cron/refresh-engagement-cache` | Refresh engagement cache | `x-cron-secret` header |

---

## Feature: Daily Check-In

### Overview

Users can "walk" (check in) once per day to build a streak and earn CATWALK tokens.

### Reset Time

- **9 AM Pacific Time** daily reset
- Uses `America/Los_Angeles` timezone
- Implemented in `src/lib/dateUtils.ts`

### Streak Logic

```typescript
// If checked in yesterday → increment streak
// If missed a day → reset streak to 1
// Same day → no change (already checked in)
```

### Database Fields

| Field | Type | Description |
|-------|------|-------------|
| `fid` | BIGINT | Farcaster user ID |
| `last_checkin` | TIMESTAMPTZ | Last check-in timestamp |
| `streak` | INTEGER | Current streak count |
| `total_checkins` | INTEGER | All-time total walks |
| `reward_claimed_at` | TIMESTAMPTZ | When daily reward was claimed |
| `total_walk_rewards` | NUMERIC | Total CATWALK earned from walks |

### API Flow

1. `GET /api/checkin?fid=123` - Check current status
2. `POST /api/checkin` with `{ fid: 123 }` - Perform check-in
3. `POST /api/checkin/reward` - Claim token reward

---

## Feature: Creator Portal

**Full documentation:** [CREATOR_PORTAL_COMPREHENSIVE_SOT.md](./CREATOR_PORTAL_COMPREHENSIVE_SOT.md)

### Quick Summary

| Component | Description |
|-----------|-------------|
| **Creator Rewards** | 1,000,000 CATWALK per post in /catwalk |
| **Engagement Rewards** | 1k (like), 2k (recast), 5k (comment) |
| **Auto-Engage** | Auto like/recast with 10% bonus |
| **Caching** | 1-hour user cache, 5-minute feed cache |

---

## Feature: Leaderboard

### Ranking Types

| Type | Sort Field | Description |
|------|------------|-------------|
| `streak` | `streak DESC` | Current check-in streak |
| `walks` | `total_checkins DESC` | All-time total walks |
| `holdings` | Token balance | CATWALK token holdings |

### Data Sources

- **Streak/Walks:** `checkins` table in Supabase
- **Holdings:** Neynar API `fetchUserBalance` for each user

### API

```
GET /api/leaderboard?type=streak&limit=100
GET /api/leaderboard?type=walks&limit=100
GET /api/leaderboard?type=holdings&limit=50
```

---

## Feature: Channel Feed

### Data Flow

1. `GET /api/channel-feed` called from FeedTab
2. Fetches from Neynar `/channel/feed` endpoint
3. Returns casts from /catwalk channel
4. Displays with images, videos, engagement counts

### Caching

- `channel_feed_cache` table stores responses
- 5-minute TTL
- Reduces Neynar API credit usage

---

## Monorepo Structure

### ⚠️ CRITICAL: Stay Out of These Folders

This repo contains multiple apps. **Only modify root `/src` for Catwalk.**

| Folder | App | Status |
|--------|-----|--------|
| `/src/` | **Catwalk** | ✅ Safe to modify |
| `/burrfriends/` | BurrFriends/Betr | ❌ DO NOT MODIFY |
| `/poker/` | Poker Mini App | ❌ DO NOT MODIFY |
| `/basketball/` | Basketball App | ❌ DO NOT MODIFY |
| `/catwalkagent/` | AI Agent Scripts | ❌ DO NOT MODIFY |

### Safe Files (Catwalk)

```
/src/                    ← All Catwalk source code
/public/                 ← Catwalk assets
/supabase_*.sql          ← Root-level migrations only
/vercel.json             ← Catwalk deployment config
/package.json            ← Catwalk dependencies
/*.md                    ← Catwalk documentation
```

---

## Deployment

### Vercel Auto-Deploy

- Pushes to `master` branch auto-deploy to Vercel
- Production URL: https://catwalk-smoky.vercel.app

### Manual Deployment

```bash
npm run build
npm run deploy:vercel
```

### Environment Setup

1. Set all required env vars in Vercel dashboard
2. Ensure `CATWALK_AUTHOR_FIDS` has all 47 creator FIDs
3. Verify `REWARD_SIGNER_PRIVATE_KEY` wallet has CATWALK tokens + ETH for gas

---

## Troubleshooting

### Quick Health Check

```bash
curl https://catwalk-smoky.vercel.app/api/ops/portal-health | jq
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Check-in not saving | Supabase connection | Check `SUPABASE_SERVICE_ROLE` |
| Token price N/A | DexScreener rate limit | Wait and retry |
| Leaderboard empty | No check-in records | Users need to check in |
| Portal not showing rewards | Webhook not configured | Set up Neynar webhook |
| Creators not earning | Missing in `CATWALK_AUTHOR_FIDS` | Add FID to env var |

### Logs

- **Vercel Runtime Logs:** Vercel dashboard → Project → Logs
- **Database:** Supabase dashboard → SQL Editor

---

## Related Documentation

- **[CREATOR_PORTAL_COMPREHENSIVE_SOT.md](./CREATOR_PORTAL_COMPREHENSIVE_SOT.md)** - Complete Creator Portal documentation
- **[CREATOR_PORTAL_SOT.md](./CREATOR_PORTAL_SOT.md)** - Shorter portal reference

---

*Last verified: 2026-02-02*
