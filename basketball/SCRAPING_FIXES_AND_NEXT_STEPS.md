# Scraping Fixes and Next Steps

## What Was Fixed

### 1. **Zero players**
- **Cause**: The script was using `/roster/` instead of the **all-time roster** URL.
- **Change**: Roster URL is now **`/roster/all-time/`** (e.g.  
  `https://www.maxpreps.com/tx/the-woodlands/college-park-cavaliers/basketball/roster/all-time/`).
- **Parser**: Added `parsePlayerStatsFromAllTime()` to find season blocks (e.g. "2005-06") and player lines like `LastName, FirstName(Sr.)` and to accept players with only name + grade (no stats); missing stats stay null and rating will default to 60 later.

### 2. **Games not saving ("no unique or exclusion constraint")**
- **Cause**: `historical_schedules` had no unique constraint, but the script used `upsert` with `onConflict`.
- **Change**: Script now uses **`.insert()`** for games instead of `.insert().upsert()`, so games are stored without needing a unique constraint.

---

## What You Should Do

### 1. Clear old scraped data (optional but recommended)

In **Supabase SQL Editor** run:

```sql
DELETE FROM basketball.historical_schedules;
DELETE FROM basketball.historical_players;
DELETE FROM basketball.historical_teams;
```

Then re-run the scraper so you don’t mix old empty data with new.

### 2. Re-run the scraper

```bash
cd c:\miniapps\routine\basketball
node scripts/scrape-maxpreps.mjs
```

- You should see **games** stored without errors.
- You should see **players** if the all-time roster HTML contains the season sections and player lines we parse.

### 3. If you still get **0 players**

MaxPreps may be loading the roster with **JavaScript**, so the HTML we get over plain HTTPS might not include the roster. In that case we have two paths:

**Option A – Share one roster URL and HTML**

1. Open in a browser:  
   `https://www.maxpreps.com/tx/the-woodlands/college-park-cavaliers/basketball/roster/all-time/`
2. Right‑click the page → **View Page Source** (or Ctrl+U).
3. Copy a **small portion** of the HTML that shows one season (e.g. "2005-06") and a few player names (e.g. "LastName, FirstName(Sr.)").
4. Paste that snippet here (or into a file and reference it). With that, we can adjust the parser to match the real structure.

**Option B – Use Puppeteer**

We can add a Puppeteer-based scraper that loads the page in a real browser so the JS-rendered roster is in the HTML. If you want to go that way, say so and we’ll wire it in.

### 4. After scraping works

Run the rating script (works even if some players have null stats; they’ll get default 60):

```bash
node scripts/calculate-historical-ratings.mjs
```

---

## Summary

- **Roster**: Now uses **all-time** URL and a parser that expects season blocks and "Name(Grade)" lines.
- **Games**: Now use **insert** only, so they save without a unique constraint.
- If **players are still 0**, we need either a sample of the real HTML (Option A) or a browser-based scraper (Option B).
