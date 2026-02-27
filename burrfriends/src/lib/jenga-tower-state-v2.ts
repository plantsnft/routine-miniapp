/**
 * JENGA Tower State V2
 * Types and init for official-rules tower. tower[L][R][B] = blockId 0..53 | null.
 */

import type { TowerV2, RemoveSlot } from './jenga-official-rules';

export interface TowerStateV2 {
  version: 2;
  tower: TowerV2;
  blockInHand: number | null;
  removedFrom: RemoveSlot | null;
}

const TOWER_LEVELS = 18;
const BLOCKS_PER_LEVEL = 3;

/**
 * Initialize v2 tower: 18 levels × 3 blocks, blockIds 0..53.
 * blockInHand and removedFrom are null.
 */
export function initializeTowerV2(): TowerStateV2 {
  const tower: TowerV2 = [];
  for (let L = 0; L < TOWER_LEVELS; L++) {
    const row: (number | null)[] = [];
    for (let B = 0; B < BLOCKS_PER_LEVEL; B++) {
      row.push(L * BLOCKS_PER_LEVEL + B);
    }
    tower.push([row]);
  }
  return {
    version: 2,
    tower,
    blockInHand: null,
    removedFrom: null,
  };
}

/**
 * Type guard: is this tower_state a v2 shape?
 */
export function isTowerStateV2(ts: unknown): ts is TowerStateV2 {
  return (
    typeof ts === 'object' &&
    ts != null &&
    (ts as TowerStateV2).version === 2 &&
    Array.isArray((ts as TowerStateV2).tower)
  );
}

/** V1-like block for JengaTower rendering: { removed, orientation } */
export type TowerBlockV1Like = { removed: boolean; orientation: 'horizontal' | 'vertical' };

/**
 * Convert v2 tower_state to a v1-like shape for JengaTower (and jenga-game-logic findTopLevel / isDirectionValid).
 * tower[L][R][B] = blockId | null → { removed: v==null, orientation }.
 */
export function towerStateV2ToV1Like(ts: { version: 2; tower: (number | null)[][][] }): TowerBlockV1Like[][][] {
  const out: TowerBlockV1Like[][][] = [];
  const arr = ts.tower || [];
  for (let L = 0; L < arr.length; L++) {
    const rows = arr[L] || [];
    const levelRows: TowerBlockV1Like[][] = [];
    const orient: 'horizontal' | 'vertical' = L % 2 === 0 ? 'horizontal' : 'vertical';
    if (rows.length === 0) {
      levelRows.push(
        [orient, orient, orient].map(() => ({ removed: true, orientation: orient }))
      );
    } else {
      for (const row of rows) {
        const r = row || [];
        levelRows.push(
          [0, 1, 2].map((b) => ({ removed: r[b] == null, orientation: orient }))
        );
      }
    }
    out.push(levelRows);
  }
  return out;
}
