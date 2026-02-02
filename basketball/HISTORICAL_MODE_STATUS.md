# Historical Mode Implementation Status

## ✅ Completed

### Phase 1: Database Schema
- ✅ Created `supabase_migration_historical_mode.sql`
  - New tables: `historical_players`, `historical_teams`, `historical_schedules`, `retired_players`
  - Modified `players`: Removed age/tier/salary/contract, added year_in_school/historical_year/ratings
  - Modified `teams`: Added historical_year, historical_team_id, team_strength_rating
  - Modified `games`: Added historical_game_id, actual scores, game_date, district flags
  - Modified `player_season_stats`: Added all stat fields (rebounds, assists, steals, blocks, etc.)
  - Modified `season_state`: Removed 60-day constraint (dynamic per season)

### Phase 2: Constants & Configuration
- ✅ Updated `src/lib/constants.ts`
  - Added FIDs for librarian (623879) and monument (624048)
  - Added FARCASTER_FIDS mapping
  - Added COLLEGE_PARK_OWNER_FID (318447 = plantsnft)
  - Marked old constants as deprecated

### Phase 3: Data Reset Script
- ✅ Created `scripts/reset-data.mjs`
  - Deletes all games, players, teams, stats
  - Resets season_state to Day 1, OFFDAY
  - Preserves profiles (users don't need to re-register)

## 📋 Next Steps (In Order)

### 1. Run Database Migration
**Action**: Execute `supabase_migration_historical_mode.sql` in Supabase SQL Editor

**What it does**:
- Creates historical tables
- Modifies existing tables
- Sets up RLS policies

### 2. Run Data Reset Script
**Action**: `node scripts/reset-data.mjs`

**What it does**:
- Clears all existing game data
- Prepares for fresh historical mode start

### 3. Build MaxPreps Scraping Script
**Priority**: HIGH - This is the foundation for all historical data

**Requirements**:
- Scrape College Park, Lufkin, Conroe, The Woodlands, Oak Ridge, Magnolia
- Years: 2005-06 and 2006-07
- Extract: rosters, player stats, team standings, schedules, game results
- Store in `historical_players`, `historical_teams`, `historical_schedules`

**Challenges**:
- MaxPreps may have rate limiting
- Need to handle missing data gracefully
- Need to normalize team names across pages
- Need to match players across seasons

### 4. Implement Player Rating System
**File**: `src/lib/playerRatings.ts` (new)

**Functions needed**:
- `calculateBaseRating(stats)` - PPG 25%, RPG 25%, APG 25%, Steals+Blocks 25%
- `normalizeRatings(players, season)` - 10% above 90, 25% in 80s, rest below
- `calculateStartingRating(firstSeasonStats)` - from first varsity season
- `calculatePotentialRating(bestSeasonStats)` - from best season + 3 to each stat

### 5. Update Team Initialization
**File**: `src/app/api/admin/initialize/route.ts`

**Changes needed**:
- Fetch 6 FIDs (catwalk, farville, plantsnft, librarian, monument, email)
- Create 6 teams from historical data
- Assign College Park to plantsnft (FID 318447)
- Assign other 5 teams randomly
- Load players from `historical_players` for that year
- Set starting ratings, potential ratings
- Set team strength ratings

### 6. Update Schedule System
**File**: `src/lib/gameSimulation.ts`

**Changes needed**:
- Replace `generateScheduleForGameNight()` with historical schedule loader
- Load from `historical_schedules` table
- Map historical dates to game days (OFFDAY/GAMENIGHT pattern)
- Handle variable number of games per season

### 7. Update Game Simulation
**File**: `src/lib/gameSimulation.ts`

**Changes needed**:
- For out-of-conference games: Use historical result to inform win probability
  - Formula: `win_prob = max(0.05, min(0.95, 0.5 - (margin / 40)))`
- Store actual results in `games.actual_home_score`, `games.actual_away_score`
- Link to `historical_schedules` via `historical_game_id`

### 8. Implement Player Progression
**File**: `src/lib/playerProgression.ts` (new)

**Functions needed**:
- `processPlayerProgression(seasonNumber, isPreDistrict)` - Main function
- Calculate wins bonus: `+0.1% per win`
- Calculate stat bonus: `+1 point per 10% above season average`
- Calculate minutes bonus: `+0.1% per 3-minute average above 20`
- Cap at potential_rating and 97 max
- Return progression results for UI

### 9. Remove Old Code
**Files to update**:
- `src/lib/offseason.ts` - Remove contract/age-based progression
- Any UI displaying age/salary/contracts
- Update to use new progression system

### 10. UI Updates
**Files to create/update**:
- `src/components/ProgressionResults.tsx` - Popup showing progression increases
- `src/app/games/page.tsx` - Add "View IRL Result" button
- `src/app/roster/page.tsx` - Remove age/salary, add year_in_school, historical stats

### 11. Update SoT Document
**File**: `docs/SOURCE_OF_TRUTH.md`

**Major sections to update**:
- Product Summary (6 teams, historical mode)
- Season Structure (dynamic, historical schedules)
- Player System (stat-based ratings, year_in_school)
- Team System (historical teams, strength ratings)
- Schedule System (historical schedules)
- Progression System (new formula)
- Database Schema (all new tables/fields)

## 🎯 Current Status

**Ready to proceed with**: MaxPreps scraping script (Phase 3)

**Blockers**: None - can start scraping script immediately

**Estimated Time**: 
- Scraping script: 2-3 hours (complex, needs testing)
- Rating system: 1 hour
- Team initialization: 1 hour
- Schedule system: 2 hours
- Progression system: 1 hour
- UI updates: 2 hours
- SoT updates: 1 hour
- **Total**: ~10-12 hours of development

## 📝 Notes

- Season starts on OFFDAY (Day 1) so coaches can choose train/study opponent before first game
- College Park assigned to plantsnft (FID 318447), other 5 teams random
- All existing game data will be deleted (preserves user profiles)
- Historical data is source of truth - simulation uses it to inform probabilities
