# Neynar Credits & Webhooks — End-to-End Review and Optimization Plan

**Scope:** burrfriends app only. All call sites verified in code; no guesses.

**Source of truth:** `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` (Infrastructure → Neynar; Phase 8 feed; Phase 7.6 settlement batching; §10.3.5 signup profile cache).

**Do not edit code from this doc until you approve the plan.** This document only describes current usage and proposed changes.

---

## 0. Alignment with Source of Truth and Neynar Docs

- **SOT Infrastructure → Neynar:** Lists `NEYNAR_API_KEY` and usage: auth/verify, neynar-wallet, REMIX (submit, leaderboard, history, submitters), channel feed + cron, burr-casts, `/api/users`, `/api/users/bulk`, game results, payouts, JENGA start. This review’s §1 matches that and adds every verified call site.
- **SOT Phase 8 (feed):** “Only the cron job calls Neynar API” for the **channel feed** flow; GET `/api/burrfriends-feed` is read-only from cache. “Maximum 2 Neynar API calls per day” refers to the **scheduled cron** run (feed + channel stats). **Admin manual refresh** (`/api/admin/refresh-burrfriends-feed`) uses the same logic and adds 2 Neynar calls per manual trigger when used.
- **SOT Phase 7.6:** Settlement already uses batched `getBulkWalletAddresses` (one `fetchBulkUsers` per settle). No change needed.
- **SOT §10.3.5:** GET game for BUDDY UP/THE MOLE reads signups from DB and only calls Neynar for rows missing cached profile; admin “View all” modal is unchanged in UI. The **GET signups** API (used by that modal) is not specified in SOT as using the cache; it currently calls Neynar every time. Using the same cached columns there is a natural extension of the SOT pattern and does not change the modal contract (admin still sees PFP + name).
- **Neynar API (web):** `fetchBulkUsers` = GET `/v2/farcaster/user/bulk`, up to 100 FIDs per request (comma-separated). Credits pricing: [dev.neynar.com/pricing](https://dev.neynar.com/pricing); exact credit cost per call not stated in public docs. Rate limits are per-endpoint RPM (Starter 300, Growth 600, Scale 1200) and are separate from credits.
- **Webhook:** Neynar docs state that `verifyAppKeyWithNeynar` (used by `@farcaster/miniapp-node` for webhook verification) uses Neynar and requires `NEYNAR_API_KEY`. So verification may consume Neynar API credits per webhook event; confirm with Neynar if optimizing.

---

## 1. Neynar API Usage (Verified)

### 1.1 `fetchBulkUsers` (profiles and/or wallet data)

| Trigger | File(s) | When | Cached? | Notes |
|--------|---------|------|---------|--------|
| **Auth verify** | `api/auth/verify/route.ts` | Every token verification (app load, session check) | No | Optional enrichment (username, pfpUrl); auth succeeds even if Neynar fails. 1 call per verify. |
| **Users bulk** | `api/users/bulk/route.ts` | GET with `fids=...` | No | Called from: games/[id] (participants), the-mole (winners), BuddyUpV2Client (winners), BetrGamesRegistrationsListModal, ParticipantListModal, clubs/[slug] (single fid via ?fid=), games/[id]/manage. 1 call per request. |
| **Users POST** | `api/users/route.ts` | POST (SIWN / create user) | Writes to Supabase | 1 fetchBulkUsers then upsert; no read cache for GET (GET uses Supabase `getUserByFid` only). |
| **Buddy Up signup** | `api/buddy-up/signup/route.ts` | Per signup | Yes (DB) | Profile cached in `buddy_up_signups` (migration 35). 1 call per signup, then GET game reads from DB. |
| **The Mole signup** | `api/the-mole/signup/route.ts` | Per signup | Yes (DB) | Same as Buddy Up; cached in `mole_signups`. |
| **Buddy Up GET game** | `api/buddy-up/games/[id]/route.ts` | GET game when status=signup | Lazy backfill | Reads from DB; only calls Neynar for rows with missing cache, then updates DB. |
| **The Mole GET game** | `api/the-mole/games/[id]/route.ts` | GET game when status=signup | Lazy backfill | Same as Buddy Up. |
| **Buddy Up GET signups** | `api/buddy-up/games/[id]/signups/route.ts` | Admin: list all signups | No | Fetches signups from DB then fetchBulkUsers for all FIDs every time. |
| **The Mole GET signups** | `api/the-mole/games/[id]/signups/route.ts` | Admin: list all signups | No | Same. |
| **Buddy Up chat GET** | `api/buddy-up/.../groups/[groupId]/chat/route.ts` | GET messages | No | fetchBulkUsers for unique sender FIDs. |
| **Buddy Up chat POST** | Same | POST new message | No | fetchBulkUsers for sender FID (1 user). |
| **The Mole chat GET/POST** | `api/the-mole/.../groups/[groupId]/chat/route.ts` | Same pattern | No | Same as Buddy Up. |
| **Buddy Up rounds groups** | `api/buddy-up/.../rounds/[roundId]/groups/route.ts` | GET groups for round | No | fetchBulkUsers for all FIDs in groups. |
| **The Mole rounds groups** | `api/the-mole/.../rounds/[roundId]/groups/route.ts` | Same | No | Same. |
| **Buddy Up progress** | `api/buddy-up/games/[id]/progress/route.ts` | GET progress | No | fetchBulkUsers for FIDs. |
| **The Mole progress** | `api/the-mole/games/[id]/progress/route.ts` | Same | No | Same. |
| **Buddy Up my-group** | `api/buddy-up/games/[id]/my-group/route.ts` | GET my group | No | fetchBulkUsers for group FIDs. |
| **The Mole my-group** | `api/the-mole/games/[id]/my-group/route.ts` | Same | No | Same. |
| **Buddy Up history** | `api/buddy-up/history/route.ts` | GET history | No | fetchBulkUsers for winner FIDs. |
| **The Mole history** | `api/the-mole/history/route.ts` | Same | No | Same. |
| **Betr Guesser history** | `api/betr-guesser/history/route.ts` | GET history | No | fetchBulkUsers for FIDs. |
| **Betr Guesser guesses** | `api/betr-guesser/games/[id]/guesses/route.ts` | Admin: list guesses | No | fetchBulkUsers for guess FIDs. |
| **Remix BETR history** | `api/remix-betr/history/route.ts` | GET history | No | fetchBulkUsers for FIDs. |
| **Remix BETR submitters** | `api/remix-betr/submitters/route.ts` | Admin | No | fetchBulkUsers for FIDs. |
| **Remix BETR leaderboard** | `api/remix-betr/leaderboard/route.ts` | GET leaderboard | Yes (DB) | 30 min TTL in `remix_betr_leaderboard_cache`; only calls Neynar when cache stale. |
| **JENGA start** | `api/jenga/games/[id]/start/route.ts` | Admin starts game | Yes (DB) | One bulk fetch at start; profiles stored in `jenga_signups` (cached columns). |
| **Settlement (wallets)** | `neynar-wallet.ts` via `getBulkWalletAddresses` / `getAllPlayerWalletAddresses` | Settle flows | Batched | settle-contract uses getBulkWalletAddresses for winners; settlement-core same for BUDDY UP, REMIX, BETR GUESSER, JENGA. LPS uses getAllPlayerWalletAddresses (1 call). |
| **Staking** | `lib/staking.ts` → `getAllPlayerWalletAddresses(fid)` | Every stake check | No | 1 fetchBulkUsers per FID. Called from: betr-games/register, buddy-up/signup, the-mole/signup, jenga/signup, betr-guesser/submit, games/[id]/join (eligibility), notifications/broadcast (per subscriber when stakingMinAmount > 0). |
| **Payments recover** | `api/payments/recover/route.ts` | POST recover | No | getAllPlayerWalletAddresses(fid) — 1 call per recovery. |

### 1.2 Other Neynar APIs (not fetchBulkUsers)

| Trigger | File(s) | API | When | Cached? |
|--------|---------|-----|------|---------|
| **Cron refresh feed** | `api/cron/refresh-burrfriends-feed/route.ts` | Feed filter (parent_url) + lookupChannel or channel search | Once per day (cron); SOT: “2 Neynar API calls per refresh” | Yes: writes to `burrfriends_channel_feed_cache`; GET /api/burrfriends-feed reads only from cache. Admin manual refresh uses same logic (2 calls per trigger). |
| **Burr casts** | `api/burr-casts/route.ts` | `v2/farcaster/feed/user/casts?fid=BURR_FID` | Every GET (About page) | No |
| **Remix BETR submit (Path B)** | `api/remix-betr/submit/route.ts` | `lookupCastByHashOrWarpcastUrl` | When user submits with cast URL (not screenshot) | No |

### 1.3 Webhooks

| Item | File(s) | Behavior |
|------|---------|----------|
| **Farcaster Mini App webhook** | `api/farcaster/webhook/route.ts` | POST receives miniapp_added, notifications_enabled, etc. Verification uses `parseWebhookEvent(..., verifyAppKeyWithNeynar)` from `@farcaster/miniapp-node`. Neynar docs state this verification “uses Neynar” and requires `NEYNAR_API_KEY`, so it may consume API credits per event; confirm with Neynar if optimizing. |
| **Audit webhook** | `lib/audit-logger.ts` | Optional `ALERT_WEBHOOK_URL` — outbound only; not a Neynar consumer. |

---

## 2. High-Impact / High-Frequency Call Sites (No or Weak Caching)

1. **auth/verify** — 1 call per token verification (every app load / tab / session refresh). No cache.
2. **users/bulk** — 1 call per request. No cache; used on game pages, modals, admin.
3. **Buddy Up / The Mole signups (admin)** — GET signups calls fetchBulkUsers every time even though signup rows now have cached profile columns (migration 35); could read from DB first.
4. **Chat (GET/POST)** — fetchBulkUsers for senders on every chat load and every new message; no cache.
5. **Rounds groups, progress, my-group** — fetchBulkUsers every request; no cache.
6. **History endpoints** — fetchBulkUsers every request; no cache.
7. **Betr Guesser guesses (admin)** — no profile cache on guesses table; fetchBulkUsers every time.
8. **Staking** — 1 call per FID per check; no cache. Multiple flows (register, signup, join, broadcast filter) can each trigger a stake check.
9. **Burr casts** — 1 feed API call per About page visit; no cache.
10. **Remix BETR submit (Path B)** — 1 cast lookup per submit with cast URL.

---

## 3. Optimization Plan (No Functionality Break)

### 3.1 Auth verify — cache profile by FID (short TTL)

- **Current:** Every auth verify calls fetchBulkUsers for the single FID to return username/pfpUrl.
- **Change:** Add a small server-side cache (in-memory or Redis) keyed by FID with short TTL (e.g. 5–15 minutes). On verify, return cached username/pfpUrl if present and fresh; otherwise call Neynar and store in cache.
- **Why safe:** Auth still relies only on JWT; Neynar is optional enrichment. Stale profile for a few minutes is acceptable.
- **Implementation note:** If no Redis, use in-memory Map with TTL (evict on expiry); optional max size to avoid unbounded growth.

### 3.2 Users bulk — optional response cache (short TTL) or delegate to existing caches

- **Current:** Every GET /api/users/bulk?fids=... calls Neynar.
- **Change (A):** For call sites that are “game participants” or “signup list,” prefer using data that already has cached profiles (e.g. game participants from settle/signup flows that return profile from DB where available) so the client does not need to call /api/users/bulk for the same FIDs repeatedly. Where backend already returns profile in game/signup APIs, frontend should not duplicate with users/bulk for that same set.
- **Change (B):** Add optional short-TTL cache for /api/users/bulk responses keyed by sorted fids (e.g. 2–5 min). Reduces repeated identical requests (e.g. same game page refreshed).
- **Why safe:** Same FIDs within a few minutes return same data; slight delay in profile updates is acceptable for list UIs.

### 3.3 Buddy Up / The Mole GET signups (admin) — use cached profile columns

- **Current:** GET .../signups fetches rows from DB then calls fetchBulkUsers for all FIDs.
- **Change:** Read `username`, `display_name`, `pfp_url` from signup rows (migration 35). Call Neynar only for rows where cache is missing (username/pfp_url null); then update those rows so next time no Neynar call. Same pattern as GET game signups.
- **Why safe:** Same contract (admin sees PFP + name); backward compatible with old rows (lazy backfill).

### 3.4 Chat — cache sender profiles (per FID, short TTL or DB)

- **Current:** GET chat and POST message both call fetchBulkUsers for sender FIDs.
- **Change (A):** Add a small “chat sender profile” cache (e.g. FID → profile, TTL 10–30 min). On GET/POST, resolve from cache first; call Neynar only for cache miss, then store.
- **Change (B):** If you add a generic “profile cache” table (FID, username, display_name, pfp_url, updated_at), chat could read/write that and only call Neynar on miss (with periodic refresh or TTL). Larger change.
- **Why safe:** Sender names/PFPs in chat don’t need real-time updates; slight staleness is acceptable.

### 3.5 Rounds groups, progress, my-group — use DB caches where they exist or add short TTL

- **Current:** All call fetchBulkUsers for FIDs in the response.
- **Change:** Where the same FIDs already exist in tables with profile cache (e.g. signups, settlements), prefer returning from DB. Where no such table exists, consider a short-TTL profile cache (same as 3.1/3.4) keyed by FID to avoid repeated Neynar for same users across requests.
- **Why safe:** Consistency with “profile from DB when we have it; else Neynar + cache.”

### 3.6 History endpoints — short TTL or DB-backed profile cache

- **Current:** Buddy Up, The Mole, Betr Guesser, Remix BETR history all call fetchBulkUsers for winner/submitter FIDs every time.
- **Change:** Introduce a shared “profile cache” (table or short-TTL cache): FID → profile. History endpoints read from cache first; on miss call Neynar and store. Optionally prefill from existing caches (e.g. signups, leaderboard) where FIDs overlap.
- **Why safe:** History is not real-time; cached profiles for past winners/submitters are acceptable.

### 3.7 Betr Guesser guesses (admin) — optional profile cache table or short TTL

- **Current:** GET guesses fetches guess rows then fetchBulkUsers for all FIDs.
- **Change:** Either (A) add cached profile columns to `betr_guesser_guesses` (like signup profile cache) and fill at submit time + lazy backfill, or (B) use a shared FID profile cache (short TTL) so repeated admin views don’t re-call Neynar for same FIDs.
- **Why safe:** Admin list; slight staleness is fine.

### 3.8 Staking — cache wallet addresses by FID (short TTL)

- **Current:** Every stake check calls getAllPlayerWalletAddresses(fid) → fetchBulkUsers([fid]). Same user can be checked multiple times (register, signup, join, broadcast).
- **Change:** Cache “FID → list of wallet addresses” with short TTL (e.g. 5–15 min). Stake check: if cache hit, use cached addresses and run RPC only; if miss, call Neynar then cache. **Do not** cache “FID + minAmount → meetsRequirement” with a long TTL, or a user who just staked could get 403 for the duration of TTL. Optionally cache meetsRequirement with very short TTL (e.g. 1 min) if you accept that edge case.
- **Why safe:** Caching addresses only saves Neynar; eligibility is still computed from on-chain state each time, so users who just staked are not blocked.

### 3.9 Burr casts — cache response (short TTL)

- **Current:** Every GET /api/burr-casts calls Neynar user/casts.
- **Change:** Cache the response (e.g. in-memory or DB) with TTL 5–15 min. About page is low frequency; cache significantly reduces feed API calls.
- **Why safe:** About page doesn’t need real-time Burr casts.

### 3.10 Remix BETR submit (Path B) — no change or optional cache

- **Current:** One lookupCastByHashOrWarpcastUrl per submit with cast URL.
- **Change:** No change recommended unless you see high volume; cast lookup is required for verification. Optional: if same cast URL is resubmitted, could cache “url → cast” for a few minutes to avoid duplicate lookups (idempotency / retries).
- **Why safe:** Only optimize if metrics show meaningful usage of Path B.

### 3.11 Webhook verification

- **Current:** verifyAppKeyWithNeynar used per webhook event.
- **Change:** None until confirmed whether it uses Neynar API and how many credits. If Neynar confirms it does not use API credits, no change. If it does, consider rate-limiting or batching only if events are very frequent.
- **Why safe:** Verification is required for security; do not remove or weaken without Neynar guidance.

---

## 4. Admin /api/users?fids= vs ?fid=

- **Verified:** GET /api/users only reads query param `fid` (singular). Admin users page calls GET `/api/users?fids=${fids.join(',')}`. Backend does not read `fids`; it expects `fid`. So with `fids=1,2,3` the server gets no `fid` and returns 400. Effectively admin users page may not be loading profiles for multiple users correctly.
- **Recommendation:** Have admin users page call GET /api/users/bulk?fids=... (which supports multiple FIDs and one Neynar call) instead of GET /api/users?fids=.... Fixes behavior and uses a single batched Neynar call instead of N (if you had fixed backend to accept fids).

---

## 5. Summary: Recommended Order of Implementation

| Priority | Item | Effect | Risk |
|----------|------|--------|------|
| 1 | Use signup cached columns in GET signups (Buddy Up + The Mole) | Fewer Neynar calls on every admin signup list | Low |
| 2 | Cache auth/verify profile (FID, short TTL) | Fewer calls on every app load/session | Low |
| 3 | Cache /api/burr-casts response (short TTL) | Fewer feed API calls on About page | Low |
| 4 | Staking: cache wallet addresses or stake result by FID (short TTL) | Fewer calls for register/signup/join/broadcast | Low |
| 5 | Chat: cache sender profiles (FID, short TTL or DB) | Fewer calls on chat load/send | Low |
| 6 | History: shared profile cache (short TTL or DB) | Fewer calls on history views | Low |
| 7 | Optional: /api/users/bulk response cache (short TTL) | Fewer duplicate bulk requests | Low |
| 8 | Fix admin users page to use /api/users/bulk?fids=... | Correct behavior + one batch call | Low |
| 9 | Rounds/groups, progress, my-group: use DB cache where available or FID profile cache | Fewer repeated profile fetches | Low |
| 10 | Betr Guesser guesses: profile cache columns or shared cache | Fewer calls on admin guesses view | Low |

---

## 6. What Not to Change

- **Cron feed:** Already cached in DB; GET burrfriends-feed is read-only from cache. No change.
- **Remix leaderboard:** Already 30 min cache. No change.
- **JENGA start:** Already one bulk fetch and DB cache. No change.
- **Settlement batching:** Already uses getBulkWalletAddresses. No change.
- **Webhook verification:** Do not remove or weaken; only add caching/rate limits if Neynar confirms credit usage and it’s high.

---

---

## 7. Plan That Will Make This More Efficient (Summary)

**If you want to reduce Neynar usage without changing behavior, do the following in this order.**

1. **Use signup cached columns in GET signups (Buddy Up + The Mole)**  
   Admin “View all” signup list currently calls Neynar for every FID every time. The same tables now have `username`, `display_name`, `pfp_url` (migration 35). Have GET signups read those columns first and call Neynar only for rows with missing cache (then update cache), same as GET game. **Effect:** Fewer Neynar calls on every admin signup list open. **Risk:** Low; SOT pattern already used for GET game.

2. **Cache auth/verify profile by FID (short TTL, e.g. 5–15 min)**  
   Every token verification (app load, session check) currently does one fetchBulkUsers for the user’s FID. Add a small server-side cache (FID → username, pfpUrl) with short TTL. **Effect:** Far fewer Neynar calls on app load/tab refresh. **Risk:** Low; Neynar is optional enrichment; auth is JWT-only.

3. **Cache /api/burr-casts response (short TTL, e.g. 5–15 min)**  
   About page calls Neynar user/casts on every visit. Cache the JSON response. **Effect:** Fewer feed API calls. **Risk:** Low; About page doesn’t need real-time Burr casts.

4. **Cache staking: FID → wallet addresses (short TTL)**  
   Every stake check does getAllPlayerWalletAddresses(fid) → one fetchBulkUsers. Same user can be checked on register, signup, join, broadcast. Cache **FID → list of wallet addresses** with short TTL (e.g. 5–15 min); keep computing meetsRequirement from RPC each time so a user who just staked is not blocked. **Effect:** Fewer Neynar calls for repeated stake checks. **Risk:** Low. (If you cache meetsRequirement instead, use very short TTL e.g. 1 min to avoid blocking users who just staked.)

5. **Cache chat sender profiles (FID → profile, short TTL or DB)**  
   GET chat and POST message both call fetchBulkUsers for sender FIDs. Cache per FID. **Effect:** Fewer calls on chat load/send. **Risk:** Low; chat names/PFPs don’t need real-time updates.

6. **History endpoints: shared profile cache (short TTL or DB)**  
   Buddy Up, The Mole, Betr Guesser, Remix BETR history all call fetchBulkUsers every time. Use a shared FID → profile cache (or DB table) with read-through on miss. **Effect:** Fewer calls on history views. **Risk:** Low; history is not real-time.

7. **Optional: /api/users/bulk response cache (short TTL, keyed by sorted fids)**  
   Reduces duplicate identical bulk requests (e.g. same game page refreshed). **Effect:** Fewer duplicate bulk calls. **Risk:** Low.

8. **Fix admin users page to use /api/users/bulk?fids=...**  
   Page currently calls GET `/api/users?fids=...`; the backend only supports `?fid=`. Use GET `/api/users/bulk?fids=...` so multiple users load correctly with one batched Neynar call. **Effect:** Correct behavior + one batch instead of N. **Risk:** Low.

9. **Rounds/groups, progress, my-group:** Use DB profile where available (e.g. signups), else shared FID profile cache. **Effect:** Fewer repeated profile fetches. **Risk:** Low.

10. **Betr Guesser guesses (admin):** Either add profile cache columns (like signups) and fill at submit + lazy backfill, or use shared FID profile cache. **Effect:** Fewer calls on admin guesses view. **Risk:** Low.

**Do not change:** Cron feed (already DB cache); Remix leaderboard (30 min cache); JENGA start (DB cache); settlement batching; webhook verification (do not weaken; only add caching/limits if Neynar confirms credit usage).

---

## 8. Double-check: Will this break anything?

Each item was checked against the codebase; the plan is safe if implemented as described.

| Item | Verification | Break risk |
|------|--------------|------------|
| **1. GET signups use cache** | Response shape is already `{ fid, signed_up_at, username, display_name, pfp_url }`. GET game (buddy-up/games/[id], the-mole/games/[id]) uses the same pattern: read rows (with cached columns from migration 35), needHydrate = rows where `username == null && pfp_url == null`, fetch only those FIDs from Neynar, update DB, then merge cached + hydrated into response. Reusing that pattern in GET signups keeps the same contract. No behavior change. | None |
| **2. Auth verify cache** | Auth success is JWT-only; Neynar only enriches username/pfpUrl. Cache hit returns same data; cache miss calls Neynar and stores. Stale profile for TTL is acceptable. **Note:** In-memory cache on Vercel serverless is per-instance (cold starts get empty cache); savings are best when the same instance serves repeated verifies, or use Redis for shared cache. | None |
| **3. Burr casts cache** | Response is read-only for About page; caching for 5–15 min does not change UX contract. | None |
| **4. Staking cache** | **Recommendation:** Cache **FID → wallet addresses** only (TTL 5–15 min), and keep computing `meetsRequirement` from RPC each time. That way you save the Neynar call but a user who just staked is not blocked (eligibility is recomputed from on-chain state). If you instead cache **FID + minAmount → meetsRequirement**, use a very short TTL (e.g. 1 min) or accept that a user who just staked may get 403 for up to TTL. | Low if you cache addresses only; medium if you cache meetsRequirement with long TTL |
| **5. Chat cache** | Sender PFP/name for TTL may be stale; acceptable for chat. | None |
| **6. History cache** | Past winners/submitters; staleness acceptable. | None |
| **7. Users/bulk cache** | Same fids within TTL return same response; slight staleness. | None |
| **8. Admin users → /api/users/bulk** | GET /api/users only supports `?fid=`. Admin page currently calls `?fids=...`, so backend gets no `fid` and returns 400; profiles do not load. Switching to GET /api/users/bulk?fids=... fixes the bug and returns one batched result. Response shape of users/bulk (array of { fid, username, display_name, avatar_url }) is compatible with admin page’s use (it maps to profilesMap by fid). | None (fixes current bug) |
| **9. Rounds/groups, progress, my-group** | For Buddy Up / The Mole, group members are signups for that game; signup rows already have cached profile columns. Prefer reading profile from signups table for that game; only call Neynar for FIDs not present in signups (edge case). | None |
| **10. Betr Guesser guesses** | Either add profile columns (like signups) with submit-time fill + lazy backfill, or use shared FID cache. Admin list; staleness acceptable. | None |

---

## 9. Is this the best plan?

- **Order:** Priorities 1–10 are ordered by impact and lowest risk first. Item 1 (GET signups cache) reuses the exact pattern already used in GET game and requires no new infra. Item 8 (admin users fix) fixes a real bug and should be done regardless of credits.
- **Staking (item 4):** Best approach is to cache **wallet addresses by FID** only, not the stake result, so eligibility is always recomputed from RPC and users who just staked are not delayed.
- **In-memory vs Redis:** For auth, chat, history, users/bulk, and burr-casts, in-memory cache helps when the same serverless instance serves repeated requests. For cross-instance savings, use Redis or a shared store; the plan does not require it.
- **Scope:** The plan does not change any API contract, remove any feature, or weaken security. It only reduces Neynar calls by using existing DB caches, adding short-TTL caches, or fixing the admin users call.

**Document version:** 1.2  
**Next step:** Review this plan; then implement in the order above (or subset) and run tests. No code edits were made in this review.
