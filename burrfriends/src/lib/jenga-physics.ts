/**
 * JENGA Physics & Collapse (Phase 5)
 * Cannon-es: buildWorld, step, detectTowerFell, detectNonMovedBlockFell.
 * runPlacementSimulation(towerBeforePlace, placedBlockId) — physics + impact/stability bands.
 * runReplaceSimulation(tower) — for replace "would fall" (optional from wouldReplaceCauseFall).
 */

import * as CANNON from 'cannon-es';
import type { TowerV2, RemoveSlot } from './jenga-official-rules';
import {
  getTopLevel,
  getPlaceTarget,
  placeBlock,
  removeBlock,
} from './jenga-official-rules';
import { computeStabilityPercent, COLLAPSE_STABILITY_THRESHOLD } from './jenga-stability';

export type CollapseReason = 'tower_fell' | 'non_moved_block_fell';

export interface PlacementSimulationResult {
  collapse: boolean;
  reason?: CollapseReason;
}

export interface PhysicsWorld {
  world: CANNON.World;
  blockIdToBody: Map<number, CANNON.Body>;
  blockIdToInitialY: Map<number, number>;
}

// ——— Block geometry: 1 unit = block height. Block 1 (h) x 3 (length) x 1 (depth). Half-extents.
const H_H = 0.5;
const H_L = 1.5;
const H_D = 0.5;

function getBlockPosition(level: number, block: number): { x: number; y: number; z: number } {
  const y = level * 1 + H_H;
  if (level % 2 === 0) {
    return { x: (block - 1) * 3, y, z: 0 };
  }
  return { x: 0, y, z: (block - 1) * 3 };
}

function getBlockHalfExtents(level: number): CANNON.Vec3 {
  // level%2===0: long axis X; 1: long axis Z
  if (level % 2 === 0) return new CANNON.Vec3(H_L, H_H, H_D);
  return new CANNON.Vec3(H_D, H_H, H_L);
}

export type BuildWorldOpts = {
  allDynamic?: boolean;
  /** Top N levels dynamic so impact can topple blocks (placement sim). */
  dynamicLevelsFromTop?: number;
};

/**
 * Build Cannon-es world from tower. For each non-null block, create a body (static or dynamic).
 * @param allDynamic — if true, all bodies are dynamic (for replace sim to detect collapse).
 * @param dynamicLevelsFromTop — if set, levels in the top N are dynamic (for "any block fell" in placement).
 */
export function buildWorld(tower: TowerV2, opts?: BuildWorldOpts): PhysicsWorld {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -10, 0) });
  const blockIdToBody = new Map<number, CANNON.Body>();
  const blockIdToInitialY = new Map<number, number>();
  const top = getTopLevel(tower);
  if (top < 0) return { world, blockIdToBody, blockIdToInitialY };

  const allDynamic = opts?.allDynamic ?? false;
  const dynamicLevelsFromTop = opts?.dynamicLevelsFromTop ?? 0;

  for (let L = 0; L <= top; L++) {
    const rows = tower[L];
    if (!rows?.length) continue;
    const row = rows[0];
    if (!row) continue;
    const useDynamic =
      allDynamic ||
      (dynamicLevelsFromTop > 0 && (top - L) < dynamicLevelsFromTop);
    const mass = useDynamic ? 1 : 0;
    const type = useDynamic ? CANNON.Body.DYNAMIC : CANNON.Body.STATIC;
    for (let b = 0; b < row.length; b++) {
      const id = row[b];
      if (id == null) continue;
      const pos = getBlockPosition(L, b);
      const he = getBlockHalfExtents(L);
      const body = new CANNON.Body({
        mass,
        type,
        position: new CANNON.Vec3(pos.x, pos.y, pos.z),
        shape: new CANNON.Box(he),
      });
      world.addBody(body);
      blockIdToBody.set(id, body);
      blockIdToInitialY.set(id, pos.y);
    }
  }
  return { world, blockIdToBody, blockIdToInitialY };
}

/**
 * Remove a body from the world and from the map.
 */
export function removeBody(
  world: CANNON.World,
  blockIdToBody: Map<number, CANNON.Body>,
  blockId: number
): void {
  const b = blockIdToBody.get(blockId);
  if (b) {
    world.removeBody(b);
    blockIdToBody.delete(blockId);
  }
}

/**
 * Add a dynamic body (e.g. placed block or pushed block) with optional impulse.
 */
export function addDynamicBody(
  world: CANNON.World,
  blockIdToBody: Map<number, CANNON.Body>,
  blockIdToInitialY: Map<number, number>,
  blockId: number,
  level: number,
  block: number,
  impulse?: CANNON.Vec3
): CANNON.Body {
  const pos = getBlockPosition(level, block);
  const he = getBlockHalfExtents(level);
  const body = new CANNON.Body({
    mass: 1,
    type: CANNON.Body.DYNAMIC,
    position: new CANNON.Vec3(pos.x, pos.y, pos.z),
    shape: new CANNON.Box(he),
  });
  if (impulse) body.velocity.copy(impulse);
  world.addBody(body);
  blockIdToBody.set(blockId, body);
  blockIdToInitialY.set(blockId, pos.y);
  return body;
}

/**
 * Add the placed block on top as dynamic, with initial downward velocity to simulate impact.
 */
export function addBlockOnTop(
  world: CANNON.World,
  blockIdToBody: Map<number, CANNON.Body>,
  blockIdToInitialY: Map<number, number>,
  blockId: number,
  level: number,
  block: number,
  velocity?: CANNON.Vec3
): CANNON.Body {
  return addDynamicBody(
    world,
    blockIdToBody,
    blockIdToInitialY,
    blockId,
    level,
    block,
    velocity ?? new CANNON.Vec3(0, -0.4, 0)
  );
}

/**
 * Step the world.
 */
export function step(world: CANNON.World, dt: number): void {
  world.step(dt);
}

/**
 * Tower fell: any block below base, or >half of blocks dropped far.
 * @param excludeBlockId — when set, do not count this body (e.g. removed block in remove sim).
 */
export function detectTowerFell(
  blockIdToBody: Map<number, CANNON.Body>,
  _blockIdToInitialY: Map<number, number>,
  excludeBlockId?: number
): boolean {
  let below = 0;
  let sumY = 0;
  let n = 0;
  for (const [id, body] of blockIdToBody) {
    if (excludeBlockId !== undefined && id === excludeBlockId) continue;
    const y = body.position.y;
    if (y < 0.5) below++;
    sumY += y;
    n++;
  }
  if (n === 0) return false;
  if (below > 0) return true;
  const avg = sumY / n;
  if (avg < 2) return true;
  return false;
}

/**
 * Any block other than movedBlockId has fallen (y < 1).
 */
export function detectNonMovedBlockFell(
  blockIdToBody: Map<number, CANNON.Body>,
  movedBlockId: number
): boolean {
  for (const [id, body] of blockIdToBody) {
    if (id === movedBlockId) continue;
    if (body.position.y < 1) return true;
  }
  return false;
}

// ——— Impact + stability bands (Phase 5 plan §4.5). Tunable.
const IMPACT_LOW = 0.2;
const IMPACT_MEDIUM = 0.5;
const IMPACT_HIGH = 1.0;
const IMPACT_VERY_HIGH = 2.0;
const STABILITY_20 = 20;
const STABILITY_50 = 50;
const STABILITY_70 = 70;

function impactCausesCollapse(stability: number, impact: number): boolean {
  if (stability < STABILITY_20 && impact > IMPACT_LOW) return true;
  if (stability < STABILITY_50 && impact >= IMPACT_MEDIUM) return true;
  if (stability < STABILITY_70 && impact >= IMPACT_HIGH) return true;
  if (stability >= STABILITY_70 && impact >= IMPACT_VERY_HIGH) return true;
  return false;
}

const PLACEMENT_MAX_STEPS = 120;
const PLACEMENT_DT = 1 / 60;

/**
 * Run placement simulation: build world from towerBeforePlace, add placed block from above,
 * run steps. Use detectTowerFell, detectNonMovedBlockFell. On first contact, record impact
 * and apply stability bands. Fallback: stability-only if Cannon-es fails.
 * 
 * Accuracy slider: placementAccuracy (0-100) affects:
 * - Perfect (≥90%): Skip physics, only check critical stability (<30%)
 * - Good (70-89%): Lower impact velocity (0.7x), stability bonus (+3%)
 * - Acceptable (50-69%): Normal impact (1.0x), no bonus
 * - Poor (<50%): Higher impact (1.3x), stability malus (-5%), stricter threshold (60%)
 */
export function runPlacementSimulation(
  towerBeforePlace: TowerV2,
  placedBlockId: number,
  placementAccuracy?: number // 0-100, optional
): PlacementSimulationResult {
  try {
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

    const target = getPlaceTarget(towerBeforePlace);
    const { world, blockIdToBody, blockIdToInitialY } = buildWorld(towerBeforePlace, {
      dynamicLevelsFromTop: 2,
    });
    
    // Adjust impact velocity based on accuracy
    const baseImpact = -0.4;
    let accuracyMultiplier = 1.0;
    if (placementAccuracy != null) {
      if (placementAccuracy >= 70) {
        // Good: 0.7x impact velocity (gentler)
        accuracyMultiplier = 0.7;
      } else if (placementAccuracy >= 50) {
        // Acceptable: 1.0x impact velocity (normal)
        accuracyMultiplier = 1.0;
      } else {
        // Poor: 1.3x impact velocity (harsher)
        accuracyMultiplier = 1.3;
      }
    }
    const impactVel = new CANNON.Vec3(0, baseImpact * accuracyMultiplier, 0);
    
    const placedBody = addBlockOnTop(
      world,
      blockIdToBody,
      blockIdToInitialY,
      placedBlockId,
      target.level,
      target.block,
      impactVel
    );

    const t = placeBlock(towerBeforePlace, placedBlockId);
    let stability = computeStabilityPercent(t);
    
    // Adjust stability bonus/malus based on accuracy
    if (placementAccuracy != null) {
      const stabilityAdjustment = (placementAccuracy - 50) / 10; // -5% to +5%
      stability = Math.max(0, Math.min(100, stability + stabilityAdjustment));
    }
    
    let impact: number | undefined;

    for (let i = 0; i < PLACEMENT_MAX_STEPS; i++) {
      const vBefore = placedBody.velocity.length();
      step(world, PLACEMENT_DT);

      if (impact === undefined) {
        for (const c of world.contacts) {
          if (c.bi === placedBody || c.bj === placedBody) {
            impact = vBefore;
            break;
          }
        }
      }

      if (detectTowerFell(blockIdToBody, blockIdToInitialY)) {
        return { collapse: true, reason: 'tower_fell' };
      }
      if (detectNonMovedBlockFell(blockIdToBody, placedBlockId)) {
        return { collapse: true, reason: 'non_moved_block_fell' };
      }
    }

    // If poor accuracy (<50%), use stricter collapse detection
    if (placementAccuracy != null && placementAccuracy < 50) {
      // Lower stability threshold (60% instead of default)
      if (stability < 60) {
        return { collapse: true, reason: 'tower_fell' };
      }
    }

    if (impact !== undefined && impactCausesCollapse(stability, impact)) {
      return { collapse: true, reason: 'tower_fell' };
    }

    return { collapse: false };
  } catch {
    // Fallback: stability-only (no Cannon-es or runtime error)
    const t = placeBlock(towerBeforePlace, placedBlockId);
    let s = computeStabilityPercent(t);
    
    // Apply stability adjustment in fallback too
    if (placementAccuracy != null) {
      const stabilityAdjustment = (placementAccuracy - 50) / 10;
      s = Math.max(0, Math.min(100, s + stabilityAdjustment));
    }
    
    // Use stricter threshold for poor accuracy
    const threshold = placementAccuracy != null && placementAccuracy < 50 ? 60 : COLLAPSE_STABILITY_THRESHOLD;
    if (s < threshold) {
      return { collapse: true, reason: 'tower_fell' };
    }
    return { collapse: false };
  }
}

const REPLACE_MAX_STEPS = 80;
const REPLACE_DT = 1 / 60;

/**
 * Run a short physics sim on the full tower (e.g. after hypothetical replace).
 * All bodies dynamic. If detectTowerFell, the structure would collapse.
 */
export function runReplaceSimulation(tower: TowerV2): boolean {
  try {
    const { world, blockIdToBody, blockIdToInitialY } = buildWorld(tower, { allDynamic: true });
    for (let i = 0; i < REPLACE_MAX_STEPS; i++) {
      step(world, REPLACE_DT);
      if (detectTowerFell(blockIdToBody, blockIdToInitialY)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Would putting the block back cause the tower to fall?
 * Phase 5: runReplaceSimulation (physics) first; fallback to stability.
 * Exported for jenga-official-rules (replaceBlock, on-read-timeout).
 */
export function wouldReplaceCauseFall(
  tower: TowerV2,
  blockId: number,
  removedFrom: RemoveSlot
): boolean {
  const { level, row, block } = removedFrom;
  if (level < 0 || level >= tower.length) return true;
  const rows = tower[level];
  if (!rows?.[row] || block < 0 || block >= rows[row].length) return true;
  if (rows[row][block] != null) return true;
  const t: TowerV2 = JSON.parse(JSON.stringify(tower));
  t[level][row][block] = blockId;
  try {
    if (runReplaceSimulation(t)) return true;
  } catch {
    // fallback to stability only
  }
  return computeStabilityPercent(t) < COLLAPSE_STABILITY_THRESHOLD;
}

// ——— On remove: physics sim (Phase 5 §7.2)
const REMOVE_MAX_STEPS = 40;
const REMOVE_DT = 1 / 60;

export interface RemoveSimulationResult {
  collapse: boolean;
}

/**
 * On remove: tower without the block, removed block as dynamic with impulse. Run steps.
 * If detectTowerFell (excluding removed) or detectNonMovedBlockFell → collapse.
 * 
 * Accuracy slider: removalAccuracy (0-100) affects:
 * - Perfect (≥90%): Skip physics check, assume clean removal
 * - Good (70-89%): Normal physics, reduced impulse (0.7x)
 * - Acceptable (50-69%): Normal physics, normal impulse (1.0x)
 * - Poor (<50%): Stricter physics, higher impulse (1.3x), extra steps
 */
export function runRemoveSimulation(
  towerAfterRemove: TowerV2,
  removedBlockId: number,
  level: number,
  row: number,
  block: number,
  impulse?: CANNON.Vec3,
  removalAccuracy?: number // 0-100, optional
): RemoveSimulationResult {
  try {
    // If perfect accuracy (≥90%), skip physics check (assume clean removal)
    if (removalAccuracy != null && removalAccuracy >= 90) {
      return { collapse: false };
    }

    const { world, blockIdToBody, blockIdToInitialY } = buildWorld(towerAfterRemove);
    
    // Adjust impulse based on accuracy
    const baseImp = impulse ?? new CANNON.Vec3(0, 0.3, 0);
    let accuracyMultiplier = 1.0;
    if (removalAccuracy != null) {
      if (removalAccuracy >= 70) {
        // Good: 0.7x impulse (cleaner removal)
        accuracyMultiplier = 0.7;
      } else if (removalAccuracy >= 50) {
        // Acceptable: 1.0x impulse (normal)
        accuracyMultiplier = 1.0;
      } else {
        // Poor: 1.3x impulse (more chaos)
        accuracyMultiplier = 1.3;
      }
    }
    const imp = new CANNON.Vec3(
      baseImp.x * accuracyMultiplier,
      baseImp.y * accuracyMultiplier,
      baseImp.z * accuracyMultiplier
    );
    
    addDynamicBody(world, blockIdToBody, blockIdToInitialY, removedBlockId, level, block, imp);
    
    // If poor accuracy (<50%), use stricter collapse detection (more steps)
    const maxSteps = removalAccuracy != null && removalAccuracy < 50 
      ? Math.floor(REMOVE_MAX_STEPS * 1.5) 
      : REMOVE_MAX_STEPS;
    
    for (let i = 0; i < maxSteps; i++) {
      step(world, REMOVE_DT);
      if (detectTowerFell(blockIdToBody, blockIdToInitialY, removedBlockId)) {
        return { collapse: true };
      }
      if (detectNonMovedBlockFell(blockIdToBody, removedBlockId)) {
        return { collapse: true };
      }
    }
    return { collapse: false };
  } catch {
    return { collapse: false };
  }
}

// ——— Push-with-fall: Cannon-es (Phase 5, §7.2)
export type PushDirection = 'left' | 'right' | 'forward' | 'back';

const PUSH_MAX_STEPS = 60;
const PUSH_DT = 1 / 60;

function directionToImpulse(dir: PushDirection, strength: number): CANNON.Vec3 {
  const mag = 0.3 + 0.7 * strength;
  switch (dir) {
    case 'left':
      return new CANNON.Vec3(-mag, 0, 0);
    case 'right':
      return new CANNON.Vec3(mag, 0, 0);
    case 'forward':
      return new CANNON.Vec3(0, 0, -mag);
    case 'back':
      return new CANNON.Vec3(0, 0, mag);
    default:
      return new CANNON.Vec3(0, 0, -mag);
  }
}

export interface PushWithFallResult {
  hitTower: boolean;
}

/** Unit offset (4 units) in push direction so the block starts outside the tower row. */
const PUSH_SPAWN_OFFSET = 4;

function pushDirectionOffset(dir: PushDirection): { dx: number; dy: number; dz: number } {
  switch (dir) {
    case 'left': return { dx: -PUSH_SPAWN_OFFSET, dy: 0, dz: 0 };
    case 'right': return { dx: PUSH_SPAWN_OFFSET, dy: 0, dz: 0 };
    case 'forward': return { dx: 0, dy: 0, dz: -PUSH_SPAWN_OFFSET };
    case 'back': return { dx: 0, dy: 0, dz: PUSH_SPAWN_OFFSET };
    default: return { dx: 0, dy: 0, dz: -PUSH_SPAWN_OFFSET };
  }
}

/**
 * Tap-to-push: block pushed out with impulse in direction. Run until it hits the tower or leaves.
 * If it hits the tower before leaving → hitTower: true (game over, loser).
 * Spawn: block is placed 4 units outside the tower in the push direction so it does not start
 * in contact with neighbors (which previously caused tap to always hitTower).
 */
export function runPushWithFallSimulation(
  tower: TowerV2,
  blockPosition: { level: number; row: number; block: number },
  direction: PushDirection,
  strength: number
): PushWithFallResult {
  try {
    const { level, row, block } = blockPosition;
    const { tower: t1, blockId } = removeBlock(tower, level, row, block);
    const { world, blockIdToBody, blockIdToInitialY } = buildWorld(t1);
    const imp = directionToImpulse(direction, strength);
    const base = getBlockPosition(level, block);
    const { dx, dy, dz } = pushDirectionOffset(direction);
    const spawnPos = new CANNON.Vec3(base.x + dx, base.y + dy, base.z + dz);
    const he = getBlockHalfExtents(level);
    const pushedBody = new CANNON.Body({
      mass: 1,
      type: CANNON.Body.DYNAMIC,
      position: spawnPos,
      shape: new CANNON.Box(he),
    });
    pushedBody.velocity.copy(imp);
    world.addBody(pushedBody);
    blockIdToBody.set(blockId, pushedBody);
    blockIdToInitialY.set(blockId, spawnPos.y);
    for (let i = 0; i < PUSH_MAX_STEPS; i++) {
      step(world, PUSH_DT);
      for (const c of world.contacts) {
        if ((c.bi === pushedBody && c.bj !== pushedBody) || (c.bj === pushedBody && c.bi !== pushedBody)) {
          return { hitTower: true };
        }
      }
      if (pushedBody.position.y < 0) return { hitTower: false };
    }
    return { hitTower: false };
  } catch {
    return { hitTower: false };
  }
}
