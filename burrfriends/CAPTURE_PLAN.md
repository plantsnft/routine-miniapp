# Capture Plan: THE MOLE, BUDDY UP v2 (schedule), JENGA 3D, Agent training (poker contract payout)

**Purpose:** Align `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` (source of truth) with shipped and mid-stage features: **THE MOLE**, **BUDDY UP v2 / schedule** ("Next BUDDY UP"), **JENGA 3D** (and Phase 5 & 6), and **agent training for poker contract payout logic**. This doc summarizes what was updated, what to do before/after push and deploy, and where to point an agent working on poker contract payout logic.

---

## 1. What was missing and what was updated

### THE MOLE
- **Was:** Migration `supabase_migration_the_mole.sql` was in the Running migrations list (#28); no Phase in the plan.
- **Now:**
  - **Phase 16: THE MOLE** added (overview, DB, APIs, UI, files, notifications). Migration **#31** (see §2).
  - **D2 Checklist:** THE MOLE included in “one game type” and “one settle” smoke options.

### BUDDY UP v2 / schedule (“Next BUDDY UP”) and advance_at
- **Was:** `supabase_migration_buddy_up_schedule.sql`, `GET /api/buddy-up/next-run`, `POST /api/buddy-up/schedule`, and games-page “Next BUDDY UP in Xh Xm” + admin “Next: 1h | 2h | 3h | Clear” were implemented but **not** in the plan. `buddy_up_advance_at` and `advance_at` (in-round “Advancing in M:SS”) were also missing.
- **Now:**
  - **Running migrations:** `supabase_migration_buddy_up_schedule.sql` **#26**, `supabase_migration_buddy_up_advance_at.sql` **#27** (after schedule, before jenga). Then jenga #28, jenga_v2_phase1 #29, jenga_v2_phase6 #30, the_mole #31, burrfriends_feed_cache #32.
  - **Phase 14 (BUDDY UP):**
    - Table **`poker.buddy_up_schedule`** and **`advance_at`** on `buddy_up_games` (in-round countdown; set by Complete round with `advanceInSeconds` 60,120,180,300; cleared when next round is created).
    - APIs: **GET /api/buddy-up/next-run**, **POST /api/buddy-up/schedule**; **POST .../complete** accepts optional `{ advanceInSeconds?: 60|120|180|300 }`.
    - BUDDY UP card: “Next BUDDY UP in Xh Xm” and admin “Next: 1h | 2h | 3h | Clear”. In progress: “Advancing in M:SS” when `advance_at` in future; “Start Round” disabled until it passes; Complete Round modal: “Advance now” / “In 1/2/3/5 min”.
    - **14.12 Files:** `supabase_migration_buddy_up_schedule.sql`, `supabase_migration_buddy_up_advance_at.sql`, `next-run/route.ts`, `schedule/route.ts`; pokerDb and clubs games page.

### JENGA 3D and Phase 5 & 6 (physics, collapse)
- **Was:** Phase 15 described a “2D top-down” board and `JengaTower`; `JengaTower3D` and JENGA V2 Phase 5 & 6 (physics, collapse, `game_ended_reason`) were not fully in the plan.
- **Now:**
  - **Phase 15.8:** Game board “3D primary, 2D fallback”; **JengaTower3D** (CSS 3D, 360° rotation, pinch) primary; **JengaTower** 2D fallback.
  - **Phase 15.17:** 3D tower in use. **Phase 5 & 6 complete:** Cannon-es physics, collapse (on-remove, placement, push-hit-tower), replace “would fall,” stability %, impact bands. Practice uses same physics. Create always V2; v1 legacy read-only. Migration **`supabase_migration_jenga_v2_phase6.sql`** adds `game_ended_reason` values `'collapse'`, `'tower_fell'`. Edge cases: collapse, tower_fell.

### Infrastructure and D2
- **Running migrations:** Count is now **32**. D2 pre-deploy: “1–32”.
- **D2 post-deploy:** THE MOLE in “one game type” and “one settle”; Phase 16 pointer.

### Scope and poker contract payout logic (for agent training)
- **Overview** and **Infrastructure → Poker app (out of scope)** in the plan state: this doc is source of truth for **burrfriends (BETR WITH BURR)** only. **Poker contract payout logic** and the **poker** app live in `poker/`. For an agent working on that logic, the plan’s **Infrastructure → Poker app (out of scope) → Agent briefing: poker contract payout logic** is the **source-of-truth** (route, contract, payout_bps, payment verification, DB, flow). Also use `poker/AI_AGENT_HANDOFF.md`, `poker/DEPLOYMENT_CHECKLIST.md`, `poker/VERCEL_DEPLOYMENT_CHECKLIST.md`.

---

## 2. Migration order (after edits)

Run in this order in Supabase SQL Editor:

| # | Migration |
|---|-----------|
| 1–24 | (unchanged: poker_schema … buddy_up_chat) |
| 25 | `supabase_migration_buddy_up_chat.sql` |
| 26 | `supabase_migration_buddy_up_schedule.sql` |
| 27 | `supabase_migration_buddy_up_advance_at.sql` |
| 28 | `supabase_migration_jenga.sql` |
| 29 | `supabase_migration_jenga_v2_phase1.sql` |
| 30 | `supabase_migration_jenga_v2_phase6.sql` |
| 31 | `supabase_migration_the_mole.sql` |
| 32 | `supabase_migration_burrfriends_feed_cache.sql` |

Run **`buddy_up_advance_at`** after `buddy_up_schedule` and before `jenga`. Run **`jenga_v2_phase6`** after `jenga_v2_phase1` and before `the_mole`.

---

## 3. What to do before push/commit

1. **Run `supabase_migration_buddy_up_schedule.sql`** and **`supabase_migration_buddy_up_advance_at.sql`** in Supabase if you have not already (for “Next BUDDY UP” and in-round “Advancing in M:SS”). Run **`supabase_migration_jenga_v2_phase6.sql`** if you use JENGA V2 physics and `game_ended_reason` `'collapse'`/`'tower_fell'`.
2. **Confirm `buddy_up_schedule` in `pokerDb`:** `VALID_POKER_TABLES` in `src/lib/pokerDb.ts` already includes `buddy_up_schedule` (and all `mole_*` tables). No code change needed if that’s the case.
3. **Optional:** If BUDDY UP v2 UX (e.g. `BuddyUpV2Client`, or a v2-specific page) is shipped and the main `/buddy-up` flow has changed, add a short note to Phase 14 (e.g. “BUDDY UP v2 UX merged; see `BUDDY_UP_V2_PLAN.md` for parity, swap, and schedule”).

---

## 4. What to do after push/deploy

1. **Push to production (Vercel):** Production deploys from the **`burrfriends`** branch, not `main`. After pushing to `main`, merge `main` into `burrfriends` and push `burrfriends` so Vercel picks it up. Full steps: **BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md → Infrastructure → Deploy to Vercel (burrfriends) → Deploy workflow (how to push to Vercel)**.
2. **Pre-deploy:** Use **Infrastructure → Supabase → Running migrations** and run any of **#26–#32** you haven’t yet (`buddy_up_schedule`, `buddy_up_advance_at`, `jenga`, `jenga_v2_phase1`, `jenga_v2_phase6`, `the_mole`, `burrfriends_feed_cache`).
3. **Post-deploy (D2 smoke):** For “one game type” and “one settle,” you can use **THE MOLE** as well as BUDDY UP, BETR GUESSER, JENGA, or poker.
4. **THE MOLE:** Create → signup → start → create round (with or without custom mole) → vote → complete round (or mole wins) → settle. Ensures `mole_games`, `mole_rounds`, `mole_groups`, `mole_votes`, and settlement are wired.

---

## 5. Not done / optional later

- **Phase 7 Implementation Notes:** THE MOLE is already in `notifications.ts` (`gameType: 'the_mole'`). Phase 7 could briefly list THE MOLE with the other BETR game types in the unified notification section; it’s optional.
- **Phase 7.6 eligibility / settlement:** THE MOLE settle is single-winner when `mole_won` (`mole_winner_fid`). If you add an eligibility table or validation similar to BUDDY UP, the plan and 7.6 can be updated then.
- **JENGA:** Phase 5 & 6 (physics, collapse, `game_ended_reason` `'collapse'`/`'tower_fell'`) are **documented as complete** in the plan. Any further JENGA_V2 plan items (e.g. practice polish) can be added when shipped.
- **BUDDY UP v2 swap:** If v2 has fully replaced v1 (e.g. only one `/buddy-up` page and it’s the v2 UX), add a one-line to Phase 14.1: “The main BUDDY UP page uses the v2 UX (see `BUDDY_UP_V2_PLAN.md`).”

---

## 6. Files touched in the plan

- `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md`:
  - **Overview:** **Scope** paragraph: burrfriends only; **poker contract payout logic** → `poker/`, `poker/contracts/GameEscrow.sol`, `poker/.../settle-contract/route.ts`; pointer to **Agent briefing** for agent training. **Infrastructure → Poker app (out of scope):** expanded with **Agent briefing: poker contract payout logic** (route, contract, ABI, winnerFids vs legacy, payout_bps, payment-verifier, amounts, DB columns, flow, constants, audit, permissions, types; poker docs).
  - **Infrastructure → Running migrations:** 32 total: #26 `buddy_up_schedule`, #27 `buddy_up_advance_at`, #28 jenga, #29 jenga_v2_phase1, #30 jenga_v2_phase6, #31 the_mole, #32 burrfriends_feed_cache.
  - **Phase 14:** `buddy_up_schedule`, **`advance_at`** on `buddy_up_games`, next-run/schedule APIs, **Complete round `advanceInSeconds`**, “Advancing in M:SS” and “Start Round” disabled; 14.12 `buddy_up_advance_at.sql`, complete route behavior.
  - **Phase 15.2:** Migration line includes `jenga_v2_phase1`, `jenga_v2_phase6`. **15.13:** edge cases `collapse`, `tower_fell`. **15.15:** all three JENGA migrations.
  - **Phase 15.8:** 3D primary (JengaTower3D), 2D fallback (JengaTower).
  - **Phase 15.17:** 3D tower; **Phase 5 & 6 complete** (physics, collapse, `game_ended_reason`).
  - **Phase 16:** THE MOLE (overview, behavior, APIs, UI, files, notifications).
  - **D2 Checklist:** migrations “1–32”; THE MOLE in “one game type” and “one settle”, Phase 16 pointer.

---

## 7. If you’re mid-stage (not all pushed)

- **THE MOLE:** If some THE MOLE APIs or UI are only local, Phase 16 still matches the *intended* build. Adjust 16.2 / 16.3 when you finalize (e.g. add/remove an endpoint or modal).
- **BUDDY UP schedule:** If `next-run` / `schedule` or the “Next BUDDY UP” UI are not in the branch you’re pushing, you can:
  - Keep the plan as-is (it reflects the target), and add a short “Not yet in this branch” note in 14.7 or 14.12 if you want; or
  - Temporarily revert the schedule-related plan edits until the feature is in the same branch.
- **JENGA 3D:** If `JengaTower3D` is not in the build you’re pushing, you can tone down 15.8 (e.g. “3D (JengaTower3D) in development” or “2D only in this release”) and fix it when 3D is merged.

---

## 8. Agent training: poker contract payout logic

When training or briefing an agent that will work on **poker contract payout logic**, use:

1. **Source of truth:** `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` → **Infrastructure → Poker app (out of scope) → Agent briefing: poker contract payout logic**. That subsection documents the route, contract, winnerFids vs legacy, `payout_bps`, payment verification, DB, flow, and related files.
2. **Primary code:** `poker/src/app/api/games/[id]/settle-contract/route.ts`, `poker/contracts/GameEscrow.sol`, `poker/src/lib/contracts.ts` (ABI), `poker/src/lib/payment-verifier.ts`, `poker/src/lib/amounts.ts`.
3. **Poker docs:** `poker/AI_AGENT_HANDOFF.md`, `poker/DEPLOYMENT_CHECKLIST.md`, `poker/VERCEL_DEPLOYMENT_CHECKLIST.md`.

This document (CAPTURE_PLAN) and the phased plan are kept in sync so the plan remains the single source of truth for both burrfriends and for steering a poker contract-payout agent.

---

*Generated from a pass over the plan and code. If migration order or table names differ in your Supabase project, adjust the plan and this CAPTURE_PLAN accordingly.*
