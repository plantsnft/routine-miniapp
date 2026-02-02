# Phase 4 Implementation - Complete ✅

## What Was Implemented

### ✅ Schedule Generator

**File**: `src/lib/gameSimulation.ts`

**Function**: `generateScheduleForGameNight(gameNightNumber, teams)`

- ✅ Implements round-robin pattern for 4 teams
- ✅ 3-day cycle:
  - GameNight 1: Team1 vs Team2, Team3 vs Team4
  - GameNight 2: Team1 vs Team3, Team2 vs Team4
  - GameNight 3: Team1 vs Team4, Team2 vs Team3
- ✅ Repeats every 3 game nights (10 full cycles = 30 game nights)

### ✅ Game Simulation Engine

**File**: `src/lib/gameSimulation.ts`

**Function**: `simulateGameNight(seasonNumber, dayNumber)`

**Complete Implementation**:

1. ✅ **Schedule Generation**
   - Generates games for current game night
   - Uses round-robin pattern

2. ✅ **Gameplan Loading**
   - Loads gameplans for all teams for this day
   - Handles missing gameplans (worst penalty per SoT)

3. ✅ **RPS Strategy Calculation**
   - Drive vs Zone → Defense advantage (offense ×0.8)
   - Drive vs Man → Offense advantage (offense ×1.2)
   - Shoot vs Zone → Offense advantage (offense ×1.2)
   - Shoot vs Man → Defense advantage (offense ×0.8)

4. ✅ **Mentality Multipliers**
   - Aggressive vs Zone → +20% (×1.2)
   - Aggressive vs Man → -20% (×0.8)
   - Conservative vs Man → +20% (×1.2)
   - Conservative vs Zone → -20% (×0.8)
   - Neutral → 0% (×1.0)

5. ✅ **Prep Boost**
   - +25% multiplier if `prep_boost_active = true`
   - Consumed after game (set to false)

6. ✅ **Missing Gameplan Penalty**
   - Offense/Defense treated as disadvantaged in RPS
   - Mentality treated as wrong (-20% multiplier)

7. ✅ **Win Probability Calculation**
   - Base: `homeRating / (homeRating + awayRating)`
   - Home advantage: +3%
   - Clamped to [0.15, 0.85]

8. ✅ **Score Generation**
   - Base: `55 + (avgPlayerRating * 0.55)`
   - Performance modifier: `(share - 0.5) * 20`
   - Noise: Uniform(-8, +8)
   - MVP: Winner always has higher score

9. ✅ **Player Point Distribution**
   - Base weight: player rating
   - Affinity multiplier:
     - StrongVsZone vs Zone: ×1.15
     - StrongVsZone vs Man: ×0.85
     - StrongVsMan vs Man: ×1.15
     - StrongVsMan vs Zone: ×0.85
   - Points sum to team total (rounding fix applied)

10. ✅ **Stats Updates**
    - **Games table**: Stores game record with scores, winner, status
    - **game_player_lines**: Stores player points per game
    - **team_season_stats**: Updates W/L, points_for, points_against, streak
    - **player_season_stats**: Updates points, games_played

11. ✅ **Prep Boost Consumption**
    - Sets `prep_boost_active = false` after game

### ✅ Admin Endpoint

**File**: `src/app/api/admin/simulate/route.ts`

**Endpoint**: `POST /api/admin/simulate`

**Features**:
- ✅ Validates current day is GAMENIGHT
- ✅ Validates season/day match current state
- ✅ Calls `simulateGameNight()` to simulate all games
- ✅ Returns success/error response

**Note**: Admin check is TODO for Phase 5 (all users are admin in MVP)

## Implementation Details (Following SoT)

### Game Simulation Formula (Per SoT)

1. **Team Strength**: `sum(player.rating)`
2. **Game Rating Multiplier**:
   ```
   mult = 1.0
   mult *= RPS_multiplier (1.2 if advantaged, 0.8 if disadvantaged)
   mult *= mentality_multiplier (1.2 if correct, 0.8 if wrong, 1.0 if neutral)
   mult *= 1.25 if prep_boost_active
   ```
3. **Game Rating**: `sum(player.rating) * mult`
4. **Win Probability**: `homeRating / (homeRating + awayRating) + 0.03` (clamped [0.15, 0.85])
5. **Team Score**: `55 + (avgRating * 0.55) + (share - 0.5) * 20 + noise`
6. **Player Points**: Distributed by rating + affinity, sums to team total

### Schedule Pattern (Per SoT)

- **4 teams**: Round-robin 3-day cycle
- **30 game nights**: 10 full cycles
- **Pattern**:
  - Day 1: T1 vs T2, T3 vs T4
  - Day 2: T1 vs T3, T2 vs T4
  - Day 3: T1 vs T4, T2 vs T3
  - Repeat...

### Missing Gameplan Handling (Per SoT)

- Offense/Defense: Treated as disadvantaged in RPS (Drive vs Zone = ×0.8)
- Mentality: Treated as wrong (-20% = ×0.8)
- No prep boost unless previously set

## How to Use

1. **Ensure league is initialized** (Phase 2)
2. **Ensure current day is GAMENIGHT** (check season_state)
3. **Call endpoint**:
   ```bash
   POST /api/admin/simulate
   ```
4. **Response**:
   ```json
   {
     "ok": true,
     "message": "Games simulated successfully for Season 1, Day 2",
     "season_number": 1,
     "day_number": 2
   }
   ```

## Database Updates

After simulation, the following tables are updated:
- ✅ `basketball.games` - Game records
- ✅ `basketball.game_player_lines` - Player points per game
- ✅ `basketball.team_season_stats` - Team W/L, points, streaks
- ✅ `basketball.player_season_stats` - Player points, games played
- ✅ `basketball.teams` - Prep boost consumed (set to false)

## Next Steps

Phase 4 is complete! Ready for:
- **Phase 5**: Cron + Automation
  - Will add Vercel cron to advance days
  - Will process offday actions (TRAIN)
  - Will call simulate endpoint automatically

## Testing Notes

To test Phase 4:
1. Initialize league (Phase 2)
2. Advance to a GAMENIGHT (manually update season_state or wait for Phase 5)
3. Submit gameplans (Phase 3)
4. Call `/api/admin/simulate`
5. Verify:
   - Games created in `games` table
   - Player lines created
   - Stats updated correctly
   - Prep boosts consumed

---

**Status**: ✅ **Phase 4 Complete** - Game Simulation Engine fully implemented per SoT
