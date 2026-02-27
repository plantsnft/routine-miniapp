# BETR WITH BURR — Master Audit Prompt

**How to use: copy everything below the line and paste into a new chat. Edit the Status block first: `Last completed` = what we last did; `Next` = what to do next (or "continue in plan order"). The AI will: double-check that Last completed was done right (fix and stop if not), then do Next and follow the plan; if it has questions only you can answer, it will ask and pause.**

---

## Status (edit before each paste)

```
Last completed: [e.g. "A1. Fact gathering" or "Phase 7.6 BUDDY UP table" or "None yet"]
Next: [e.g. "A2. Draft and insert Infrastructure section" or "continue in plan order"]
```

---

## Instructions for the AI

You are continuing the **BETR WITH BURR source-of-truth audit**. The app is the burrfriends mini-app; the source of truth is `burrfriends/BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md`.

**Flow each run:** (1) **Check** that `Last completed` was done right in the doc/code; if not, fix it and stop. (2) If it’s right, **do** `Next` (or the next item in the plan). (3) If you need info only the user has, **ask** and pause. (4) **Report** what you did and propose updated Status for the next paste.

### Rules (do not break)

1. **Verify before you edit.** For every doc change: find the supporting code or config (file and, if useful, line). If you cannot verify it, do **not** edit the doc; skip and say "unverified — recommend manual check," or **ask the user**.
2. **One source of truth.** Deploy, Supabase, Neynar, and env-var details live in (or are pointed to from) `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md`. Other docs must match it; the source-of-truth doc wins.
3. **Scope: burrfriends only** (`burrfriends/` and its `src/`, APIs, `pokerDb`, `poker` schema). Do not change the poker app or root `src/` except to fix misplaced poker-only checklists in `burrfriends/`.
4. **No guessing.** No assumed migration order, env vars, or Vercel settings. Use: `process.env` / `constants` / `pokerDb` / `vercel.json` / migration `REFERENCES` and schema. If you need a value only the user has (e.g. Vercel Root Directory, project name), **ask the user** — do not guess.

### Each time you run

1. **Double-check "Last completed"**
   - Read the **Status** block: `Last completed` and `Next`.
   - **Verify** that `Last completed` was actually done correctly: spot-check the doc and, when relevant, the code (paths, env names, migration order, table names).
   - **If it’s wrong or incomplete:** fix it, report what you fixed, and **stop** — do **not** move on to `Next`. Propose the same `Next` for the next paste (or "re-verify Last completed" if needed).
   - **If it’s right:** say briefly "Last completed verified: [what you checked]" and go to step 2.

2. **Do "Next" (follow the plan)**
   - If `Next` is set: do that. If `Next` is "continue in plan order": pick the **next uncompleted** item in the plan below (in A→B→C→D order).
   - **Follow the plan**; don’t skip or reorder unless the plan says so.
   - **If you need info only the user has** (Vercel Root Directory, Supabase project/URL, migration-order ambiguity, env not in repo): **ask the user** in a clear block (see "When you need to ask the user") and **pause** until they reply. Then continue the same `Next` item.
   - When you edit: verify in code first, then change the doc. List what you verified and what you changed.

3. **Report and set up the next paste**
   - Say what you **did** (and what you **verified** for "Last completed").
   - Propose an updated **Status** for the user to paste next time:
     ```
     Last completed: [what you just finished]
     Next: [the next plan item or "continue in plan order"]
     ```
   - If you are **waiting on the user** (you asked a question): say "Pause: waiting on your answer before [Next item]. After you reply, paste again with the same Status."

---

## The plan (in order)

### A. Infrastructure, deploy, Supabase, Neynar (new section in source-of-truth doc)

- **A1. Fact gathering (no doc edits)**
  - Vercel: `vercel.json`, build/install/output, cron; confirm Root Directory and project with user if not in repo.
  - Env: `grep process.env` in `burrfriends/src` → full list with required/optional and where used.
  - Supabase: project id/URL, `poker` schema, service-role; list every `supabase_migration_*.sql` in `burrfriends/` and determine a safe run order from `REFERENCES`/schema.
  - Neynar: `NEYNAR_API_KEY` only; list uses (auth, wallets, REMIX, feed, burr-casts).
  - **Deliverable:** short fact list (can live in a temp section or as a reply).

- **A2. New section: "Infrastructure, Deployment, and External Services"**
  - Insert after **Overview**, before **Phase 1**.
  - Subsections: **Deploy to Vercel (burrfriends)**, **Environment variables**, **Supabase**, **Neynar**. Content only from A1 facts; no guesses.
  - Cron, Hobby/free limits, migration order, and "used for" as in the original plan. Point to `burrfriends/.env.local.example` and `burrfriends/VERCEL_ENV_VARS_CHECKLIST.md`.

- **A3. Align other artifacts**
  - Overview: one sentence pointing to **Infrastructure, Deployment, and External Services**.
  - `.env.local.example`: add any required vars found in A1 that are missing (e.g. `OPENAI_API_KEY`, `CRON_SECRET`) with a one-line comment.
  - `VERCEL_DEPLOYMENT_CHECKLIST.md` in `burrfriends/`: if it is for **poker**, move to `poker/` or rename and add a one-line note. In the source of truth, say burrfriends deploy is in **Infrastructure**.

- **A4. Migration and Neynar pointers**
  - In phases that say "run `supabase_migration_XYZ.sql`": add "See **Infrastructure → Supabase → Running migrations** for order."
  - Where Neynar is discussed: add "Neynar setup: **Infrastructure → Neynar**."

### B. Phase-by-phase and feature audit (doc vs code)

- **B1. Phases 1–7.7**  
  - For each: objectives, file paths, API contracts, "as implemented" — verify vs code; fix only what is wrong or outdated.

- **B2. Phases 8–15 (and 7.x not yet done)**  
  - Same for: Channel Feed (8), Staking display (9), BETR GAMES Registration (10), Admin list (11), REMIX BETR (12), BETR GUESSER (13), BUDDY UP (14), JENGA (15). JENGA: include v2 (`last_placement_at`, move `{ remove }`, handoff, `supabase_migration_jenga_v2_phase1.sql`).

- **B3. Change Log and "as implemented"**  
  - Where the doc cites "lines X–Y" or "as implemented," verify against current code; update or remove if wrong.

### C. Cross-cutting and hygiene

- **C1. Misplaced poker docs**  
  - Any poker-only checklist in `burrfriends/` → move or rename; in source of truth, point to **Infrastructure** for burrfriends.

- **C2. Overview**  
  - One sentence: deploy, Supabase, Neynar in **Infrastructure, Deployment, and External Services**; migration order in **Supabase → Running migrations**; Neynar in **Neynar**; link to `.env.local.example` and `VERCEL_ENV_VARS_CHECKLIST.md`.

### D. Final deliverable

- **D1. Audit summary**  
  - Short report: what was audited, list of doc edits (file + section + one-line description), and any "unverified — recommend manual check."

- **D2. Checklist for the user**  
  - Pre-deploy: migrations in order, env in Vercel, cron. Post-deploy: smoke (auth, one game type, one settle). Pointers to the source-of-truth section for each.

---

## Already done (do not redo; only verify if "Last completed" refers to them)

- **BETR GUESSER (§13):** Phase 7.5 alert text; §13.4 status API shape; §13.6 clubs link, game page path, Copy/Share, deep link, settled UI; §13.8 settlement (fetchBulkWalletAddressesForWinners, step 7); §13.11 files (page path, countdown inline); §13.12 deps; §13.13 Staking.
- **Phase 7.5:** BETR GUESSER alert and Implementation details (frontend #3).
- **Phase 7.6:** BUDDY UP eligibility table (✅ YES, `buddy_up_signups` 67–87); "Critical Finding" → "Update (Phase 5 implemented)"; "Current Neynar API Usage" → post–Phase 1; Phase 2 solution (remove `validateEligibility`); Phase 5 solution and "Files Modified" (BUDDY UP only).
- **Phase 7.7:** Status → ✅ COMPLETED; per-page table (Share/Copy both "— (exists)" for all five burrfriends pages).

---

## When you need to ask the user

**If you have a question the repo can’t answer, ask before guessing or editing.** Along the way, pause and ask for:

- **Vercel:** Root Directory for burrfriends, project name, or whether deploy is Git-only or also CLI.
- **Supabase:** project id or URL if it differs from `.env.local.example` / `VERCEL_ENV_VARS_CHECKLIST`.
- **Migration order:** when `REFERENCES` or schema are ambiguous and the order affects safety.
- **Env or constants:** any required value you cannot find in the repo.

Ask in a clear, one-place block, e.g.:

> **Questions before I continue:**  
> 1. Vercel burrfriends project: Root Directory = `burrfriends` or repo root?  
> 2. …

Then **pause** until the user replies. After they answer, they paste again with the **same** Status; you continue from the same "Next" item.

---

## Template for your next paste (after you’ve run this once)

1. **Edit the Status block** (at the top) using what the AI proposed: `Last completed:` and `Next:`.
2. **Copy** from the `---` (below the title) through the end of "## When you need to ask the user".
3. **Paste** into a new message.

(That includes: Status, Instructions, The plan, Already done, When you need to ask the user.)
