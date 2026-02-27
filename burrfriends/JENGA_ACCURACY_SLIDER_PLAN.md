# JENGA Accuracy Slider System — End-to-End Plan

**Problem:** Current physics-based system is too unpredictable and unstable. Players have no control over removal/placement success beyond selecting the block.

**Solution:** Implement a skill-based accuracy slider system (like Madden kicker mechanics) where:
1. **Removal accuracy** determines how cleanly the block is removed (affects physics chaos)
2. **Placement accuracy** determines how stable the placement is (affects impact/stability)

**Goal:** Make the game skill-based and predictable while keeping physics for visual feedback only.

---

## Overview: Two-Phase Accuracy System

### Phase 1: Removal Accuracy
When user selects a block to remove (tap or pull):
1. Show accuracy slider (moves back and forth)
2. User presses/releases when slider is in "sweet spot" (green zone)
3. Accuracy score (0-100%) determines:
   - **Impulse magnitude** for removal (lower = cleaner)
   - **Physics simulation tolerance** (perfect = skip collapse check, poor = strict check)

### Phase 2: Placement Accuracy
After block is removed and user releases over drop zone:
1. Show accuracy slider again
2. User presses when slider is in "sweet spot"
3. Accuracy score determines:
   - **Placement impact velocity** (lower = more stable)
   - **Stability bonus/malus** (perfect = +5%, poor = -10%)
   - **Physics simulation tolerance** (perfect = skip collapse check, poor = strict check)

---

## 1. Accuracy Slider Component

### 1.1 Component Design
**File:** `src/components/JengaAccuracySlider.tsx`

**Props:**
```typescript
interface JengaAccuracySliderProps {
  onComplete: (accuracy: number) => void; // 0-100
  onCancel?: () => void;
  label: string; // "Remove block" or "Place block"
  speed?: number; // Slider speed multiplier (default 1.0)
  sweetSpotSize?: number; // Percentage of slider that's "sweet spot" (default 20%)
}
```

**Visual Design:**
- Horizontal slider bar (full width, ~200px height)
- Slider indicator (vertical line) moves left-to-right continuously
- **Green zone** (sweet spot) in center 20% of bar
- **Yellow zones** on either side (40% each) = acceptable but not perfect
- **Red zones** at edges (20% each) = poor accuracy
- **Current position** shown as vertical line
- **Label** above: "Remove block" or "Place block"
- **Hint text** below: "Press when the slider is in the green zone"

**Behavior:**
- Slider moves continuously (sine wave or linear ping-pong)
- Speed: ~2-3 seconds per full cycle (configurable)
- On any key press or click anywhere → capture accuracy
- Accuracy calculation:
  - If in green zone (center 20%): `100 - (distance from center * 2)`
  - If in yellow zone: `60 - (distance from green edge * 1.5)`
  - If in red zone: `20 - (distance from yellow edge * 0.5)`
  - Clamp to 0-100

**State:**
- `position: number` (0-100, current slider position)
- `direction: 1 | -1` (moving left or right)
- `isActive: boolean` (slider is visible and running)
- `capturedAccuracy: number | null` (result after capture)

**Animation:**
- Use `requestAnimationFrame` or `useEffect` with `setTimeout` for smooth movement
- CSS transition for visual feedback on capture (flash green/yellow/red)

---

## 2. Integration Points

### 2.1 Removal Accuracy (Block Selection)

**File:** `src/components/JengaTower3D.tsx`

**Current flow:**
1. User taps/pulls block → `onMove` called immediately
2. `onMove` → `removeBlock` → `runRemoveSimulation` → check collapse

**New flow:**
1. User taps/pulls block → **show removal accuracy slider**
2. User presses when slider in green zone → capture accuracy
3. **Then** call `onMove` with `opts.removalAccuracy` (0-100)
4. `onMove` → `removeBlock` → `runRemoveSimulation` with accuracy-adjusted impulse
5. If accuracy ≥ 90% → skip collapse check (perfect removal)
6. If accuracy < 50% → stricter collapse check (poor removal)

**Changes:**
- Add state: `removalSliderActive: { blockPosition, direction } | null`
- On block tap/pull start: set `removalSliderActive` (don't call `onMove` yet)
- Show `<JengaAccuracySlider label="Remove block" onComplete={(acc) => { ... }} />`
- On complete: call `onMove` with `opts.removalAccuracy = acc`
- Hide slider, proceed with removal

**Code location:**
- `JengaTower3D.tsx` lines ~180-216 (tap handler) and ~218-325 (pull handler)
- Modify `onPointerUp` to show slider instead of calling `onMove` immediately

---

### 2.2 Placement Accuracy (Drop Zone Release)

**File:** `src/components/JengaTower3D.tsx`

**Current flow:**
1. User releases over drop zone → `onMove` called immediately
2. `onMove` → `placeBlock` → `runPlacementSimulation` → check collapse

**New flow:**
1. User releases over drop zone → **show placement accuracy slider**
2. User presses when slider in green zone → capture accuracy
3. **Then** call `onMove` with `opts.placementAccuracy` (0-100)
4. `onMove` → `placeBlock` → `runPlacementSimulation` with accuracy-adjusted impact
5. If accuracy ≥ 90% → skip collapse check (perfect placement)
6. If accuracy < 50% → stricter collapse check (poor placement)

**Changes:**
- Add state: `placementSliderActive: boolean`
- On drop zone release: set `placementSliderActive = true` (don't call `onMove` yet)
- Show `<JengaAccuracySlider label="Place block" onComplete={(acc) => { ... }} />`
- On complete: call `onMove` with `opts.placementAccuracy = acc`
- Hide slider, proceed with placement

**Code location:**
- `JengaTower3D.tsx` lines ~274-316 (`onPointerUp` in drag handler)
- Modify `overDrop` branch to show slider instead of calling `onMove` immediately

---

## 3. Physics Integration

### 3.1 Removal Accuracy → Physics

**File:** `src/lib/jenga-physics.ts`

**Function:** `runRemoveSimulation`

**Current:**
```typescript
const imp = impulse ?? new CANNON.Vec3(0, 0.3, 0);
```

**New:**
```typescript
function runRemoveSimulation(
  towerAfterRemove: TowerV2,
  removedBlockId: number,
  level: number,
  row: number,
  block: number,
  impulse?: CANNON.Vec3,
  removalAccuracy?: number // 0-100, optional
): RemoveSimulationResult {
  // If perfect accuracy (≥90%), skip physics check (assume clean removal)
  if (removalAccuracy != null && removalAccuracy >= 90) {
    return { collapse: false };
  }
  
  // Adjust impulse based on accuracy
  const baseImp = impulse ?? new CANNON.Vec3(0, 0.3, 0);
  const accuracyMultiplier = removalAccuracy != null 
    ? 0.3 + (removalAccuracy / 100) * 0.7 // 0.3x to 1.0x
    : 1.0;
  const imp = new CANNON.Vec3(
    baseImp.x * accuracyMultiplier,
    baseImp.y * accuracyMultiplier,
    baseImp.z * accuracyMultiplier
  );
  
  // ... rest of simulation
  
  // If poor accuracy (<50%), use stricter collapse detection
  if (removalAccuracy != null && removalAccuracy < 50) {
    // Run extra steps or use lower threshold
    for (let i = 0; i < REMOVE_MAX_STEPS * 1.5; i++) {
      // ... stricter check
    }
  }
  
  return { collapse: false };
}
```

**Logic:**
- **Perfect (≥90%):** Skip physics, assume clean removal
- **Good (70-89%):** Normal physics, reduced impulse
- **Acceptable (50-69%):** Normal physics, normal impulse
- **Poor (<50%):** Stricter physics check, higher impulse (more chaos)

---

### 3.2 Placement Accuracy → Physics

**File:** `src/lib/jenga-physics.ts`

**Function:** `runPlacementSimulation`

**Current:**
```typescript
new CANNON.Vec3(0, -0.4, 0) // Fixed impact velocity
```

**New:**
```typescript
function runPlacementSimulation(
  towerBeforePlace: TowerV2,
  placedBlockId: number,
  placementAccuracy?: number // 0-100, optional
): PlacementSimulationResult {
  // If perfect accuracy (≥90%), skip physics check (assume stable placement)
  if (placementAccuracy != null && placementAccuracy >= 90) {
    const t = placeBlock(towerBeforePlace, placedBlockId);
    const s = computeStabilityPercent(t);
    // Only fail if stability is critically low
    if (s < 30) {
      return { collapse: true, reason: 'tower_fell' };
    }
    return { collapse: false };
  }
  
  // Adjust impact velocity based on accuracy
  const baseImpact = -0.4;
  const accuracyMultiplier = placementAccuracy != null
    ? 0.2 + (placementAccuracy / 100) * 0.8 // 0.2x to 1.0x (lower = gentler)
    : 1.0;
  const impactVel = new CANNON.Vec3(0, baseImpact * accuracyMultiplier, 0);
  
  // Adjust stability bonus/malus
  const stabilityBonus = placementAccuracy != null
    ? (placementAccuracy - 50) / 10 // -5% to +5%
    : 0;
  
  // ... rest of simulation with adjusted impact
  
  // If poor accuracy (<50%), use stricter collapse detection
  if (placementAccuracy != null && placementAccuracy < 50) {
    // Lower stability threshold or extra steps
    const stability = computeStabilityPercent(placeBlock(towerBeforePlace, placedBlockId));
    if (stability < 60) { // Stricter threshold
      return { collapse: true, reason: 'tower_fell' };
    }
  }
  
  return { collapse: false };
}
```

**Logic:**
- **Perfect (≥90%):** Skip physics, only check critical stability (<30%)
- **Good (70-89%):** Lower impact velocity, stability bonus
- **Acceptable (50-69%):** Normal impact, no bonus
- **Poor (<50%):** Higher impact, stability malus, stricter threshold

---

## 4. API Integration

### 4.1 Move Endpoint

**File:** `src/app/api/jenga/games/[id]/move/route.ts`

**Current request:**
```typescript
{ remove: { level, row, block } }
```

**New request:**
```typescript
{
  remove: { level, row, block },
  removalAccuracy?: number, // 0-100
  placementAccuracy?: number // 0-100
}
```

**Changes:**
- Accept `removalAccuracy` and `placementAccuracy` in request body
- Pass to `runRemoveSimulation` and `runPlacementSimulation`
- Store in database (optional, for analytics): add `removal_accuracy` and `placement_accuracy` columns to `jenga_moves` table (if exists) or game state

---

## 5. UI/UX Flow

### 5.1 Removal Flow

1. User taps/pulls block
2. **Immediate:** Block highlights, removal slider appears (overlay or modal)
3. Slider moves back and forth
4. User presses any key or clicks anywhere
5. **Feedback:** Slider flashes green/yellow/red based on accuracy
6. **Then:** Block removal animation plays (with accuracy-adjusted physics)
7. Proceed to placement

**Visual:**
- Slider overlay: centered, semi-transparent dark background
- Slider bar: ~300px wide, ~60px tall
- Green zone: clearly marked (maybe with glow)
- Current position: animated line
- Hint: "Press any key or click to capture"

---

### 5.2 Placement Flow

1. User releases over drop zone
2. **Immediate:** Placement slider appears (overlay or modal)
3. Slider moves back and forth
4. User presses any key or clicks anywhere
5. **Feedback:** Slider flashes green/yellow/red based on accuracy
6. **Then:** Block placement animation plays (with accuracy-adjusted physics)
7. Move complete

**Visual:**
- Same as removal slider, but label: "Place block"

---

## 6. Practice Mode Integration

**File:** `src/app/jenga/page.tsx`

**Current:** Practice mode uses same `onMove` as regular game

**Changes:**
- Practice mode uses same accuracy slider system
- Show accuracy score after each move (for learning)
- Optional: Show "Perfect!" / "Good!" / "Poor!" feedback
- Optional: Allow skipping slider in Practice (for testing) via settings

---

## 7. Implementation Order (End-to-End Safe)

### Phase 1: Slider Component (Foundation)
1. Create `JengaAccuracySlider.tsx`
2. Implement slider animation (sine wave or ping-pong)
3. Implement accuracy calculation (green/yellow/red zones)
4. Test in isolation (standalone page or Storybook)

### Phase 2: Removal Integration
5. Add `removalSliderActive` state to `JengaTower3D.tsx`
6. Modify tap handler to show slider instead of calling `onMove`
7. Modify pull handler to show slider instead of calling `onMove`
8. Pass `removalAccuracy` to `onMove` via `opts`
9. Update `runRemoveSimulation` to accept and use `removalAccuracy`
10. Test removal flow end-to-end

### Phase 3: Placement Integration
11. Add `placementSliderActive` state to `JengaTower3D.tsx`
12. Modify drop zone release to show slider instead of calling `onMove`
13. Pass `placementAccuracy` to `onMove` via `opts`
14. Update `runPlacementSimulation` to accept and use `placementAccuracy`
15. Test placement flow end-to-end

### Phase 4: API & Backend
16. Update move API endpoint to accept `removalAccuracy` and `placementAccuracy`
17. Pass to physics functions in API route
18. Test API flow end-to-end

### Phase 5: Polish
19. Add visual feedback (flash colors, "Perfect!" messages)
20. Add sound effects (optional)
21. Tune accuracy thresholds (90% perfect, 50% poor, etc.)
22. Tune slider speed and sweet spot size
23. Add Practice mode accuracy display

---

## 8. Accuracy Thresholds (Tunable)

**Removal:**
- **Perfect (≥90%):** Skip physics check, assume clean removal
- **Good (70-89%):** Normal physics, 0.7x impulse
- **Acceptable (50-69%):** Normal physics, 1.0x impulse
- **Poor (<50%):** Stricter physics, 1.3x impulse, extra steps

**Placement:**
- **Perfect (≥90%):** Skip physics, only check critical stability (<30%)
- **Good (70-89%):** 0.7x impact velocity, +3% stability bonus
- **Acceptable (50-69%):** 1.0x impact velocity, no bonus
- **Poor (<50%):** 1.3x impact velocity, -5% stability malus, stricter threshold (60%)

---

## 9. Edge Cases & Error Handling

1. **User cancels slider:** Add cancel button or timeout (5s) → revert to poor accuracy (20%)
2. **Slider during animation:** Disable slider if tower is animating
3. **Network delay:** Slider works client-side, accuracy sent to server
4. **Mobile touch:** Slider works with touch events (tap anywhere to capture)
5. **Accessibility:** Keyboard support (Space/Enter to capture), screen reader labels

---

## 10. Testing Checklist

- [ ] Slider appears on block selection
- [ ] Slider captures accuracy correctly (green/yellow/red zones)
- [ ] Perfect removal (≥90%) skips physics check
- [ ] Poor removal (<50%) uses stricter physics
- [ ] Slider appears on drop zone release
- [ ] Perfect placement (≥90%) skips physics check
- [ ] Poor placement (<50%) uses stricter physics
- [ ] Accuracy affects impulse/impact as expected
- [ ] API accepts and uses accuracy values
- [ ] Practice mode shows accuracy feedback
- [ ] Mobile touch works
- [ ] Keyboard navigation works
- [ ] Cancel/timeout works

---

## 11. Files to Create/Modify

**New:**
- `src/components/JengaAccuracySlider.tsx` (new component)

**Modify:**
- `src/components/JengaTower3D.tsx` (add slider states, show sliders)
- `src/lib/jenga-physics.ts` (accept accuracy, adjust physics)
- `src/app/api/jenga/games/[id]/move/route.ts` (accept accuracy in request)
- `src/app/jenga/page.tsx` (pass accuracy through, show feedback)

**Optional:**
- Database migration: add `removal_accuracy` and `placement_accuracy` to `jenga_moves` (if table exists)

---

## 12. Success Criteria

1. **Predictable:** Perfect accuracy (≥90%) always succeeds (no random collapse)
2. **Skill-based:** Better accuracy = better outcome (lower impulse, higher stability)
3. **Fair:** Poor accuracy can still succeed if tower is stable enough
4. **Engaging:** Slider adds skill element without being frustrating
5. **End-to-end:** Works in Practice and real games, via API and client-side

---

*This plan replaces unpredictable physics with skill-based accuracy while keeping physics for visual feedback. The game becomes more predictable and fair while maintaining the challenge of timing the slider correctly.*
