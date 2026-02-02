# Historical Mode Implementation Progress

## ✅ Completed (Ready to Test)

### 1. Database Schema Migration
- ✅ `supabase_migration_historical_mode.sql` created
- ✅ New tables: `historical_players`, `historical_teams`, `historical_schedules`, `retired_players`
- ✅ Modified existing tables (removed age/tier/salary, added historical fields)
- ✅ **Status**: Ready to run in Supabase SQL Editor

### 2. Constants & Configuration
- ✅ Updated `src/lib/constants.ts` with new FIDs
- ✅ Added librarian (623879) and monument (624048) FIDs
- ✅ Added COLLEGE_PARK_OWNER_FID (318447 = plantsnft)

### 3. Data Reset Script
- ✅ `scripts/reset-data.mjs` created
- ✅ Deletes all games, players, teams, stats
- ✅ Preserves user profiles
- ✅ **Status**: Ready to run

### 4. Player Rating System
- ✅ `src/lib/playerRatings.ts` created
- ✅ Formula: PPG 25%, RPG 25%, APG 25%, Steals+Blocks 25%
- ✅ Normalization: 10% above 90, 25% in 80s, rest below
- ✅ Starting rating from first season
- ✅ Potential rating from best season + 3 to each stat

### 5. Rating Calculation Script
- ✅ `scripts/calculate-historical-ratings.mjs` created
- ✅ Processes all scraped players
- ✅ Calculates and normalizes ratings
- ✅ Updates `historical_players` table
- ✅ **Status**: Ready to run after scraping

### 6. MaxPreps Scraping Script (Basic)
- ✅ `scripts/scrape-maxpreps.mjs` created
- ⚠️ **Note**: Basic HTML parser - may need Puppeteer if MaxPreps uses JS-rendered content
- ✅ Attempts to scrape rosters, standings, schedules
- ✅ Stores in historical tables
- ✅ **Status**: Ready to test (may need improvements)

## 📋 Next Steps (In Order)

### Step 1: Run Database Migration
**Action**: Execute `supabase_migration_historical_mode.sql` in Supabase SQL Editor
**Status**: ✅ SQL file ready

### Step 2: Run Data Reset
**Action**: `node scripts/reset-data.mjs`
**Status**: ✅ Script ready

### Step 3: Test MaxPreps Scraping
**Action**: `node scripts/scrape-maxpreps.mjs`
**Expected**: Scrapes College Park data for 2005-06 and 2006-07
**If it fails**: May need to use Puppeteer for browser automation

### Step 4: Calculate Ratings
**Action**: `node scripts/calculate-historical-ratings.mjs`
**Prerequisite**: Step 3 must complete successfully
**Result**: All players have starting_rating and potential_rating set

### Step 5: Update Team Initialization Route
**File**: `src/app/api/admin/initialize/route.ts`
**Changes needed**:
- Load 6 teams from `historical_teams` for season 1 (2005)
- Assign College Park to plantsnft (FID 318447)
- Assign other 5 teams randomly to remaining 5 users
- Load players from `historical_players` for that year
- Set starting ratings, potential ratings, year_in_school
- Remove age/tier/salary/contract logic
- **Status**: ⏳ Not started (waiting for scraped data to test)

### Step 6: Update Schedule System
**File**: `src/lib/gameSimulation.ts`
**Changes needed**:
- Replace round-robin with historical schedule loader
- Load from `historical_schedules` table
- Map historical dates to game days
- **Status**: ⏳ Not started

### Step 7: Update Game Simulation
**File**: `src/lib/gameSimulation.ts`
**Changes needed**:
- For out-of-conference games: Use historical result to inform win probability
- Store actual results in games table
- **Status**: ⏳ Not started

### Step 8: Implement Player Progression
**File**: `src/lib/playerProgression.ts` (new)
**Changes needed**:
- Wins bonus: +0.1% per win
- Stats bonus: +1 point per 10% above season average
- Minutes bonus: +0.1% per 3-minute average above 20
- Cap at potential_rating and 97
- **Status**: ⏳ Not started

### Step 9: Remove Old Code
**Files to update**:
- `src/lib/offseason.ts` - Remove contract/age-based progression
- UI components - Remove age/salary/contract displays
- **Status**: ⏳ Not started

### Step 10: UI Updates
**Files to create/update**:
- `src/components/ProgressionResults.tsx` - Progression popup
- `src/app/games/page.tsx` - Add "View IRL Result" button
- `src/app/roster/page.tsx` - Update to show year_in_school, historical stats
- **Status**: ⏳ Not started

### Step 11: Update SoT Document
**File**: `docs/SOURCE_OF_TRUTH.md`
**Status**: ⏳ Not started

## 🎯 Current Priority

**IMMEDIATE**: Test the MaxPreps scraping script
1. Run `node scripts/scrape-maxpreps.mjs`
2. Check if it successfully scrapes data
3. If it fails, we'll need to use Puppeteer for browser automation
4. Once data is scraped, run rating calculation script
5. Then proceed with updating initialization route

## 📝 Important Notes

- **Scraping Script**: The current implementation is basic HTML parsing. MaxPreps likely uses JavaScript-rendered content, so we may need Puppeteer.
- **Team Assignment**: College Park → plantsnft (FID 318447), other 5 teams random
- **Season Start**: Day 1 = OFFDAY (so coaches can choose train/study before first game)
- **Data Reset**: All existing game data will be deleted (profiles preserved)

## 🐛 Known Issues / Limitations

1. **Scraping Script**: May not work if MaxPreps uses JS-rendered content
2. **Team URLs**: Need to find actual MaxPreps URLs for all 6 teams
3. **Data Quality**: Scraped data may need manual cleanup/validation
