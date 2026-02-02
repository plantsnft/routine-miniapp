# Catwalk Mini App - Source of Truth

> **FOR AI/AGENT USE:** This document is the single source of truth for the Catwalk mini app.
> All information is verifiable against the codebase. Update this document with every code change.
> Never add information that cannot be verified. When in doubt, check the actual source files.

**Last Updated:** 2026-02-02  
**Last Verified:** 2026-02-02  
**Status:** ✅ LIVE  
**Production URL:** https://catwalk-smoky.vercel.app

---

## QUICK REFERENCE (Most Used)

### Critical Paths
```
CATWALK SOURCE CODE:     c:\miniapps\routine\src\
PORTAL SOT:              c:\miniapps\routine\CREATOR_PORTAL_COMPREHENSIVE_SOT.md
THIS SOT:                c:\miniapps\routine\CATWALK_APP_SOT.md
```

### Key Constants (from src/lib/constants.ts)
| Constant | Value | Line |
|----------|-------|------|
| `CATWALK_CREATOR_FIDS` | 31 FIDs array | 75-107 |
| `APP_URL` | `https://catwalk-smoky.vercel.app` | 23 |
| `CHECK_IN_RESET_HOUR` | 9 (9 AM Pacific) | 153 |
| `PACIFIC_TIMEZONE` | `America/Los_Angeles` | 154 |

### Token (verified in 14+ source files)
| Property | Value |
|----------|-------|
| Address | `0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07` |
| Chain | Base (mainnet) |
| Decimals | 18 |
| Uniswap Pair | `0xAcf65dDaF08570076D1Dfba9539f21ae5A30b8Bc` |

### DO NOT MODIFY (Other Apps in Monorepo)
```
❌ /burrfriends/    - BurrFriends/Betr app
❌ /poker/          - Poker mini app  
❌ /basketball/     - Basketball app
❌ /catwalkagent/   - AI agent scripts
```

---

## Table of Contents

1. [Quick Reference](#quick-reference-most-used)
2. [Overview](#overview)
3. [App Features](#app-features)
4. [Tech Stack](#tech-stack)
5. [App Architecture](#app-architecture)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Environment Variables](#environment-variables)
9. [Authentication](#authentication)
10. [Token Information](#token-information)
11. [Pages & Routes](#pages--routes)
12. [React Hooks](#react-hooks)
13. [UI Components](#ui-components)
14. [Library Utilities](#library-utilities)
15. [Cron Jobs](#cron-jobs)
16. [Feature: Daily Check-In](#feature-daily-check-in)
17. [Feature: Creator Portal](#feature-creator-portal)
18. [Feature: Leaderboard](#feature-leaderboard)
19. [Feature: Notifications](#feature-notifications)
20. [Feature: Channel Feed](#feature-channel-feed)
21. [Feature: Sharing & OpenGraph](#feature-sharing--opengraph)
22. [Neynar Integration](#neynar-integration)
23. [Webhook Configuration](#webhook-configuration)
24. [Farcaster Manifest Details](#farcaster-manifest-details)
25. [Monorepo Structure](#monorepo-structure)
26. [Deployment](#deployment)
27. [Troubleshooting](#troubleshooting)
28. [Known Issues & Gotchas](#known-issues--gotchas)
29. [Testing Checklist](#testing-checklist)
30. [Change Log](#change-log)

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

> **Note:** No migration file exists for this table. Schema inferred from `CheckinRecord` interface in `src/lib/supabase.ts`.

```sql
-- Expected schema (create if not exists)
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
-- From supabase_migration_price_history.sql
CREATE TABLE IF NOT EXISTS public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  price NUMERIC NOT NULL,
  price_usd NUMERIC NOT NULL,
  market_cap NUMERIC,
  volume_24h NUMERIC,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_price_history_token_address ON price_history(token_address);
CREATE INDEX idx_price_history_timestamp ON price_history(timestamp DESC);
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

> **Total:** 47 route files in `src/app/api/`

### Check-In (`src/app/api/checkin/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/checkin` | GET/POST | `route.ts` | Get status / perform check-in |
| `/api/checkin/reward` | POST | `reward/route.ts` | Claim check-in reward |

### Leaderboard (`src/app/api/leaderboard/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/leaderboard` | GET | `route.ts` | Get top users by streak, walks, or holdings |

### Channel & Feed (`src/app/api/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/channel-feed` | GET | `channel-feed/route.ts` | Get /catwalk channel posts |
| `/api/channel-stats` | GET | `channel-stats/route.ts` | Get channel follower count |
| `/api/cast-comments` | GET | `cast-comments/route.ts` | Get comments on a cast |
| `/api/cast-react` | POST | `cast-react/route.ts` | Like/recast a cast |

### Token & Price (`src/app/api/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/token-price` | GET | `token-price/route.ts` | CATWALK price, 24h change, market cap |
| `/api/recent-purchases` | GET | `recent-purchases/route.ts` | Recent token transfer events |

### Authentication (`src/app/api/auth/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/siwn` | POST | `siwn/route.ts` | Sign In With Neynar |
| `/api/users` | GET | `users/route.ts` | Get user profiles by FID |
| `/api/auth/signer` | GET | `auth/signer/route.ts` | Get managed signer status |
| `/api/auth/signer/signed_key` | POST | `auth/signer/signed_key/route.ts` | Create signed key request |
| `/api/auth/signers` | GET | `auth/signers/route.ts` | List all signers |
| `/api/auth/session-signers` | GET | `auth/session-signers/route.ts` | Get session signers |
| `/api/auth/nonce` | GET | `auth/nonce/route.ts` | Generate auth nonce |
| `/api/auth/validate` | POST | `auth/validate/route.ts` | Validate auth token |

### Social & Notifications (`src/app/api/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/best-friends` | GET | `best-friends/route.ts` | User's best friends (top 3) |
| `/api/send-notification` | POST | `send-notification/route.ts` | Send push notification |

### Creator Stats (`src/app/api/creator-stats/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/creator-stats` | GET | `route.ts` | Get creator statistics |
| `/api/creator-stats/sync` | POST | `sync/route.ts` | Sync creator stats (cron) |
| `/api/creator-stats/casts-by-label` | GET | `casts-by-label/route.ts` | Casts filtered by label |
| `/api/creator-stats/top-casts` | GET | `top-casts/route.ts` | Top performing casts |
| `/api/creator-stats/populate-placeholders` | POST | `populate-placeholders/route.ts` | Populate placeholder data |
| `/api/creator-fids` | GET | `creator-fids/route.ts` | List of creator FIDs |
| `/api/creator-cast-counts` | GET | `creator-cast-counts/route.ts` | Cast counts per creator |
| `/api/update-creator-fids` | POST | `update-creator-fids/route.ts` | Update creator FID list |

### OpenGraph (`src/app/api/opengraph-image/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/opengraph-image` | GET | `route.tsx` | Generate OG image for sharing |

### Portal Endpoints (`src/app/api/portal/`)

> **See:** [CREATOR_PORTAL_COMPREHENSIVE_SOT.md](./CREATOR_PORTAL_COMPREHENSIVE_SOT.md)

| Endpoint | File |
|----------|------|
| `/api/portal/status` | `status/route.ts` |
| `/api/portal/engagement/verify` | `engagement/verify/route.ts` |
| `/api/portal/engagement/claim` | `engagement/claim/route.ts` |
| `/api/portal/creator/claim` | `creator/claim/route.ts` |
| `/api/portal/engage/preferences` | `engage/preferences/route.ts` |
| `/api/portal/engage/authorize` | `engage/authorize/route.ts` |
| `/api/portal/engage/bulk` | `engage/bulk/route.ts` |
| `/api/portal/lifetime-rewards` | `lifetime-rewards/route.ts` |

### Ops/Diagnostics (`src/app/api/ops/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/ops/portal-health` | GET | `portal-health/route.ts` | Full portal health check |
| `/api/ops/auth-health` | GET | `auth-health/route.ts` | Auth system health |
| `/api/ops/wiring-check` | GET | `wiring-check/route.ts` | Verify env var wiring |
| `/api/ops/webhook-metrics` | GET | `webhook-metrics/route.ts` | Basic webhook status |

### Cron Endpoints (`src/app/api/cron/`)

| Endpoint | File | Schedule | Auth |
|----------|------|----------|------|
| `/api/cron/auto-engage` | `auto-engage/route.ts` | Hourly | `Authorization: Bearer {CRON_SECRET}` |
| `/api/cron/seed-eligible-casts` | `seed-eligible-casts/route.ts` | Manual | `x-cron-secret` header |
| `/api/cron/webhook-health` | `webhook-health/route.ts` | Manual | `x-cron-secret` header |
| `/api/cron/refresh-channel-feed` | `refresh-channel-feed/route.ts` | Manual | `x-cron-secret` header |
| `/api/cron/refresh-engagement-cache` | `refresh-engagement-cache/route.ts` | Manual | `x-cron-secret` header |

### Webhooks (`src/app/api/`)

| Endpoint | Method | File | Purpose |
|----------|--------|------|---------|
| `/api/webhooks/neynar` | POST | `webhooks/neynar/route.ts` | Receive Neynar webhook events |
| `/api/webhook` | POST | `webhook/route.ts` | Legacy webhook endpoint |

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_URL` | App URL (https://catwalk-smoky.vercel.app) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
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
| `NEXT_PUBLIC_APP_BUTTON_TEXT` | Mini app button text | - |
| `NEXT_PUBLIC_APP_WEBHOOK_URL` | App webhook URL | - |
| `NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION` | Farcaster account association JSON | - |
| `BASESCAN_API_KEY` | BaseScan API for token stats | - |
| `BASE_RPC_URL` | Base chain RPC | https://mainnet.base.org |
| `NEYNAR_CLIENT_ID` | Neynar client ID (for notifications) | - |
| `KV_REST_API_URL` | Upstash Redis URL (for notifications) | - |
| `KV_REST_API_TOKEN` | Upstash Redis token | - |
| `CATWALK_PROFILE_BASE_URL` | Profile URL base | https://warpcast.com |

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

## Pages & Routes

### App Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Main app entry (renders App component) |
| `/portal` | `src/app/portal/page.tsx` | Direct portal page access |
| `/share/[fid]` | `src/app/share/[fid]/page.tsx` | Shareable profile page with OG image |

### Special Routes

| Route | File | Purpose |
|-------|------|---------|
| `/.well-known/farcaster.json` | `src/app/.well-known/farcaster.json/route.ts` | Farcaster mini app manifest |

---

## React Hooks

### Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useCheckin` | `src/hooks/useCheckin.ts` | Check-in state management, streak fetching |
| `useNeynarUser` | `src/hooks/useNeynarUser.ts` | Fetch Neynar user data |
| `useAuth` | `src/hooks/useAuth.ts` | Authentication state |
| `useQuickAuth` | `src/hooks/useQuickAuth.ts` | Quick auth flow |
| `useHapticFeedback` | `src/hooks/useHapticFeedback.ts` | Haptic feedback for interactions |
| `useDetectClickOutside` | `src/hooks/useDetectClickOutside.ts` | Detect clicks outside element |

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
│   ├── Button.tsx             # Reusable button component
│   ├── input.tsx              # Form input component
│   ├── label.tsx              # Form label component
│   ├── Share.tsx              # Share button/dialog
│   ├── ImageCarousel.tsx      # Image carousel for posts
│   ├── VideoPlayer.tsx        # Video player component
│   ├── wallet/
│   │   ├── SignIn.tsx         # Wallet sign-in
│   │   ├── SendEth.tsx        # Send ETH
│   │   ├── SendSolana.tsx     # Send SOL
│   │   ├── SignEvmMessage.tsx # Sign EVM messages
│   │   └── SignSolanaMessage.tsx # Sign Solana messages
│   └── tabs/
│       ├── HomeTab.tsx        # Check-in, creator info
│       ├── LeaderboardTab.tsx # Rankings
│       ├── FeedTab.tsx        # Channel posts
│       ├── PortalTab.tsx      # Rewards portal (~1650 lines)
│       ├── WalletTab.tsx      # Wallet functions
│       ├── ActionsTab.tsx     # Cast, notifications
│       └── ContextTab.tsx     # Debug/context info
├── providers/
│   ├── WagmiProvider.tsx      # Wagmi wallet provider
│   └── SafeFarcasterSolanaProvider.tsx  # Solana wallet provider
├── CheckinButton.tsx          # Daily check-in button
├── CheckinAnimation.tsx       # Check-in success animation
├── CheckinGifAnimation.tsx    # GIF-based check-in animation
├── ConfettiCelebration.tsx    # Celebration effects
├── CreatorCard.tsx            # Creator profile cards
├── CreatorGreeting.tsx        # Creator welcome message
├── RewardClaimButton.tsx      # Claim reward button
├── SleepingCat.tsx            # Idle cat animation
├── DevAuthDebug.tsx           # Dev-only auth debug panel
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

## Library Utilities

### Key Lib Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Supabase client, check-in CRUD operations |
| `src/lib/supabaseAdmin.ts` | Supabase admin client (service role) |
| `src/lib/neynar.ts` | Neynar API client and helpers |
| `src/lib/constants.ts` | App constants, creator FIDs, config |
| `src/lib/dateUtils.ts` | Date utilities, check-in reset logic |
| `src/lib/types.ts` | TypeScript type definitions |
| `src/lib/utils.ts` | General utilities |
| `src/lib/auth.ts` | Auth utilities |
| `src/lib/kv.ts` | Key-value store (Redis/in-memory) |
| `src/lib/notifs.ts` | Push notification helpers |
| `src/lib/webhookSecurity.ts` | Webhook signature verification |
| `src/lib/creatorStats.ts` | Creator statistics helpers |
| `src/lib/creatorStatsHelpers.ts` | Additional creator stat utilities |
| `src/lib/castUtils.ts` | Cast/post utilities |
| `src/lib/devices.ts` | Device detection |
| `src/lib/errorUtils.tsx` | Error handling components |
| `src/lib/localStorage.ts` | Local storage utilities |
| `src/lib/models.ts` | Data models |
| `src/lib/neynarResult.ts` | Neynar API response types |
| `src/lib/opsAuth.ts` | Ops endpoint auth |
| `src/lib/truncateAddress.ts` | Wallet address formatting |
| `src/lib/authDebug.ts` | Auth debugging utilities |
| `src/lib/dbConstants.ts` | Database constants |

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

### Check-In Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DAILY CHECK-IN FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User opens app                                                     │
│         │                                                           │
│         ▼                                                           │
│  GET /api/checkin?fid={fid}                                         │
│         │                                                           │
│         ├──► Has checked in today? ──Yes──► Show "Already walked"   │
│         │           │                                               │
│         │          No                                               │
│         │           │                                               │
│         │           ▼                                               │
│         │   Show "Walk" button                                      │
│         │                                                           │
│  User clicks "Walk"                                                 │
│         │                                                           │
│         ▼                                                           │
│  POST /api/checkin { fid }                                          │
│         │                                                           │
│         ├──► First check-in ever? ──Yes──► INSERT streak=1          │
│         │           │                                               │
│         │          No                                               │
│         │           │                                               │
│         │           ├──► Last check-in was yesterday?               │
│         │           │           │                                   │
│         │           │    Yes ───► UPDATE streak = streak + 1        │
│         │           │           │                                   │
│         │           │    No ────► UPDATE streak = 1 (reset)         │
│         │                                                           │
│         ▼                                                           │
│  Return { ok: true, streak, total_checkins }                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Reset Time Logic

- **9 AM Pacific Time** daily reset
- Uses `America/Los_Angeles` timezone
- Implemented in `src/lib/dateUtils.ts`
- Constants also exported from `src/lib/constants.ts`

```typescript
// src/lib/dateUtils.ts (actual implementation)
const PACIFIC_TIMEZONE = "America/Los_Angeles";
const CHECK_IN_RESET_HOUR = 9; // 9 AM Pacific

// Get "day ID" - changes at 9 AM Pacific each day
export function getCheckInDayId(date: Date): string {
  // Uses Intl.DateTimeFormat for accurate timezone handling
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  
  // If before 9 AM, it belongs to previous day's check-in window
  // Returns YYYY-MM-DD string
}

// Check if user can check in (different check-in window)
export function canCheckIn(lastCheckinDate: Date | null, nowDate: Date): boolean {
  if (!lastCheckinDate) return true;
  return getCheckInDayId(lastCheckinDate) !== getCheckInDayId(nowDate);
}

// Calculate days difference between two check-in windows
export function getPacificDaysDiff(date1: Date, date2: Date): number {
  // Returns number of check-in days between dates
}
```

> **Note:** The actual implementation uses `Intl.DateTimeFormat` for reliable timezone conversion, not `toLocaleString`. See `src/lib/dateUtils.ts` for complete code.

### Streak Calculation

The streak calculation happens in `src/app/api/checkin/route.ts`:

```typescript
// From the actual POST /api/checkin handler:

// Calculate days difference in Pacific check-in windows
const daysDiff = getPacificDaysDiff(lastDate, nowDate);

let newStreak: number;
if (daysDiff === 1) {
  // Checked in consecutive day - increment streak
  newStreak = currentStreak + 1;
} else if (daysDiff > 1) {
  // Missed a day or more - reset streak
  newStreak = 1;
} else {
  // Same window (shouldn't happen due to canCheckIn check)
  newStreak = currentStreak;
}
```

**Important:** The GET endpoint also adjusts displayed streak:
- If user hasn't checked in today (daysDiff >= 1), streak displays as **0**
- This is for display purposes only - the actual streak is preserved in DB
- When they check in again, the real streak calculation runs

### Database Schema: `checkins` Table

> **Note:** No migration file exists for this table. Schema inferred from `CheckinRecord` interface in `src/lib/supabase.ts`.

```typescript
// From src/lib/supabase.ts
interface CheckinRecord {
  id?: string;
  fid: number;                          // Farcaster user ID (unique)
  last_checkin: string | null;          // ISO timestamp of last check-in
  streak: number;                        // Current streak count
  total_checkins?: number;               // All-time total walks
  reward_claimed_at?: string | null;     // When daily reward was claimed
  inserted_at?: string;
  updated_at?: string;
}
// Note: total_walk_rewards also exists (accessed via type cast)
```

**Expected SQL (create if not exists):**
```sql
CREATE TABLE IF NOT EXISTS checkins (
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

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/checkin` | GET | Get user's status: streak, last_checkin, hasCheckedInToday |
| `/api/checkin` | POST | Perform check-in, update streak |
| `/api/checkin/reward` | POST | Claim token reward for check-in |

### API Response Types

```typescript
interface CheckinResponse {
  ok: boolean;
  streak?: number;
  last_checkin?: string | null;
  total_checkins?: number;
  hasCheckedIn?: boolean;
  hasCheckedInToday?: boolean;
  error?: string;
  mode?: "insert" | "update" | "already_checked_in";
}
```

### Frontend Hook: `useCheckin`

```typescript
// src/hooks/useCheckin.ts
const { 
  status,           // { checkedIn, streak, totalCheckins, lastCheckIn, timeUntilNext }
  loading,          // boolean
  saving,           // boolean  
  error,            // string | null
  fetchStreak,      // (userId) => Promise<void>
  performCheckIn,   // (userId) => Promise<{ success, streak }>
  clearError,       // () => void
} = useCheckin();
```

### Diagnostic Queries

```sql
-- Check a user's status
SELECT fid, streak, total_checkins, last_checkin, reward_claimed_at 
FROM checkins WHERE fid = 318447;

-- Top 10 by streak
SELECT fid, streak, total_checkins FROM checkins 
ORDER BY streak DESC LIMIT 10;

-- Users who checked in today (approximate - depends on timezone)
SELECT COUNT(*) FROM checkins 
WHERE last_checkin > NOW() - INTERVAL '24 hours';

-- Total walks across all users
SELECT SUM(total_checkins) as total_walks FROM checkins;
```

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

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      LEADERBOARD DATA FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User opens Leaderboard tab                                         │
│         │                                                           │
│         ▼                                                           │
│  GET /api/leaderboard?type={type}&limit={limit}                     │
│         │                                                           │
│         ├──► type = "streak" or "walks"?                            │
│         │           │                                               │
│         │    Yes ───► Query checkins table (fast)                   │
│         │           │                                               │
│         │    No ────► type = "holdings"                             │
│         │           │                                               │
│         │           ▼                                               │
│         │   Get top users from checkins                             │
│         │           │                                               │
│         │           ▼                                               │
│         │   For each user: fetch balance via Neynar API             │
│         │   (Uses fetchUserBalance - EXPENSIVE!)                    │
│         │           │                                               │
│         │           ▼                                               │
│         │   Sort by balance, return top N                           │
│         │                                                           │
│         ▼                                                           │
│  For each user: fetch profile from Neynar (username, pfp)           │
│         │                                                           │
│         ▼                                                           │
│  Return LeaderboardEntry[]                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Sources

| Type | Source | Speed | API Cost |
|------|--------|-------|----------|
| `streak` | `checkins` table | Fast | None |
| `walks` | `checkins` table | Fast | None |
| `holdings` | Neynar API per user | Slow | High |

### API

```bash
# Get top streaks
GET /api/leaderboard?type=streak&limit=100

# Get top total walks
GET /api/leaderboard?type=walks&limit=100

# Get top holders (expensive - Neynar API calls)
GET /api/leaderboard?type=holdings&limit=50
```

### Response Type

```typescript
// From src/lib/models.ts
interface LeaderboardEntry {
  fid: number;
  streak: number;
  last_checkin: string | null;
  total_checkins?: number;      // All-time total check-ins
  allTimeStreak?: number;       // Derived longest streak
  username?: string;
  displayName?: string;
  pfp_url?: string;
  profileUrl?: string;
  rank: number;
  // For holdings type:
  balance?: number;             // CATWALK token balance (added at runtime)
}
```

### Diagnostic Queries

```sql
-- Top 20 by streak
SELECT fid, streak, total_checkins, last_checkin 
FROM checkins ORDER BY streak DESC LIMIT 20;

-- Top 20 by total walks
SELECT fid, streak, total_checkins, last_checkin 
FROM checkins ORDER BY total_checkins DESC LIMIT 20;

-- Users with broken streaks (haven't checked in recently)
SELECT fid, streak, last_checkin 
FROM checkins 
WHERE streak > 5 
  AND last_checkin < NOW() - INTERVAL '2 days'
ORDER BY streak DESC;
```

---

## Feature: Notifications

### Overview

The app can send push notifications to users via Farcaster's notification system.

### Two Methods

| Method | When Used | Storage |
|--------|-----------|---------|
| **Neynar Notifications** | When `NEYNAR_CLIENT_ID` is set | Managed by Neynar |
| **Direct Notifications** | Fallback | Upstash Redis or in-memory |

### Flow

1. User enables notifications in Warpcast
2. Notification details sent to `/api/send-notification`
3. App stores token (if not using Neynar)
4. App sends notification via Farcaster notification URL

### Environment

- `NEYNAR_CLIENT_ID` - Enables Neynar-managed notifications
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` - Upstash Redis for direct method

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

## Feature: Sharing & OpenGraph

### Share Pages

The app supports shareable profile pages at `/share/[fid]`.

**Example:** `https://catwalk-smoky.vercel.app/share/318447`

### How It Works

1. User visits `/share/{fid}`
2. Server generates OpenGraph metadata
3. `/api/opengraph-image?fid={fid}` generates custom image
4. Page redirects to home, but share card shows user's profile

### Farcaster Manifest

Located at `/.well-known/farcaster.json`, provides:
- App name and description
- Mini app embed metadata
- Account association (for verified apps)

---

## Neynar Integration

### Overview

Neynar provides the Farcaster API layer for:
- User authentication (SIWN)
- Channel feeds and cast data
- User profiles and balances
- Reactions (like/recast)
- Managed signers for auto-engage
- Push notifications

### Neynar SDK Setup

```typescript
// src/lib/neynar.ts
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';

const config = new Configuration({ apiKey: process.env.NEYNAR_API_KEY });
const client = new NeynarAPIClient(config);
```

### Key Neynar Methods Used

| Method | Purpose | Endpoint |
|--------|---------|----------|
| `fetchBulkUsers` | Get user profiles | `/api/users` |
| `fetchUserBalance` | Get token balances | `/api/leaderboard` |
| `fetchChannelFeed` | Get channel posts | `/api/channel-feed` |
| `fetchReactionsForCast` | Check reactions | `/api/portal/engagement/verify` |
| `publishReaction` | Like/recast | `/api/cron/auto-engage` |
| `publishFrameNotifications` | Send notifications | `/api/send-notification` |
| `createSigner` | Create managed signer | `/api/portal/engage/authorize` |

### Neynar Dashboard Setup

1. Go to [dev.neynar.com](https://dev.neynar.com)
2. Create/select your app
3. Copy API Key → Set as `NEYNAR_API_KEY`
4. Copy Client ID → Set as `NEYNAR_CLIENT_ID` (optional, for notifications)
5. Set up webhook (see below)

---

## Webhook Configuration

### Neynar Webhook Setup

1. Go to Neynar Dashboard → Webhooks
2. Create new webhook with URL: `https://catwalk-smoky.vercel.app/api/webhooks/neynar`
3. Select events:
   - `cast.created` - New casts
   - `cast.deleted` - Deleted casts
   - `reaction.created` - Likes/recasts
   - `reaction.deleted` - Unlikes/unrecasts
4. Copy Webhook Secret → Set as `NEYNAR_WEBHOOK_SECRETS`

### Webhook Signature Verification

```typescript
// src/lib/webhookSecurity.ts
import crypto from "crypto";

export function verifyNeynarWebhookSignature(
  rawBody: string,
  signature: string | null,
  secrets: string[]
): boolean {
  // HMAC SHA-512 over raw body (UTF-8)
  // Signature in X-Neynar-Signature header (hex string)
  const expectedSignature = crypto
    .createHmac("sha512", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
```

### Multiple Secrets (Rotation)

`NEYNAR_WEBHOOK_SECRETS` supports comma-separated secrets for rotation:
```
NEYNAR_WEBHOOK_SECRETS=secret1,secret2,secret3
```

### Webhook Events Processing

| Event | Action |
|-------|--------|
| `cast.created` (creator) | Create `eligible_casts` + `creator_claims` |
| `cast.created` (reply) | Create `engagements` + `engagement_claims` |
| `cast.deleted` | Remove from `eligible_casts` |
| `reaction.created` | Create `engagements` + `engagement_claims` |
| `reaction.deleted` | Remove from `engagements` |

---

## Farcaster Manifest Details

### Manifest Structure

```typescript
// Generated by /.well-known/farcaster.json route
{
  accountAssociation: {
    header: "eyJmaWQiOjMxODQ0Ny4uLg",  // Base64 JWT header
    payload: "eyJkb21haW4iOi4uLg",      // Base64 domain claim
    signature: "edEJSA+ZYlH0..."        // Signature
  },
  miniapp: {
    version: "1",
    name: "Catwalk",
    homeUrl: "https://catwalk-smoky.vercel.app",
    iconUrl: "https://catwalk-smoky.vercel.app/logo.png",
    imageUrl: "https://catwalk-smoky.vercel.app/api/opengraph-image",
    buttonTitle: "Launch Mini App",
    splashImageUrl: "https://catwalk-smoky.vercel.app/logo.png",
    splashBackgroundColor: "#000000",
    webhookUrl: "https://api.neynar.com/f/app/{CLIENT_ID}/event"
  }
}
```

### Account Association

The `accountAssociation` proves the mini app is owned by a specific Farcaster account.

**To generate:**
1. Sign a message with your Farcaster account's custody address
2. The message contains: `{ fid, type: "auth", key: "0x..." }`
3. Set via `NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION` env var (JSON)

> **Note:** The hardcoded fallback in `utils.ts` has `routine-smoky.vercel.app` domain, but production uses `catwalk-smoky.vercel.app`. Always ensure `NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION` is set correctly in Vercel.

### Webhook URL in Manifest

If using Neynar notifications:
```
webhookUrl: "https://api.neynar.com/f/app/{NEYNAR_CLIENT_ID}/event"
```

If using direct notifications:
```
webhookUrl: "https://catwalk-smoky.vercel.app/api/webhook"
```

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

### GitHub Repository

- **Repo:** `https://github.com/plantsnft/routine-miniapp`
- **Branch:** `master` (production)
- **Auto-deploy:** Pushes to `master` trigger Vercel deployment

### Git Workflow

```bash
# Make changes
git add .
git commit -m "Your commit message"
git push origin master
# → Vercel auto-deploys
```

### Vercel Configuration

**Project Settings:**
- Framework: Next.js
- Build Command: `next build`
- Output Directory: `.next`
- Install Command: `npm install`

**vercel.json:**
```json
{
  "buildCommand": "next build",
  "framework": "nextjs",
  "crons": [
    { "path": "/api/creator-stats/sync", "schedule": "0 1 * * *" },
    { "path": "/api/cron/auto-engage", "schedule": "0 * * * *" }
  ]
}
```

### Manual Deployment

```bash
# Build locally first
npm run build

# Deploy to Vercel
npm run deploy:vercel
# OR
vercel --prod
```

### Environment Variables Setup

**In Vercel Dashboard → Settings → Environment Variables:**

#### Required Variables

| Variable | How to Get |
|----------|------------|
| `NEXT_PUBLIC_URL` | Your Vercel URL (e.g., `https://catwalk-smoky.vercel.app`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → URL |
| `SUPABASE_SERVICE_ROLE` | Supabase Dashboard → Settings → API → service_role key |
| `NEYNAR_API_KEY` | Neynar Dashboard → API Key |
| `NEYNAR_WEBHOOK_SECRETS` | Neynar Dashboard → Webhooks → Secret |
| `CATWALK_AUTHOR_FIDS` | Comma-separated FIDs: `8926,11632,14511,...` |
| `REWARD_SIGNER_PRIVATE_KEY` | Private key of reward wallet (starts with `0x`) |
| `CRON_SECRET` | Generate: `openssl rand -hex 32` |

#### Optional Variables

| Variable | How to Get |
|----------|------------|
| `NEYNAR_CLIENT_ID` | Neynar Dashboard → Client ID |
| `KV_REST_API_URL` | Upstash Dashboard → Redis → REST URL |
| `KV_REST_API_TOKEN` | Upstash Dashboard → Redis → REST Token |
| `BASESCAN_API_KEY` | BaseScan → API Keys |

### First-Time Deployment Checklist

1. **Fork/Clone repo** to your GitHub account
2. **Create Vercel project** linked to GitHub repo
3. **Set environment variables** in Vercel
4. **Create Supabase project** and run migrations
5. **Set up Neynar webhook** pointing to your Vercel URL
6. **Deploy** - push to master or run `vercel --prod`
7. **Verify** - check `/api/ops/portal-health`

### Post-Deployment Verification

```bash
# Check app is running
curl https://your-app.vercel.app/api/ops/portal-health | jq

# Seed eligible casts
curl -H "x-cron-secret: YOUR_CRON_SECRET" \
  https://your-app.vercel.app/api/cron/seed-eligible-casts

# Test check-in API
curl "https://your-app.vercel.app/api/checkin?fid=318447"
```

---

## Troubleshooting

### Quick Health Check

```bash
# Full portal health (most comprehensive)
curl https://catwalk-smoky.vercel.app/api/ops/portal-health | jq

# Auth system health
curl https://catwalk-smoky.vercel.app/api/ops/auth-health | jq

# Environment wiring check
curl https://catwalk-smoky.vercel.app/api/ops/wiring-check | jq
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Check-in not saving | Supabase connection | Check `SUPABASE_SERVICE_ROLE` |
| Token price N/A | DexScreener rate limit | Wait and retry |
| Leaderboard empty | No check-in records | Users need to check in |
| Portal not showing rewards | Webhook not configured | Set up Neynar webhook |
| Creators not earning | Missing in `CATWALK_AUTHOR_FIDS` | Add FID to env var |
| "SDK not loaded" | Farcaster context missing | Open in Warpcast app |
| Profile pictures not loading | Neynar API key | Check `NEYNAR_API_KEY` |
| Channel feed empty | API error | Check Neynar dashboard |

### Logs

- **Vercel Runtime Logs:** Vercel dashboard → Project → Logs
- **Database:** Supabase dashboard → SQL Editor
- **Neynar:** Neynar dashboard → Logs

---

## Known Issues & Gotchas

### ⚠️ Timezone: 9 AM Pacific Reset

**Issue:** Check-in day resets at 9 AM Pacific, not midnight.

**Impact:** Users checking in at 11 PM Pacific and then 10 AM next day = 2 days (streak maintained). Users checking in at 10 AM and then 8 AM next day = same day (blocked).

**Code Location:** `src/lib/dateUtils.ts`

### ⚠️ Holdings Leaderboard is Expensive

**Issue:** `?type=holdings` makes Neynar API calls for EACH user to get token balances.

**Impact:** High Neynar credit usage, slow response time.

**Recommendation:** Limit to 50 users max, consider caching.

### ⚠️ Base RPC 503 Errors

**Issue:** `https://mainnet.base.org` occasionally returns 503.

**Affected Endpoints:** 
- `/api/token-price` (partial)
- `/api/portal/lifetime-rewards`
- `/api/recent-purchases`

**Impact:** Features fail gracefully but show stale/no data.

### ⚠️ Token Price Caching

**Issue:** DexScreener rate limits requests.

**Mitigation:** 
- `price_history` table stores snapshots
- 24h change calculated from stored data
- Fallback to cached value if API fails

### ⚠️ SIWN May Fail on Web

**Issue:** Sign In With Neynar (SIWN) requires Farcaster context.

**Impact:** App shows "SDK not loaded" if opened directly in browser instead of Warpcast.

**Solution:** Always test in Warpcast app, not browser.

---

## Testing Checklist

### After Any Deployment, Verify:

#### 1. Basic App Loads
- Open in Warpcast
- Check SDK initializes (no "Loading SDK..." stuck)
- Verify user context is available

#### 2. Check-In Works
```bash
# Get status
curl "https://catwalk-smoky.vercel.app/api/checkin?fid=318447"

# Should return: { ok: true, streak: N, hasCheckedInToday: true/false }
```

#### 3. Leaderboard Loads
```bash
curl "https://catwalk-smoky.vercel.app/api/leaderboard?type=streak&limit=10"
```

#### 4. Token Price Shows
```bash
curl "https://catwalk-smoky.vercel.app/api/token-price"

# Should return: { price, priceChange24h, ... }
```

#### 5. Channel Feed Loads
```bash
curl "https://catwalk-smoky.vercel.app/api/channel-feed"
```

#### 6. Portal Health (Comprehensive)
```bash
curl "https://catwalk-smoky.vercel.app/api/ops/portal-health" | jq

# Verify: criticalIssues = 0, all checks pass
```

### SQL Health Checks

```sql
-- Total users
SELECT COUNT(*) FROM checkins;

-- Active users (checked in last 7 days)
SELECT COUNT(*) FROM checkins 
WHERE last_checkin > NOW() - INTERVAL '7 days';

-- Top streaks
SELECT fid, streak FROM checkins ORDER BY streak DESC LIMIT 5;

-- Webhook receiving events
SELECT * FROM app_state WHERE key = 'last_webhook_at';
```

---

## Change Log

> **IMPORTANT:** Update this log with every code change. Include date, files modified, and what changed.

### 2026-02-02

| Change | Files Modified | Details |
|--------|---------------|---------|
| SOT restructured for AI use | `CATWALK_APP_SOT.md` | Added quick reference, file paths, change log format |
| Full App SOT created | `CATWALK_APP_SOT.md` | Comprehensive documentation of all features |
| Creator Portal fixes | `webhooks/neynar/route.ts`, `portal/status/route.ts` | Fixed creator_claims creation, engagement_claims default |
| Author username added | `eligible_casts` table | Added `author_username` column |

### 2026-02-01

| Change | Files Modified | Details |
|--------|---------------|---------|
| Multiple creator FIDs | `webhooks/neynar/route.ts` | Changed `CATWALK_AUTHOR_FID` → `CATWALK_AUTHOR_FIDS` (47 FIDs) |
| Cast URL fix | `portal/engagement/verify/route.ts` | Fixed Warpcast URL format for opening casts |

### Earlier (Historical)

| Feature | Status |
|---------|--------|
| Daily check-in system | ✅ Implemented |
| Leaderboard (streak/walks/holdings) | ✅ Implemented |
| Token price ticker (DexScreener) | ✅ Implemented |
| Channel feed integration | ✅ Implemented |
| Creator Portal rewards | ✅ Implemented |
| Auto-engage feature | ✅ Implemented |

---

## Related Documentation

| Document | Path | Purpose |
|----------|------|---------|
| **Creator Portal SOT** | `CREATOR_PORTAL_COMPREHENSIVE_SOT.md` | Complete portal documentation |
| **Creator Portal (Short)** | `CREATOR_PORTAL_SOT.md` | Quick portal reference |

---

## SOT Maintenance Rules

1. **Every code change** → Update this SOT
2. **Never add unverified info** → Check source files first
3. **Include file paths** → Makes future reference easier
4. **Update "Last Updated" date** at top of document
5. **Log changes** in Change Log section with files modified

---

*Document verified against codebase: 2026-02-02*
