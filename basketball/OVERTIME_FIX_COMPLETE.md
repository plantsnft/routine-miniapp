# Overtime Fix - Implementation Complete ✅

## Problem
Games were ending in ties (e.g., 105-105) but showing "✓ Win" incorrectly. The SoT requires no ties - if scores are equal, the game should go to overtime.

## Solution Implemented

### 1. Database Migration ✅
- **File**: `supabase_migration_add_overtime_count.sql`
- **Change**: Added `overtime_count` field to `basketball.games` table
- **Type**: `integer NOT NULL DEFAULT 0`
- **Purpose**: Tracks number of overtime periods (0 = no overtime, 1 = OT, 2 = 2OT, etc.)

### 2. Overtime Score Generation ✅
- **Function**: `generateOvertimeScore()` in `src/lib/gameSimulation.ts`
- **Formula**: Scaled-down version of regular game scoring
  - Regular: `basePts = 55 + avgPlayerRating * 0.55`, then `teamPts = basePts + (share - 0.5) * 20 + noise(-8 to +8)`
  - Overtime: `basePts = 6 + avgPlayerRating * 0.09`, then `teamPts = basePts + (share - 0.5) * 3 + noise(-2 to +2)`
  - **Range**: 6-15 points per team per overtime period
  - **Proportional**: Uses same team strength calculation (gameRatingShare) as regular game

### 3. Overtime Simulation Logic ✅
- **Location**: `simulateGame()` function in `src/lib/gameSimulation.ts`
- **Flow**:
  1. Generate initial scores naturally (no forced adjustment)
  2. Check if scores are tied
  3. If tied, simulate overtime periods:
     - Generate overtime scores (6-15 points each)
     - Add to existing scores
     - Repeat until scores differ or max overtimes reached (10 max for safety)
  4. If still tied after max overtimes, force winner based on original probability
  5. Final guarantee: Ensure winner has higher score

### 4. GameResult Interface Update ✅
- **Change**: Added `overtime_count: number` to `GameResult` interface
- **Purpose**: Pass overtime count from simulation to game storage

### 5. Game Storage Update ✅
- **Location**: `simulateGameNight()` and `simulatePlayoffGameNight()` in `src/lib/gameSimulation.ts`
- **Change**: Include `overtime_count` when saving games to database
- **Result**: All games now store overtime count

### 6. API Win/Loss Fix ✅
- **File**: `src/app/api/games/route.ts`
- **Change**: Calculate `is_win` based on actual scores, not just `winner_team_id`
- **Logic**:
  ```typescript
  const actualWinner = game.home_score > game.away_score 
    ? game.home_team_id 
    : game.away_score > game.home_score 
    ? game.away_team_id 
    : null;
  const isWin = teamId && actualWinner ? actualWinner === teamId : null;
  ```
- **Result**: Win/loss now correctly reflects actual scores

### 7. API Overtime Count ✅
- **Files**: 
  - `src/app/api/games/route.ts` - Include `overtime_count` in game list
  - `src/app/api/games/[gameId]/route.ts` - Include `overtime_count` in game details
- **Result**: Frontend receives overtime count for display

### 8. UI Overtime Display ✅
- **File**: `src/app/games/page.tsx`
- **Changes**:
  - Added `overtime_count` to `Game` interface
  - Display OT indicator badge next to "Day X" (shows "OT", "2OT", "3OT", etc.)
  - Display overtime indicator in game details box score
- **Visual**: Orange badge with white text showing overtime count

## Files Modified

1. ✅ `supabase_migration_add_overtime_count.sql` - Database migration
2. ✅ `src/lib/gameSimulation.ts` - Overtime logic, score generation, game storage
3. ✅ `src/app/api/games/route.ts` - Win/loss calculation fix, overtime_count in response
4. ✅ `src/app/api/games/[gameId]/route.ts` - Overtime_count in game details
5. ✅ `src/app/games/page.tsx` - UI overtime display

## Testing Checklist

- [ ] Run database migration: `supabase_migration_add_overtime_count.sql`
- [ ] Simulate a game that results in a tie
- [ ] Verify overtime is simulated (scores differ after overtime)
- [ ] Verify `overtime_count` is saved correctly
- [ ] Verify UI shows "OT" badge for overtime games
- [ ] Verify win/loss is calculated correctly (based on scores, not just winner_team_id)
- [ ] Verify no games end in ties (all games have winner with higher score)

## Next Steps

1. **Run Database Migration**: Execute `supabase_migration_add_overtime_count.sql` in Supabase SQL Editor
2. **Test**: Simulate games and verify overtime works correctly
3. **Verify**: Check that no games end in ties and overtime is displayed correctly

## Notes

- **Overtime Scoring**: 6-15 points per team per overtime, proportional to team strength
- **Max Overtimes**: 10 (safety limit to prevent infinite loops)
- **Player Points**: Overtime points are added to regular game total (included in player totals)
- **Display**: Shows "OT", "2OT", "3OT", etc. in UI and box score
