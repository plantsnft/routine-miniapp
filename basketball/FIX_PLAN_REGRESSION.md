# Fix Plan: Gameplan/Offday Action Selection Regression

## Problem Summary
User cannot select multiple options - clicking one option causes others to reset. Affects:
- Gameplan: Offense, Defense, Mentality (can only keep one selection at a time)
- Offday Actions: TRAIN/PREP (can't choose both - but this is expected, they're mutually exclusive)

## Root Cause Analysis

### Issue 1: State Not Initialized When No Gameplan Exists
**Location**: `src/app/dashboard/page.tsx` lines 136-144

**Problem**:
```typescript
if (gameplanData.ok && gameplanData.gameplan) {
  setGameplan({ offense, defense, mentality });
}
```
- If no gameplan exists in database, `gameplanData.gameplan` is `null`
- State is NOT set, so `gameplan` stays `null`
- All button clicks use defaults: `gameplan?.defense || "Zone"` → always "Zone"

**Impact**: 
- First click: Submits with defaults (e.g., Drive, Zone, Neutral)
- State updates to `{Drive, Zone, Neutral}`
- Second click: Should use updated state, but if there's any delay or re-render issue, might use null again

### Issue 2: State Update Race Condition
**Location**: `src/app/dashboard/page.tsx` lines 407-539

**Problem**:
- Button clicks call `submitGameplan()` which is async
- State update happens in `submitGameplan()` after API call (line 219)
- If user clicks buttons quickly, second click might happen before first state update
- Second click uses old state (or null) with defaults

### Issue 3: No Optimistic State Update
**Location**: `src/app/dashboard/page.tsx` line 219

**Problem**:
- State only updates AFTER successful API call
- If API call is slow, user might click another button before state updates
- Should update state optimistically (immediately) and revert on error

## Solution Plan

### Fix 1: Initialize State Even When No Gameplan Exists
**Change**: Always set gameplan state, even if null from API
```typescript
// Current (line 138-144):
if (gameplanData.ok && gameplanData.gameplan) {
  setGameplan({ offense, defense, mentality });
}

// Fixed:
if (gameplanData.ok) {
  if (gameplanData.gameplan) {
    setGameplan({
      offense: gameplanData.gameplan.offense,
      defense: gameplanData.gameplan.defense,
      mentality: gameplanData.gameplan.mentality,
    });
  } else {
    // Initialize with defaults so buttons work
    setGameplan({
      offense: "Drive",
      defense: "Zone",
      mentality: "Neutral",
    });
  }
}
```

### Fix 2: Use Optimistic State Updates
**Change**: Update state immediately when button is clicked, before API call
```typescript
// In submitGameplan(), update state immediately:
setGameplan({ offense, defense, mentality }); // Optimistic update

// Then make API call
const res = await fetch("/api/gameplans", { ... });

// If API fails, revert state or show error
if (!data.ok) {
  // Reload gameplan from API to get correct state
  // OR revert to previous state
}
```

### Fix 3: Use Functional State Updates
**Change**: Use functional updates to ensure we always have latest state
```typescript
// Instead of:
submitGameplan("Drive", gameplan?.defense || "Zone", gameplan?.mentality || "Neutral")

// Use:
setGameplan(prev => ({
  offense: "Drive",
  defense: prev?.defense || "Zone",
  mentality: prev?.mentality || "Neutral"
}));
// Then submit
```

### Fix 4: Separate State Variables (Alternative)
**Change**: Use separate state for each field instead of single object
```typescript
const [offense, setOffense] = useState<string | null>(null);
const [defense, setDefense] = useState<string | null>(null);
const [mentality, setMentality] = useState<string | null>(null);

// Buttons update individual state
// Submit combines all three
```

## Recommended Approach

**Use Fix 1 + Fix 2 (Optimistic Updates)**

1. Initialize state with defaults if no gameplan exists
2. Update state optimistically when button is clicked
3. Reload from API after successful submission to ensure consistency
4. Handle errors gracefully

## Files to Modify

1. **src/app/dashboard/page.tsx**:
   - Fix state initialization (lines 136-144)
   - Add optimistic state updates in `submitGameplan()` (line 219)
   - Ensure state is always available for button handlers

## SoT Compliance

### Current SoT (Section 6):
- ✅ Offense: Drive or Shoot
- ✅ Defense: Zone or Man  
- ✅ Mentality: Aggressive, Conservative, Neutral
- ✅ All three must be submitted together

### SoT Update Needed:
- Add note about UI state management: State must be initialized even when no gameplan exists
- Add note about optimistic updates for better UX

## Testing Plan

1. **Test Initial Load**:
   - Load dashboard with no existing gameplan
   - Verify buttons are clickable
   - Click one option, verify it stays selected
   - Click another option, verify first stays selected

2. **Test State Persistence**:
   - Click "Drive" → verify state updates
   - Click "Man" → verify "Drive" stays, "Man" is selected
   - Click "Aggressive" → verify all three stay selected

3. **Test API Failure**:
   - Simulate API failure
   - Verify state doesn't update incorrectly
   - Verify error message shows

4. **Test Offday Actions**:
   - Verify TRAIN/PREP buttons work correctly
   - Verify only one can be selected at a time (expected behavior)

## Verification Checklist

- [ ] State initializes correctly on page load (even with no existing gameplan)
- [ ] Clicking one button doesn't reset others
- [ ] State persists between button clicks
- [ ] API calls succeed and update database correctly
- [ ] Error handling works correctly
- [ ] Offday actions work correctly (TRAIN/PREP mutually exclusive)
