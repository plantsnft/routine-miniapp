# BULLIED manual outcome — step-by-step to get this live

This is the full checklist: what’s already done and what you do when you’re ready to close BULLIED and set the correct outcome.

---

## Part 1: What’s already done (no action needed)

1. **Scripts and docs are in the repo**
   - `scripts/set-bullied-outcome.sql` — run in Supabase SQL Editor; you edit the outcome rows (group_number, winner_fid).
   - `scripts/set-bullied-outcome.ts` — run from terminal; you provide an outcome file with usernames.
   - `scripts/BULLIED_OUTCOME_STEPS.md` — short instructions for both options.
   - `scripts/BULLIED_OUTCOME_GO_LIVE.md` — this file.

2. **Plan doc is the source of truth**
   - `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` was updated with:
     - **§33.12** — Manual outcome override (post-close): when to use it, SQL vs Node, effect.
     - **§33.10** — New files listed: `set-bullied-outcome.sql`, `set-bullied-outcome.ts`, `BULLIED_OUTCOME_STEPS.md`.
     - **Change log** — One entry for BULLIED manual outcome override (date + §33.12 + steps doc).

3. **npm script**
   - `package.json` has `"set-bullied-outcome": "tsx scripts/set-bullied-outcome.ts"` so you can run `npm run set-bullied-outcome -- outcome.txt` if you prefer.

Nothing else needs to be “deployed” for this. The scripts run locally or in Supabase; no new API or migration.

---

## Part 2: When you’re ready — what you do

### Step 1: Close BULLIED and complete the round in the app

- Open the BULLIED game in the app.
- Use **Complete Round** (and **End Game** if the UI requires it) so the game is **settled**.
- You can use the in-app outcome from voting or ignore it; the script/SQL will overwrite it.

### Step 2: Choose SQL or Node and prepare the outcome

**Option A — SQL**

1. Open **Supabase → SQL Editor**.
2. Open `scripts/set-bullied-outcome.sql` in your repo (or paste its contents into the editor).
3. Find the block:  
   `INSERT INTO outcome (group_number, winner_fid) VALUES`
4. Edit so there is **exactly one row per group** for this game:
   - `(1, 12345)` = group 1 winner has FID 12345.
   - `(5, NULL)` = group 5 is “all eliminated.”
5. Add or remove rows so the list matches the real group numbers (1, 2, 3, …).  
   Get FIDs from the app (e.g. tournament/group views) or Warpcast (profile URL or page).

**Option B — Node (usernames)**

1. Create a text file (e.g. `outcome.txt`) with one line per group:
   - `1 - je11y`
   - `5 - all eliminated`
   - `17 - Jerry`
2. Use the **exact** group numbers. One line per group; no missing or duplicate numbers.
3. Names are matched to players **in this game** only (by username or display name, case-insensitive).

### Step 3: Run the script or SQL

**If you chose SQL**

1. In Supabase SQL Editor, run the **entire** script (all statements).
2. Check the result: the script ends with a small `SELECT` showing “Groups updated” and “Winners (alive)” counts.

**If you chose Node**

1. Open a terminal and go to the **burrfriends** folder (where `package.json` is).
2. Ensure `.env.local` exists and has:
   - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE` (or `SUPABASE_SERVICE_ROLE_KEY`)
   - `NEYNAR_API_KEY`
3. Run:
   ```bash
   npx tsx scripts/set-bullied-outcome.ts outcome.txt
   ```
   (Use your file path instead of `outcome.txt` if different.)
4. The script prints which game it used, each group update, eliminated FIDs, reinstated winners, and a short summary.

### Step 4: Verify in the app

1. **Games page** — Open the BETR games page and find **“BULLIED – Past games.”** The settled game should list the correct winners (names and PFPs).
2. **Active players** — Wherever the app shows “alive” tournament players (e.g. IN OR OUT “X players remaining,” or admin tournament list), only the people who advanced in your outcome should be alive; everyone else should be eliminated.

### Step 5: If something is wrong

- **SQL:** Edit the outcome `INSERT` (fix FIDs or NULLs), then run the **whole** script again. It will overwrite the same game’s groups and re-sync the tournament.
- **Node:** Edit the outcome file, then run the script again. Same effect.

---

## Part 3: Quick reference

| Step | SQL | Node |
|------|-----|------|
| Prepare | Edit `INSERT INTO outcome` in `set-bullied-outcome.sql` with (group_number, winner_fid). | Create `outcome.txt` with lines `N - username` or `N - all eliminated`. |
| Run | Supabase SQL Editor → run full script. | Terminal in burrfriends: `npx tsx scripts/set-bullied-outcome.ts outcome.txt` |
| Needs | Supabase access. | .env.local (Supabase + Neynar API key). |

---

You’re “live” once Part 1 is in your repo and the plan doc is updated. Part 2 is what you do **once** when you close BULLIED and set the correct outcome.
