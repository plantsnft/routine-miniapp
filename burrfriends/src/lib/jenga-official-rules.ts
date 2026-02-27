/**
 * JENGA Official Rules (V2)
 * Pure, deterministic functions. Server and client (practice) use this module.
 * Tower format: (number | null)[][][] — blockId 0..53 or null per slot.
 */

import { wouldReplaceCauseFall } from './jenga-physics';

export { wouldReplaceCauseFall };

export type TowerV2 = (number | null)[][][]; // [level][row][block]

export interface RemoveSlot {
  level: number;
  row: number;
  block: number;
}

export type Orientation = 'horizontal' | 'vertical';

function deepClone(t: TowerV2): TowerV2 {
  return JSON.parse(JSON.stringify(t));
}

/**
 * Orientation for a level: level % 2 === 0 ⇒ horizontal; 1 ⇒ vertical.
 */
export function getLevelOrientation(level: number): Orientation {
  return level % 2 === 0 ? 'horizontal' : 'vertical';
}

/**
 * Highest level with ≥1 non-null slot.
 */
export function getTopLevel(tower: TowerV2): number {
  for (let L = tower.length - 1; L >= 0; L--) {
    const rows = tower[L];
    if (!rows) continue;
    for (const row of rows) {
      if (!row) continue;
      for (const v of row) {
        if (v != null) return L;
      }
    }
  }
  return -1;
}

/**
 * Top level has 1 or 2 blocks (incomplete).
 */
export function isTopIncomplete(tower: TowerV2): boolean {
  const top = getTopLevel(tower);
  if (top < 0) return false;
  const rows = tower[top];
  if (!rows?.length) return false;
  let n = 0;
  for (const row of rows) {
    if (!row) continue;
    for (const v of row) {
      if (v != null) n++;
    }
  }
  return n === 1 || n === 2;
}

/**
 * Forbidden removal levels: always top; if top incomplete, also top-1.
 */
export function getForbiddenRemovalLevels(tower: TowerV2): Set<number> {
  const top = getTopLevel(tower);
  if (top < 0) return new Set();
  const set = new Set<number>([top]);
  if (isTopIncomplete(tower)) set.add(top - 1);
  return set;
}

/**
 * Slot non-null and level not in forbidden set. Bounds checks.
 */
export function isRemovalLegal(tower: TowerV2, level: number, row: number, block: number): boolean {
  if (level < 0 || level >= tower.length) return false;
  const rows = tower[level];
  if (!rows || row < 0 || row >= rows.length) return false;
  const r = rows[row];
  if (!r || block < 0 || block >= r.length) return false;
  if (r[block] == null) return false;
  const forbidden = getForbiddenRemovalLevels(tower);
  return !forbidden.has(level);
}

/**
 * Returns new tower with slot = null, and { blockId, orientation, removedFrom }.
 */
export function removeBlock(
  tower: TowerV2,
  level: number,
  row: number,
  block: number
): { tower: TowerV2; blockId: number; orientation: Orientation; removedFrom: RemoveSlot } {
  const out = deepClone(tower);
  const rows = out[level];
  if (!rows?.[row] || rows[row][block] == null) {
    throw new Error('removeBlock: slot is null or out of bounds');
  }
  const blockId = rows[row][block] as number;
  rows[row][block] = null;
  const orientation = getLevelOrientation(level);
  return { tower: out, blockId, orientation, removedFrom: { level, row, block } };
}

/**
 * First gap on top (has support from below) or null if top is full.
 */
function findFirstGap(tower: TowerV2): { row: number; block: number } | null {
  const top = getTopLevel(tower);
  if (top < 0) return null;
  const rows = tower[top];
  if (!rows?.length) return null;
  for (let row = 0; row < rows.length; row++) {
    const r = rows[row];
    if (!r) continue;
    for (let b = 0; b < r.length; b++) {
      const hasSupport =
        top === 0 || (tower[top - 1]?.[0]?.[b] != null);
      const isGap = r[b] == null;
      if (hasSupport && isGap) return { row, block: b };
    }
  }
  return null;
}

/**
 * Slot where placeBlock would put the next block: { level, row, block }.
 * Used by jenga-physics for placement simulation. If top has a gap, that slot; else (top+1, 0, 0).
 */
export function getPlaceTarget(tower: TowerV2): { level: number; row: number; block: number } {
  const top = getTopLevel(tower);
  const gap = findFirstGap(tower);
  if (gap != null && top >= 0) return { level: top, row: gap.row, block: gap.block };
  return { level: top + 1, row: 0, block: 0 };
}

/**
 * Places blockId on top: first gap or new level. Returns new tower.
 */
export function placeBlock(tower: TowerV2, blockId: number): TowerV2 {
  const out = deepClone(tower);
  const gap = findFirstGap(out);
  const top = getTopLevel(out);
  if (gap != null && top >= 0 && out[top]?.[gap.row]?.[gap.block] != null) {
    out[top][gap.row][gap.block] = blockId;
    return out;
  }
  // New level: one row, first slot = blockId, others null
  const nextLevel = top + 1;
  const newRow: (number | null)[] = [blockId, null, null];
  while (out.length <= nextLevel) out.push([]);
  if (!out[nextLevel].length) out[nextLevel].push(newRow);
  else out[nextLevel][0] = newRow;
  return out;
}

/**
 * Validates remove only (atomic move: remove+place). placeTarget implied as on-top.
 */
export function validateMove(tower: TowerV2, removeSlot: RemoveSlot): { ok: true } | { ok: false; reason: string } {
  const { level, row, block } = removeSlot;
  if (!isRemovalLegal(tower, level, row, block)) {
    return { ok: false, reason: 'Removal not legal: forbidden level or invalid slot' };
  }
  return { ok: true };
}

/**
 * Puts blockId back into removedFrom. Returns null if wouldReplaceCauseFall.
 */
export function replaceBlock(
  tower: TowerV2,
  blockId: number,
  removedFrom: RemoveSlot
): TowerV2 | null {
  if (wouldReplaceCauseFall(tower, blockId, removedFrom)) return null;
  const out = deepClone(tower);
  const { level, row, block } = removedFrom;
  if (level < 0 || level >= out.length) return null;
  const rows = out[level];
  if (!rows?.[row] || block < 0 || block >= rows[row].length) return null;
  if (rows[row][block] != null) return null; // slot must be empty
  rows[row][block] = blockId;
  return out;
}
