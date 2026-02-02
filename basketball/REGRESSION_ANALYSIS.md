# Regression Analysis: Gameplan/Offday Action Selection Issue

## Problem Description
User reports that after the last build, they can no longer select multiple options:
- Cannot choose zone/man defense options
- Cannot choose type of defense
- Cannot choose mentality
- "It will only keep one at a time"
- Also affects offday actions (TRAIN/PREP) - can't choose both

## Code Review Findings

### 1. Gameplan Submission Logic (src/app/dashboard/page.tsx)

**Current Implementation:**
- Lines 407-440: Offense buttons call `submitGameplan(newOffense, gameplan?.defense || "Zone", gameplan?.mentality || "Neutral")`
- Lines 448-481: Defense buttons call `submitGameplan(gameplan?.offense || "Drive", newDefense, gameplan?.mentality || "Neutral")`
- Lines 489-539: Mentality buttons call `submitGameplan(gameplan?.offense || "Drive", gameplan?.defense || "Zone", newMentality)`

**Issue Identified:**
- When `gameplan` state is `null` (initial load or if API fails), clicking any button uses **defaults** for other fields
- After submission, state is updated: `setGameplan({ offense, defense, mentality })` (line 219)
- **BUT**: If the initial load fails to fetch gameplan, or if state is cleared, subsequent clicks will keep using defaults

### 2. State Loading (src/app/dashboard/page.tsx)

**Lines 136-144:**
```typescript
const gameplanData = await gameplanRes.json();
if (gameplanData.ok && gameplanData.gameplan) {
  setGameplan({
    offense: gameplanData.gameplan.offense,
    defense: gameplanData.gameplan.defense,
    mentality: gameplanData.gameplan.mentality,
  });
}
```

**Potential Issue:**
- If `gameplanData.gameplan` is `null` (no existing gameplan), state is NOT set
- This means `gameplan` stays `null`
- All button clicks will use defaults, overwriting previous selections

### 3. Offday Actions (src/app/dashboard/page.tsx)

**Lines 371-384:**
- Buttons are mutually exclusive by design (TRAIN or PREP, not both)
- But user says they "couldn't choose train or study opponent either"
- This suggests the buttons might be disabled or not working

**Lines 373, 380:**
```typescript
disabled={submitting || offdayAction === "TRAIN"}
disabled={submitting || offdayAction === "PREP"}
```
- If `offdayAction` is set to "TRAIN", PREP button is disabled
- This is correct behavior (mutually exclusive)
- But if state isn't loading correctly, both might appear disabled

### 4. API Endpoints

**POST /api/gameplans (src/app/api/gameplans/route.ts):**
- Line 69: `const seasonState = await basketballDb.fetch("season_state", { limit: 1 });` ✅ Correct
- Lines 97-111: Updates existing gameplan with all three fields ✅ Correct
- Lines 114-121: Creates new gameplan with all three fields ✅ Correct

**POST /api/offday-actions (src/app/api/offday-actions/route.ts):**
- Lines 64-71: Fetches existing action ✅ Correct
- Lines 73-85: Updates existing action ✅ Correct
- Lines 87-93: Creates new action ✅ Correct

## Root Cause Hypothesis

### Primary Issue: State Not Persisting Between Clicks

**Scenario:**
1. User loads dashboard → `gameplan` is `null` (no existing gameplan)
2. User clicks "Drive" → Submits (Drive, Zone, Neutral) → State updates to `{Drive, Zone, Neutral}`
3. User clicks "Man" → Should use `gameplan.offense = "Drive"`, but if state didn't update or React didn't re-render, it might use default "Drive" again
4. **OR**: If API call fails silently, state never updates, so next click uses defaults again

### Secondary Issue: State Not Loading on Initial Load

**Scenario:**
1. Dashboard loads → Fetches gameplan from API
2. If API returns `null` (no gameplan exists), state stays `null`
3. All button clicks use defaults
4. Each click overwrites previous selection because state is always `null`

## Verification Needed

1. **Check Browser Console**: Are there API errors when submitting gameplans?
2. **Check Network Tab**: Are POST requests to `/api/gameplans` succeeding (200 status)?
3. **Check State**: Is `gameplan` state being set after submission?
4. **Check Database**: Are gameplans being saved with all three fields?

## SoT Compliance Check

### SoT Section 6: Strategy Submission
- ✅ **Offense**: Drive or Shoot (correct)
- ✅ **Defense**: Zone or Man (correct)
- ✅ **Mentality**: Aggressive, Conservative, Neutral (correct)
- ✅ All three fields must be submitted together (correct in API)
- ❓ **UI Issue**: Buttons allow individual selection, which should work if state is managed correctly

## Recent Changes Review

### Overtime Fix (Just Completed)
- **Files Modified**: 
  - `src/lib/gameSimulation.ts` (overtime logic)
  - `src/app/api/games/route.ts` (win/loss calculation)
  - `src/app/games/page.tsx` (overtime display)
- **Impact**: Should NOT affect gameplan/offday action submission
- **Verification**: No changes to dashboard or gameplan/offday-action APIs

## Plan to Fix

### Step 1: Verify Current Behavior
1. Check if gameplan state is loading correctly on dashboard load
2. Check if API calls are succeeding
3. Check if state updates after submission

### Step 2: Fix State Management
1. **Ensure state persists**: After successful submission, reload gameplan from API OR use optimistic update
2. **Handle null state**: If `gameplan` is null, don't use defaults - instead, maintain local state for each field
3. **Fix initial load**: If no gameplan exists, initialize state with empty values, not null

### Step 3: Fix Button Logic
1. **Use local state**: Instead of relying on `gameplan` state, use separate state for each field (offense, defense, mentality)
2. **OR**: Ensure `gameplan` state is always up-to-date before using it in button handlers

### Step 4: Add Error Handling
1. Show error messages if API calls fail
2. Prevent state updates if API calls fail
3. Retry logic for failed submissions

## Proposed Solution

### Option A: Use Separate State for Each Field (Recommended)
- Create `offense`, `defense`, `mentality` as separate state variables
- Update all three when any button is clicked
- Submit all three together
- Load all three from API on initial load

### Option B: Fix State Loading and Persistence
- Ensure gameplan state loads correctly on initial load
- After submission, reload gameplan from API to ensure consistency
- Handle null state gracefully (don't use defaults, use previous values)

### Option C: Use Form State Management
- Use React form library or controlled inputs
- Submit entire form at once
- Better state management and validation

## Files to Check/Modify

1. **src/app/dashboard/page.tsx**:
   - State management for gameplan
   - Button onClick handlers
   - State loading logic

2. **src/app/api/gameplans/route.ts**:
   - Verify API is working correctly
   - Check for any errors

3. **src/app/api/offday-actions/route.ts**:
   - Verify API is working correctly
   - Check for any errors

## Questions for User

1. When you click a button, does it show as selected (highlighted)?
2. When you click another button, does the first one deselect?
3. Are there any error messages in the browser console?
4. Does this happen on initial page load, or after submitting something?
5. Can you see the "Current: Drive / Zone / Neutral" text updating?
