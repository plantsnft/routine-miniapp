# Historical Mode Implementation Plan

## Overview
Transform the basketball simulation from a generic 4-team league to a historical recreation of College Park High School's district, starting with the 2005-06 and 2006-07 seasons. This includes real teams, real players, real schedules, and stat-based player ratings.

---

## Phase 1: Database Schema Changes

### 1.1 New Historical Tables

#### `basketball.historical_players`
Source of truth for all historical player data from MaxPreps.
```sql
CREATE TABLE IF NOT EXISTS basketball.historical_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  historical_year integer NOT NULL, -- e.g., 2005 for 2005-06 season
  team_name text NOT NULL, -- e.g., "College Park"
  position text CHECK (position IN ('PG', 'SG', 'SF', 'PF', 'C')),
  height_inches integer, -- fallback for position if not available
  year_in_school text CHECK (year_in_school IN ('Freshman', 'Sophomore', 'Junior', 'Senior')),
  
  -- Actual stats from MaxPreps
  ppg numeric,
  rpg numeric, -- rebounds per game
  apg numeric, -- assists per game
  spg numeric, -- steals per game
  bpg numeric, -- blocks per game
  mpg numeric, -- minutes per game
  
  -- Calculated fields
  starting_rating numeric, -- from first varsity season
  potential_rating numeric, -- from best season + 3 points to each stat
  best_season_year integer, -- year of best season
  
  -- Metadata
  maxpreps_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(name, historical_year, team_name) -- prevent duplicates
);

CREATE INDEX IF NOT EXISTS historical_players_year_team_idx 
ON basketball.historical_players (historical_year, team_name);
CREATE INDEX IF NOT EXISTS historical_players_name_idx 
ON basketball.historical_players (name);
```

#### `basketball.historical_teams`
Source of truth for historical team data.
```sql
CREATE TABLE IF NOT EXISTS basketball.historical_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  historical_year integer NOT NULL,
  
  -- Standings data
  district_wins integer,
  district_losses integer,
  overall_wins integer,
  overall_losses integer,
  points_for integer,
  points_against integer,
  district_rank integer, -- 1-6 (or however many teams in district)
  
  -- Calculated team strength rating
  team_strength_rating numeric, -- calculated from standings (district 75%, margin 15%, overall 10%)
  
  -- Metadata
  maxpreps_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(name, historical_year)
);

CREATE INDEX IF NOT EXISTS historical_teams_year_idx 
ON basketball.historical_teams (historical_year);
```

#### `basketball.historical_schedules`
Exact historical game schedules with results.
```sql
CREATE TABLE IF NOT EXISTS basketball.historical_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  historical_year integer NOT NULL,
  game_date date, -- actual date from MaxPreps
  home_team_name text NOT NULL,
  away_team_name text NOT NULL,
  
  -- Actual results
  home_score integer,
  away_score integer,
  winner_team_name text,
  margin integer, -- point differential
  
  -- Game type
  is_district_game boolean NOT NULL DEFAULT false, -- true if both teams in district
  is_out_of_conference boolean NOT NULL DEFAULT false,
  
  -- For simulation probability calculation
  expected_win_probability numeric, -- calculated from margin (e.g., 20pt loss = 5% win chance)
  
  -- Metadata
  maxpreps_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historical_schedules_year_idx 
ON basketball.historical_schedules (historical_year);
CREATE INDEX IF NOT EXISTS historical_schedules_teams_idx 
ON basketball.historical_schedules (home_team_name, away_team_name);
```

#### `basketball.retired_players`
Players from teams that left the district.
```sql
CREATE TABLE IF NOT EXISTS basketball.retired_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES basketball.players(id),
  retired_season integer NOT NULL,
  retired_reason text NOT NULL DEFAULT 'team_left_district',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retired_players_player_id_idx 
ON basketball.retired_players (player_id);
```

### 1.2 Modify Existing Tables

#### `basketball.players`
Remove: `age`, `tier`, `salary_m`, `contract_years_remaining`
Add: `year_in_school`, `historical_year`, `starting_rating`, `potential_rating`, `historical_player_id` (reference to historical_players)

```sql
-- Remove columns
ALTER TABLE basketball.players DROP COLUMN IF EXISTS age;
ALTER TABLE basketball.players DROP COLUMN IF EXISTS tier;
ALTER TABLE basketball.players DROP COLUMN IF EXISTS salary_m;
ALTER TABLE basketball.players DROP COLUMN IF EXISTS contract_years_remaining;

-- Add new columns
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS year_in_school text CHECK (year_in_school IN ('Freshman', 'Sophomore', 'Junior', 'Senior'));
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS historical_year integer;
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS starting_rating numeric;
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS potential_rating numeric;
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS historical_player_id uuid REFERENCES basketball.historical_players(id);

-- Update rating constraint (still 0-99)
ALTER TABLE basketball.players DROP CONSTRAINT IF EXISTS players_rating_check;
ALTER TABLE basketball.players ADD CONSTRAINT players_rating_check 
CHECK (rating >= 0 AND rating <= 99);
```

#### `basketball.teams`
Add: `historical_year`, `historical_team_id`, `team_strength_rating`

```sql
ALTER TABLE basketball.teams 
ADD COLUMN IF NOT EXISTS historical_year integer;
ALTER TABLE basketball.teams 
ADD COLUMN IF NOT EXISTS historical_team_id uuid REFERENCES basketball.historical_teams(id);
ALTER TABLE basketball.teams 
ADD COLUMN IF NOT EXISTS team_strength_rating numeric;
```

#### `basketball.games`
Add: `historical_game_id`, `actual_home_score`, `actual_away_score`, `game_date`, `is_district_game`, `is_out_of_conference`

```sql
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS historical_game_id uuid REFERENCES basketball.historical_schedules(id);
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS actual_home_score integer; -- IRL result
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS actual_away_score integer; -- IRL result
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS game_date date;
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS is_district_game boolean NOT NULL DEFAULT false;
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS is_out_of_conference boolean NOT NULL DEFAULT false;
```

#### `basketball.player_season_stats`
Add: `minutes_played`, `rebounds`, `assists`, `steals`, `blocks`, `ppg`, `rpg`, `apg`, `spg`, `bpg`, `mpg`

```sql
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS minutes_played integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS rebounds integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS assists integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS steals integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS blocks integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS ppg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS rpg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS apg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS spg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS bpg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS mpg numeric;
```

### 1.3 Update Season State
Remove 60-day constraint, make it dynamic based on historical schedule.

```sql
ALTER TABLE basketball.season_state 
DROP CONSTRAINT IF EXISTS season_state_day_number_check;
ALTER TABLE basketball.season_state 
ADD CONSTRAINT season_state_day_number_check 
CHECK (day_number >= 1); -- No upper limit, dynamic per season
```

---

## Phase 2: MaxPreps Scraping Script

### 2.1 Script Structure
**File**: `scripts/scrape-maxpreps.mjs`

**Requirements**:
- Scrape all 6 teams in College Park's district for 2005-06 and 2006-07
- Extract: rosters, player stats, team standings, schedules, game results
- Store in `historical_players`, `historical_teams`, `historical_schedules` tables
- Handle rate limiting, errors, retries
- Log progress and errors

### 2.2 Scraping Targets

**Teams to Scrape** (determined from MaxPreps district pages):
1. College Park
2. Lufkin
3. Conroe
4. The Woodlands
5. Oak Ridge
6. Magnolia
(Plus any other teams that were in district those years)

**Data to Extract Per Team Per Year**:
- **Roster**: Name, position, year in school, height, stats (PPG, RPG, APG, SPG, BPG, MPG)
- **Standings**: District W-L, Overall W-L, Points For/Against, District Rank
- **Schedule**: All games with dates, opponents, scores, home/away

### 2.3 Scraping Logic

1. **Identify District Teams**:
   - Start with College Park's history page
   - For each year (2005, 2006), find district page
   - Extract all teams in district that year

2. **Scrape Each Team**:
   - Roster page → extract all players with stats
   - Standings page → extract team record
   - Schedule page → extract all games with results

3. **Data Normalization**:
   - Normalize team names (handle variations)
   - Match players across seasons (same name + team)
   - Calculate starting_rating and potential_rating

4. **Store in Database**:
   - Insert into `historical_players`, `historical_teams`, `historical_schedules`
   - Handle duplicates (ON CONFLICT DO NOTHING or UPDATE)

---

## Phase 3: Player Rating System

### 3.1 Rating Formula

**Base Rating Calculation** (from stats):
```
rating = (PPG * 0.25) + (RPG * 0.25) + (APG * 0.25) + ((SPG + BPG) * 0.125)
```

**Normalization** (across all players in database for that season):
- Sort all players by calculated rating
- Top 10% → scale to 90-97 range
- Next 25% → scale to 80-89 range
- Rest → scale to 55-79 range
- Minimum: 55, Maximum: 97

### 3.2 Starting Rating vs Potential

- **Starting Rating**: From first varsity season stats (normalized)
- **Potential Rating**: From best season stats + 3 points to each stat category, then normalized
  - Best PPG + 3, Best RPG + 3, Best APG + 3, Best (SPG+BPG) + 3
  - Recalculate rating formula
  - Cap at 97

### 3.3 Position Assignment

**Priority**:
1. Use position from MaxPreps if available
2. If not available, infer from height:
   - < 6'0" → PG
   - 6'0" - 6'3" → SG
   - 6'4" - 6'6" → SF
   - 6'7" - 6'9" → PF
   - 6'10"+ → C
3. If height not available, default to 6'3" (SG)

---

## Phase 4: Team Initialization (6 Teams)

### 4.1 New User Accounts

Add 2 new Farcaster profiles:
- `librarian` (FID to be fetched)
- `monument` (FID to be fetched)

### 4.2 Team Assignment

**6 Teams** (from historical data):
1. College Park → catwalk
2. Lufkin → farville
3. Conroe → plantsnft
4. The Woodlands → email (cpjets07@yahoo.com)
5. [Team 5] → librarian
6. [Team 6] → monument

**Team Assignment Logic**:
- Use actual historical team names from MaxPreps
- Assign based on district standings (best teams to first users, etc.)
- Or assign alphabetically/randomly (user preference)

### 4.3 Team Strength Rating

**Formula** (from historical standings):
```
team_strength_rating = (
  (district_rank_score * 0.75) +  -- 1st = 100, 2nd = 85, etc.
  (margin_score * 0.15) +         -- based on point differential
  (overall_record_score * 0.10)   -- based on overall W-L%
)
```

Where:
- `district_rank_score = 100 - (rank - 1) * 15` (1st = 100, 2nd = 85, 3rd = 70, etc.)
- `margin_score = normalized point differential`
- `overall_record_score = win_percentage * 100`

---

## Phase 5: Historical Schedule System

### 5.1 Schedule Generation

**Replace round-robin with historical schedule**:
- Load `historical_schedules` for current season's `historical_year`
- Filter by teams in current league
- Map to game days (OFFDAY/GAMENIGHT pattern)
- Preserve actual dates for UI display

### 5.2 Game Simulation with Historical Context

**For District Games**:
- Use normal simulation (team ratings, gameplans, etc.)
- Historical result informs expected outcome but doesn't determine it

**For Out-of-Conference Games**:
- Use historical result to calculate win probability
- Example: If team lost by 20 points IRL → 5% win chance in simulation
- Formula: `win_prob = max(0.05, min(0.95, 0.5 - (margin / 40)))`
- Still simulate (not hardcoded), but heavily weighted toward historical result

### 5.3 Schedule Structure

**Day Progression**:
- Keep OFFDAY/GAMENIGHT alternation
- Number of days = (number of games * 2) + buffer
- Games scheduled based on historical dates (mapped to game days)

---

## Phase 6: Player Progression System

### 6.1 Progression Triggers

**When**: 
- Before district games (pre-season/out-of-conference period)
- During offseason (between seasons)

**Not during**: Regular district games

### 6.2 Progression Formula

**Additive bonuses** (added to overall rating):

1. **Win Bonus**: `+0.1% per win`
   - `bonus = rating * 0.001 * wins`

2. **Stat Above Average Bonus**: `+1 point per 10% above season average`
   - For each stat (PPG, RPG, APG, SPG, BPG):
     - `percent_above_avg = ((player_stat - season_avg) / season_avg) * 100`
     - `bonus_points = floor(percent_above_avg / 10)`
   - Sum all bonuses

3. **Minutes Bonus**: `+0.1% per 3-minute average above baseline`
   - `baseline = 20 minutes` (assumed average)
   - `minutes_above = max(0, mpg - 20)`
   - `bonus = rating * 0.001 * floor(minutes_above / 3)`

**Total Progression**:
```
new_rating = current_rating + win_bonus + stat_bonus + minutes_bonus
new_rating = min(potential_rating, new_rating)  -- Cap at potential
new_rating = min(97, new_rating)  -- Hard cap
```

### 6.3 Progression UI

**Popup Component** (shown after progression):
- Display player name, team
- Show increases: "+2.3 rating from wins", "+1.5 from stats", "+0.8 from minutes"
- Total increase
- New rating
- Don't show formula, just results

---

## Phase 7: Code Updates

### 7.1 Remove Salary/Contract Logic

**Files to Update**:
- `src/lib/offseason.ts` - Remove contract processing
- `src/app/api/admin/initialize/route.ts` - Remove salary/contract assignment
- Any UI displaying salary/contracts

### 7.2 Remove Age/Tier Logic

**Files to Update**:
- `src/lib/offseason.ts` - Remove age-based progression, use new progression system
- `src/app/api/admin/initialize/route.ts` - Remove age/tier assignment
- Replace with `year_in_school` and rating-based system

### 7.3 Update Schedule Generation

**File**: `src/lib/gameSimulation.ts`

**Changes**:
- Replace `generateScheduleForGameNight()` with historical schedule loader
- Load from `historical_schedules` table
- Map historical dates to game days
- Handle variable number of games per season

### 7.4 Update Game Simulation

**File**: `src/lib/gameSimulation.ts`

**Changes**:
- For out-of-conference games, use historical result to inform win probability
- Store actual results in `games.actual_home_score`, `games.actual_away_score`
- Link to `historical_schedules` via `historical_game_id`

### 7.5 Update Player Progression

**File**: `src/lib/offseason.ts` (or new `src/lib/playerProgression.ts`)

**New Function**: `processPlayerProgression(seasonNumber, isPreDistrict)`
- Calculate wins, stat averages, minutes
- Apply progression formula
- Update player ratings
- Return progression results for UI

### 7.6 Update Team Initialization

**File**: `src/app/api/admin/initialize/route.ts`

**Changes**:
- Fetch FIDs for 6 users (catwalk, farville, plantsnft, email, librarian, monument)
- Create 6 teams from historical data
- Assign players from `historical_players` for that year
- Set starting ratings, potential ratings
- Set team strength ratings

---

## Phase 8: UI Updates

### 8.1 Game Results Display

**File**: `src/app/games/page.tsx`

**Add**:
- Display actual game date
- Show "View IRL Result" button/link
- Display actual scores when viewing IRL result
- Show if game is district or out-of-conference

### 8.2 Progression Results Popup

**New Component**: `src/components/ProgressionResults.tsx`

**Display**:
- Player name, team
- Rating increases (wins, stats, minutes)
- Total increase
- New rating
- Close button

**Trigger**: After progression processing (pre-district, offseason)

### 8.3 Roster Display

**File**: `src/app/roster/page.tsx`

**Update**:
- Remove age, salary, contract display
- Add year in school
- Show starting rating, current rating, potential rating
- Show historical stats (PPG, RPG, APG, etc.)

---

## Phase 9: SoT Document Updates

### 9.1 Major Sections to Update

1. **Product Summary**: Change from 4 teams to 6 teams, historical mode
2. **Season Structure**: Remove 60-day fixed calendar, use historical schedules
3. **Player System**: Remove age/tier/salary, add year_in_school, stat-based ratings
4. **Team System**: Add historical teams, team strength ratings
5. **Schedule System**: Replace round-robin with historical schedules
6. **Progression System**: New formula (wins, stats, minutes)
7. **Database Schema**: Add historical tables, modify existing tables

---

## Phase 10: Implementation Order

### Step 1: Database Schema (Phase 1)
- Create migration script
- Test in development
- Apply to production

### Step 2: Scraping Script (Phase 2)
- Build MaxPreps scraper
- Test on College Park 2005-06
- Scrape all 6 teams for 2005-06 and 2006-07
- Verify data quality

### Step 3: Rating System (Phase 3)
- Implement rating formula
- Implement normalization
- Test on scraped data

### Step 4: Team Initialization (Phase 4)
- Update initialize endpoint
- Test with 6 teams
- Verify team assignments

### Step 5: Schedule System (Phase 5)
- Update schedule generation
- Test with historical schedule
- Verify game simulation

### Step 6: Progression System (Phase 6)
- Implement progression formula
- Test calculations
- Build UI popup

### Step 7: Code Cleanup (Phase 7)
- Remove salary/contract/age/tier code
- Update all references
- Test thoroughly

### Step 8: UI Updates (Phase 8)
- Add IRL results view
- Add progression popup
- Update roster display

### Step 9: SoT Updates (Phase 9)
- Update documentation
- Verify all changes documented

### Step 10: Testing
- End-to-end test with historical data
- Verify progression works
- Verify schedule matches historical
- Verify ratings are reasonable

---

## Questions Resolved

✅ **Rating Formula**: PPG 25%, RPG 25%, APG 25%, Steals+Blocks 25% (equal split)
✅ **Normalization**: 10% above 90, 25% in 80s, rest below (across all players in season)
✅ **Starting vs Potential**: Starting from first season, potential from best season + 3 to each stat
✅ **Position**: Use MaxPreps position, fallback to height (6'3" default)
✅ **Teams**: 6 teams, scrape all in district for each year
✅ **Schedule**: Exact historical schedule with dates
✅ **Progression**: Wins (+0.1% each), stats (+1 per 10% above avg), minutes (+0.1% per 3 min above 20)
✅ **Age**: Remove, use year_in_school
✅ **Salary/Contracts**: Remove entirely
✅ **Player ID**: Keep same across seasons, update stats

---

## Next Steps

1. Review this plan with user
2. Get FIDs for librarian and monument Farcaster accounts
3. Confirm team assignment order
4. Start with Phase 1 (database schema)
5. Build scraping script
6. Iterate through phases
