# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo containing multiple Farcaster Mini Apps built with Next.js 15 (App Router). The primary active app is the **poker** (Giveaway Games) mini app. Other sub-projects include **basketball** and the root **catwalk** app.

### Sub-projects

- **`poker/`** — "Giveaway Games" mini app. Club-based games on ClubGG with USDC entry fees, giveaway wheel, NFT/token prizes, and on-chain settlement on Base. This is the most actively developed app.
- **`basketball/`** — Basketball simulation mini app with seasons, rosters, game plans.
- **Root (`/`)** — "Catwalk" daily check-in app (original starter template).
- **`burrfriends/`** — Git submodule (legacy name for the poker app).

## Build & Dev Commands

### Poker app (primary)
```bash
cd poker
npm install
npm run dev          # Next.js dev server
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Playwright e2e tests
npm run test:smoke   # Smoke test script (tsx scripts/smoke-test.ts)
```

### Root catwalk app
```bash
npm run dev          # Uses scripts/dev.js
npm run build        # next build
npm run lint         # next lint
```

### Utility scripts (poker)
```bash
npm run seed:clubs           # tsx scripts/seed-clubs.ts (idempotent)
npm run seed:members         # tsx scripts/seed-members.ts
npm run cleanup:burrfriends  # tsx scripts/cleanup-burrfriends.ts
```

## Architecture

### Tech Stack
- **Framework:** Next.js 15.5.9, React 19, TypeScript 5, App Router
- **Styling:** Tailwind CSS 3.4 with custom fire/ember design tokens (CSS variables in `globals.css`)
- **Database:** Supabase PostgreSQL via PostgREST (not the Supabase JS client)
- **Auth:** Farcaster Quick Auth (JWT-based, `@farcaster/quick-auth`)
- **Blockchain:** Ethers.js 6 on Base network (chain ID 8453), USDC payments
- **Farcaster SDK:** `@farcaster/miniapp-sdk` for mini app lifecycle
- **API client:** Neynar SDK for Farcaster user data
- **Testing:** Vitest (unit), Playwright (e2e)
- **Deploy:** Vercel

### Poker App Structure (`poker/src/`)

**Path alias:** `~/*` maps to `./src/*` (configured in tsconfig.json)

**`app/`** — Next.js App Router pages and 40+ API routes
- `app/api/auth/verify/` — JWT token verification endpoint
- `app/api/games/` — CRUD, join, cancel, results, payouts, spin wheel
- `app/api/payments/` — Prepare, confirm, recover USDC payments
- `app/api/clubs/` — Club management
- `app/api/notifications/` — Push notification subscribe/broadcast
- `app/api/admin/` — Admin operations
- `app/clubs/[slug]/games/` — Main game listing page
- `app/games/[id]/` — Game detail page

**`lib/`** — ~35 utility modules organized by domain:
- `pokerDb.ts` — Central DB access layer. PostgREST wrapper with table allowlist safety rail. Uses `poker` schema via headers (NOT `poker.tablename` in URL).
- `auth.ts` — JWT verification via Quick Auth. FID extracted only from verified tokens, never from client input.
- `constants.ts` — All env var access and app constants centralized here.
- `payment-verifier.ts` — Verifies USDC Transfer events on Base chain.
- `contract-ops.ts` / `contracts.ts` — Smart contract interactions (game escrow, prize distribution).
- `games.ts` / `game-registration.ts` / `game-creation.ts` — Game logic and registration windows.
- `permissions.ts` — Club owner/admin authorization checks.
- `neynar.ts` — Farcaster user data hydration.
- `crypto/credsVault.ts` — ClubGG credentials encryption/decryption.
- `eligibility.ts` — Game eligibility (token gating, NFT checks).
- `notifications.ts` — Push notification management.
- `authedFetch.ts` — Client-side authenticated fetch wrapper with auto-retry.

**`components/`** — ~19 React components
- `AuthProvider` / `AuthProviderWrapper` — Context-based auth state (stores JWT in sessionStorage as `pokerAuthToken`)
- `MiniAppInitializer` — Calls `sdk.actions.ready()`
- `PaymentButton` / `PaymentButtonWrapper` — USDC payment flow

### Database

Supabase PostgreSQL using a dedicated `poker` schema. Access is through `pokerDb.ts` which wraps PostgREST REST calls with service role auth. Key tables: `clubs`, `club_members`, `games`, `participants`, `game_results`, `payouts`, `game_requests`, `game_prizes`, `audit_log`, `notification_subscriptions`, `user_blocks`.

### Auth Flow
1. Client: `sdk.quickAuth.getToken()` from Farcaster mini app SDK
2. Token stored in `sessionStorage` as `pokerAuthToken`
3. API routes: `requireAuth(req)` verifies JWT, extracts FID from `payload.sub`
4. FID must only come from verified JWT — never trust client-supplied FID

### Key Conventions
- ESLint allows `@ts-ignore`, `no-explicit-any`, and unused vars prefixed with `_`
- `SUPER_OWNER_FID` (318447) has admin access to all clubs
- Blockchain operations target Base mainnet (chain 8453) with USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- PostgREST schema selection uses headers (`Accept-Profile: poker`, `Content-Profile: poker`), not table prefixes in URLs
