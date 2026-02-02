# Bug Analysis: Tie Game (105-105) Showing as Win

## Problem Summary
A game ended with a tie score (105-105) but the UI shows "✓ Win" instead of handling it as a tie that should go to overtime.

## Root Cause Analysis

### 1. Current Implementation Flow

**Game Simulation (`src/lib/gameSimulation.ts`):**
1. Determines winner probabilistically: `homeWins = Math.random() < homeWinProb` (line 354)
2. Sets `winnerTeamId` based on probability (line 355)
3. Generates scores independently: `homeScore` and `awayScore` (lines 366-367)
4. Attempts to enforce winner has higher score (lines 369-376):
   ```typescript
   if (homeWins && homeScore <= awayScore) {
     const diff = awayScore - homeScore;
     homeScore += Math.min(5, Math.max(1, diff + 1));
   } else if (!homeWins && awayScore <= homeScore) {
     const diff = homeScore - awayScore;
     awayScore += Math.min(5, Math.max(1, diff + 1));
   }
   ```

### 2. The Bug

**Issue 1: Score Adjustment Logic Flaw**
- The adjustment logic only adds `diff + 1` to the winner's score
- If `diff = 0` (scores are equal), it adds `0 + 1 = 1` point
- However, there's a potential edge case where:
  - Scores are generated: homeScore = 105, awayScore = 105
  - `homeWins = true`
  - Check: `homeScore <= awayScore` → `105 <= 105` → `true`
  - Adjustment: `homeScore += Math.min(5, Math.max(1, 0 + 1))` → `homeScore = 106`
  - **BUT**: If the score generation happens in a way where both teams get the same base score and the same noise, the adjustment might not work correctly

**Issue 2: No Overtime Logic**
- The SoT says "there can be no ties" (implied from user requirement)
- The SoT says (Section 7.8): "MVP Decision: Enforce winner has higher score"
- **BUT**: There's no overtime logic implemented
- If scores end up equal despite the adjustment, the game is stored with equal scores and a `winner_team_id` set, but the scores don't match

**Issue 3: UI Win/Loss Calculation**
- In `src/app/api/games/route.ts` (line 60):
  ```typescript
  is_win: teamId ? (isHome ? game.winner_team_id === teamId : game.winner_team_id === teamId) : null
  ```
- This only checks `winner_team_id`, not the actual scores
- If `winner_team_id` is set but scores are equal, it will show "Win" incorrectly

### 3. What Actually Happened

Based on the screenshot:
- Game: NYC 105 vs Vegas 105
- `winner_team_id` is set (probably to NYC based on probability)
- But `home_score = 105` and `away_score = 105` (equal)
- UI shows "✓ Win" because it only checks `winner_team_id`, not scores

## SoT Requirements

### Current SoT (Section 7.8):
- "MVP Decision: Enforce winner has higher score: If sampled winner ends up with <= loser score, swap by adding +1..+5 points to winner until higher."

### User Requirement:
- "There can be no ties. If there is a tie, go to overtime and play another quarter."

## Solution Plan

### Phase 1: Fix Score Adjustment Logic
**Problem**: Current adjustment might not always work
**Solution**: 
1. After generating scores, check if they're equal
2. If equal, add points to the winner's score to ensure it's higher
3. Use a loop to ensure scores are never equal:
   ```typescript
   while (homeWins && homeScore <= awayScore) {
     homeScore += 1;
   }
   while (!homeWins && awayScore <= homeScore) {
     awayScore += 1;
   }
   ```

### Phase 2: Implement Overtime Logic
**Problem**: No overtime when scores are tied
**Solution**:
1. After initial score generation, check if scores are equal
2. If equal, simulate an "overtime quarter":
   - Generate additional scores for both teams (smaller range, e.g., 10-20 points)
   - Add to existing scores
   - Check again - if still tied, repeat (with a max limit, e.g., 3 overtimes)
3. Ensure winner always has higher score after overtime

### Phase 3: Fix UI Win/Loss Display
**Problem**: UI shows win based only on `winner_team_id`, not scores
**Solution**:
1. In `src/app/api/games/route.ts`, verify scores match winner:
   ```typescript
   const actualWinner = game.home_score > game.away_score 
     ? game.home_team_id 
     : game.away_score > game.home_score 
     ? game.away_team_id 
     : null; // Tie (shouldn't happen after fix)
   
   is_win: teamId ? (actualWinner === teamId) : null
   ```
2. If scores are equal but `winner_team_id` is set, treat as error/invalid state

### Phase 4: Database Validation
**Problem**: No constraint preventing equal scores
**Solution**:
1. Add a CHECK constraint: `CHECK (home_score != away_score OR winner_team_id IS NULL)`
2. Or add application-level validation before saving games

## Implementation Details

### Overtime Simulation Logic:
```typescript
// After initial score generation
let overtimeCount = 0;
const maxOvertimes = 3;

while (homeScore === awayScore && overtimeCount < maxOvertimes) {
  overtimeCount++;
  
  // Generate overtime scores (smaller range)
  const homeOTScore = Math.floor(Math.random() * 11) + 10; // 10-20
  const awayOTScore = Math.floor(Math.random() * 11) + 10;
  
  homeScore += homeOTScore;
  awayScore += awayOTScore;
  
  // If still tied after max overtimes, break tie by adding 1 to winner
  if (homeScore === awayScore && overtimeCount >= maxOvertimes) {
    if (homeWins) {
      homeScore += 1;
    } else {
      awayScore += 1;
    }
  }
}
```

## Files to Modify

1. **`src/lib/gameSimulation.ts`**:
   - Fix score adjustment logic (lines 369-376)
   - Add overtime simulation logic
   - Ensure scores are never equal before returning

2. **`src/app/api/games/route.ts`**:
   - Fix `is_win` calculation to verify scores match winner (line 60)

3. **`src/app/games/page.tsx`**:
   - Add visual indicator for overtime games (optional)

4. **Database Schema** (optional):
   - Add CHECK constraint to prevent equal scores

## Testing Plan

1. **Test Score Adjustment**:
   - Simulate games where initial scores are equal
   - Verify winner always has higher score

2. **Test Overtime**:
   - Simulate games that go to overtime
   - Verify scores are never equal after overtime
   - Verify overtime is recorded (if we add overtime tracking)

3. **Test UI**:
   - Verify win/loss shows correctly for all games
   - Verify no "Win" shown for tied scores

## Questions for User

1. **Overtime Scoring**: How should overtime scores be generated?
   - Fixed range (e.g., 10-20 points)?
   - Proportional to team strength?
   - Same formula as regular game but smaller?

2. **Overtime Tracking**: Should we track overtime in the database?
   - Add `overtime_count` field to `games` table?
   - Or just ensure no ties without tracking?

3. **Max Overtimes**: What's the maximum number of overtimes?
   - 3? 5? Unlimited (with forced winner after N)?

4. **Overtime Display**: Should the UI show "OT" or "2OT" for overtime games?
   - Or just show final score without indicating overtime?

## End-to-End Flow After Fix

1. **Game Simulation**:
   - Generate initial scores
   - Check if tied → if yes, simulate overtime
   - Ensure winner has higher score
   - Store game with `winner_team_id` matching higher score

2. **API Response**:
   - Calculate `is_win` based on actual scores, not just `winner_team_id`
   - Verify `winner_team_id` matches score-based winner

3. **UI Display**:
   - Show correct win/loss based on scores
   - Show overtime indicator if applicable
