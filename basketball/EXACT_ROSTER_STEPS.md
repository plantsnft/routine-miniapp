# Exact 2005-06 and 2006-07 Rosters – What to Do

## Edits made (no need to run the script on old data)

1. **Season-only parser** – The scraper now takes only the **text for that season** from the all-time page:
   - Finds the block for "2005-06" (or "2006-07").
   - Stops at the **next** season heading (e.g. "2006-07" when scraping 2005).
   - Parses player lines only in that block, so you get **only** the real roster for that year.

2. **Player line patterns** – It looks for:
   - `LastName, FirstName(Sr.)` and `LastName, FirstName (Sr.)` (with or without space before the parenthesis).

3. **Stats** – Right now we still don’t have a season-specific **stats** URL (PPG, RPG, APG, etc.). So:
   - You’ll get the **exact roster** (names + grade) for 2005-06 and 2006-07.
   - Stats may stay null until we add a stats page or you send a link/sample of where those numbers appear.

---

## What you should do (in order)

### 1. Clear old historical data

In **Supabase → SQL Editor** run:

```sql
DELETE FROM basketball.historical_schedules;
DELETE FROM basketball.historical_players;
DELETE FROM basketball.historical_teams;
```

### 2. Re-run the scraper

```bash
cd c:\miniapps\routine\basketball
node scripts/scrape-maxpreps.mjs
```

You should see something like:
- **2005-06**: “Found X players” (X should be ~10–15, not 154).
- **2006-07**: “Found Y players” (same idea).
- Games and teams stored as before.

If you still see **0 players** for a year, the page format may differ (e.g. different heading or name format). In that case, send a small **View Page Source** snippet that shows one season heading and a few player lines so we can match it.

### 3. Run the rating script

```bash
node scripts/calculate-historical-ratings.mjs
```

This fills `starting_rating`, `potential_rating`, and `best_season_year`. Players with no stats get default 60.

---

## Summary

- **Do not** run the rating script on the old 154-per-year data.
- **Do** clear data, then run the scraper (with the new parser), then run the rating script.
- Rosters will be **exact** for 2005-06 and 2006-07; exact **stats** per player will come once we have the right stats page or HTML sample.
