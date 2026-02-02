# MaxPreps Scraping Script - Important Notes

## ⚠️ Current Implementation Status

The scraping script (`scripts/scrape-maxpreps.mjs`) is a **basic HTML parser** that may not work perfectly with MaxPreps because:

1. **MaxPreps uses JavaScript-rendered content** - The site likely loads data dynamically, so basic HTML parsing may miss data
2. **Page structure varies** - MaxPreps may have different HTML structures for different teams/years
3. **Rate limiting** - MaxPreps may block rapid requests

## 🔧 What the Script Does

The script attempts to:
- Fetch roster pages and parse player stats (PPG, RPG, APG, SPG, BPG, MPG)
- Fetch standings pages and parse team records
- Fetch schedule pages and parse game results
- Store everything in `historical_players`, `historical_teams`, `historical_schedules` tables

## 🚀 How to Use

1. **Test the script first**:
   ```bash
   node scripts/scrape-maxpreps.mjs
   ```

2. **Check the results**:
   - Review data in Supabase `historical_players`, `historical_teams`, `historical_schedules` tables
   - Verify player stats, team records, and games were captured correctly

3. **If the script fails or misses data**:
   - We may need to use **Puppeteer** or **Playwright** for browser automation
   - Or manually extract data and import via CSV/JSON

## 🔄 Alternative Approaches

### Option 1: Browser Automation (Recommended if basic parsing fails)
Use Puppeteer to render JavaScript and extract data:
```javascript
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(url);
const html = await page.content();
// Then parse HTML
```

### Option 2: Manual Data Entry
If scraping is too complex:
1. Export data from MaxPreps manually (copy/paste or screenshots)
2. Create CSV/JSON files with the data
3. Create import script to load from files

### Option 3: MaxPreps API (if available)
Check if MaxPreps has an API we can use (unlikely for free, but worth checking)

## 📝 Next Steps After Scraping

Once data is scraped (regardless of method):

1. **Calculate ratings**: Run `node scripts/calculate-historical-ratings.mjs`
   - This processes all scraped players and calculates starting/potential ratings
   - Normalizes ratings across each season

2. **Calculate team strength**: Create script to calculate `team_strength_rating` from standings
   - Formula: District rank 75%, margin 15%, overall record 10%

3. **Mark district games**: Update `historical_schedules` to mark which games are district vs out-of-conference

4. **Initialize league**: Run updated initialization endpoint to create teams and players from historical data

## 🐛 Troubleshooting

If the script fails:

1. **Check network**: Verify you can access MaxPreps URLs manually
2. **Check HTML structure**: Inspect MaxPreps pages to see actual HTML structure
3. **Add logging**: Add more console.log statements to see what's being parsed
4. **Try Puppeteer**: Switch to browser automation if needed

## 📊 Data Validation

After scraping, validate:
- ✅ All 6 teams have rosters
- ✅ All players have stats (at least PPG, RPG, or APG)
- ✅ All teams have standings data
- ✅ All teams have schedules with game results
- ✅ Player names are consistent across seasons
- ✅ Team names match exactly (important for linking)
