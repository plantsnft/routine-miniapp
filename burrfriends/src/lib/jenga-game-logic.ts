/**
 * JENGA Game Logic
 * Tower structure, move validation, stability calculation.
 * Place-on-top: findTopLevel, findFirstGap, addBlockOnTop, applyMoveAndPlace, getHitBlock.
 * All helpers return a new tower; they do not mutate the input.
 */

export interface TowerBlock {
  removed: boolean;
  orientation: 'horizontal' | 'vertical';
}

export type TowerState = TowerBlock[][][]; // [level][row][block]

export interface BlockPosition {
  level: number;
  row: number;
  block: number;
}

/** Position + orientation (from tower at that cell before removal). */
export type PrimaryBlock = BlockPosition & { orientation: 'horizontal' | 'vertical' };

/** Block to place on top; only orientation is required. */
export type BlockToPlace = { orientation: 'horizontal' | 'vertical' };

export type MoveDirection = 'left' | 'right' | 'forward' | 'back';

export interface MoveData {
  blockPosition: BlockPosition;
  direction: MoveDirection;
}

const TOWER_LEVELS = 18;
const BLOCKS_PER_LEVEL = 3;

function deepCloneTower(tower: TowerState): TowerState {
  return JSON.parse(JSON.stringify(tower));
}

/**
 * Initialize tower structure
 * 18 levels × 3 blocks = 54 blocks total
 * Alternating orientation: level 1 (bottom) = horizontal, level 2 = vertical, etc.
 */
export function initializeTower(): TowerState {
  const tower: TowerState = [];
  
  for (let level = 0; level < TOWER_LEVELS; level++) {
    const orientation: 'horizontal' | 'vertical' = level % 2 === 0 ? 'horizontal' : 'vertical';
    const levelBlocks: TowerBlock[][] = [];
    
    // Each level has 3 blocks in a row
    const row: TowerBlock[] = [];
    for (let block = 0; block < BLOCKS_PER_LEVEL; block++) {
      row.push({
        removed: false,
        orientation,
      });
    }
    levelBlocks.push(row);
    
    tower.push(levelBlocks);
  }
  
  return tower;
}

/**
 * Highest level index with ≥1 non-removed block. Treat a level as empty if all
 * slots are removed; skip it. Do not compact the array.
 */
export function findTopLevel(tower: TowerState): number {
  for (let level = tower.length - 1; level >= 0; level--) {
    const rows = tower[level];
    if (!rows) continue;
    for (const row of rows) {
      if (!row) continue;
      for (const blk of row) {
        if (blk && !blk.removed) return level;
      }
    }
  }
  return -1;
}

/**
 * First slot on the top level that (a) has support from below (level 0 ⇒ base;
 * for L>0, tower[L-1][0][block] exists and is not removed) and (b) is a gap
 * (removed or absent). If the top level has 3 non-removed blocks, returns null.
 */
export function findFirstGap(tower: TowerState): { row: number; block: number } | null {
  const top = findTopLevel(tower);
  if (top < 0) return null;
  const rows = tower[top];
  if (!rows || rows.length === 0) return null;

  for (let row = 0; row < rows.length; row++) {
    const r = rows[row];
    if (!r) continue;
    for (let b = 0; b < r.length; b++) {
      const blk = r[b];
      const hasSupport =
        top === 0 ||
        (tower[top - 1]?.[0]?.[b] != null && !tower[top - 1][0][b].removed);
      const isGap = !blk || blk.removed;
      if (hasSupport && isGap) return { row, block: b };
    }
  }
  return null;
}

/**
 * Place block on top. If findFirstGap is non-null, write into that slot; else
 * append a new level (one row, three slots; first placed, other two removed).
 * Returns a new tower.
 */
export function addBlockOnTop(tower: TowerState, block: BlockToPlace): TowerState {
  const out = deepCloneTower(tower);
  const gap = findFirstGap(out);
  if (gap != null) {
    const top = findTopLevel(out);
    if (top >= 0 && out[top]?.[gap.row]?.[gap.block] != null) {
      out[top][gap.row][gap.block] = { removed: false, orientation: block.orientation };
    }
    return out;
  }
  const newRow: TowerBlock[] = [
    { removed: false, orientation: block.orientation },
    { removed: true, orientation: block.orientation },
    { removed: true, orientation: block.orientation },
  ];
  out.push([newRow]);
  return out;
}

/**
 * Remove primaryBlock and each position in extraRemoved (set removed: true),
 * then addBlockOnTop with the primary's orientation. Returns a new tower.
 */
export function applyMoveAndPlace(
  tower: TowerState,
  primaryBlock: PrimaryBlock,
  extraRemoved?: BlockPosition[]
): TowerState {
  const t = deepCloneTower(tower);
  const { level, row, block } = primaryBlock;
  if (level >= 0 && level < t.length && t[level]?.[row]?.[block] != null) {
    t[level][row][block].removed = true;
  }
  for (const p of extraRemoved ?? []) {
    if (p.level >= 0 && p.level < t.length && t[p.level]?.[p.row]?.[p.block] != null) {
      t[p.level][p.row][p.block].removed = true;
    }
  }
  return addBlockOnTop(t, { orientation: primaryBlock.orientation });
}

/**
 * The one block (if any) in the removal path when pulling from position in
 * direction. left/forward → (level, row, block-1); right/back → (level, row, block+1).
 * No hardness threshold; hardness is only for UI impact/shake.
 */
export function getHitBlock(
  tower: TowerState,
  position: BlockPosition,
  direction: MoveDirection
): BlockPosition | null {
  const { level, row, block } = position;
  const dc = direction === 'left' || direction === 'forward' ? -1 : 1;
  const b = block + dc;
  if (b < 0 || level < 0 || level >= tower.length) return null;
  const r = tower[level]?.[row];
  if (!r || b >= r.length) return null;
  const blk = r[b];
  if (!blk || blk.removed) return null;
  return { level, row, block: b };
}

/**
 * Check if a block is removable
 * Block must:
 * 1. Exist and not be removed
 * 2. Have no blocks directly above it
 * 3. Be accessible from at least one side (not blocked by adjacent blocks)
 */
export function isBlockRemovable(
  tower: TowerState,
  position: BlockPosition
): { removable: boolean; reason?: string } {
  const { level, row, block } = position;
  
  // Check bounds
  if (level < 0 || level >= tower.length) {
    return { removable: false, reason: 'Invalid level' };
  }
  if (row < 0 || row >= tower[level].length) {
    return { removable: false, reason: 'Invalid row' };
  }
  if (block < 0 || block >= tower[level][row].length) {
    return { removable: false, reason: 'Invalid block' };
  }
  
  const targetBlock = tower[level][row][block];
  
  // Check if already removed
  if (targetBlock.removed) {
    return { removable: false, reason: 'Block already removed' };
  }
  
  // Check if any blocks above (on higher levels)
  for (let aboveLevel = level + 1; aboveLevel < tower.length; aboveLevel++) {
    const aboveRow = tower[aboveLevel];
    if (aboveRow && aboveRow.length > 0) {
      for (const aboveBlockRow of aboveRow) {
        if (aboveBlockRow && aboveBlockRow.length > block) {
          const aboveBlock = aboveBlockRow[block];
          if (aboveBlock && !aboveBlock.removed) {
            return { removable: false, reason: 'Block has blocks above it' };
          }
        }
      }
    }
  }
  
  // Check accessibility (at least one side must be clear)
  // For horizontal blocks: check left/right
  // For vertical blocks: check forward/back
  if (targetBlock.orientation === 'horizontal') {
    // Check if blocked on both sides
    const leftBlocked = block > 0 && !tower[level][row][block - 1]?.removed;
    const rightBlocked = block < tower[level][row].length - 1 && !tower[level][row][block + 1]?.removed;
    
    // If both sides blocked, can't remove
    if (leftBlocked && rightBlocked) {
      return { removable: false, reason: 'Block is blocked on both sides' };
    }
  } else {
    // Vertical blocks: accessibility is simpler (can always pull from ends)
    // But we still check if it's the middle block and both adjacent are present
    if (block === 1) {
      const leftPresent = !tower[level][row][0]?.removed;
      const rightPresent = !tower[level][row][2]?.removed;
      if (leftPresent && rightPresent) {
        return { removable: false, reason: 'Middle block is blocked' };
      }
    }
  }
  
  return { removable: true };
}

/**
 * Check if direction is valid for block orientation
 */
export function isDirectionValid(
  tower: TowerState,
  position: BlockPosition,
  direction: MoveDirection
): boolean {
  const { level, row, block } = position;
  
  if (level < 0 || level >= tower.length) return false;
  if (row < 0 || row >= tower[level].length) return false;
  if (block < 0 || block >= tower[level][row].length) return false;
  
  const targetBlock = tower[level][row][block];
  if (targetBlock.removed) return false;
  
  // Horizontal blocks: can only move left/right
  if (targetBlock.orientation === 'horizontal') {
    return direction === 'left' || direction === 'right';
  }
  
  // Vertical blocks: can only move forward/back
  if (targetBlock.orientation === 'vertical') {
    return direction === 'forward' || direction === 'back';
  }
  
  return false;
}

/**
 * Tower stability. Top level may have 1 or 2 blocks (center-of-mass relaxed).
 * Support-from-below: each non-removed block must have support (block or base).
 * Empty levels are skipped and do not count as support.
 */
export function isTowerStable(tower: TowerState): boolean {
  const topLevel = findTopLevel(tower);

  for (let level = 0; level < tower.length; level++) {
    const levelBlocks = tower[level];
    if (!levelBlocks || levelBlocks.length === 0) continue;

    let blockCount = 0;
    let totalMassX = 0;

    for (const row of levelBlocks) {
      if (!row) continue;
      for (let blockIdx = 0; blockIdx < row.length; blockIdx++) {
        const blk = row[blockIdx];
        if (blk && !blk.removed) {
          blockCount++;
          totalMassX += blockIdx;
        }
      }
    }

    if (blockCount === 0) continue;

    // Top level: 1 or 2 blocks allowed (relaxed). Others: need ≥2.
    if (level !== topLevel && blockCount < 2) return false;

    // Center of mass: relaxed for top level; for others, must be within base (0.5–1.5).
    if (level !== topLevel) {
      const centerX = totalMassX / blockCount;
      if (centerX < 0.5 || centerX > 1.5) return false;
    }

    // Support-from-below: level 0 is base; for L≥1, find first level below with non-removed in same column. Empty levels do not count.
    for (const row of levelBlocks) {
      if (!row) continue;
      for (let blockIdx = 0; blockIdx < row.length; blockIdx++) {
        const blk = row[blockIdx];
        if (!blk || blk.removed) continue;

        if (level === 0) continue; // base

        let hasSupport = false;
        for (let Lp = level - 1; Lp >= 0; Lp--) {
          const below = tower[Lp]?.[0]?.[blockIdx];
          if (below != null && !below.removed) {
            hasSupport = true;
            break;
          }
        }
        if (!hasSupport) return false;
      }
    }
  }

  return true;
}

/** Move processor result. */
export interface ValidateAndProcessMoveResult {
  success: boolean;
  newTower?: TowerState;
  eliminated?: boolean;
  reason?: string;
  blocksRemoved?: BlockPosition[];
}

/**
 * placementHitBlocks validation (v1): accept iff in bounds, not removed, not
 * blockPosition, and level is findTopLevel(tower) or findTopLevel(tower)-1.
 */
function isPlacementHitAllowed(
  tower: TowerState,
  blockPosition: BlockPosition,
  candidate: BlockPosition,
  top: number
): boolean {
  const { level, row, block } = candidate;
  if (level !== top && level !== top - 1) return false;
  if (
    level === blockPosition.level &&
    row === blockPosition.row &&
    block === blockPosition.block
  )
    return false;
  if (level < 0 || level >= tower.length) return false;
  const r = tower[level]?.[row];
  if (!r || block < 0 || block >= r.length) return false;
  const blk = r[block];
  return blk != null && !blk.removed;
}

function key(p: BlockPosition): string {
  return `${p.level},${p.row},${p.block}`;
}

/**
 * Move processor (15.5): validate → build extraRemoved → applyMoveAndPlace →
 * isTowerStable. Optional placementHitBlocks; deduped by position.
 */
export function validateAndProcessMove(
  tower: TowerState,
  moveData: MoveData,
  placementHitBlocks?: BlockPosition[]
): ValidateAndProcessMoveResult {
  const { blockPosition, direction } = moveData;

  const removableCheck = isBlockRemovable(tower, blockPosition);
  if (!removableCheck.removable) {
    return { success: false, reason: removableCheck.reason || 'Block is not removable' };
  }

  if (!isDirectionValid(tower, blockPosition, direction)) {
    return { success: false, reason: 'Invalid direction for block orientation' };
  }

  const top = findTopLevel(tower);
  const seen = new Set<string>();
  const extraRemoved: BlockPosition[] = [];

  const hit = getHitBlock(tower, blockPosition, direction);
  if (hit != null && !seen.has(key(hit))) {
    seen.add(key(hit));
    extraRemoved.push(hit);
  }

  for (const p of placementHitBlocks ?? []) {
    if (!isPlacementHitAllowed(tower, blockPosition, p, top)) continue;
    const k = key(p);
    if (seen.has(k)) continue;
    seen.add(k);
    extraRemoved.push(p);
  }

  const cell = tower[blockPosition.level]?.[blockPosition.row]?.[blockPosition.block];
  const primaryBlock: PrimaryBlock = {
    ...blockPosition,
    orientation: cell?.orientation ?? 'horizontal',
  };

  const newTower = applyMoveAndPlace(tower, primaryBlock, extraRemoved);

  if (!isTowerStable(newTower)) {
    return { success: false, eliminated: true, reason: 'Move makes tower unstable', blocksRemoved: extraRemoved };
  }

  return { success: true, newTower, eliminated: false, blocksRemoved: extraRemoved };
}
