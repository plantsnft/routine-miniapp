# Invite-Only Game Flow (Whitelist N Players) — Agent Brief

Use this brief to add an **invite-only** (whitelist) flow to a game: only N specific FIDs can participate; they bypass normal registration/staking. We implemented this for **BETR GUESSER** with **N = 5**. You can adapt it for another game or a different N.

---

## 1. What It Does

- **Open game (default):** Anyone who meets normal rules (e.g. registered, staking) can play.
- **Invite-only:** Creator supplies exactly **N** FIDs at game creation. Only those N users can submit/play; they **skip** registration and staking checks. Everyone else gets 403 "This game is invite-only. You are not on the list."
- **UI:** Create modal has N FID inputs (all visible); game page shows e.g. "Invite-only · N players" when the game has a whitelist.

---

## 2. Schema (Database)

- Add a nullable array column on the **game** table, e.g. `whitelist_fids bigint[]`.
- Constraint: when set, length must be exactly N (e.g. 5):
  - `CHECK (whitelist_fids IS NULL OR array_length(whitelist_fids, 1) = N)`
- Migration order: (1) add column + constraint for N; if you later change N (e.g. 6 → 5), (2) run a second migration that drops the old constraint and adds the new one. **Before** changing the constraint, update or delete any existing rows that have the old length, or the new constraint will fail.

---

## 3. Create Game (API)

- Accept optional body field, e.g. `whitelistFids`: array of exactly N FIDs (positive integers).
- Validate: if present, must be array of length N; all elements valid integers > 0. Return 400 otherwise.
- On insert, set `whitelist_fids` only when the validated array has exactly N elements; otherwise leave column NULL (open game).

---

## 4. Create Modal (UI)

- **State:** Array of N strings (e.g. 5 inputs: `['', '', '', '', '']`).
- **Validation:** On submit, parse to numbers; if any non-empty, must have exactly N valid FIDs, else show error (e.g. "Invite-only list must have exactly N FIDs, or leave all empty for open game").
- **Submit payload:** Include `whitelistFids` only when parsed list has exactly N entries.
- **Layout:** Use a vertical list (e.g. `flexDirection: 'column'`, one input per row) so all N inputs are visible. Give the modal card **maxHeight: '90vh'** and **overflowY: 'auto'** so when there are many fields the content scrolls and the Create/Cancel buttons stay reachable.
- **Copy:** e.g. "Enter exactly N FIDs to make this game invite-only. Leave all empty for open game."

---

## 5. Submit / Play (API)

- When loading the game for a submit/play action, read `whitelist_fids`.
- Treat as invite-only only when `whitelist_fids != null && Array.isArray(whitelist_fids) && whitelist_fids.length === N`. Then:
  - If the user's FID is in the array: allow the action and **skip** registration and staking checks (whitelisted bypass).
  - If the user's FID is not in the array: return 403 "This game is invite-only. You are not on the list."
- When `whitelist_fids` is null or length ≠ N, ignore it (open game; normal registration/staking rules).

---

## 6. GET Game and Game Page

- **GET game:** Return the full game row (or include `whitelist_fids` in the response) so the client can see whether the game is invite-only.
- **Game page:** When `game.whitelist_fids != null && game.whitelist_fids.length === N`, show a line like "Invite-only · N players". Do not expose the raw FID list to non-admins if you want to keep the list private.

---

## 7. Reference Implementation (BETR GUESSER, N = 5)

- **Table:** `poker.betr_guesser_games`, column `whitelist_fids bigint[]`, constraint length 5 (migration 81 + 81a).
- **Create:** `POST /api/betr-guesser/games`, body `whitelistFids` (optional, exactly 5 FIDs).
- **Submit:** `POST /api/betr-guesser/submit` — whitelist check and bypass in same route.
- **Modal:** `src/components/CreateBetrGuesserGameModal.tsx` (5 inputs, vertical list, maxHeight 90vh, overflowY auto).
- **Game page:** `src/app/betr-guesser/BetrGuesserClient.tsx` ("Invite-only · 5 players" when length === 5).
- **Plan doc:** `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` §13.9.

---

## 8. Checklist for Adding to Another Game

1. Add DB column `whitelist_fids bigint[]` (or equivalent) and CHECK for length N; run migration(s).
2. Create API: accept optional `whitelistFids` (length N), validate, store on insert.
3. Submit/play API: if game has whitelist of length N, allow only those FIDs and give them registration/staking bypass; else 403.
4. Create modal: N inputs, all visible (vertical list), modal scrollable (maxHeight 90vh, overflowY auto); send `whitelistFids` only when exactly N valid.
5. GET game: return whitelist field when set.
6. Game page: show "Invite-only · N players" when whitelist is set and length N.
7. If changing N later: migration to drop old CHECK and add new one; before that, fix any rows with the old length (e.g. set to NULL or trim).

---

## 9. Edge Cases

- **Existing rows when changing N:** Before adding a new CHECK that enforces a different length, update or delete rows that currently have the old length (e.g. 6 → 5: set 6-FID rows to NULL or trim to 5), or the ADD CONSTRAINT will fail.
- **Empty vs partial whitelist:** Only send/store whitelist when the user has entered exactly N valid FIDs; otherwise treat as open game (NULL).
- **Admin/preview bypass:** If your app has an admin preview bypass (e.g. admins can play preview games without registering), keep that separate from the whitelist: whitelist applies to invite-only games for the N listed FIDs; admin bypass applies per your existing rules.

This flow is self-contained: you can add it to your current process by implementing the schema, create API, submit/play API, modal, and game page display as above.
