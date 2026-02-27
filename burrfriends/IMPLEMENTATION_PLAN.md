# Poker Lobby Mini App — Cursor Implementation Plan (Warpcast MVP)

## 0) Objectives / Non-Goals

### Objectives (MVP)
- Warpcast-first mini app
- Every user must be authenticated (auto-attempt on launch)
- Users can: see games → pay buy-in → unlock shared ClubGG username/password
- Real money among friends; assume good actors but implement basic safety/idempotency
- Exactly 1 fixed buy-in per game
- Clubs cannot be created in-app; only app owner can add clubs via code/seed

### Non-Goals (v1)
- Notifications (prepare for v2 but don't build)
- Club owner adding admins (v2)
- Base app support (bonus later; architecture should not block it)

---

## 1) Hard Architecture Decisions

### 1.1 Auth (Replace SIWN)

**Use Farcaster Mini App Quick Auth JWT as the only trusted identity.**

- **Frontend:** attempt `sdk.quickAuth.getToken()` on load (user may need to approve once)
- **Backend:** verify JWT and derive fid
- All sensitive endpoints require verified fid
- **Do not rely on localStorage for identity;** localStorage may cache UI state only

### 1.2 Data Isolation (Do NOT touch Catwalk tables)

**Create a separate Postgres schema `poker` in Supabase.**
- All Poker tables live under `poker.*`
- Existing `public.*` (catwalk) remains unchanged

### 1.3 Permissions

- **Global admins (hardcoded allowlist):** plants / burr / tormental (the 3 FIDs already in code)
- **Club owner (stored in DB):** can add/remove members for that club
- **Member:** can view/join/pay/unlock credentials for games in that club
- **No UI/API to create clubs.** Clubs are seeded/managed only by service role scripts/code

### 1.4 Credentials Unlocking

- Shared ClubGG credentials per game (same for all paid participants)
- Store encrypted at rest (AES-GCM) with a server-only key in env
- Reveal only if participant is paid (and member of club)

### 1.5 Payment correctness

- Confirm-payment endpoint must be idempotent
- Enforce uniqueness constraints to prevent double payment crediting
- Keep existing on-chain verification logic; it gates paid transition

---

## 2) Supabase Schema (Basic, Safe)

### 2.1 SQL Migration: create schema + tables

**Create poker schema + minimal tables (avoid any change to public.*).**

#### Tables
- `poker.clubs`
- `poker.club_members`
- `poker.games`
- `poker.participants`
- `poker.audit_log` (optional if you want poker-scoped audit, or reuse existing logger sink)

#### Key constraints
- `club_members`: unique (club_id, fid)
- `participants`: unique (game_id, fid)
- `participants`: unique (game_id, tx_hash) where tx_hash not null

### 2.2 RLS posture (keep simple for MVP)

**To minimize risk and complexity:**
- Use service role server-side for all poker writes/reads via API routes
- No direct client access to `poker.*` tables

---

## 3) API Contracts (Authoritative)

### 3.1 Auth

**POST /api/auth/verify**
- Request: `{ token: string }`
- Response: `{ fid: number, username?: string, pfpUrl?: string }`
- Server verifies JWT and returns trusted FID; may hydrate profile via Neynar (optional)

**Create server helper:**
- `requireAuth(req): Promise<{ fid: number }>`
- Reads Authorization header `Bearer <token>` or body `token` (pick one and standardize)

### 3.2 Games

**GET /api/clubs/:clubId/games**
- Auth required; returns only games for clubs where fid is a member (or admin)

**POST /api/games/:gameId/join**
- Auth required; creates participant row with status `joined` if missing

**POST /api/games/:gameId/confirm-payment**
- Auth required
- Request: `{ txHash: string, currency: "ETH"|"USDC" }`
- Server:
  - verifies on-chain payment -> expected contract call / transfer
  - writes `participants.status = "paid"`, sets `tx_hash`, `paid_at`
  - **idempotent:** if already paid with same tx hash, return success; if paid with different tx hash, reject

**GET /api/games/:gameId/credentials**
- Auth required
- Checks:
  - user is club member (or admin)
  - participant exists and status is `paid`
- Returns decrypted `{ clubggUsername, clubggPassword }`

### 3.3 Membership management

**POST /api/clubs/:clubId/members/add**
- Auth required
- Only club owner or global admin
- Request: `{ fid: number }`

**POST /api/clubs/:clubId/members/remove**
- Auth required
- Only club owner or global admin
- Request: `{ fid: number }`

### 3.4 Clubs (no creation)

No endpoints for club creation.
Clubs added via seed script or code-only admin script.

---

## 4) Frontend Behavior (Warpcast MVP)

### 4.1 Auto-login

**On app mount:**
1. call `sdk.actions.ready()` (already implemented)
2. call `sdk.quickAuth.getToken()`:
   - if token returned: call `/api/auth/verify` and store token in memory/sessionStorage
   - if not in mini app or fails: show a "Sign in" button that retries `getToken()`
3. Also use `sdk.context.user` only for display while auth is loading

### 4.2 End user flow

1. List games (member-filtered)
2. Join game
3. Pay buy-in (existing payment button flow)
4. Confirm payment (server verifies on chain)
5. Unlock credentials (calls `/credentials`)

### 4.3 Admin flow (v1)

Global admin / club owner:
- Add/remove members
- Create games (if this exists already, ensure it uses `poker.games` only)
- Refund/settle (if enabled v1; keep behind global admin allowlist)

---

## 5) Encryption Details (shared creds per game)

**Implement AES-GCM utility server-side only:**
- env: `POKER_CREDS_ENCRYPTION_KEY` (32 bytes base64)
- store per-game:
  - `creds_ciphertext` (base64)
  - `creds_iv` (base64)
  - `creds_version` (int)

Encrypt on game creation/update.
Decrypt only in `/credentials` endpoint.

---

## 6) State Machine / Idempotency Rules (must enforce)

**Participant statuses:**
- `joined` → `paid` → (`refunded` | `settled`)

**Rules:**
- cannot go paid twice
- cannot reveal credentials unless paid
- `confirm-payment`:
  - if already paid with same tx_hash: return success
  - if already paid with different tx_hash: reject
- refund/settle endpoints require admin permissions and must be idempotent

---

## 7) Implementation Order (Cursor Task List)

### Task 1 — Create poker schema + tables
- Add SQL migration for `poker.*` tables + constraints
- Update code to reference poker schema explicitly (`supabaseAdmin.schema('poker')`)

**Acceptance:**
- No changes to `public.*`
- `poker.*` tables exist and constraints apply

### Task 2 — Implement Quick Auth backend + requireAuth
- Add `/api/auth/verify`
- Add `requireAuth()` helper used by all poker routes
- Remove/disable SIWN endpoints from critical path

**Acceptance:**
- Can retrieve trusted fid via token in Warpcast mini app
- Any poker API call without valid token returns 401

### Task 3 — Wire frontend auto-login
- Replace SignInButton logic with Quick Auth
- Store token in sessionStorage or memory
- Show graceful "retry sign in" if needed

**Acceptance:**
- In Warpcast, user lands and is authenticated (one approval at most)
- Preview tool limitations are irrelevant; don't optimize for preview

### Task 4 — Migrate API routes to poker schema + permission gates
- Ensure all poker endpoints use `poker.*` tables only
- Implement membership checks for game list/join/credentials

**Acceptance:**
- A non-member cannot view club games or unlock creds
- Club owner/admin can manage members

### Task 5 — Credentials encryption + reveal endpoint
- Add AES-GCM utils
- Encrypt at game create time
- Add `/credentials` endpoint

**Acceptance:**
- DB never stores plaintext ClubGG password
- Paid user can retrieve creds; unpaid user cannot

### Task 6 — Payment confirm idempotency + constraints
- Confirm-payment endpoint: verify on-chain, then transition participant to paid
- Add unique constraints and handle conflicts

**Acceptance:**
- Same txHash can't credit multiple participants
- Same participant can't be marked paid twice

### Task 7 — Seed script (code-only club creation)
- Create `scripts/seedPokerClubs.ts` + `scripts/seedPokerMembers.ts`
- Inputs: JSON list of clubs and member FIDs

**Acceptance:**
- Running script creates clubs + members in `poker.*`
- No runtime UI for club creation

### Task 8 — E2E Warpcast manual test checklist
- Create game → join → pay → confirm → unlock creds
- Admin: add member → member sees games

**Acceptance:**
- MVP flow works end-to-end in Warpcast

---

## 8) Explicit "Do Not Break Catwalk" Guardrails

- Never run `ALTER TABLE public.*` in poker migrations
- Never reuse existing `public.clubs`, `public.games`, etc.
- Add code-level lint/grep rule: `from('clubs')` must be `schema('poker').from('clubs')` in poker service layer

---

## 9) Open items for Cursor (assume defaults)

- Currency model: keep your existing amounts library; store buy_in as numeric plus currency
- Club list: maintained in code/seed only
- Admin allowlist: keep as env or constants

