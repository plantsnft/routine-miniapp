/**
 * JENGA Stability % (Phase 5)
 * computeStabilityPercent(tower) → [0, 100].
 * Used to modulate impact→collapse and for UI.
 */

import type { TowerV2 } from './jenga-official-rules';

function getTopLevel(tower: TowerV2): number {
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

/** Per-plan: support penalty, CoM outside [0.5, 1.5]. Clamp [0, 100]. */
const COEFF_NO_SUPPORT = 12;
const COEFF_COM_OUT = 8;

/**
 * Compute stability % for a v2 tower.
 * - Start at 100.
 * - Each block lacking full support from below: subtract COEFF_NO_SUPPORT.
 * - Level CoM outside [0.5, 1.5] in block-index: subtract COEFF_COM_OUT.
 * - Height penalty removed (Option B): a full tower starts at 100%.
 * - Clamp to [0, 100].
 */
export function computeStabilityPercent(tower: TowerV2): number {
  let s = 100;
  const top = getTopLevel(tower);
  if (top < 0) return 100;

  for (let L = 0; L <= top; L++) {
    const rows = tower[L];
    if (!rows?.length) continue;
    const row = rows[0];
    if (!row) continue;

    const indices: number[] = [];
    for (let b = 0; b < row.length; b++) {
      if (row[b] != null) indices.push(b);
    }
    if (indices.length === 0) continue;

    // Center of mass in block-index space [0, 1, 2]
    const com = indices.reduce((a, i) => a + i, 0) / indices.length;
    if (com < 0.5 || com > 1.5) s -= COEFF_COM_OUT;

    // Support from below: level 0 = base; L>0 needs tower[L-1][0][b] (same column, matches findFirstGap)
    for (const b of indices) {
      if (L === 0) continue;
      const below = tower[L - 1]?.[0];
      const hasSupport = below && b >= 0 && b < below.length && below[b] != null;
      if (!hasSupport) s -= COEFF_NO_SUPPORT;
    }
  }

  return Math.max(0, Math.min(100, Math.round(s * 10) / 10));
}

/** Threshold below which we treat the tower as collapsed (Phase 5). */
export const COLLAPSE_STABILITY_THRESHOLD = 15;
