# Historical Mode Setup Instructions

## Step-by-Step Guide (Copy & Paste)

---

## Step 1: Run Database Migration

### What to do:
1. Open your Supabase project dashboard
2. Go to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy and paste the ENTIRE contents of this file: `supabase_migration_historical_mode.sql`
5. Click **Run** (or press Ctrl+Enter)
6. Wait for it to finish (should say "Success" with no errors)

### How to verify it worked:
- You should see messages like "CREATE TABLE" and "ALTER TABLE" in the results
- No red error messages

---

## Step 2: Reset Existing Data

### What to do:
1. Open your terminal/command prompt
2. Navigate to the basketball folder:
   ```bash
   cd c:\miniapps\routine\basketball
   ```

3. Run the reset script:
   ```bash
   node scripts/reset-data.mjs
   ```

### What you should see:
```
🔄 Starting data reset...
1. Deleting game_player_lines...
   ✅ Deleted game_player_lines
2. Deleting games...
   ✅ Deleted games
...
✅ Data reset complete!
```

### If you get an error:
- Make sure you're in the `basketball` folder
- Make sure you have `.env.local` file with your Supabase credentials

---

## Step 3: Test MaxPreps Scraping

### What to do:
1. Make sure you're still in the basketball folder:
   ```bash
   cd c:\miniapps\routine\basketball
   ```

2. Run the scraping script:
   ```bash
   node scripts/scrape-maxpreps.mjs
   ```

### What you should see:
```
🚀 Starting MaxPreps scraping...
📅 YEAR: 2005-2006
📊 Scraping College Park (2005-2006)...
  📋 Fetching roster...
  ✅ Found X players
  📊 Fetching standings...
  ✅ Standings: District X-Y, Overall X-Y
  📅 Fetching schedule...
  ✅ Found X games
💾 Storing College Park data for 2005...
  ✅ Stored team data
  ✅ Stored X players
  ✅ Stored X games
```

### If it fails:
- **Error: "Cannot find module 'node-html-parser'"**: Run `npm install` first
- **Error: "HTTP 404" or "Cannot fetch"**: MaxPreps URLs might be wrong, or site structure changed
- **No data scraped**: The site might use JavaScript - we'll need to use Puppeteer (let me know and I'll help)

### How to verify it worked:
1. Go to Supabase Dashboard
2. Go to **Table Editor**
3. Check these tables have data:
   - `basketball.historical_players` (should have player rows)
   - `basketball.historical_teams` (should have team rows)
   - `basketball.historical_schedules` (should have game rows)

---

## Step 4: Calculate Player Ratings

### What to do:
1. Make sure you're still in the basketball folder:
   ```bash
   cd c:\miniapps\routine\basketball
   ```

2. Run the rating calculation script:
   ```bash
   node scripts/calculate-historical-ratings.mjs
   ```

### What you should see:
```
🚀 Calculating historical player ratings...
📊 Processing ratings for 2005-2006...
  ✅ Calculated ratings for X players
     Top 10%: X players
     80-89: X players
     55-79: X players
  💾 Updating X player records...
  ✅ Updated ratings for X players
```

### How to verify it worked:
1. Go to Supabase Dashboard
2. Go to **Table Editor**
3. Open `basketball.historical_players` table
4. Check that these columns have numbers:
   - `starting_rating` (should be 55-97)
   - `potential_rating` (should be 55-97)
   - `best_season_year` (should be a year like 2005 or 2006)

---

## Step 5: Review the Data

### What to check:
1. **Players**: Go to `basketball.historical_players` table
   - Should have players with names, positions, stats
   - Ratings should be calculated (55-97 range)

2. **Teams**: Go to `basketball.historical_teams` table
   - Should have teams with names, records
   - Should have district/overall wins-losses

3. **Schedules**: Go to `basketball.historical_schedules` table
   - Should have games with dates, teams, scores

### If something looks wrong:
- **Missing data**: Scraping might have failed - check Step 3 errors
- **Wrong ratings**: Check that stats (PPG, RPG, APG) are populated
- **No games**: Schedule scraping might have failed

---

## Troubleshooting

### "Cannot find module" errors:
```bash
cd c:\miniapps\routine\basketball
npm install
```

### "Missing SUPABASE_URL" error:
- Make sure you have `.env.local` file in the `basketball` folder
- It should have:
  ```
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_SERVICE_ROLE=your-service-role-key
  ```

### Script runs but no data appears:
- Check Supabase table editor to see if data was actually saved
- Check the script output for error messages
- Try running the script again (it's safe to run multiple times)

### MaxPreps scraping fails:
- The site might use JavaScript (dynamic content)
- We may need to use Puppeteer for browser automation
- **Let me know** and I'll create a Puppeteer version

---

## Next Steps (After Setup)

Once all steps are complete:
1. ✅ Database migration done
2. ✅ Data reset done
3. ✅ Scraping done (with data in Supabase)
4. ✅ Ratings calculated

**Then I'll update the initialization route** to use the historical data instead of random players.

---

## Quick Reference: All Commands

```bash
# Navigate to folder
cd c:\miniapps\routine\basketball

# Reset data
node scripts/reset-data.mjs

# Scrape MaxPreps
node scripts/scrape-maxpreps.mjs

# Calculate ratings
node scripts/calculate-historical-ratings.mjs
```

---

## Need Help?

If any step fails:
1. Copy the error message
2. Tell me which step failed
3. I'll help you fix it!
