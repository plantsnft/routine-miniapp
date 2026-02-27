# JENGA: Official Rules, Practice Mode, 3D, and Physics — End-to-End Plan

## 1. Purpose and Scope

This plan **replaces** the current JENGA game with one that follows the **official JENGA rules** and adds **Practice mode**, **3D tower**, **360° view**, **tap-to-push / grab-to-pull** with strength, **physics-based** collapse, and **stability %**. All **new** games use this design; there is no separate “v2” product—this is **the** JENGA game.

- **Existing in-progress games** that still have the **old** `tower_state` format: we keep a **legacy read-only path** so they can **finish** (we never write the old format). We **never** create new games with the old format.
- **Non‑JENGA** (poker, BUDDY UP, BETR GUESSER, REMIX BETR, clubs, notifications, settlement-core, etc.) is **not** changed.

---

## 2. Source of Truth: Official Rules (Implement Exactly)

### 2.1 Setup
- 54 blocks, 18 levels × 3 blocks per level.
- Within a level, 3 blocks sit side-by-side (long sides parallel); each new level is rotated 90° relative to the level below.
- Builder goes first (for digital: we use `turn_order`; builder = first in order; we can ignore for practice).

### 2.2 Turn — Legal Move
On a player’s turn, a legal move is:
1. **REMOVE** exactly **one** block from any level of the tower **EXCEPT**:
   - **NOT** from the **topmost level**.
   - **NOT** from the level **directly below an incomplete top level**.
   - *Incomplete top level* = top level has 1 or 2 blocks (not 3).
2. **PLACE** that same block onto the topmost level to complete it.
   - If the topmost level already has 3 blocks, **start a new top level** (rotated 90° from the previous) and place the block there.
   - A level must be completed (3 blocks) before a higher one is started.

### 2.3 Hand / Interaction
- Only **one hand** at a time; only one hand may touch the tower at any time.
- Players may **tap/touch** blocks to find a loose one.
- Any block **moved but NOT played** should be **replaced** (put back), unless doing so would make the tower fall.

### 2.4 When a Turn Ends
- The turn ends when the **next player touches the tower** OR after **10 seconds**, whichever occurs first, **counted after the block is placed on top**.

### 2.5 Game End
- The game ends when:
  - the **tower falls (completely)**, OR
  - **any block falls** from the tower **other than** the block the current player moved on that turn.
- The **loser** is the player whose turn it was when the tower fell.

---

## 3. Changes vs Current Phase 15 (v1)

| Aspect | Phase 15 (v1) | V2 (Official + New UX) |
|--------|----------------|--------------------------|
| Removal rules | `isBlockRemovable` (nothing above, one side clear) + `isDirectionValid` | **Official:** only forbid top and (top−1 when top incomplete). Remove **exactly one** block. |
| Extra blocks removed | `getHitBlock` + `placementHitBlocks` add more removed blocks | **None.** Remove exactly 1; no hit-based extra removal. |
| Hits during placement | `placementHitBlocks` → extra removal; impact → shake | **Hits only affect collapse:** stability % + impact decide if tower falls. No extra blocks removed. |
| Block identity | `{ removed, orientation }` per slot | **Stable block IDs** (0..53). `tower[L][R][B]=blockId \| null`, `blockInHand`, `removedFrom` for replace. |
| Placement rule | Fill 1→2→3, then new level | Same. |
| Turn end | After move; `turn_time_seconds` for “time to move” | **10s after placement** or **next player touch**, whichever first. (We keep `turn_time_seconds` for “time to complete remove+place” if desired.) |
| Replace | N/A | **If turn ends with `blockInHand`:** replace into `removedFrom` unless that would make the tower fall. |
| Collapse | `isTowerStable` heuristic; eliminate on unstable | **Physics:** tower fell completely **or** any non-moved block fell. **Impact + stability %:** e.g. &lt;20% → any non-trivial impact = fall; 20–50% → medium; 50%+ light impact = OK. Loser = current player. |
| Input | One continuous drag: pull out → drop zone → release | **Tap-to-push** (strength from press duration or meter) + **grab-to-pull** (hold, then drag). Direction/angle chosen by user. |
| View | 2D top-down | **3D** (CSS 3D), **360°** (rotate + pinch). |
| Stability | Implicit in `isTowerStable` | **Stability %** in top-right; always visible; used to modulate impact→collapse. |

---

## 4. New Features (Your Answers Baked In)

### 4.1 Practice Mode
- **Entry:** Small **“Practice”** button on the JENGA card in the BETR GAMES section (`/clubs/[slug]/games`). Placed so it doesn’t dominate the card (e.g. corner or under the subtitle).
- **Route:** `/jenga?practice=1` or `/jenga/practice`. No auth required; anyone can play.
- **Behavior:** Solo, **turn-after-turn** (player goes repeatedly). No opponent; no signups, no bets, no persistence.
- **Timer:** 5s between “turns” by default, or an optional “No limit” for learning. (Official 10s can be an option.)
- **Rules / physics:** Same rule engine and physics as real games. **Client-only** for practice: rule module + physics (Cannon-es) run in the browser; no server calls for move/state. Restart clears state.

### 4.2 Strength
- **Default — “Finger” mode:**  
  - **Mobile:** Press **duration** = strength (longer press = harder).  
  - **Desktop:** **Mouse down duration** (press/release) = same idea; optionally release **velocity** can modulate.  
  - Output: `strength` in `[0,1]` drives how far the block moves out on **tap-to-push**.
- **Optional — "Meter" mode (Madden power‑kicking style):**  
  - **Order: power first, then accuracy.** Phase 1 — **Power:** bar or needle; user presses to start, presses again to **lock power**. Phase 2 — **Accuracy:** sweet spot or sweeping indicator; user presses to **stop** in the zone. **Strength formula:** `strength = f(power, accuracy)` (e.g. `power * (0.7 + 0.3 * accuracy)`).  
  - **Desktop:** primary for meter; **mobile:** optional. UI: moving bar or needle; exact layout TBD in Phase 4.

### 4.3 Tap-to-Push vs Grab-to-Pull
- **Tap to push:** User selects block and **direction/angle**. On **tap**, we apply a **push** with `strength` (from finger or meter). Block moves **out** in that direction; **distance ∝ strength**.  
  - If it moves **too far** and **falls out before the user grabs it**, it can **hit the tower** as it falls → **game over, loser = current player** (in practice: "You lose" / practice over; in real: same as collapse).
- **Grab to pull:** User **holds** on the block, then **drags** to pull. Direction comes from the **drag**. Same one-block removal; no strength-derived distance, user controls how far it’s pulled.
- **Direction/angle:** Chosen by the user (e.g. 4 or 8 directions, or a wheel). **Then** they either **tap** (push) or **grab** (pull) in that sense.

### 4.4 3D and Rotation
- **3D:** **CSS 3D** (`transform: rotateX/Y`, `perspective`). Mini-app friendly; no Three.js/R3F to limit bundle size.
- **360° view:** User can orbit around the tower.
- **Rotation controls:**  
  - **Small ⟲ / ⟳ buttons** (Option C).  
  - **Pinch-rotate** on mobile.  
  - (Optional: drag on background to orbit; can add later.)

### 4.5 Collapse and Physics
- **Physics engine:** **Cannon-es** (3D, JS, no WASM). If bundle or perf is an issue, **Rapier** (WASM) is the alternative.
- **Collapse conditions:**  
  1. **Tower fell completely** (enough blocks have left the structure / base).  
  2. **Any block fell** from the tower **other than** the block the current player moved this turn.  
- **Impact + stability (placement):**  
  - When the placed block (or the one being dragged) **hits** the tower: use **stability %** + **impact intensity** (e.g. velocity):  
    - **Stability ≥ ~70%** and **light impact** → OK.  
    - **~50%** → **medium** impact can cause fall.  
    - **&lt;20%** → **any** non-trivial impact → fall.  
  - Exact bands (20/50/70) and “light/medium/high” thresholds are **tunable**; plan assumes this structure.

### 4.6 Stability %
- **Formula (proposed):**  
  - Start at 100.  
  - For each block: if it **lacks full support** from below (no block or base in its column), subtract a penalty.  
  - If a level’s **center-of-mass** (in block units) is outside a safe range (e.g. [0.5, 1.5]), subtract.  
  - **Height** penalty: each level above base adds a small decrement (taller = less stable).  
  - Clamp to [0, 100].  
- **Display:** **Top-right**, **always visible**. Shown at turn start; number stays on screen.  
- **Use:** Modulates whether a **placement hit** causes collapse (see 4.5).

### 4.7 One-Hand / One-Pointer
- **Digital stand-in:** Only **one pointer** (one `pointerId`) may be active for block interaction at a time. A second pointer down is **ignored** for block logic.  
- Applies to both practice and real games.

### 4.8 “Replace” (Block Moved but Not Played)
- If the turn ends with **`blockInHand`** non-null (they removed but never placed—this only happens when **`turn_time_seconds`** expires before a place; 10s and next-player touch occur only *after* a place, so `blockInHand` is null in those cases), we **replace** that block into **`removedFrom`** (the slot it came from).  
- **Exception:** “Unless doing so would make the tower fall.”  
  - **Approach:** Run a **physics simulation** (Cannon-es) after a hypothetical replace. If the sim predicts **collapse** or **tower/block fell**, **do not** replace; treat as **collapse**, **loser = current player**. Physics is the authority for realism; stability % is also shown so everyone knows the situation.

---

## 5. Tower State (V2)

### 5.1 Block IDs
- 54 blocks: **blockId** `0..53` (or `"0".."53"`). Assigned at init and **stable** for the game.
- **Initial assignment:** e.g. `tower[L][0][B] = L*3 + B` for `L in 0..17`, `B in 0..2`.

### 5.2 Structure
- `tower[level][row][block] = blockId | null`.  
  - `null` = gap.  
  - Only one row per level in the standard layout: `row = 0`.
- **`blockInHand: number | null`** (blockId). Non-null only during a move, after remove and before place.
- **`removedFrom: { level, row, block } | null`.** When we remove, we set this so we can **replace** if the turn ends without a place.

### 5.3 Orientation
- Per **level**: `level % 2 === 0` ⇒ horizontal; `level % 2 === 1` ⇒ vertical. Matches “90° per level” and is used for 3D rendering and placement (new level gets the next orientation).

### 5.4 Top, Incomplete, Forbidden Removal
- **Top level index** `top` = highest `level` with at least one non-null slot.
- **Incomplete top** = number of non-null slots on `top` is 1 or 2.
- **Forbidden removal levels:**  
  - Always: `top`.  
  - If top is incomplete: also `top - 1`.  
- **Removable levels:** `0 .. top-1`, but if top is incomplete then `0 .. top-2` (we exclude `top-1`).

### 5.5 Placement
- **Place `blockInHand` on top:**  
  - If top has a **gap** (fewer than 3 blocks): put `blockInHand` into the first such gap (with support from below).  
  - If top has **3 blocks**: append a new level (one row, 3 slots), set the **first** slot to `blockInHand`, other two `null` (or we could initialize as gaps; logic same).  
- Then set `blockInHand = null`, `removedFrom = null`.

### 5.6 DB and Backward Compatibility
- **`tower_state` (JSONB):** Support a **`version`** (or a separate shape).  
  - **v1 (current):** `[L][R][B] = { removed, orientation }`; no `blockInHand`, no `removedFrom`.  
  - **v2:** `{ version: 2, tower: (blockId|null)[][][], blockInHand: number|null, removedFrom: {...}|null }`.  
- **New games** and **practice** use **v2**. **Existing in-progress games** stay **v1** until they finish or we run a one-time migration. The **rule engine** and **move API** detect `version` and branch.  
- **`jenga_games`:** Optional `rules_version` or we infer from `tower_state.version`.  
- **`last_placement_at` (timestamptz):** For "10s after placement." **Prefer a column** on `jenga_games` for 10s handoff and on-read logic; if a migration is delayed, it may live in `tower_state` or game JSONB temporarily. Same for "whose turn" during the 10s handoff.

---

## 6. Rule Engine (Authoritative)

### 6.1 Module
- **`src/lib/jenga-official-rules.ts`** (or `jenga-rules-v2.ts`).  
- Pure, deterministic functions. **Server** uses it for real games; **client** can import the same module for **practice** (no auth, no server).

### 6.2 Functions
- **`getTopLevel(tower): number`**  
  - Highest level with ≥1 non-null slot.
- **`isTopIncomplete(tower): boolean`**  
  - Top level has 1 or 2 blocks.
- **`getForbiddenRemovalLevels(tower): Set<number>`**  
  - `{ top }` if top complete; `{ top, top-1 }` if top incomplete.
- **`isRemovalLegal(tower, level, row, block): boolean`**  
  - Slot non-null, `level` not in forbidden set. (We can add bounds checks.)
- **`removeBlock(tower, level, row, block): { tower, blockId, orientation, removedFrom }`**  
  - Returns new tower with that slot = `null`, `blockInHand` set, `removedFrom` set. Reads orientation from level.
- **`placeBlock(tower, blockInHand, removedFrom): tower`**  
  - Places `blockInHand` on top (gap or new level); clears `blockInHand` and `removedFrom`.  
  - (In practice we’ll often have `blockInHand` in state and call a `placeOnTop(tower, blockId)` that finds the slot.)
- **`validateMove(state, removeSlot, placeTarget?): { ok, reason? }`**  
  - Checks `isRemovalLegal`, that `blockInHand` is consumed by a single place, and that the place target is valid (top gap or new level).  
  - For V2 we only need to validate remove + one place; “placeTarget” can be implied (place on top).
- **`replaceBlock(tower, blockInHand, removedFrom): tower | null`**  
  - Puts `blockInHand` back into `removedFrom`. Returns `null` if we must not replace (e.g. would-fall; that can be decided by physics or a separate heuristic).

### 6.3 Collapse and Loser
- Collapse and “any block fell” are **not** in the pure rule module; they live in **physics** and a **game-state layer** that:
  - Runs physics after place (and optionally after replace attempt).
  - Detects “tower fell” and “non-moved block fell.”
  - Sets **loser = current_turn_fid** and **game over**.

---

## 7. Physics and Collapse

### 7.1 Library
- **Cannon-es** for 3D rigid bodies and gravity.  
- If we need to reduce bundle size, **Rapier** (WASM) is the alternative.

### 7.2 Roles
- **Build world from `tower`:** For each non-null `tower[L][R][B]`, create a static (or kinematically positioned) body. One block = one body; `blockId` stored on the body.
- **On remove:** Remove that body from the tower; add it as a **dynamic** body and apply an impulse in the **remove direction** (for push: scaled by `strength`; for pull: by drag). Run steps.
- **On place:** Add the placed block as a body on top; run steps. Detect contacts.
- **During “push” before grab:** If the block is pushed out and **falls** (no grab in time), run physics. If it **collides with the tower** → **game over, loser = current player** (same as collapse).
- **Collapse detection:**  
  - **Tower fell:** e.g. >50% of blocks have left a “tower volume” or the center of the structure has dropped below a threshold.  
  - **Block fell (non-moved):** Any block (by `blockId`) that is **not** `blockInHand` / “the block moved this turn” has left the tower volume or is clearly fallen.  
- **Impact on placement:** When the placed block (or the one we’re moving) hits existing blocks, compute an **impact magnitude** (e.g. relative velocity). Feed that plus **stability %** into the band logic (e.g. &lt;20% → fall; 20–50% medium; 50%+ light only) to decide whether to **force collapse** in the sim or treat as normal place.

### 7.3 “Replace” and “Would Make Tower Fall”
- **Replace:** We put `blockInHand` back into `removedFrom` in the **logical** tower and then run a **short physics** sim (or a fast stability check).  
- If the result is “collapse” or stability 0, we **do not** replace and we **do** treat as collapse; **loser = current player**.

---

## 8. Turn Timer and Touch (10s and Next-Player Touch)

### 8.1 After Placement
- On **place**, set `last_placement_at = now()`.
- For the next **10 seconds** (or until **next player touch**):
  - **Previous player** cannot make another move (their turn is “done”).
  - **Next player** may **touch the tower** to start their turn.  
- **Touch:** `POST /api/jenga/games/[id]/touch` (or `beginTurn`) when the next player starts interaction.  
  - If we’re within the 10s window and it’s the correct “next” fid, we immediately **end the handoff** and set `current_turn_fid = next`, `current_turn_started_at = now()`.

### 8.2 If 10s Elapse Without Touch
- On read (or a timer), if `now() > last_placement_at + 10` and the handoff hasn’t been taken by touch, we set `current_turn_fid = next` (and `current_turn_started_at`) so the next player's turn begins. The **same on-read** (e.g. GET `/api/jenga/games/[id]` and `/state`) also checks `turn_time_seconds`: if `current_turn_started_at + turn_time_seconds < now()`, process turn timeout (eliminate, replace if `blockInHand`, advance turn).

### 8.3 Replace During Handoff
- If the **previous** player had **`blockInHand`** (they removed but never placed) and the turn ends by **timeout** (e.g. `turn_time_seconds` for “time to make the move”) **before** they placed, we run **replace** when their turn ends. **Replace runs server-side:** when the on-read (or equivalent) turn-timeout logic advances the turn and finds `blockInHand` non-null, it runs replace (physics); if it would fall → collapse, loser; else persist the replaced tower and advance. The client does **not** send a replace request for timeout.  
- The **10s** only starts **after** a successful **place**. So if they never place, we use the **move timer** (`turn_time_seconds`) to end their turn and then **replace** if `blockInHand` is set.

### 8.4 Practice
- No “next player.” After place, wait **5s** (or “no limit”) then the **same** player’s “next turn” starts. No touch endpoint. **In practice there is no replace-by-timeout:** the player must place, or cause collapse, or pushed-block-hit. Replace is only used in **real** games when `turn_time_seconds` expires with `blockInHand`.

---

## 9. Practice Mode — Technical

- **Route:** `/jenga?practice=1` or `/jenga/practice`.  
- **UI:** Reuse the same game board and 3D/rotation/strength/tap/grab/stability as real games; hide multiplayer, timer-to-next-player, and bets.
- **State:**  
  - In-memory on the client: `tower` (v2 shape), `blockInHand`, `removedFrom`, `movedBlockIdThisTurn` (for “any block fell” excluding it).  
  - **Rule engine:** `jenga-official-rules` on the client.  
  - **Physics:** Cannon-es on the client.  
- **Persistence:** None. Restart = new tower. Optional: `localStorage` for “practice high score” (e.g. moves before collapse) later; out of scope for this plan.

---

## 10. UI and Input (Summary)

### 10.1 JENGA Card (BETR GAMES)
- Keep existing link and layout.  
- Add a **small “Practice”** button (e.g. under subtitle or in a corner).  
  - `href="/jenga?practice=1"` (or `/jenga/practice`).  
  - `onClick` can `preventDefault` and `router.push` if we use SPA navigation.  
- Add a **"How to Play"** control **next to** the Practice button. Opens a **modal**; use `e.stopPropagation()` so clicking it does not trigger the card link. **Brief copy** in §10.5.

### 10.2 Game Board (Real and Practice)
- **3D:** CSS 3D tower and blocks.  
- **Stability %:** Top-right, always visible.  
- **Rotation:** ⟲ / ⟳ buttons; pinch on mobile.  
- **Block interaction:**  
  1. **Select block** (and optionally **direction**).  
  2. Either **tap (push)** or **hold then drag (pull)**.  
- **Strength (push):**  
  - **Finger (default):** press duration (+ optional release velocity on desktop).  
  - **Meter (optional):** power‑then‑accuracy (Madden-style); desktop preferred, mobile optional.  
- **One-pointer:** Enforce in the pointer handlers; second pointer ignored.  

### 10.3 Flow: Push
1. Select block (+ direction).  
2. Tap.  
3. Measure press duration → `strength`.  
4. Apply push: block moves out along that direction; distance ∝ `strength`.  
5. If user **holds** on it before it “gets away,” we can transition to **grab** (pull) and cancel the auto-fall.  
6. If it **falls out** and **hits the tower** before grab → **game over, loser = current player**.

### 10.4 Flow: Pull
1. Select block (direction can be inferred from first drag).  
2. **Hold** (~300–500 ms) to “grab,” then **drag** to pull out.  
3. Drag to **top / drop zone** and release to **place**.  
4. (If we unify with current "drop zone," the same target works.)

### 10.5 How to Play Modal (Brief Copy)

- **Placement:** Opened by "How to Play" next to Practice on the JENGA card; the same modal may be reused on the jenga page (e.g. in practice) if desired.  
- **Format:** Short, scannable modal.  
- **Copy to use:**  
  - **Rules:** Remove 1 block from allowed levels (not top; not top−1 when top is incomplete). Place it on top. Your turn ends 10s after you place, or when the next player touches the tower. If you still hold a block when your turn ends, put it back unless that would make the tower fall. One hand only; you may tap to find a loose block.  
  - **Game over:** Tower falls, or any block (other than the one you moved) falls, or a pushed block hits the tower → **game over, loser = you**.  
  - **Controls:** **Push:** tap (strength from press duration or power‑then‑accuracy meter). **Pull:** hold, then drag to the top and release. Choose **direction**; use **⟲/⟳** or pinch to **rotate**. **Stability %** (top‑right) shows how stable the tower is.

---

## 11. APIs (Add/Change)

### 11.1 New
- **`POST /api/jenga/games/[id]/touch`**  
  - Body: `{}` or `{ fid }` (fid can come from auth).  
  - Auth: `requireAuth`.  
  - If `current_turn_fid !== fid` and `fid` is the *next* in `turn_order` and we’re in the 10s-after-placement window, set `current_turn_fid = fid`, `current_turn_started_at = now()`, clear handoff state.  
  - Response: `{ ok: true }` or `{ ok: false, error }`.

### 11.2 Move API (V2)
- **Body (V2):**  
  - `{ remove: { level, row, block }, place?: "on_top", rulesVersion?: 2 }`  
  - Optional: `blockInHand` only if we ever split remove/place into two calls; for a single “move” we can keep remove+place atomic and infer `blockInHand` from `remove`.  
- **Server:**  
  - If `tower_state.version === 2` or `rulesVersion === 2`: use **`jenga-official-rules`**.  
  - Validate remove (level not forbidden, slot non-null).  
  - Remove: `removeBlock` → new tower, `blockInHand`, `removedFrom`.  
  - Place: `placeBlock` (or `placeOnTop`) → final tower.  
  - Run **physics** (or a **stability/fall** heuristic) to detect collapse.  
  - If collapse: set loser, game over, **do not** persist the place; advance state (eliminate, etc.) per current design.  
  - If OK: persist `tower_state` (v2), set `last_placement_at = now()`, clear `blockInHand` and `removedFrom`, advance “handoff” state (next player can touch or 10s).  
- **Replace:** Replace is run **server-side** by the on-read turn-timeout logic when it finds `blockInHand` non-null (see §8.3); that logic calls `replaceBlock` and physics. If the move route ever receives a `replace: { blockInHand, removedFrom }` body, it is only from that internal codepath (or from a future admin path)—the game client does **not** send replace. If it would fall, treat as collapse.

### 11.3 Practice
- **No** move or touch API. All state and rules on the client.

---

## 12. Phased Implementation (Non-Breaking)

### Phase 1 — Foundation (Rules, Tower State, Timers, Touch)
- **Add** `jenga-official-rules.ts`: `getTopLevel`, `isTopIncomplete`, `getForbiddenRemovalLevels`, `isRemovalLegal`, `removeBlock`, `placeBlock`, `validateMove`, `replaceBlock` (and a heuristic or stub for “would fall” that always allows replace for now).
- **Add** v2 tower shape and `blockInHand`, `removedFrom` in types and in **new** games only (e.g. `rules_version` or `tower_state.version`).  
- **Extend** move route: if `rules_version === 2` or `tower_state.version === 2`, use the new rules and **remove exactly one**, **place one**; **no** `getHitBlock` or `placementHitBlocks` removal.  
- **Add** `last_placement_at` (column or in state) and **10s / next-player** logic: on read, if `now() > last_placement_at + 10` and handoff not done, advance `current_turn_fid`.  
- **Add** `POST /api/jenga/games/[id]/touch` for next-player takeover.  
- **Keep** all existing v1 games and v1 logic untouched; v1 and v2 coexist.

**Deliverable:** **Create = always new (official) rules and v2 tower format**; no v2 flag. Move and touch work. **Legacy:** only read/process old `tower_state` for existing in‑progress games; **never** write old format. No UI change yet.

---

### Phase 2 — Practice Mode
- **Add** small **"Practice"** button and **"How to Play"** (modal) next to it on the JENGA card in `src/app/clubs/[slug]/games/page.tsx`.  
- **Add** `/jenga?practice=1` (or `/jenga/practice`) handling in `jenga/page.tsx`: when `practice=1`, render a **practice layout** (same board component, no multiplayer UI, no server move/touch).  
- **Client:** Use **`jenga-official-rules`** for validate/remove/place. Use a **stub** or **simplified** physics (or a “no physics” mode where we only run a heuristic for “tower fell” for now).  
- **State:** `useState` (or useReducer) for `tower` (v2), `blockInHand`, `removedFrom`, `movedBlockIdThisTurn`.  
- **Timer:** 5s (or “no limit” toggle) between turns in practice.

**Deliverable:** Anyone can open Practice from the JENGA card; solo, turn-after-turn, with official rules. No persistence.

---

### Phase 3 — 3D and 360° Rotation
- **Refactor** (or add) **`JengaTower3D`** (or `JengaTower` in 3D mode): render blocks and levels with **CSS 3D** (`transform: rotateX/Y`, `perspective`).  
- **Rotation:**  
  - State: `cameraAngle` (e.g. degrees).  
  - Small **⟲ / ⟳** buttons: increment/decrement `cameraAngle`.  
  - **Pinch** on mobile: `gesture-handler` or `touch` events to adjust `cameraAngle`.  
- **Integration:** Use this in both **real** and **practice** when we’re in “3D mode.” We can keep a 2D fallback for v1 or low-perf devices if needed; plan assumes we switch the main board to 3D for v2/practice.

**Deliverable:** 3D tower and 360° view with buttons + pinch. No change to move or rules.

---

### Phase 4 — Strength, Tap-to-Push, Grab-to-Pull
- **Strength (finger, default):**  
  - On pointer down on a block: start a timer.  
  - On pointer up: `strength = f(duration)` (e.g. `min(1, duration / 800)`), and optionally `f(releaseVelocity)` on desktop.  
  - Use for **tap-to-push**: apply impulse or anim offset ∝ `strength` in the chosen direction.  
- **Strength (meter, optional):**  
  - **`JengaStrengthMeter`:** **Power first, then accuracy** (Madden power‑kicking). Phase 1: bar/needle, user presses to start, presses again to **lock power**. Phase 2: sweet spot or sweeping indicator; user presses to **stop** in zone. `strength = f(power, accuracy)` (e.g. `power * (0.7 + 0.3 * accuracy)`).  
  - Shown on desktop as an option; mobile as an option. Settings or a small “Meter / Finger” toggle.  
- **Tap-to-push:**  
  - Select block + direction. On **tap** (short press without transitioning to hold), use `strength` to push.  
  - If the block **leaves the tower** and we have **physics**, run it. If it **hits the tower** before grab → **game over, loser = current player**.  
- **Grab-to-pull:**  
  - If **hold** &gt; ~300 ms and then **drag**, treat as pull. Block follows the pointer (in 3D, project to a plane or use a fixed “out” axis). Drag to **drop zone** and release to **place**.  
- **Direction:**  
  - 4 or 8 directions chosen before tap or at drag start. UI: arrows, wheel, or “closest to drag direction.”  
- **One-pointer:** In all of these, ignore a second `pointerdown` for block interaction.

**Deliverable:** Tap (push) and grab (pull) with strength; meter optional. **Game over, loser** when pushed block falls and hits the tower.

---

### Phase 5 — Physics, Collapse, Stability %
- **Integrate Cannon-es:**  
  - **`jenga-physics.ts`** (or `jenga-collapse.ts`):  
    - `buildWorld(tower, blockIdToBody?)`  
    - `removeBody(blockId)`, `addDynamicBody(blockId, pos, impulse)`  
    - `addBlockOnTop(blockId, pos)`  
    - `step(dt)`, `detectTowerFell()`, `detectNonMovedBlockFell(movedBlockId)`  
  - On **remove** (both push and pull): remove from structure, add as dynamic, apply impulse.  
  - On **place**: add on top, run steps.  
  - On **push-with-fall**: run until the block hits something or leaves; if hit tower → game over, loser = current player.  
- **Collapse:**  
  - Use `detectTowerFell` and `detectNonMovedBlockFell(movedBlockId)`.  
  - On collapse: set **loser = current_turn_fid**, game over, **revert** the place (and the remove) in persisted state; in-memory we can show a short “collapse” animation.  
- **Impact + stability:**  
  - **`jenga-stability.ts`:** `computeStabilityPercent(tower): number` using support, CoM, height.  
  - When the placed (or moved) block **contacts** the tower, get **impact** (e.g. relative speed).  
  - If `stability < 20` and impact &gt; low → collapse.  
  - If `20 <= stability < 50` and impact &gt;= medium → collapse.  
  - If `50 <= stability < 70` and impact &gt;= high → collapse.  
  - If `stability >= 70` only very high impact.  
  - (Exact numbers to tune in impl.)  
- **Replace and “would fall”:**  
  - When we **replace**, run `replaceBlock` to get the logical tower, then run **physics** for a short time (or `computeStabilityPercent`). If we detect fall or stability 0, **do not** replace; instead, **collapse**, loser = current.  
- **UI:** Stability % in the **top-right**, always visible.

**Deliverable:** Physics-driven collapse; “any block fell” and “tower fell”; impact modulated by stability %; replace with “would fall” check; stability % on screen.

---

### Phase 6 — Integration and Cutover
- **Real games:**  
  - **Create = always new (official) JENGA**; no v2 opt-in. When creating a **new** JENGA game, set `rules_version: 2` (or `tower_state.version: 2`) and use v2 init (blockIds, `blockInHand: null`, `removedFrom: null`).  
  - Move API and touch API already support v2 from Phase 1.  
  - Ensure **move timer** (`turn_time_seconds`) still applies to “time to complete remove+place” and that **10s after place** and **touch** work.  
- **Practice:**  
  - Use the same **physics** and **stability** as real v2 (Phase 5).  
  - Ensure **game over, loser** (pushed block hits tower) and **collapse** both end the practice run with a clear message.  
- **Legacy:**  
  - **v1** remains only for **in‑progress** games that already have old `tower_state`; we never write old format. No new v1 games.

**Deliverable:** New real games are **always** the new (official) JENGA with full rules, physics, stability, and 10s+touch. Practice uses the same stack. v1 only as legacy for in‑progress.

---

## 13. Files to Create or Modify

### New
- `src/lib/jenga-official-rules.ts` — Rule engine (remove/place/forbidden/validate/replace).
- `src/lib/jenga-tower-state-v2.ts` or extend `jenga-game-logic.ts` — v2 types, `blockInHand`, `removedFrom`, init with blockIds.
- `src/lib/jenga-physics.ts` — Cannon-es: build world, add/remove bodies, step, `detectTowerFell`, `detectNonMovedBlockFell`.
- `src/lib/jenga-stability.ts` — `computeStabilityPercent(tower)`.
- `src/components/JengaTower3D.tsx` — 3D tower (CSS 3D), rotation (⟲/⟳ + pinch).
- `src/components/JengaStrengthMeter.tsx` — Optional meter (Madden power‑then‑accuracy) for strength.
- `src/components/JengaHowToPlay.tsx` — How to Play modal (brief rules + controls); trigger next to Practice on JENGA card.
- `src/app/api/jenga/games/[id]/touch/route.ts` — `POST` for next-player touch.

### Modified
- `src/app/api/jenga/games/route.ts` — POST create: always init `tower_state` as v2, set `rules_version` or `tower_state.version` to 2.
- `src/app/api/jenga/games/[id]/move/route.ts` — Branch on `rules_version`/`tower_state.version`; v2 uses `jenga-official-rules`, no getHitBlock/placementHitBlocks removal; call physics and stability for collapse; handle replace.
- `src/app/api/jenga/games/[id]/route.ts` — Return `last_placement_at`, handoff state, and `tower_state` v2 when applicable; on-read 10s handoff advancement.
- `src/app/jenga/page.tsx` — Practice mode (`?practice=1`), use `JengaTower3D` and new input (tap/grab, strength, stability %). For practice, client-only state and `jenga-official-rules` + physics.
- `src/app/clubs/[slug]/games/page.tsx` — Small "Practice" and "How to Play" (modal) on JENGA card.
- `src/components/JengaTower.tsx` — Either replaced by `JengaTower3D` for v2/practice or kept as 2D fallback; and/or refactored to host 3D, rotation, and new input.
- `jenga_games` (DB): add `last_placement_at` (optional) or store in JSONB; support `tower_state` v2 shape. (Migration TBD.)

### Dependencies
- **cannon-es** (or **@react-three/cannon** if we ever move to R3F; for now, **cannon-es** alone is enough).

---

## 14. Decisions (Final)

All resolved per product direction:

1. **Create:** **Replace, not v2.** Create = always new (official) rules and v2 tower format. No v2 flag; no new v1 games.
2. **Pushed block hits tower:** **Game over, loser = current player** (same as collapse). In practice: "You lose" / practice over.
3. **Meter:** **Power first, then accuracy** (Madden power‑kicking). Phase 1: lock power; Phase 2: stop in accuracy zone. `strength = f(power, accuracy)`.
4. **`turn_time_seconds` vs 10s:** `turn_time_seconds` = time to complete remove+place. **10s** = after place before next player must take over. Both apply.
5. **Replace "would make tower fall":** **Physics** is the goal (Cannon-es sim). Stability % shown so everyone knows. If physics says collapse, do not replace; **loser = current player**.

---

## 15. Success Criteria (E2E)

- **Practice:** From BETR GAMES → JENGA card → Practice → `/jenga?practice=1`. Solo, turn-after-turn, official rules (remove 1 from legal levels, place 1 on top). Tap-to-push (strength from finger or meter) and grab-to-pull. If pushed block falls and hits tower → game over, loser. 3D, 360°, stability % visible. Physics: tower fell or non-moved block fell → practice over. One-pointer. No server calls for moves.
- **Real (v2):** New v2 game: same 3D, rotation, tap/grab, strength, stability %. Move API: remove 1, place 1, no hit-removal. 10s after place or next-player touch. Replace when turn ends with block in hand (unless would fall). Physics collapse + impact/stability. Touch API for next player. Loser = current on collapse.
- **Real (v1):** Unchanged; existing in-progress games and old logic keep working.

---

## 16. If You’re 100% Sure

Once this plan is approved and these decisions are reflected, implementation can proceed phase-by-phase. Each phase is designed so that:

- **Phase 1:** v1 and v2 coexist; no UI change; **Create = always new** (official) rules and v2 tower; legacy read-only for in‑progress v1.
- **Phase 2:** Practice is additive; no change to real-game APIs or v1.
- **Phase 3:** 3D/rotation can sit behind a “use3D” or “v2” flag so we can ship without forcing 3D on v1.
- **Phase 4:** Strength and tap/grab can be limited to v2/practice boards.
- **Phase 5:** Physics and stability are used only for v2 and practice.
- **Phase 6:** **Create = always new (official) JENGA**; no v2 opt-in. v1 only as legacy for in‑progress games.

That keeps the app working end-to-end at every step.

**Cutover complete / E2E ready (Phase 1):** v2 is the new game. Create always uses v2 (`tower_state.version === 2`, `last_placement_at`, 10s handoff, touch API). v1 is legacy only for in‑progress games; we never write v1. Move v2 = `{ remove: { level, row, block } }`; move during handoff is rejected (400) until the next player touches or 10s elapse. E2E testable: create → signup → start → first move → handoff (“Touch to start (Xs)”) → touch or 10s → second move. Migration: `supabase_migration_jenga_v2_phase1.sql`.

## 17. Full Edits (File-by-File)

**Create:** `jenga-official-rules.ts`, `jenga-physics.ts`, `jenga-stability.ts`, `JengaTower3D.tsx`, `JengaStrengthMeter.tsx`, `JengaHowToPlay.tsx`, `api/jenga/games/[id]/touch/route.ts`.

**Modify:** `api/jenga/games/route.ts` (POST create: always init `tower_state` as v2, set `rules_version` or `tower_state.version` to 2); `api/jenga/games/[id]/move/route.ts` (branch v2, jenga-official-rules, physics, replace, no getHitBlock/placementHitBlocks); `api/jenga/games/[id]/route.ts` (`last_placement_at`, handoff, 10s); `jenga/page.tsx` (practice=1, JengaTower3D, tap/grab, stability %, JengaHowToPlay in board); `clubs/[slug]/games/page.tsx` (Practice + How to Play on JENGA card); `JengaTower.tsx` (refactor or replace by JengaTower3D); `jenga_games` DB (last_placement_at, tower_state v2).

**Delete:** None. (Legacy v1 read path stays.)

## 18. Source of Truth Update (BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md)

In **Phase 15**, update: **15.1 Overview** — describe new JENGA as the primary design (official rules, 3D, tap/grab, physics, stability %, 10s+touch, replace, game over loser). **15.2** — add `last_placement_at`, document v2 `tower_state` shape and that **Create** always uses v2. **15.5 Game logic** — point to `jenga-official-rules` and `jenga-physics`; remove getHitBlock/placementHitBlocks for new games. **15.8 UI** — JENGA card: Practice + How to Play; board: 3D, tap/grab, power‑then‑accuracy meter, stability %. **15.13 Edge cases** — pushed block hits tower → game over, loser; replace with physics "would fall." **15.14 Files** — align with §13 and §17. **15.16 Implementation order** — follow `JENGA_V2_OFFICIAL_RULES_AND_PRACTICE_PLAN.md` Phases 1–6. Add a pointer: *Full JENGA design: `JENGA_V2_OFFICIAL_RULES_AND_PRACTICE_PLAN.md`.* Do not change other phases (poker, BUDDY UP, etc.).

## 19. Optional Polish (E2E)

**Haptics:** On good accuracy stop (meter) or tower shake — `navigator.vibrate` if available. **Sound:** Place, light shake, collapse (short, non-intrusive). Both are out-of-scope for the core plan; add behind a pref or after launch. E2E: wire to the same events (place, impact, collapse) used for physics and UI; no new game rules.
