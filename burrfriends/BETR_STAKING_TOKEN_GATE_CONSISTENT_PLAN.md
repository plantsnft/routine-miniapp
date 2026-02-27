# BETR staking token gate — consistent across all games (plan)

**Source of truth:** `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` is the source of truth for burrfriends. This doc is the **detailed implementation plan** for the staking token gate feature. When implemented, the phased plan must be updated as described in **§9 Docs** and **Edits required in BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md** below.

## Goal

When an admin sets up a game, they can **optionally token-gate it by BETR staked amount**. If the user doesn’t have that amount staked, they cannot join (or sign up / submit). This should work and look the **same** for:

- **Poker** (burrfriends_games) — already implemented
- **BETR GUESSER** — partially (notification path exists; no DB, no UI, no enforcement)
- **BUDDY UP** — not implemented (no column, no enforcement)
- **THE MOLE** — backend only (DB + create API; no create UI, no signup enforcement)
- **JENGA** — not implemented

## Implementation status (as of plan date)

**Nothing from this plan has been implemented yet.** Only pre-existing behavior exists: Poker full flow; THE MOLE has DB column and create API persistence (no validation, no create UI, no signup enforcement). All items in **§1–§9** below remain to be done. Use the **Order of work** and **Files to touch** sections when implementing.

---

## Current state (from review)

### Poker (burrfriends_games) — reference implementation ✅

- **DB:** `burrfriends_games.staking_min_amount` (migration `supabase_migration_add_staking_columns.sql`).
- **Create:** `clubs/[slug]/games/new` has “Token Gating (optional)” dropdown: None, 1M, 5M, 25M, 50M, 200M BETR (same as `VALID_STAKING_THRESHOLDS`). Sent as `staking_min_amount` in POST body.
- **API create:** `POST /api/games` validates with `isValidStakingThreshold`, sets `gating_type: 'stake_threshold'` when staking &gt; 0, persists `staking_min_amount`.
- **Join:** `POST /api/games/[id]/join` uses `canUserJoinGame(fid, game)`; on `stake_threshold` it calls `checkUserStakeByFid(fid, game.staking_min_amount)`. If not eligible → 403 with `eligibility: { eligible, reason, message }`.
- **Display:** `formatStakingRequirement(game.staking_min_amount)` on clubs list and `games/[id]` (e.g. “25M BETR staking required” or “No staking requirement”).
- **Frontend join error:** Game detail page shows `eligibility.message` when join returns 403 (e.g. “Insufficient stake. Required: X BETR, You have: Y BETR”).

### THE MOLE

- **DB:** `mole_games.staking_min_amount` exists (`supabase_migration_the_mole.sql`).
- **Create API:** `POST /api/the-mole/games` accepts `body.stakingMinAmount`, persists it. Notifications get `staking_min_amount` from created game.
- **Create UI:** `CreateTheMoleGameModal` has **no** staking field; admin cannot set it.
- **Signup:** `POST /api/the-mole/signup` does **not** check stake; anyone registered for BETR GAMES can sign up.
- **Display:** GET `/api/the-mole/games/[id]` fetches full row (no restrictive select), so `staking_min_amount` is already in the response. The-mole page does not yet render it; add `formatStakingRequirement(game.staking_min_amount)` where game info is shown.

### BUDDY UP

- **DB:** `buddy_up_games` has **no** `staking_min_amount` column.
- **Create API:** Passes `(createdGame as any).staking_min_amount` to notifications (always null). Insert does not include staking.
- **Create UI:** No staking in `CreateBuddyUpGameModal`.
- **Signup:** `POST /api/buddy-up/signup` does not check stake.
- **Start route:** Comment says “staking_min_amount column doesn’t exist in buddy_up_games schema yet”.

### BETR GUESSER

- **DB:** `betr_guesser_games` has **no** `staking_min_amount` column (`supabase_migration_betr_guesser.sql`).
- **Create API:** Uses `(createdGame as any).staking_min_amount` in notifications (always undefined). Insert does not include staking.
- **Create UI:** No staking in `CreateBetrGuesserGameModal`.
- **Submit (join equivalent):** `POST /api/betr-guesser/submit` does not check stake before inserting a guess.

### JENGA

- **DB:** `jenga_games` has **no** `staking_min_amount` column.
- **Create API:** No staking in insert.
- **Create UI:** No staking in `CreateJengaGameModal`.
- **Signup:** `POST /api/jenga/games/[id]/signup` does not check stake.
- **GET game:** Uses `select: "*"`; once column is added, response will include it.

---

## Shared conventions (align with Poker)

1. **Allowed values:** `VALID_STAKING_THRESHOLDS` in `constants.ts`: 1M, 5M, 25M, 50M, 200M BETR, or null/0 for “no requirement”. Validate with `isValidStakingThreshold`.
2. **Create UI:** Optional “Token gating” / “Staking requirement” control: dropdown same as Poker (None, 1M, 5M, 25M, 50M, 200M BETR). Helper text: “Require players to have staked this amount of BETR to join.”
3. **Enforcement:** If `game.staking_min_amount > 0`, before allowing join/signup/submit: call `checkUserStakeByFid(fid, game.staking_min_amount)`. If `!stakeCheck.meetsRequirement`, return **403** with a clear message and optional `reason: 'insufficient_stake'`, `stakedAmount`, `requiredAmount` for frontend.
4. **Display:** Use `formatStakingRequirement(game.staking_min_amount)` everywhere (e.g. “25M BETR staking required” or “No staking requirement”).
5. **Error message:** Same wording as eligibility: e.g. “Insufficient stake. Required: X BETR, You have: Y BETR” (backend can use `stakeCheck.stakedAmount` and `game.staking_min_amount`).

---

## Implementation plan

### 1. Database

- **Migration:** Add `staking_min_amount numeric DEFAULT NULL` to:
  - `poker.betr_guesser_games`
  - `poker.buddy_up_games`
  - `poker.jenga_games`  
  (`mole_games` already has it.)  
  Comment: “Minimum BETR staked to join/play; null = no requirement. Use VALID_STAKING_THRESHOLDS.”
- **Order:** Run after existing game migrations; document in BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md under Supabase → Running migrations.
- **Deploy / migration order:** Either (a) run the migration in Supabase first, then deploy the new code, or (b) deploy code first, then run the migration. Recommended: run migration first so the column exists when the new create/signup code runs. Existing rows get `staking_min_amount = NULL`; new games get a value when the admin sets it. No backfill needed. You can do both when ready.

### 2. Backend — Create APIs

- **BETR GUESSER** `POST /api/betr-guesser/games`:  
  Read `body.stakingMinAmount`. If present and &gt; 0, validate with `isValidStakingThreshold`; if invalid, return 400 with same message as Poker. Include `staking_min_amount` in `pokerDb.insert("betr_guesser_games", [...])`. Return it in the created game so notifications keep working.

- **BUDDY UP** `POST /api/buddy-up/games`:  
  Same: accept `stakingMinAmount`, validate, add `staking_min_amount` to insert. Notifications already use `(createdGame as any).staking_min_amount`; once inserted, it will be correct.

- **JENGA** `POST /api/jenga/games`:  
  Same: accept `stakingMinAmount`, validate, add `staking_min_amount` to insert. **Notification:** When calling `prepareGameCreationNotification`, pass `staking_min_amount` in the game data object (in addition to `prize_amount`, `turn_time_seconds`) so creation notifications show "Staking: XM BETR required." when set. Today JENGA create does not pass `staking_min_amount` to the helper.

- **THE MOLE** `POST /api/the-mole/games`:  
  Already persists `staking_min_amount`. **Required:** Add validation before insert: if `stakingMinAmount` is provided and &gt; 0, call `isValidStakingThreshold`; if invalid, return 400 with same error text as Poker (e.g. "Invalid staking_min_amount: ... Must be one of: 1M, 5M, 25M, 50M, 200M BETR or null/0 for no requirement"). This keeps data consistent and prevents invalid values (e.g. 10M). No schema change.

### 3. Backend — Join / Signup / Submit enforcement

Use the same pattern everywhere: load game with `staking_min_amount`; if `staking_min_amount > 0`, call `checkUserStakeByFid(fid, Number(game.staking_min_amount))`; if `!stakeCheck.meetsRequirement`, return 403 with body e.g.:

```json
{
  "ok": false,
  "error": "Insufficient stake. Required: 25000000 BETR, You have: 10000000 BETR",
  "data": {
    "reason": "insufficient_stake",
    "requiredAmount": 25000000,
    "stakedAmount": "10000000"
  }
}
```

(Optional: also return a short `eligibility: { eligible: false, reason, message }` for parity with Poker join.)

- **THE MOLE** `POST /api/the-mole/signup`:  
  Fetch game with `select` including `staking_min_amount`. After “game exists” and “status === signup”, add stake check; if not met, return 403 as above. Then continue with existing signup logic.

- **BUDDY UP** `POST /api/buddy-up/signup`:  
  After migration, fetch game including `staking_min_amount`. Same stake check and 403 before insert.

- **BETR GUESSER** `POST /api/betr-guesser/submit`:  
  Fetch game with `staking_min_amount` (e.g. add to existing select). Before “already guessed” and insert, add stake check; if not met, return 403. Submit is the “join” action for this game.

- **JENGA** `POST /api/jenga/games/[id]/signup`:  
  After migration, fetch game including `staking_min_amount`. Same stake check and 403 before insert.

### 4. Create modals — Staking UI

Add the same optional staking control to all four modals:

- **CreateBetrGuesserGameModal**
- **CreateBuddyUpGameModal**
- **CreateTheMoleGameModal**
- **CreateJengaGameModal**

- **UI:** Label e.g. “Token gating (optional)” or “Staking requirement (optional)”. Dropdown: value `''` or `null` = None; options 1000000, 5000000, 25000000, 50000000, 200000000 with labels “1M BETR”, “5M BETR”, “25M BETR”, “50M BETR”, “200M BETR” (reuse `VALID_STAKING_THRESHOLDS` or same numbers). Helper text: “Require players to have staked this amount of BETR to join.”
- **Submit:** Include `stakingMinAmount: value || null` in the create payload (each modal already has its own field names; align with the API: `stakingMinAmount` for THE MOLE, same for others for consistency).

### 5. GET game detail — Return `staking_min_amount`

- **THE MOLE** `GET /api/the-mole/games/[id]`:  
  Fetches full row (no explicit select), so `staking_min_amount` is already returned. Ensure response shape does not strip it; no change needed if the full game object is spread into the response.

- **BUDDY UP** `GET /api/buddy-up/games/[id]`:  
  Fetches full row; after migration, `staking_min_amount` will be in the payload. No code change needed unless the response explicitly omits it.

- **BETR GUESSER:**  
  Active list and any game detail fetch without a narrow `select` return full rows; after migration, `staking_min_amount` will be present. If any route uses a restrictive `select`, add `staking_min_amount` to that select.

- **JENGA** `GET /api/jenga/games/[id]`:  
  Uses `select: "*"`; after migration, `staking_min_amount` will be in the row. Ensure it’s not stripped in the response shape so the frontend can use it.

### 6. Frontend — Display staking requirement

- **Poker:** No change (already uses `formatStakingRequirement(game.staking_min_amount)` on list and game detail).
- **BETR GUESSER / BUDDY UP / THE MOLE / JENGA:** On each game’s page, wherever the current game’s prize/settings are shown (game card, info panel, or detail block), add a line or badge: `formatStakingRequirement(game.staking_min_amount)`. Use the same styling as Poker (muted, small text). Ensure `game` from API includes `staking_min_amount` (step 5).

### 7. Frontend — Insufficient-stake error

- **Poker:** Already shows join error via `eligibility.message` on 403; no change.
- **BETR GUESSER / BUDDY UP / THE MOLE / JENGA:** When the signup/submit API returns 403, check for `data?.data?.reason === 'insufficient_stake'`. If so, show a clear message (e.g. “X BETR staking required. You have Y BETR staked.” using `data.data.stakedAmount` and required amount). If no `reason`, show `data.error` or generic “You don’t meet the staking requirement.” Use the same copy pattern as the BETR GAMES registration modal (without changing that modal).

### 8. Notifications

- **BETR GUESSER / THE MOLE:** After create APIs persist `staking_min_amount`, `prepareGameCreationNotification` already receives it from the created game object; no change needed once insert includes the column (BETR GUESSER) or validation is added (THE MOLE).
- **BUDDY UP:** Create route already passes `(createdGame as any).staking_min_amount`; once insert includes the column, it will be correct. **BUDDY UP start route:** Once column exists, fetch `staking_min_amount` from the game row and pass it into the notification helper (replace the current `staking_min_amount: null` and the TODO). See `src/app/api/buddy-up/games/[id]/start/route.ts`.
- **JENGA:** Create route must pass `staking_min_amount` in the game data object when calling `prepareGameCreationNotification` (see §2). **JENGA start route** (`src/app/api/jenga/games/[id]/start/route.ts`): same as BUDDY UP start — once column exists, fetch `staking_min_amount` from the game row (add to the existing `select: 'prize_amount,turn_time_seconds'`), pass it in the game data object to `prepareGameCreationNotification`, and when building the overridden "game started" body include staking text when `staking_min_amount > 0` (e.g. "Staking: 25M BETR required.") so notifications are consistent with other games.

### 9. Docs

- **BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md** is the source of truth. After implementing this plan, apply the following edits so the phased plan stays accurate:

  **Edits required in BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md:**

  1. **Running migrations:** Add one new line after `supabase_migration_burrfriends_feed_cache.sql` (or after the last game-related migration):  
     `supabase_migration_betr_games_staking_token_gate.sql` (keep this filename).  
     Describe it as: adds `staking_min_amount` to `betr_guesser_games`, `buddy_up_games`, `jenga_games`; run after `supabase_migration_the_mole.sql`.

  2. **Phase 13 (BETR GUESSER):** In section **13.13 Staking (BETR GUESSER)**, change from “To support staking: …” to: **Implemented.** Staking token gate: optional admin setting in Create BETR GUESSER modal; enforced on submit; displayed via `formatStakingRequirement`; same as Poker. See **BETR_STAKING_TOKEN_GATE_CONSISTENT_PLAN.md**.

  3. **Phase 14 (BUDDY UP):** In the Phase 14 overview or database/API section, add a short note: **Staking token gate:** Optional `staking_min_amount` on game (migration adds column); admin sets in Create BUDDY UP modal; enforced on signup; displayed via `formatStakingRequirement`; same as Poker. See **BETR_STAKING_TOKEN_GATE_CONSISTENT_PLAN.md**.

  4. **Phase 15 (JENGA):** Same as BUDDY UP: note that staking token gate is supported (migration, create modal, signup enforcement, display). See **BETR_STAKING_TOKEN_GATE_CONSISTENT_PLAN.md**.

  5. **THE MOLE section:** In the THE MOLE phase (database or API), add: **Staking token gate:** `mole_games.staking_min_amount` already exists; admin sets in Create THE MOLE modal; enforced on signup; displayed via `formatStakingRequirement`; create API validates with `isValidStakingThreshold`. See **BETR_STAKING_TOKEN_GATE_CONSISTENT_PLAN.md**.

  6. **Implementation notes / changelog (optional):** Add a line under implementation notes: “Staking token gate (BETR GUESSER, BUDDY UP, THE MOLE, JENGA): migration, create APIs, signup/submit enforcement, create modals, display, 403 handling, notifications. Plan: BETR_STAKING_TOKEN_GATE_CONSISTENT_PLAN.md.”

---

## Order of work (recommended)

1. **Migration** — add `staking_min_amount` to `betr_guesser_games`, `buddy_up_games`, `jenga_games`.
2. **Create APIs** — validate and persist staking for BETR GUESSER, BUDDY UP, JENGA; add validation for THE MOLE.
3. **Join/signup/submit** — add stake check and 403 response for THE MOLE, BUDDY UP, BETR GUESSER, JENGA.
4. **Create modals** — add staking dropdown to all four modals; send `stakingMinAmount` in create payload.
5. **GET game** — ensure each BETR game detail/list returns `staking_min_amount`.
6. **Frontend display** — add `formatStakingRequirement(game.staking_min_amount)` on each BETR game page where game info is shown.
7. **Frontend errors** — handle 403 `insufficient_stake` on signup/submit and show consistent message.
8. **Notifications** — BUDDY UP start route and JENGA start route: fetch `staking_min_amount` from game row and pass to notification helper; include staking text in "game started" body when set. Create routes: JENGA create must pass `staking_min_amount` to helper; others already get it from created game once insert includes column.
9. **Docs** — update phased plan and migration list.

---

## End-to-end confidence

- **Poker** already proves the flow: create with staking → join blocked when stake insufficient → message and display consistent. Reusing the same constants, validation, `checkUserStakeByFid`, and `formatStakingRequirement` keeps behavior identical.
- **THE MOLE** already has DB and create API; adding validation on create, stake check on signup, and staking in GET + UI makes it match Poker.
- **BUDDY UP / BETR GUESSER / JENGA** get the same DB column, create validation, create UI, join/signup/submit enforcement, GET field, and display/error handling. No new concepts; only wiring and consistency.
- **Risks:** (1) Migration order — run new migration after existing game tables. (2) BETR GUESSER “join” is submit; enforcing stake on submit is correct. (3) Frontend must pass `stakingMinAmount` from new dropdown; payload names must match API (e.g. `stakingMinAmount`).

---

## Files to touch (summary)

- **New:** One Supabase migration file `supabase_migration_betr_games_staking_token_gate.sql` adding `staking_min_amount` to `betr_guesser_games`, `buddy_up_games`, `jenga_games`.
- **Backend:** Create routes for betr-guesser, buddy-up, jenga (and validation in the-mole); signup/submit routes for the-mole, buddy-up, betr-guesser, jenga; GET game routes for the-mole, buddy-up, betr-guesser (if needed), jenga.
- **Frontend:** CreateBetrGuesserGameModal, CreateBuddyUpGameModal, CreateTheMoleGameModal, CreateJengaGameModal; betr-guesser, buddy-up, the-mole, jenga pages (display + 403 handling).
- **Shared:** `constants.ts` and `format-prize.ts` already have thresholds and `formatStakingRequirement`; reuse. `staking.ts` and `eligibility.ts` already have `checkUserStakeByFid`; reuse in BETR signup/submit routes.
- **Docs:** BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md (migration list + staking notes per phase). See **§9** and **Edits required in BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md** above.

This plan keeps token gating consistent across all games and reuses the existing Poker implementation end to end. After implementation, run through: create game with staking → signup/submit as user below threshold → see 403 and message → display shows staking requirement; create with no staking → signup/submit succeeds.
