# Next Steps and End-to-End Impact

## What Just Happened

1. **Scraper** – Found 154 players and 35 games per year and stored them. Games now save (we switched to `.insert()`).
2. **Rating script** – Said "No players found" because it was run *before* you re-ran the scraper. It also couldn’t load the TypeScript module from `.mjs`.

## What Was Fixed

1. **154 players per year** – That came from the fallback that grabbed every "Name (Grade)" on the all-time page (all seasons). The fallback is **removed** so we only keep players from the correct season section (2005-06, 2006-07). If the main parser doesn’t match the page format, you’ll get 0 players for that year until we match the real format.
2. **Rating script** – It no longer imports from `.ts`. Rating logic is inlined in the `.mjs` so `node scripts/calculate-historical-ratings.mjs` runs. Players with no stats get default rating **60** (per SoT).

---

## What You Should Do Now

### Option A: Use current data (154 per year) and move forward

You already have 154 players for 2005 and 154 for 2006 in the DB. Run the rating script so those rows get ratings:

```bash
cd c:\miniapps\routine\basketball
node scripts/calculate-historical-ratings.mjs
```

- You should see something like: "Calculated ratings for 154 players", "Top 10%: 16", etc.
- In Supabase, `historical_players` will have `starting_rating`, `potential_rating`, `best_season_year` filled.

**Impact:** Initialization and game sim can use this data. Rosters are still “all seasons mixed” for 2005/2006; we can fix that later by re-scraping with a season-filtered parser and re-running ratings.

### Option B: Re-scrape and then rate (correct rosters per year)

If you want only the real 2005-06 and 2006-07 rosters:

1. **Clear historical data** (Supabase SQL Editor):

```sql
DELETE FROM basketball.historical_schedules;
DELETE FROM basketball.historical_players;
DELETE FROM basketball.historical_teams;
```

2. **Re-run scraper:**

```bash
cd c:\miniapps\routine\basketball
node scripts/scrape-maxpreps.mjs
```

- With the fallback removed, you may get **0 players** if the page structure doesn’t match our parser (e.g. season headings or "LastName, FirstName(Sr.)" format).
- If you get 0 players, send a small **View Page Source** snippet (the part with one season and a few player names) and we can adjust the parser.

3. **Run ratings** (after you have players again):

```bash
node scripts/calculate-historical-ratings.mjs
```

---

## End-to-End Impact

| Step | Status | Impact |
|------|--------|--------|
| DB migration | Done | Historical tables and schema ready. |
| Data reset | Done | Old games/teams/players cleared. |
| Scrape | Done (154/year) | Teams, players, schedules in DB; rosters are mixed across seasons. |
| Rating script | Fixed | Runs without .ts; assigns ratings and default 60 for no stats. |
| Run ratings | **You do this** | Fills `starting_rating`, `potential_rating`, `best_season_year`. |
| Init route (6 teams, College Park → plantsnft) | Not done | Needs to read from `historical_*` and create teams/players. |
| Schedule / game sim | Not done | Still round-robin; needs to use `historical_schedules`. |
| Progression / UI | Not done | Later. |

**Recommended path:** Run **Option A** (rating script on current 154/154 data), confirm ratings in Supabase, then we can do the **init route** and **schedule/sim** to tie everything together. Roster filtering (Option B) can follow once we match the real all-time page format.

---

## Commands Summary

```bash
cd c:\miniapps\routine\basketball

# Rate current players (do this now if you’re using Option A)
node scripts/calculate-historical-ratings.mjs
```

After that, next implementation steps are: **update init route** to load 6 teams and players from historical data (College Park → plantsnft), then **wire schedule/sim** to `historical_schedules`.
