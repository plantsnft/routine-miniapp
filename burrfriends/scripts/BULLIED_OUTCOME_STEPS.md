# BULLIED one-time outcome update — step-by-step

Use this **once** after you close the only BULLIED game and complete the round. It sets the correct winners/eliminations and syncs the tournament so "BULLIED – Past games" and the active players list are correct.

**Two options:**

| | Node script | SQL |
|--|-------------|-----|
| **Input** | Usernames (e.g. `je11y`, `Tracy`) | FIDs (numbers). You look them up. |
| **Where** | Terminal, from burrfriends folder | Supabase SQL Editor |
| **Needs** | .env.local (Supabase + Neynar API key) | Nothing extra |

**SQL downside:** You must supply each winner’s **FID**, not their username. Get FIDs from the app (e.g. tournament/group views) or from Warpcast (profile URL or profile page).

---

## Option A: SQL (Supabase SQL Editor)

1. In the app, close BULLIED and complete the round (game settled).
2. Open **Supabase → SQL Editor**. Paste and edit **`scripts/set-bullied-outcome.sql`**.
3. In the script, edit the `INSERT INTO outcome` block: one row per group `(group_number, winner_fid)`. Use the winner’s FID, or `NULL` for “all eliminated”.
4. Run the script once. Then check “BULLIED – Past games” and the active players list.

---

## Option B: Node script (usernames)

### 1. In the app: close BULLIED and complete the round

- Open the BULLIED game and use **Complete Round** (and/or **End Game** if needed) so the game is **settled**.
- You can use the in-app outcome from voting, or ignore it — the script will overwrite it with your list.

### 2. Create your outcome file

Create a text file (e.g. `outcome.txt`) in any folder. One line per group:

- `N - username` = that person advanced from group N.
- `N - all eliminated` = everyone in group N was eliminated.

**Example:**

```
1 - je11y
2 - Tracy
3 - ginajara
4 - Bbrown
5 - all eliminated
6 - bertwurst
7 - jabo
8 - Pare
9 - terrybain
10 - all eliminated
11 - cryptomantis
12 - alinaferry
13 - fatcatcrypto
14 - nmeow
15 - kender
16 - zaal
17 - Jerry
```

- Use the **exact** group numbers (1, 2, 3, …) that exist for this game.
- Names are matched to players **in this game** by username or display name (case doesn’t matter).
- You must have **one line for every group**; no missing or duplicate group numbers.

### 3. Run the script

From the **burrfriends** project folder (where `package.json` is):

```bash
npx tsx scripts/set-bullied-outcome.ts outcome.txt
```

Or, if your file is elsewhere, use the full or relative path:

```bash
npx tsx scripts/set-bullied-outcome.ts C:\path\to\outcome.txt
```

The script will:

- Find the single settled BULLIED game.
- Load groups and resolve each name in your file to a FID (using only players in that round).
- Update each group’s outcome in the DB (winner or all eliminated).
- Mark non-winners as eliminated in the tournament and reinstate any winners who were marked eliminated.

### 4. What you need on your machine

- **.env.local** in the burrfriends folder with:
  - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
  - `SUPABASE_SERVICE_ROLE` (or `SUPABASE_SERVICE_ROLE_KEY`)
  - `NEYNAR_API_KEY`

The script reads `.env.local` automatically; you don’t need to set these in the terminal.

### 5. Check the result

- **Games page** → “BULLIED – Past games”: the settled game should show the correct winners (names and PFPs).
- **Active players** (e.g. for IN OR OUT or next BETR games): only the people who advanced from your list should be “alive”; everyone else should be eliminated.

If something is wrong, you can run the script again with a corrected outcome file; it will overwrite the same game’s groups and sync the tournament again.
