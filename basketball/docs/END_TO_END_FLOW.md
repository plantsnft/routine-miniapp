# Basketball Sim - End-to-End Flow Verification

This document verifies that the complete flow works from initialization through a full season.

## ✅ Flow Verification Checklist

### 1. Initialization ✅
- [ ] Admin clicks "Initialize league" button
- [ ] System fetches FIDs for: catwalk, farville, plantsnft
- [ ] Creates 4 profiles:
  - [ ] 3 Farcaster profiles (with FIDs)
  - [ ] 1 email profile (cpjets07@yahoo.com)
- [ ] Creates 4 teams with names: "Houston", "Atlanta", "Vegas", "NYC", assigns to profiles
- [ ] Creates 20 players:
  - [ ] Each team has 1 Elite, 1 Great, 3 Good
  - [ ] Each team has PG, SG, SF, PF, C
  - [ ] All players have UVA names (from 1980-1986 era, no duplicates)
  - [ ] Affinities randomly assigned
- [ ] Creates season_state: season 1, day 1, OFFDAY, REGULAR
- [ ] Creates initial stats records

### 2. User Login ✅
- [ ] Farcaster user can log in via Neynar SIWN
- [ ] Email user can log in via Supabase Auth magic link
- [ ] Profile created on first login (if not exists)
- [ ] User sees dashboard with their team

### 3. Offday Flow ✅
- [ ] Dashboard shows: Day X, OFFDAY
- [ ] User can submit offday action: TRAIN or PREP
- [ ] User can submit gameplan: Offense, Defense, Mentality
- [ ] System validates submission before midnight ET
- [ ] After midnight ET (or manual advance):
  - [ ] If TRAIN: applies +0.1% rating boost to all 5 players (capped by tier)
  - [ ] If PREP: sets `teams.prep_boost_active = true`
  - [ ] Increments day_number, flips day_type to GAMENIGHT

### 4. GameNight Flow ✅
- [ ] Dashboard shows: Day X, GAMENIGHT
- [ ] After midnight ET (or manual advance):
  - [ ] System loads scheduled games for this day
  - [ ] For each game:
    - [ ] Loads gameplans for both teams
    - [ ] Loads prep_boost_active flags
    - [ ] Loads player ratings
    - [ ] Calculates RPS advantage/disadvantage
    - [ ] Applies mentality multipliers
    - [ ] Applies prep boost if active
    - [ ] Calculates win probability
    - [ ] Generates team scores (winner always higher)
    - [ ] Distributes player points (sums to team total)
    - [ ] Updates game record (status=FINAL, scores, winner)
    - [ ] Updates game_player_lines (points per player)
    - [ ] Updates team_season_stats (W/L, points_for, points_against, streak)
    - [ ] Updates player_season_stats (points, games_played)
    - [ ] Consumes prep boost (sets prep_boost_active = false)
  - [ ] Increments day_number, flips day_type to OFFDAY

### 5. Season Progression ✅
- [ ] Days 1-27: Regular season games
  - [ ] Schedule follows round-robin pattern
  - [ ] Standings update correctly
- [ ] Day 27 completion: Transition to PLAYOFFS phase
  - [ ] Top 2 teams determined by record
  - [ ] Higher seed gets home advantage
- [ ] Days 28-30: Playoff games (best-of-3)
  - [ ] Game 1: Higher seed home
  - [ ] Game 2: Lower seed home
  - [ ] Game 3 (if needed): Higher seed home
- [ ] Day 30 completion: Transition to OFFSEASON phase

### 6. Offseason Flow ✅
- [ ] Aging: all players age +1
- [ ] Retirement: players age >= 36 removed
- [ ] Progression/regression applied:
  - [ ] Age < 25: rating *= 1.05
  - [ ] Age 25-29: rating *= 1.03
  - [ ] Age >= 30: rating *= 0.85
  - [ ] Ratings capped by tier
- [ ] Contracts: contract_years_remaining -= 1
- [ ] Auto-renew: expired contracts renewed (same salary, 3 years)
- [ ] Draft:
  - [ ] Generate draft pool: 10 players (1 Elite, 2 Great, 7 Good)
  - [ ] Draft order: reverse standings
  - [ ] Each team drafts 1, cuts 1 (lowest-rated player)
  - [ ] New players: age=20, 3-year contract, UVA names (from 1980-1986 era, no duplicates)
- [ ] New season: season_number++, day_number=1, phase=REGULAR, day_type=OFFDAY

### 7. Data Integrity ✅
- [ ] Player points always sum to team points (per game)
- [ ] Player points sum correctly across season
- [ ] Team stats (W/L, PPG) calculated correctly
- [ ] Player stats (PPG) calculated correctly
- [ ] Standings sorted correctly
- [ ] No orphaned records (all foreign keys valid)

### 8. Edge Cases ✅
- [ ] Missing gameplan: applies worst penalty
- [ ] Missing offday action: no training/prep applied
- [ ] Multiple submissions: only latest counts (UNIQUE constraint)
- [ ] Timezone handling: all calculations use Eastern Time
- [ ] Manual advance: works independently of cron

## 🧪 Test Scenarios

### Scenario 1: Full Season Run
1. Initialize league
2. Complete 30 regular season days (15 offdays, 15 gamenights)
3. Complete playoffs (3 days)
4. Complete offseason
5. Start season 2
6. Verify all data is correct

### Scenario 2: Strategy Impact
1. Team A uses Drive + Zone defense
2. Team B uses Shoot + Man defense
3. Verify RPS advantage applies correctly
4. Verify scores reflect strategy impact

### Scenario 3: Prep Boost
1. Team submits PREP on offday
2. Next game: verify +25% multiplier applied
3. After game: verify prep_boost_active = false
4. Next game: verify no boost (unless PREP submitted again)

### Scenario 4: Training
1. Team submits TRAIN on offday
2. Verify all 5 players get +0.1% rating boost
3. Verify ratings capped by tier
4. Verify boost is permanent (not consumed)

### Scenario 5: Player Points Distribution
1. Simulate a game
2. Verify sum of all 5 player points = team points
3. Verify affinity affects distribution
4. Verify rounding doesn't cause drift

## ✅ Success Criteria

All checkboxes above must pass for MVP to be considered complete.
