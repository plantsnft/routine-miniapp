# BETR GAMES Registration: 50M Staking Requirement — Implementation Plan

**Objective:** Restrict BETR GAMES registration to users with **at least 50 million BETR staked**. Clear the existing registration list first, then enforce the staking check so the flow is correct end-to-end and nothing breaks.

**Scope:** Burrfriends app only. No changes to poker app.

**Plan verification (no guessing):** This plan was checked against the live codebase. Verified: (1) POST register route has no staking check and returns only 200 or 500/401; (2) Bar and clubs page both call POST then throw on !res.ok, so 403 today would show generic error — both must branch on 403 + `data.data.reason` before throwing; (3) Modal receives only `error: boolean` today, so it needs new props for insufficient-stake; (4) JENGA only calls GET status, not POST; (5) `checkUserStakeByFid` returns `{ meetsRequirement, stakedAmount }` and does not throw (fail closed); (6) Downstream routes (buddy-up signup, remix-betr submit, etc.) only check “in table,” no code change; (7) ApiErrorResponse allows `[key: string]: unknown` so adding `data` on 403 is valid.

---

## 1. Source of truth and existing behavior

### 1.1 Current behavior

- **Table:** `poker.betr_games_registrations` (one row per FID). Migration: `supabase_migration_betr_games_registrations.sql`. Doc: **BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md** Phase 10 (§10.1–10.12).
- **POST /api/betr-games/register:** Auth via `requireAuth(req)` → FID. If row exists → `{ ok: true, data: { registered: true, alreadyRegistered: true } }`. Else INSERT `(fid, source)` → `{ ok: true, data: { registered: true, alreadyRegistered: false } }`. No staking check today.
- **GET /api/betr-games/register/status:** Returns `{ ok: true, data: { registered } }` from presence of row for that FID.
- **Downstream:** REMIX BETR submit, BUDDY UP signup, JENGA signup, THE MOLE signup, BETR GUESSER submit, and spectator/state endpoints all require the user to be in `betr_games_registrations` (fetch by FID, limit 1). Notifications (game created/start) use intersection of `betr_games_registrations` and enabled subscriptions.

### 1.2 Staking stack (already used for games)

- **Constants:** `src/lib/constants.ts` — `VALID_STAKING_THRESHOLDS` includes `50_000_000` (50M). `BETR_STAKING_CONTRACT_ADDRESS`, `BASE_RPC_URL`.
- **Staking check:** `src/lib/staking.ts` — `checkUserStakeByFid(fid, minAmount)` returns `{ hasStake, stakedAmount, meetsRequirement, checkedAddresses }`. Uses Neynar for wallets, then RPC to staking contract; sums stake across all wallets.
- **Eligibility (games):** `src/lib/eligibility.ts` — `canUserJoinGame(fid, game, …)` uses `checkUserStakeByFid(fid, game.staking_min_amount)` when `gating_type === 'stake_threshold'`. Same pattern can be reused for registration: call `checkUserStakeByFid(fid, 50_000_000)` before allowing INSERT.

No new migrations are required for the table; the schema stays as-is.

---

## 2. Step 1 — Clear existing registrations

**What:** One-time removal of all rows from `poker.betr_games_registrations`.

**Why:** So the “who can play BETR GAMES” list reflects only users who registered under the new 50M rule.

**How:**

1. **Optional backup:** If you need a historical snapshot, run first:
   - `GET /api/admin/betr-games-registrations?format=csv&limit=50000` (as admin) and save the response, or
   - In Supabase SQL Editor: create a backup table and copy, e.g.  
     `CREATE TABLE poker.betr_games_registrations_backup_YYYYMMDD AS SELECT * FROM poker.betr_games_registrations;`
2. **Clear table:** In Supabase SQL Editor (service role / project with access to `poker` schema):
   ```sql
   DELETE FROM poker.betr_games_registrations;
   ```
3. **Verify:** `SELECT COUNT(*) FROM poker.betr_games_registrations;` → 0.

**When to run:** See **Order of operations** (§6). Recommended: **after** deploying the code that adds the 50M check (so that from the moment the table is empty, only users with ≥50M can register).

---

## 3. Step 2 — Backend: enforce 50M staking on registration

**File:** `src/app/api/betr-games/register/route.ts`

**Logic (add before the existing “already registered” check):**

1. After `requireAuth(req)` → `fid`.
2. **Staking check:** Call `checkUserStakeByFid(fid, BETR_GAMES_REGISTRATION_MIN_STAKE)`.
   - **Constant:** Define `BETR_GAMES_REGISTRATION_MIN_STAKE = 50_000_000` in `src/lib/constants.ts` (and document that it must be one of `VALID_STAKING_THRESHOLDS` for consistency).
3. If `!stakeCheck.meetsRequirement`:
   - Return **403** with a JSON body that the frontend **must** use to show the insufficient-stake state (see Step 4). Use this exact shape so both the bar and clubs page can branch on it:
     - `NextResponse.json({ ok: false, error: "Insufficient stake. Registration requires at least 50 million BETR staked.", data: { reason: 'insufficient_stake', requiredAmount: 50_000_000, stakedAmount: stakeCheck.stakedAmount } }, { status: 403 })`.
   - `stakeCheck.stakedAmount` is a **string** (human-readable BETR amount from `formatUnits` in staking.ts).
   - Do **not** INSERT; do not modify the table.
4. If `stakeCheck.meetsRequirement`, continue with existing logic: check existing row → if exists return `alreadyRegistered: true`, else INSERT and return `registered: true, alreadyRegistered: false`.

**Error handling:** Keep existing 401 for auth failures and 500 for unexpected errors. Treat “insufficient stake” as 403 only. `checkUserStakeByFid` does **not** throw; on failure (e.g. Neynar or RPC error) it returns `meetsRequirement: false` (fail closed), so the user gets 403 when we cannot verify stake — acceptable.

**Idempotency:** Unchanged. Second POST for same FID still returns success + `alreadyRegistered: true` without a second INSERT.

**Optional optimization:** Check “existing row” **before** the staking check; if the user is already registered, return success + `alreadyRegistered: true` without calling `checkUserStakeByFid`. This saves Neynar + RPC on re-click. If you do this, the gate is still enforced for every **new** registration.

---

## 4. Step 3 — GET /api/betr-games/register/status (optional enhancement)

**Current:** Returns only `{ registered: boolean }`.

**Optional (Phase 1 or later):** Add a pre-check for “can this user register?” so the UI can show “50M BETR staked required” even before they click:

- Call `checkUserStakeByFid(fid, 50_000_000)` when the user is not registered.
- Return e.g. `data: { registered, meetsStakingRequirement?, stakedAmount? }` when not registered so the bar/modal can show “You need 50M BETR staked to register” or “You have X BETR staked; 50M required.”

**Not required for correctness:** The POST already blocks insufficient stake with 403. This step is UX-only.

---

## 5. Step 4 — Frontend: bar, clubs page, and modal

**Files:** `src/components/RegisterForBetrGamesBar.tsx`, `src/app/clubs/[slug]/games/page.tsx` (handleBetrGamesRegister), `src/components/RegisterForBetrGamesModal.tsx`.

**Current behavior (verified):** Both the bar and the clubs page call `POST /api/betr-games/register`, then `if (!res.ok || !data?.ok) throw new Error(...)`. On any non-2xx (including 403), they throw and in `catch` set `error={true}` and open the modal. The modal then shows the **generic** error: “Registration failed. Something went wrong. Please try again.” It has **no** access to the response body (reason, stakedAmount) because the code throws before branching on status.

**Required change:** Both call sites must **not** treat 403 insufficient-stake as a generic error. They must branch on the response **before** throwing:

1. After `const data = await res.json()` (or `.catch(() => null)`), check `res.status === 403` and `data?.data?.reason === 'insufficient_stake'` (the API will return this shape; see Step 2).
2. If true: set state for “insufficient stake” (e.g. `errorReason: 'insufficient_stake'`, `stakedAmount: data?.data?.stakedAmount`), open the modal with these props, and **do not** throw. Do **not** set `registered` to true.
3. If false (other 4xx/5xx or network error): keep current behavior — throw, then in catch set `error={true}` and open modal (generic error).

**RegisterForBetrGamesBar** (handleClick): add the 403 + insufficient_stake branch before the existing `if (!res.ok || !data?.ok) throw ...`. Pass `errorReason` and `stakedAmount` into `RegisterForBetrGamesModal`.

**Clubs page** (handleBetrGamesRegister): same logic. The clubs page uses the same `RegisterForBetrGamesModal` and has its own state (`betrGamesModalError`, etc.). Add state for insufficient-stake (e.g. `betrGamesModalErrorReason`, `betrGamesModalStakedAmount`) or a single “insufficient stake” object, and pass to the modal. When 403 + insufficient_stake, set those and open the modal; do not set `betrGamesModalError(true)` for that case.

**RegisterForBetrGamesModal:**

- Add props: `errorReason?: 'generic' | 'insufficient_stake'` (or derive from a single “insufficient stake” payload), `stakedAmount?: string`. Both optional so existing call sites (e.g. JENGA) can omit them.
- **Modal display logic (order matters):** (1) If `errorReason === 'insufficient_stake'` → show insufficient-stake title and body (ignore `error` for this case). (2) Else if `error === true` → show generic error (“Registration failed. Something went wrong. Please try again.”). (3) Else → show success.
- When `errorReason === 'insufficient_stake'`: **Title** e.g. “Registration requires 50M BETR staked.” **Body:** If `stakedAmount` is provided, “You have {stakedAmount} BETR staked. At least 50 million BETR staked is required to register.” Otherwise: “You need at least 50 million BETR staked to register for BETR GAMES.”
- `stakedAmount` from the API is a **string** (human-readable, from `formatUnits` in staking.ts).
- **State hygiene:** When the bar or clubs page opens the modal for **success** or **generic error**, clear or do not set `errorReason`/`stakedAmount` so the modal does not show stale insufficient-stake UI on the next open. When opening for insufficient_stake, set `error=false` (or do not set `error=true`) and set `errorReason='insufficient_stake'`, `stakedAmount=...`.

**JENGA:** JENGA uses the same modal but only passes `isOpen`, `onClose`, `alreadyRegistered`, `error={false}`. It **never** calls POST register (only GET status). The “Register for BETR GAMES” button on JENGA just opens the modal; registration itself is done on the bar or clubs page. So JENGA does not need to handle 403 or pass `errorReason`/`stakedAmount`; the new props are optional and default to undefined. No change needed on JENGA once the modal accepts the new optional props.

**Optional:** Add helper text near the register button (bar and/or clubs overlay): “50M BETR staked required.”

---

## 6. Order of operations (recommended)

To avoid a window where the table is empty but the API still allows anyone to register:

1. **Deploy** the backend and frontend changes (50M check in POST, 403 response, frontend handling of insufficient stake, optional status enhancement and bar copy).
2. **Then** run the one-time `DELETE FROM poker.betr_games_registrations` in Supabase.

Result:

- From deploy onward, only users with ≥50M staked can register.
- After the DELETE, the list contains only post-change registrations; no one is grandfathered without the staking check.

**Alternative:** Run DELETE first, then deploy. Then until deploy completes, no one can register (table empty, INSERT still succeeds for anyone). Less clean; not recommended.

---

## 6.1 End-to-end flow (verified against code)

**Path A — User has ≥50M BETR staked, not yet registered (after clear):**

1. User sees “Register for BETR GAMES” (bar or clubs overlay). Clicks.
2. Bar or clubs page calls `POST /api/betr-games/register` with auth.
3. API: `requireAuth` → fid. `checkUserStakeByFid(fid, 50_000_000)` → meetsRequirement true. No row yet → INSERT. Return 200, `{ ok: true, data: { registered: true, alreadyRegistered: false } }`.
4. Bar/clubs: `res.ok` true, set registered true, open modal with success + “You’re not already on the list.” User is in the table; they can now sign up for games, submit REMIX BETR, etc.

**Path B — User has &lt;50M BETR staked:**

1. User sees “Register for BETR GAMES”. Clicks.
2. Bar or clubs page calls `POST /api/betr-games/register`.
3. API: requireAuth → fid. checkUserStakeByFid → meetsRequirement false. Return **403** with `{ ok: false, error: "...", data: { reason: 'insufficient_stake', requiredAmount: 50_000_000, stakedAmount: "12.5" } }`. No INSERT.
4. Bar/clubs: **must** check `res.status === 403` and `data?.data?.reason === 'insufficient_stake'` **before** throwing. Then open modal with errorReason = 'insufficient_stake', stakedAmount = "12.5". Modal shows “Registration requires 50M BETR staked.” and “You have 12.5 BETR staked. At least 50 million BETR staked is required to register.” User does **not** see generic “Something went wrong.”

**Path C — After table clear, user had been registered but has &lt;50M:**

1. GET status returns `registered: false` (row gone). User sees “Register for BETR GAMES”.
2. User clicks; POST runs; staking check fails → 403 as in Path B. Modal shows insufficient-stake copy. No row inserted. Correct.

**Path D — Downstream (e.g. BUDDY UP signup) for user not in table:**

1. User (not in betr_games_registrations) tries to sign up for a BUDDY UP game.
2. `POST /api/buddy-up/signup` fetches betr_games_registrations by fid; empty → returns 403 “Register for BETR GAMES first.” No change to that route; it only checks “in table.” Correct.

**Edge cases (verified):**

- **Bar:** `res.json()` is called without `.catch()`; if the server returns 403 with valid JSON, `data` is the body. If the server returns invalid JSON, `res.json()` throws and we land in catch (generic error). So the 403 branch must run only when we have parsed `data` and `res.status === 403` and `data?.data?.reason === 'insufficient_stake'`.
- **Clubs page:** `res.json().catch(() => null)` — if parse fails, `data` is null; then `data?.data?.reason === 'insufficient_stake'` is false, so we fall through to throw (generic error). Correct.
- **Modal:** Checking `errorReason === 'insufficient_stake'` **before** `error` ensures that when we open for insufficient_stake with `error=false` and `errorReason='insufficient_stake'`, the modal shows the 50M copy, not success or generic error.
- **Backend:** The 403 is returned only from the staking check branch. The route never returns 403 for “already registered”; that remains 200 with `alreadyRegistered: true`.

---

## 7. Downstream and side effects (no code changes needed)

| Area | Effect |
|------|--------|
| **REMIX BETR submit** | Checks `betr_games_registrations`. After clear, only 50M+ registrants can submit. |
| **BUDDY UP / JENGA / THE MOLE / BETR GUESSER** | Signup and submit routes check `betr_games_registrations`. Same as above. |
| **Spectator / state** | JENGA, THE MOLE etc. use same table for “registered” access. Only 50M+ who re-register can use. |
| **Notifications** | Game creation/start notifications use intersection of `betr_games_registrations` and enabled subscriptions. After clear, only 50M+ who registered get notifications. |
| **Admin export** | `GET /api/admin/betr-games-registrations` (JSON/CSV) lists only rows in the table; after clear, list is only new registrations. |

No changes required in these flows; they already gate on “in table.” The only new gate is “get into the table” = 50M staked at registration time.

---

## 8. Verification checklist

**Backend**

- [ ] **Constant:** `BETR_GAMES_REGISTRATION_MIN_STAKE = 50_000_000` in `constants.ts`; used in register route.
- [ ] **Unauthed POST** → 401.
- [ ] **User with &lt;50M BETR staked** → POST returns **403** with body `{ ok: false, error: "...", data: { reason: 'insufficient_stake', requiredAmount: 50_000_000, stakedAmount: "<string>" } }`; no row inserted.
- [ ] **User with ≥50M BETR staked** → POST returns 200, row inserted, `alreadyRegistered: false` on first time, `true` on second.
- [ ] **GET /api/betr-games/register/status** → `registered: true` only when a row exists for that FID.

**Frontend (both call sites)**

- [ ] **Bar:** On 403 with `data?.data?.reason === 'insufficient_stake'`, bar does **not** throw; it opens the modal with insufficient-stake state and passes `stakedAmount`; user does **not** see generic “Something went wrong.”
- [ ] **Clubs page (handleBetrGamesRegister):** Same as bar — on 403 + insufficient_stake, open modal with insufficient-stake state; do not set generic error.
- [ ] **Modal:** When `errorReason === 'insufficient_stake'`, title and body show 50M requirement and optional “You have X BETR staked”; when generic error, existing copy unchanged. Modal checks `errorReason === 'insufficient_stake'` before `error` so insufficient-stake UI wins when both might be set.

**Data and clear**

- [ ] **Clear table:** `DELETE FROM poker.betr_games_registrations` runs; `SELECT COUNT(*)` → 0.
- [ ] **After clear:** Existing game flows (REMIX BETR, BUDDY UP, JENGA, THE MOLE, BETR GUESSER) still require registration; users not in table see “Register for BETR GAMES first” (or equivalent); only 50M+ can (re-)register and get into the table.
- [ ] **Admin:** Export returns only post-clear registrations.

---

## 9. Files to touch (summary)

| File | Change |
|------|--------|
| `src/lib/constants.ts` | Add `BETR_GAMES_REGISTRATION_MIN_STAKE = 50_000_000` (and short comment). |
| `src/app/api/betr-games/register/route.ts` | After auth, call `checkUserStakeByFid(fid, BETR_GAMES_REGISTRATION_MIN_STAKE)`; if !meetsRequirement, return 403 with body shape in §3; else keep current INSERT logic. |
| `src/components/RegisterForBetrGamesBar.tsx` | Before throwing on !res.ok, branch on `res.status === 403 && data?.data?.reason === 'insufficient_stake'`; open modal with errorReason and stakedAmount; optional helper text “50M BETR staked required.” |
| `src/app/clubs/[slug]/games/page.tsx` | In `handleBetrGamesRegister`, same 403 + insufficient_stake branch before throw; add state for insufficient-stake and pass to `RegisterForBetrGamesModal`. |
| `src/components/RegisterForBetrGamesModal.tsx` | Add props `errorReason` (generic or insufficient_stake), `stakedAmount` (string); when insufficient_stake, show 50M title and body (with optional stakedAmount). |
| **Supabase (one-time)** | Run `DELETE FROM poker.betr_games_registrations;` after deploy. |
| **Docs** | Update **BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md** Phase 10 to describe the 50M requirement and the one-time clear. |

---

## 10. Doc update (source of truth)

In **BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md**, Phase 10:

- **§10.2.1 POST /api/betr-games/register:** Add step 0: “Check user has ≥50M BETR staked via `checkUserStakeByFid(fid, BETR_GAMES_REGISTRATION_MIN_STAKE)`; if not, return 403 with `reason: 'insufficient_stake'` and optional `stakedAmount`.” Mention constant in `constants.ts`.
- **§10.5 End-to-End Flow:** Note that registration requires 50M BETR staked; list was cleared on [date] so only post-change registrations remain.
- **§10.7 Edge Cases:** Add row: “Insufficient stake (e.g. &lt;50M BETR staked): 403; modal shows 50M requirement and optional current staked amount.”

This keeps the source of truth aligned with behavior and avoids breaking existing flows while adding the 50M gate and a clean registration list.
