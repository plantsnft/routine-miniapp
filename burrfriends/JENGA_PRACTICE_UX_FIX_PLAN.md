# JENGA Practice — UX Fix Plan (Verified, End-to-End)

**Purpose:** Fix the reported bugs (tap always fails, stability starts at 38%, confusing yellow drop zone) and related UX issues so the Practice game is playable and understandable. All items below are **verified** from the codebase; fixes are concrete and implementable.

---

## Decisions / implemented (verified)

| Item | Decision | Implemented |
|------|----------|-------------|
| **§2 Stability** | **Option B:** Remove the height penalty line. | `jenga-stability.ts`: removed `s -= L * COEFF_HEIGHT_PER_LEVEL` and `COEFF_HEIGHT_PER_LEVEL`. Full tower = 100%. |
| **§1 Tap** | Spawn pushed block 4 units outside in push direction. | `jenga-physics.ts`: `pushDirectionOffset()`, `PUSH_SPAWN_OFFSET=4`; in `runPushWithFallSimulation` the pushed body is created at `base + offset`, then `body.velocity.copy(imp)`. |
| **§3 Drop zone** | Show only when dragging; hint; feedback when release outside. | `JengaTower3D.tsx`: drop zone `{dragging && (...)}`; `showDropZoneHint` + "Release over the drop zone to place" for 1.8s when `!overDrop` on pointerUp; hint: "**Tap** = quick press to push. **Pull** = hold, then drag to the yellow drop zone and release."; `setShowDropZoneHint(false)` on block pointerDown. |
| **§3 How to Play** | Explicit tap/pull and drop zone. | `JengaHowToPlayModal.tsx`: "**Tap** = quick press to push… **Pull** = hold ~0.3s, then drag to the **yellow drop zone** (it appears when you pull) and release to place." |
| **Success feedback** | Text only (no graphic). | `jenga/page.tsx` (Practice): `showSuccessFeedback`; on successful move, "✓ Good move!" for 1s; cleanup timeout on unmount. |

---

## 1. Tap always fails (game over: "Pushed block hit the tower")

### Root cause (verified)

In `runPushWithFallSimulation` (`src/lib/jenga-physics.ts`):

1. The block is **removed** from the logical tower; the tower is built in Cannon-es **without** that block.
2. The **pushed block** is added as a dynamic body at `getBlockPosition(level, block)` — i.e. **the same physical position it had in the tower**.
3. The **neighboring blocks** on the same level are still in the world (the two other blocks at that level). In block units: centers at -3, 0, 3; half-extent 1.5 on the long axis. The pushed block at 0 is **exactly touching** the neighbors at -3 and 3 (gap 3 − 1.5 − 1.5 = 0).
4. On the first (or an early) physics step, Cannon-es reports a **contact** between the pushed body and another body. The code treats **any** contact of the pushed body with the tower as `hitTower: true` → game over.
5. Because the pushed block **starts inside/against the tower**, it is almost always in contact from step 1 → tap **always** fails.

**Relevant code:**  
`jenga-physics.ts` lines 307–328: `runPushWithFallSimulation` builds the world from `t1` (tower without the block), then `addDynamicBody(..., blockId, level, block, imp)` at `getBlockPosition(level, block)`. Contact check: `(c.bi === pushedBody && c.bj !== pushedBody) || (c.bj === pushedBody && c.bi !== pushedBody)` → `hitTower: true`.

### Fix (concrete)

**Spawn the pushed block already offset in the push direction** so it starts **outside** the row of blocks, then apply the impulse.

- In `runPushWithFallSimulation`, after `removeBlock` and `buildWorld(t1)`:
  1. Compute **unit direction** from `directionToImpulse(direction, strength)` (use the direction, ignore magnitude for the offset).
  2. **Base position:** `getBlockPosition(level, block)`.
  3. **Offset:** at least **4 units** in that direction (enough to clear one block half-extent + gap + the other block’s half-extent). In block units, 4 is safe.
  4. **Spawn position:** `base + 4 * unitDirection` (as `CANNON.Vec3`).
  5. Call `addDynamicBody` with that **spawn position** (or add an overload/param for `position` override) and the existing impulse.
- **Unit vectors** (match `directionToImpulse`):  
  `left (-1,0,0)`, `right (1,0,0)`, `forward (0,0,-1)`, `back (0,0,1)`.

**Implementation note:** `addDynamicBody` uses `getBlockPosition(level, block)`. You need to either:

- Add an optional `positionOverride?: CANNON.Vec3` to `addDynamicBody`, or  
- In `runPushWithFallSimulation` only: construct the body manually (position = base + offset, then `body.velocity.copy(imp)`) and add it to the world and maps, without using `addDynamicBody` for the pushed block.

**Implemented:** `jenga-physics.ts`: `pushDirectionOffset()` returns unit `{dx,dy,dz}` for left/right/forward/back; `PUSH_SPAWN_OFFSET=4`. In `runPushWithFallSimulation`, base = `getBlockPosition(level, block)`, spawn = base + offset; pushed block is a manually created Cannon-es body at `spawnPos` with `body.velocity.copy(imp)` (not `addDynamicBody`). Contact check unchanged.

**Verification:** After the change, a short tap on a block in the middle of a full level should **not** hit the tower (block leaves the row, then falls). Only when the block’s trajectory (gravity + impulse) brings it back into contact with the tower should `hitTower` be true.

---

## 2. Stability starts at 38% (should be 100%)

### Root cause (verified)

In `computeStabilityPercent` (`src/lib/jenga-stability.ts`):

- Starts at `s = 100`.
- For each level `L` in `[0, top]`:
  - CoM outside [0.5, 1.5]: subtract `COEFF_COM_OUT` (8).
  - Block without support from below: subtract `COEFF_NO_SUPPORT` (12).
  - **Height:** `s -= L * COEFF_HEIGHT_PER_LEVEL` with `COEFF_HEIGHT_PER_LEVEL = 0.4`.
- For a **full 18-level tower**: CoM is 1 for every complete level (no CoM penalty); every block has support (no support penalty). Only the height term applies:
  - `sum_{L=0}^{17} 0.4 * L = 0.4 * 153 = 61.2` → `s = 100 - 61.2 = 38.8` → **~38%**.

So a **perfect, complete** tower is penalized as if it were unstable, purely because of height.

**Relevant code:**  
`jenga-stability.ts` lines 37–70, especially 66: `s -= L * COEFF_HEIGHT_PER_LEVEL;`.

### Fix (concrete)

**Do not apply the height penalty when the level is complete and fully supported.** A full, supported level is the normal “stable” state; height should only reduce stability when the structure is already compromised (gaps, overhang).

**Option A (recommended):**  
- Apply `s -= L * COEFF_HEIGHT_PER_LEVEL` **only when** the level has a gap (incomplete) or at least one block lacks support.  
- If `indices.length === 3` and every `hasSupport` is true for that level → **skip** the height penalty for that level.

**Option B (simpler) — chosen and implemented:**  
- Remove the line `s -= L * COEFF_HEIGHT_PER_LEVEL;` entirely.  
- Result: a full 18-level tower stays at 100%; as blocks are removed and support/CoM suffer, stability drops. Height can be reintroduced later with a much smaller coefficient or only for incomplete levels.

**Verification:**  
- `initializeTowerV2()` produces an 18-level tower with 3 blocks per level.  
- After the fix: `computeStabilityPercent(initialTower.tower)` must return **100** (or 100.0).  
- After removing a block and placing on top (valid move), stability should drop (e.g. 85–98 depending on CoM/support), but **never** 38 at game start.

---

## 3. Yellow dashed bar (drop zone) — purpose and clarity

### What it is (verified)

- The **“Drop here to place”** area at the top of the tower in `JengaTower3D` is the **drop zone**.
- It is used **only for pull (grab-to-pull)**:
  - On `pointerUp` while **dragging**, the code checks `overDrop` (pointer over `dropZoneRef.current`).  
  - If `overDrop` → `onMove(blockPosition, direction, placementHitBlocks)` is called (no `isTap`).  
  - If **not** over the drop zone → the drag is cancelled; `onMove` is **not** called; the move does not happen.
- **Tap (push)** never uses the drop zone: a tap triggers `runPushWithFallSimulation` and, if `!hitTower`, the normal remove+place flow. The drop zone is not involved.

**Relevant code:**  
`JengaTower3D.tsx` lines 368–374 (drop zone div), 282–310 (onPointerUp: `overDrop` and `onMove` or cancel).

### Why it’s confusing

- It’s always visible, but it only matters when **pulling**.
- “Drop here to place” doesn’t say it’s for **pull only**; users may try to “drop” after a tap (there is nothing to drop — tap auto-completes or fails in the push sim).
- Releasing **outside** the drop zone during a pull cancels the move with **no feedback**, so users don’t know they must release over that area.

### Fixes (concrete)

1. **Clarify in UI**
   - **Option A:** Change label to: **“Drag block here to place (pull only)”**.
   - **Option B:** Keep “Drop here to place” and add a short line in the hint below:  
     **“Tap = push out. Pull = hold, drag here, then release.”**

2. **Show only when pulling (recommended)**  
   - Render the drop zone **only when `dragging !== null`**.  
   - When the user is not pulling, the bar is hidden; when they start a pull, it appears so its role is clear.

3. **Feedback when release is outside the drop zone**  
   - On `pointerUp` while dragging, if `!overDrop`:
     - Set a short-lived state, e.g. `showDropZoneHint: true`, and show a small message: **“Release over the drop zone to place”** (toast or text near the drop zone).  
     - Clear it after 1.5–2 s or on next pointer down.

4. **How to Play / hint**  
   - In the hint under the tower and in the How to Play modal, explicitly say:
     - **Tap:** quick press to push the block out; it is placed on top if it doesn’t hit the tower.  
     - **Pull:** hold ~400 ms, drag the block **to the yellow drop zone at the top**, then release to place.

**Implemented:** (1) Drop zone renders only when `dragging !== null`. (2) Hint under tower: "**Tap** = quick press to push. **Pull** = hold, then drag to the yellow drop zone and release." (3) On pointerUp while dragging, if `!overDrop`: `setShowDropZoneHint(true)` and `setTimeout(…, 1800)` to clear; message "Release over the drop zone to place". (4) `setShowDropZoneHint(false)` on block onPointerDown. (5) How to Play modal: tap and pull with drop zone (see § Decisions). **Success feedback:** "✓ Good move!" for 1s in Practice on successful move (text only; no diagram).

**Verification:**  
- New users can complete a **pull** after reading the hint.  
- Releasing outside the drop zone during a pull shows the new message and does not complete the move.  
- **Tap** flows are unchanged and do not reference the drop zone.

---

## 4. Other issues (verified) and recommended fixes

### 4.1 Pull: release outside drop zone → silent cancel

- **Current:** `onMove` is not called; the block never leaves the tower; the only change is that the ghost disappears.  
- **Fix:** Already covered in §3: show **“Release over the drop zone to place”** when `!overDrop` on pointerUp while dragging.

### 4.2 Drop zone size on mobile

- The drop zone is `min-h-[44px]`. On small screens or with large fingers, it may be hard to hit.  
- **Fix (optional):**  
  - Increase to `min-h-[56px]` when `dragging` is active, **or**  
  - Use a larger hit area: e.g. the full top 20% of the tower card when dragging, with the dashed box as a visual cue only.  
- Prefer **showing the drop zone only when dragging** so it doesn’t clutter the initial view; then a slightly larger hit target is more acceptable.

### 4.3 Hold time for pull (400 ms)

- `HOLD_THRESHOLD_MS = 400`. The plan suggests 300–500 ms.  
- **Optional:** Reduce to **300 ms** so pull starts a bit sooner; reduces accidental taps when the user intended to pull.  
- **Verification:** Tap = release before 300 ms; pull = hold ≥300 ms and move ≥`PULL_THRESHOLD_PX` (5). Ensure taps are still never classified as pulls.

### 4.4 Practice cooldown (5 s)

- After each move, 5 s cooldown (or “No limit”).  
- **Optional:** In Practice only, reduce to **3 s**, or add a “3 s / 5 s / No limit” choice.  
- Low priority; 5 s is acceptable once the core loop works.

### 4.5 Tap strength and impulse

- `strength = min(1, pressDuration / 800)`; impulse magnitude `0.3 + 0.7 * strength`.  
- After the push spawn-offset fix, a short tap (e.g. 100 ms → strength ~0.125, impulse ~0.39) should push the block out and usually not hit the tower.  
- **No change required** unless playtests show taps still failing often; then consider a slightly lower base impulse (e.g. 0.2 + 0.6 * strength).

### 4.6 runRemoveSimulation and runPlacementSimulation

- **runRemoveSimulation:** Removed block gets impulse `(0, 0.3, 0)`. Tower is static. Logic focuses on “tower fell” (excluding removed block) and “non‑moved block fell”. For a normal remove, static tower should not fall.  
- **runPlacementSimulation:** Block placed on top with `(0, -0.4, 0)`; top 2 levels dynamic. With stability at 100% at start, `impactCausesCollapse` needs impact ≥ `IMPACT_VERY_HIGH` (2.0). Initial 0.4 is below that.  
- **Conclusion:** No change needed for remove/placement for the issues reported. Re-evaluate only if, after the above fixes, removal or placement still causes unrealistic collapse.

---

## 5. Implementation order (end-to-end safe)

Implemented in this order:

| Order | Item | File(s) | Status |
|-------|------|---------|--------|
| 1 | **Stability 100% at start** (Option B) | `jenga-stability.ts` | Done. |
| 2 | **Tap: spawn pushed block offset in direction** | `jenga-physics.ts` | Done. |
| 3 | **Drop zone: show only when dragging** | `JengaTower3D.tsx` | Done. |
| 4 | **Drop zone: clarify hint + How to Play** | `JengaTower3D.tsx`, `JengaHowToPlayModal.tsx` | Done. |
| 5 | **Feedback when release outside drop zone** | `JengaTower3D.tsx` | Done. |
| 6 | **Success feedback "✓ Good move!"** | `jenga/page.tsx` | Done. |
| (Optional) | Hold 300 ms, cooldown 3 s, drop zone size | — | Not done. |

After 1 and 2: **tap** and **pull** can complete moves; stability starts at 100%.  
After 3–6: drop zone role is clear; failed pull shows hint; successful move shows "✓ Good move!".

---

## 6. Sanity checks (before/after)

**Before (current behavior):**

- Tap on a block → almost always “Pushed block hit the tower” (or equivalent).  
- Fresh tower: stability ~38%.  
- Yellow dashed bar: purpose unclear; pull works only if user discovers they must release over it; no feedback on wrong release.

**After (expected):**

- Tap on a block → push sim runs with block starting **outside** the row; if it doesn’t hit on the way down, remove+place runs and the move completes.  
- Fresh tower: stability **100%**.  
- Drop zone: only visible when pulling; label/hint explain it’s for pull; releasing outside shows “Release over the drop zone to place”.

---

## 7. Files touched

| File | Changes (implemented) |
|------|------------------------|
| `src/lib/jenga-stability.ts` | **Option B:** Removed `s -= L * COEFF_HEIGHT_PER_LEVEL` and `COEFF_HEIGHT_PER_LEVEL`. Doc updated. |
| `src/lib/jenga-physics.ts` | `runPushWithFallSimulation`: `pushDirectionOffset()`, `PUSH_SPAWN_OFFSET=4`; pushed body at `base + offset`, `body.velocity.copy(imp)`; manual body create, not `addDynamicBody`. |
| `src/components/JengaTower3D.tsx` | Drop zone `{dragging && (...)}`; `showDropZoneHint` + "Release over the drop zone to place" (1.8s); hint "**Tap** = … **Pull** = … yellow drop zone …"; `setShowDropZoneHint(false)` on block pointerDown. |
| `src/components/JengaHowToPlayModal.tsx` | Controls: **Tap** = quick press…; **Pull** = hold ~0.3s, drag to **yellow drop zone** (appears when you pull), release. |
| `src/app/jenga/page.tsx` | Practice: `showSuccessFeedback`, `successFeedbackTimeoutRef`; on success in `onMove`, "✓ Good move!" for 1s; cleanup on unmount. |

---

## 8. Reference: key symbols and locations

- **Tap vs pull:** `JengaTower3D.tsx`: `pressing` (tap path) and `dragging` (pull path). `HOLD_THRESHOLD_MS` (400), `PULL_THRESHOLD_PX` (5).  
- **Tap onMove:** `onMove(..., { isTap: true, strength })` from `onPointerUp` in the `pressing` effect.  
- **Push sim:** `jenga-physics.ts` `runPushWithFallSimulation`. `pushDirectionOffset`, `PUSH_SPAWN_OFFSET`; pushed body at `base + offset`; contact check unchanged.  
- **Stability:** `jenga-stability.ts` `computeStabilityPercent`; height penalty **removed** (Option B).  
- **Drop zone:** `JengaTower3D.tsx` `dropZoneRef`, `overDrop` in `onPointerUp` for `dragging`; drop zone div only when `dragging`; `showDropZoneHint` and "Release over the drop zone to place".

---

*Decisions and implementations above are verified in the codebase. Run Practice after each step to confirm.*
