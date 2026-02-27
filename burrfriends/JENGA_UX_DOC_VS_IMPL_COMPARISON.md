# JENGA UX Overhaul: Doc vs Implementation

**Plan of record:** `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` Phase 15 (sections 15.1–15.16) and the Change Log entry "Phase 15 JENGA UX Overhaul — Source of truth E2E-ready". The source of truth is now **E2E-ready**: 15.5 has Types, move processor, placementHitBlocks validation, getHitBlock (one block, no hardness); 15.8 has drop zone, impact, JengaTower/page contracts; 15.6, 15.14, 15.16 are aligned. The gaps in §3.1 below have been closed in the plan.

---

## 1. Will the current implementation work with the new doc?

**No.** The doc describes a **new** JENGA UX (place-on-top, one continuous drag, hits, variable-height tower). The **current code** still implements the **old** model (remove-only, click→select block→select direction→"Make Move"). The doc edits only **update the spec**; they do **not** change any implementation. The UX overhaul must be **implemented** in code before it will work.

---

## 2. Doc vs implementation

| Area | Doc (Phase 15 after edits) | Current implementation | Match? |
|------|----------------------------|------------------------|--------|
| **jenga-game-logic** | `findTopLevel`, `findFirstGap`, `addBlockOnTop`, `applyMoveAndPlace`, `getHitBlock`; `isTowerStable` with top level 1–2 blocks OK, support-from-below, empty levels skipped | `initializeTower`, `isBlockRemovable`, `isDirectionValid`, `applyMove` (remove only, no place-on-top), `isTowerStable` (requires ≥2 blocks/level, centerX 0.5–1.5) | ❌ Logic is remove-only; no place-on-top, no new helpers |
| **move route** | Parse `placementHitBlocks`; `getHitBlock`; `applyMoveAndPlace`; `isTowerStable`; `move_data` with `hitBlocks`/`placementHitBlocks`; response `blocksRemoved?` | Only `blockPosition`, `direction`; uses `validateAndProcessMove`/`applyMove`; `move_data` = `{ blockPosition, direction }`; no `placementHitBlocks` or `blocksRemoved` | ❌ Route uses old flow and payload |
| **JengaTower** | Drag, `onMove(blockPosition, direction, placementHitBlocks?)`, `impact`; no `selectedBlock`/`onBlockSelect` | Click-to-select, `selectedBlock`, `onBlockSelect`; no drag, `onMove`, or `impact` | ❌ Click/select, not drag/onMove/impact |
| **jenga page** | `handleSubmitMove(blockPosition, direction, placementHitBlocks?)`, `impact`; no `selectedBlock`/`selectedDirection`/direction buttons/"Make Move" | `selectedBlock`, `selectedDirection`, direction buttons, "Make Move"; submit uses `selectedBlock`/`selectedDirection` | ❌ Old select-then-move UI |

---

## 3. Doc internal consistency (will the spec work when implemented?)

### 3.1 Gaps / ambiguities

- **`applyMoveAndPlace(tower, primaryBlock, extraRemoved?)` and `addBlockOnTop(tower, block)`**  
  - `primaryBlock` / `block` must carry at least `orientation` (and position for removal). The doc does not say whether they are `BlockPosition` or `TowerBlock & { position }`. **Recommend:** define `PlacedBlock = { orientation, level?, row?, block? }`; for `addBlockOnTop` the placed block needs `orientation`; for `applyMoveAndPlace`, `primaryBlock` = position + data from `tower` at that position.

- **`getHitBlock(tower, position, direction)`**  
  - "Block or finger hits tower hard enough" and "hardness threshold" are in the Overview but not defined for `getHitBlock`. **Recommend:** either (a) specify that `getHitBlock` returns the **one** block in the removal path (no threshold; threshold only for placement/impact), or (b) add a `HIT_THRESHOLD` or equivalent and define how it is used.

- **`(dx, dy)` → direction**  
  - UI: "direction from (dx, dy)"; API: `'left'|'right'|'forward'|'back'`. Mapping is missing. **Recommend:** add a short note, e.g. "Map (dx, dy) to direction: |dx|>|dy| → dx>0 ? 'right' : 'left'; else dy>0 ? 'back' : 'forward' (or match your coordinate system)."

- **`placementHitBlocks` validation**  
  - "Server ignores invalid or out-of-allowed entries." The allowed set is not defined. **Recommend:** define allowed set as blocks that could be struck when placing on top (e.g. adjacent to the drop cell on the top level, or blocks on the top 1–2 levels). If too complex for v1, say "v1: allowed set = top-level blocks only" or "v1: server accepts any `{level,row,block}` that exists and is not the primary; invalid indices ignored."

- **`findTopLevel` and "empty levels"**  
  - "Skip empty levels" can create support-from-below edge cases (e.g. level 5 empty, level 6 has blocks). **Recommend:** state that "empty" = level with all `removed: true`; `findTopLevel` returns the highest level with ≥1 non-removed block; `findFirstGap` only considers slots with support from the level immediately below (or ground). Optionally: "We do not compact/remove empty levels; they remain in the array."

### 3.2 Minor doc lag

- **15.3 Turn progression** step 3: "Validate move → apply to tower → check stability" does not mention place-on-top or hits. **Recommend:** change to: "Validate move → remove primary (and remove-phase hit) → place primary on top (and apply placementHitBlocks) → check stability."

---

## 4. Implementation order (for when you build it)

Recommended order so each step stays E2E-consistent:

1. **jenga-game-logic**  
   Add `findTopLevel`, `findFirstGap`, `addBlockOnTop`, `applyMoveAndPlace`, `getHitBlock`.  
   Update `isTowerStable` (top level 1–2 blocks, support-from-below, skip empty levels).  
   Update or replace `validateAndProcessMove` to use `applyMoveAndPlace` + new `isTowerStable`.  
   Keep `applyMove` or fold it into `applyMoveAndPlace`; do not change the move route yet.

2. **move route**  
   Parse `placementHitBlocks`.  
   Compute remove-phase hit with `getHitBlock`, merge into `extraRemoved`.  
   Call `applyMoveAndPlace`, then `isTowerStable`.  
   Persist `move_data` with `hitBlocks`/`placementHitBlocks` as in the doc; add `blocksRemoved?` to the JSON response.  
   Ensure `initializeTower` and DB `tower_state` shape stay compatible (variable height is already in the doc; init stays 18×3).

3. **JengaTower**  
   Replace click/select with one continuous drag: press on block → pull out (direction from dx,dy) → drop on top drop zone → release.  
   New props: `onMove(blockPosition, direction, placementHitBlocks?)`, `impact` (e.g. callback or `boolean` for shake).  
   Remove `selectedBlock`, `onBlockSelect`.

4. **jenga page**  
   Remove `selectedBlock`, `selectedDirection`, direction buttons, "Make Move".  
   Add `handleSubmitMove(blockPosition, direction, placementHitBlocks?)` and wire `JengaTower`’s `onMove` to it.  
   Add `impact` state and pass to `JengaTower` for tower shake when the tower is hit.

5. **Doc / tuning**  
   Fix the gaps above in Phase 15; tune `isTowerStable`, hit rules, and (dx,dy)→direction from playtesting.

---

## 5. Summary

| Question | Answer |
|----------|--------|
| Does the **edited doc** match the **plan of record** (Phase 15)? | Yes. The edits align Phase 15 with the described JENGA UX overhaul. |
| Will it **work** with the **current implementation**? | No. The implementation still uses the old remove-only, click/select/direction/Make Move model. |
| Is the **doc internally consistent** enough to implement from? | **Yes.** The source of truth has been updated: Types, move processor, placementHitBlocks, getHitBlock, findTopLevel/findFirstGap, (dx,dy)→direction, drop zone, impact. See Change Log "Phase 15 JENGA UX Overhaul — Source of truth E2E-ready". |
| What to do next? | Implement in the order of §4 / 15.16 (logic → move route → JengaTower → jenga page → tuning). |

---

*Generated to compare BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md Phase 15 (after the "okay do that" doc edits) with the current JENGA implementation.*
