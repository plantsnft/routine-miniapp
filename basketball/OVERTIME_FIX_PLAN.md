# Overtime Fix Implementation Plan

## Requirements Summary
1. **Overtime Scoring**: 6-15 points, proportional to team strength, same formula but smaller scale
2. **Overtime Tracking**: Track `overtime_count` in database for UI display
3. **Max Overtimes**: Unlimited (with safety limit to prevent infinite loops)
4. **Overtime Display**: Show "OT", "2OT", etc. in UI and box score
5. **Player Points**: Add overtime points to regular total

## Implementation Steps

### Step 1: Database Migration
- Add `overtime_count` field to `basketball.games` table
- Default: 0 (no overtime)
- Type: integer NOT NULL DEFAULT 0

### Step 2: Fix Score Adjustment Logic
- Replace current adjustment with loop that guarantees winner has higher score
- Ensure scores are never equal before overtime check

### Step 3: Implement Overtime Logic
- After initial score generation, check if scores are equal
- If equal, simulate overtime:
  - Use smaller scale version of `generateTeamScore` (6-15 points range)
  - Proportional to team strength (use same formula but scaled down)
  - Add to existing scores
  - Increment `overtime_count`
  - Repeat if still tied (with safety limit, e.g., 10 overtimes max)

### Step 4: Update GameResult Interface
- Add `overtime_count: number` to `GameResult` interface

### Step 5: Fix UI Win/Loss Calculation
- Calculate `is_win` based on actual scores, not just `winner_team_id`
- Verify `winner_team_id` matches score-based winner

### Step 6: Update UI Display
- Show "OT", "2OT", "3OT", etc. in game list
- Show overtime indicator in box score/game details

## Files to Modify

1. **Database Migration**: `supabase_migration_add_overtime_count.sql`
2. **`src/lib/gameSimulation.ts`**:
   - Add `generateOvertimeScore()` function (smaller scale version)
   - Fix score adjustment logic (lines 369-376)
   - Add overtime simulation loop
   - Update `GameResult` interface
3. **`src/app/api/games/route.ts`**:
   - Fix `is_win` calculation (line 60)
   - Include `overtime_count` in response
4. **`src/app/api/games/[gameId]/route.ts`**:
   - Include `overtime_count` in response
5. **`src/app/games/page.tsx`**:
   - Display overtime indicator ("OT", "2OT", etc.)
6. **`src/app/games/[gameId]/page.tsx`** (if exists):
   - Display overtime indicator in box score

## Overtime Score Formula

Based on regular game formula but scaled down:
- Regular: `basePts = 55 + avgPlayerRating * 0.55`, then `teamPts = basePts + (share - 0.5) * 20 + noise(-8 to +8)`
- Overtime: `basePts = 6 + avgPlayerRating * 0.09` (scaled down by ~9x), then `teamPts = basePts + (share - 0.5) * 3 + noise(-2 to +2)`
- Range: 6-15 points per team per overtime
