# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BETR WITH BURR** is a Farcaster Mini App that hosts social/competitive games for the /betr community. Built on Next.js 15 (App Router), it runs dozens of game types with BETR token staking, on-chain settlement on Base, and real-time chat. The source code lives at `C:\miniapps\routine\burrfriends\`.

Club slug: `burrfriends`. Single-club MVP — home page redirects to `/clubs/burrfriends/games`.

## Build & Dev Commands

```bash
cd C:\miniapps\routine\burrfriends
npm install
npm run dev            # Next.js dev server
npm run build          # Production build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run test           # Vitest unit tests
npm run test:watch     # Vitest watch mode
npm run test:e2e       # Playwright e2e tests
npm run test:smoke     # tsx scripts/smoke-test.ts
```

### Utility Scripts
```bash
npm run seed:clubs                  # Seed club data (idempotent)
npm run seed:members                # Seed club members
npm run migrate:rebrand             # Club rebrand migration
npm run backfill:signup-profiles    # Backfill profile cache (Neynar hydration)
npm run set-bullied-outcome         # Set bullied game outcome
npm run tftp-fids-reverse           # Take from the pile FID reorder
```

**Path alias:** `~/*` maps to `./src/*` (tsconfig.json).

## Tech Stack

- **Framework:** Next.js 15.5.9, React 19, TypeScript 5, App Router
- **Database:** Supabase PostgreSQL via PostgREST (`poker` schema, accessed through `pokerDb.ts`)
- **Auth:** Farcaster Quick Auth JWT (`@farcaster/quick-auth`). FID extracted only from verified token, never from client.
- **Blockchain:** Base mainnet (chain 8453). BETR token (`0x051024B653E8ec69E72693F776c41C2A9401FB07`), USDC, staking contracts. Uses viem + ethers.
- **Staking:** On-chain BETR staking contract at `0x808a12766632b456a74834f2fa8ae06dfc7482f1` (function: `stakedAmount(address)`). Also supports Minted Merch community (`balanceOf`).
- **Farcaster:** `@farcaster/miniapp-sdk` for lifecycle, Neynar SDK for user data/wallet lookup.
- **Additional:** OpenAI SDK (for some game logic), `@pokertools/evaluator` (NL Holdem), `cannon-es` (Jenga physics).
- **Testing:** Vitest (unit), Playwright (e2e).
- **Deploy:** Vercel. Root directory set to the burrfriends folder.

## Game Types

Each game has its own set of database tables, API routes (`src/app/api/<game>/`), and page routes (`src/app/<game>/`).

| Game | Route prefix | Key tables | Description |
|------|-------------|------------|-------------|
| **BETR Poker** | `/clubs/[slug]/games` | `games`, `participants`, `payouts` | ClubGG poker with USDC entry fees, escrow settlement |
| **Steal or No Steal** | `/steal-no-steal` | `steal_no_steal_*` | Briefcase game with negotiation. Matches have decision deadlines; timeout auto-assigns winner based on briefcase label (YOU WIN → holder wins, else decider wins) |
| **Heads-Up Steal or No Steal** | `/heads-up-steal-no-steal` | (shared steal_no_steal tables) | 2-player variant with YOU WIN briefcase |
| **Buddy Up** | `/buddy-up` | `buddy_up_*` | Group voting/elimination game with rounds, scheduled via `buddy_up_schedule` |
| **The Mole** | `/the-mole` | `mole_*` | Social deduction game with rounds, groups, voting |
| **BETR Guesser** | `/betr-guesser` | `betr_guesser_*` | Price guessing game with auto-close |
| **Jenga** | `/jenga` | `jenga_*` | Physics-based block removal (cannon-es) with turn timers |
| **NL Holdem** | `/nl-holdem` | `nl_holdem_*` | Real poker hand evaluation with stacks, hands, hole cards, actions |
| **Superbowl Squares** | `/superbowl-squares` | `superbowl_squares_*` | Grid squares claim game |
| **Superbowl Props** | `/superbowl-props` | `superbowl_props_*` | Prop bet submissions |
| **Weekend Game** | (API only) | `weekend_game_*` | Remix 3D Tunnel Racer scores, leaderboard, winner picks |
| **Bullied by BETR** | (API only) | `bullied_*` | Group game with voting, chat, heartbeat presence |
| **In or Out** | (API only) | `in_or_out_*` | Binary choice game with chat |
| **Take from the Pile** | (API only) | `take_from_the_pile_*` | Pick-based game with events and preloads |
| **Kill or Keep** | (API only) | `kill_or_keep_*` | Action-based game with chat |
| **Art Contest** | (API only) | `art_contest*` | Submission + winner selection |
| **Sunday High Stakes** | (API only) | `sunday_high_stakes*`, `poker_sunday_high_stakes_signups` | Timed signup window (30 min after `starts_at`) |
| **NCAA Hoops** | (API only) | `ncaa_hoops_*` | Bracket contest with picks, results, settlements |
| **Framedl BETR** | (redirect) | `remix_betr_*` | Score tracking for external Framedl game |

Additional tables: `lobby_presence`, `lobby_chat_messages`, `betr_games_registrations`, `betr_games_tournament_players`, `burrfriends_channel_feed_cache`, `feedback_tickets`, `admin_notification_prefs`, `admin_broadcasts`.

## Phased Implementation Pattern

Development follows numbered phases (currently at Phase 42+). Each phase adds a feature or game type. Phase numbers appear in code comments and git commit messages (e.g., `Phase 17.7 HEADS UP Steal or No Steal`, `Phase 36` for multi-community support). When making changes, note the current highest phase number and increment for new features.

Key phase landmarks:
- **Phase 12:** Framedl BETR integration
- **Phase 17:** Steal or No Steal, HEADS UP variant, YOU WIN timer, invite-only auto-signup, profile lazy-fill
- **Phase 19:** Lobby chat with staking cache
- **Phase 22:** BETR GAMES registration (removed staking requirement), tournament players
- **Phase 29:** Preview games with admin bypass, beta access
- **Phase 30:** Weekend Game (Tunnel Racer)
- **Phase 36:** Multi-community support (BETR + Minted Merch staking)
- **Phase 39:** Art Contest
- **Phase 42:** Sunday High Stakes

## Settlement System

Settlement sends BETR tokens (or other community tokens) to winners' wallets on Base.

**Core flow** (`src/lib/settlement-core.ts`):
1. `fetchBulkWalletAddressesForWinners(fids)` — Neynar lookup + reorder by staking balance
2. `selectWalletAddress(addrs)` — Picks the wallet with highest BETR stake (filters out known contract addresses)
3. `resolveWinners(winners, addressMap)` — Validates and pairs FIDs with addresses
4. `transferBETRToWinners(resolved, tokenAddress?)` — ERC-20 `transfer()` calls from master wallet

Multi-community (Phase 36): `reorderByStaking()` accepts a staking contract + function name, so settlement works for both BETR (`stakedAmount`) and Minted Merch (`balanceOf`).

Each game type has its own settle route (e.g., `/api/steal-no-steal/games/[id]/...`, `/api/buddy-up/games/[id]/end`). Poker games use `GameEscrow` contract with `settleGame()` for USDC distribution.

## Staking & Gating

Games can require minimum staked BETR to participate. Valid thresholds: 1M, 5M, 25M, 50M, 200M.

**`src/lib/staking.ts`:**
- `checkUserStakeByFid(fid, minAmount, community)` — Resolves all wallets via Neynar, sums staked amounts via RPC
- `checkStakeWithCache(fid, minAmount)` — Caches stake verification in `lobby_presence.stake_verified_at` (5-minute TTL) to avoid RPC rate limits
- Wallet address cache (10-minute TTL) reduces Neynar API calls

**Tournament staking multipliers** (constants.ts): Tier 1 (10M) = 2x, Tier 2 (50M) = 3x, Tier 3 (100M) = 4x, Tier 4 (200M) = 5x.

## Auto-Start / Auto-Close Patterns

Several game types have time-based automation:

- **Auto-start** (`betr-games-auto-start.ts`): Mole and Buddy Up games transition from `signup` → `in_progress` when `min_players` reached OR `signup_closes_at` passes. Configurable via `start_condition`: `min_players`, `at_time`, `whichever_first`.
- **Steal or No Steal auto-timeout** (`steal-no-steal-auto-close.ts`): Active matches with passed `decision_deadline` get status `timeout`. Winner depends on `briefcase_label`: `"YOU WIN"` → player_a wins, otherwise player_b wins.
- **BETR Guesser auto-close** (`betr-guesser-auto-close.ts`): Closes games past deadline.
- **Weekend Game auto-close** (`weekend-game-auto-close.ts`): Closes rounds past cutoff.

## Permissions & Admin

**Global admins** (`src/lib/permissions.ts`): Hardcoded FID allowlist in `GLOBAL_ADMIN_FIDS` (Plants 318447, siadude 273708, burr 311933, plus others). Single source of truth — add FID, deploy, done.

- `isGlobalAdmin(fid)` — checks the allowlist
- `isClubOwnerOrAdmin(fid, club)` — global admin OR club owner OR co-owner
- `isAdminPreviewBypass(fid, isPreview)` — lets admins play preview games without registration
- `canPlayPreviewGame(fid, isPreview, req)` — admin bypass OR beta cookie

**Admin pages:**
- `/admin/broadcast` — Send push notifications to subscribers
- Admin API routes: `/api/admin/status`, `/api/admin/blocks`, `/api/admin/betr-games-registrations`, `/api/admin/betr-usage`, `/api/admin/broadcast-history`, `/api/admin/notification-prefs`, `/api/admin/preview-games`

**BETR GAMES pre-approved FIDs**: ~50 FIDs in `BETR_GAMES_PRE_APPROVED_FIDS` get instant approval on registration.

## Database

All tables live in the `poker` schema (PostgREST header-based selection, NOT table name prefixes). Access exclusively through `pokerDb.ts` which enforces a table allowlist (~100 tables). Database writes use `SUPABASE_SERVICE_ROLE` (server-only).

## Notifications

Feature-flagged push notifications via Farcaster's native notification system. Subscriptions stored in `notification_subscriptions`. Admin broadcast history in `admin_broadcasts`. Constraints: title ≤ 32 chars, body ≤ 128 chars. Batched (max 100 tokens per request, 5s timeout).

## Caching

In-memory TTL cache (`src/lib/cache.ts`) with namespaces: `auth-profile` (10 min), `burr-casts` (10 min), `wallet-addr` (10 min), `fid-profiles` (15 min). On Vercel serverless, each instance has its own cache — helps with repeated requests on the same instance only.

## Key Constants

- **BETR token:** `0x051024B653E8ec69E72693F776c41C2A9401FB07`
- **BETR staking:** `0x808a12766632b456a74834f2fa8ae06dfc7482f1`
- **Minted Merch staking:** `0x38AE5d952FA83eD57c5b5dE59b6e36Ce975a9150`
- **USDC (Base):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Master wallet:** `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
- **ClubGG Club ID:** 87774
- **Farcaster channel:** /betr
- **Super owner FID:** 318447 (Plants)
- **Burr FID:** 311933
