'use client';

import { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { findTopLevel, isDirectionValid } from '~/lib/jenga-game-logic';
import JengaAccuracySlider from './JengaAccuracySlider';

type TowerBlock = {
  removed: boolean;
  orientation: 'horizontal' | 'vertical';
};

type TowerState = TowerBlock[][][];

type BlockPosition = { level: number; row: number; block: number };
type MoveDirection = 'left' | 'right' | 'forward' | 'back';

/** Phase 5: optional 4th arg for tap-to-push: { isTap: true, strength } so parent can run runPushWithFallSimulation. */
/** Accuracy slider: removalAccuracy and placementAccuracy (0-100) for skill-based gameplay. */
type OnMoveOpts = { isTap?: boolean; strength?: number; removalAccuracy?: number; placementAccuracy?: number };

type JengaTower3DProps = {
  towerState: TowerState;
  isMyTurn: boolean;
  onMove: (blockPosition: BlockPosition, direction: MoveDirection, placementHitBlocks?: BlockPosition[], opts?: OnMoveOpts) => void;
  impact?: boolean;
  disabled?: boolean;
  onImpact?: () => void;
  /** Phase 4: when a tap-to-push causes the pushed block to hit the tower → game over, loser. */
  onPushHitTower?: () => void;
  /** Phase 5: stability % [0,100], shown top-right. */
  stabilityPercent?: number;
};

const PULL_THRESHOLD_PX = 5;
const VELOCITY_THRESHOLD_PX_PER_MS = 0.5;
const BLOCK_LENGTH = 40;
const BLOCK_THICK = 14;
const BLOCK_GAP = 4;
const ROTATE_STEP = 15;
/** Phase 4: hold longer than this + move → grab (pull). Shorter release → tap (push). */
const HOLD_THRESHOLD_MS = 400;
/** strength = min(1, duration / STRENGTH_DURATION_MS) for tap-to-push. */
const STRENGTH_DURATION_MS = 800;

function directionFromDxDy(dx: number, dy: number): MoveDirection {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'back' : 'forward';
}

function getDefaultDirectionForBlock(tower: TowerState, pos: BlockPosition): MoveDirection {
  const order: MoveDirection[] = ['forward', 'back', 'left', 'right'];
  for (const d of order) {
    if (isDirectionValid(tower, pos, d)) return d;
  }
  return 'forward';
}

export default function JengaTower3D({
  towerState,
  isMyTurn,
  onMove,
  impact = false,
  disabled = false,
  onImpact,
  onPushHitTower,
  stabilityPercent,
}: JengaTower3DProps) {
  const [cameraAngle, setCameraAngle] = useState(0);
  const [dragging, setDragging] = useState<{
    blockPosition: BlockPosition;
    blockCenterX: number;
    blockCenterY: number;
    orientation: 'horizontal' | 'vertical';
    direction: MoveDirection | null;
    ghostX: number;
    ghostY: number;
    pointerId: number;
  } | null>(null);
  /** Phase 4: short press before hold threshold → tap (push). */
  const [pressing, setPressing] = useState<{
    pressStart: number;
    blockPosition: BlockPosition;
    blockCenterX: number;
    blockCenterY: number;
    orientation: 'horizontal' | 'vertical';
    pointerId: number;
    ghostX: number;
    ghostY: number;
  } | null>(null);
  const [shaking, setShaking] = useState(false);
  /** Shown when user releases outside the drop zone during a pull. */
  const [showDropZoneHint, setShowDropZoneHint] = useState(false);
  /** Accuracy slider: removal accuracy (shown when block is selected for removal). */
  const [removalSliderActive, setRemovalSliderActive] = useState<{
    blockPosition: BlockPosition;
    direction: MoveDirection;
    opts?: { isTap?: boolean; strength?: number };
  } | null>(null);
  /** Accuracy slider: placement accuracy (shown when block is released over drop zone). */
  const [placementSliderActive, setPlacementSliderActive] = useState<{
    blockPosition: BlockPosition;
    direction: MoveDirection;
    placementHitBlocks?: BlockPosition[];
    removalAccuracy: number;
  } | null>(null);

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const draggingBlockRef = useRef<HTMLElement | null>(null);
  const pressingBlockRef = useRef<HTMLElement | null>(null);
  const placementHitsRef = useRef<Set<string>>(new Set());
  const hasTriggeredShakeRef = useRef(false);
  const pendingOnMoveRef = useRef<{
    blockPosition: BlockPosition;
    direction: MoveDirection;
    placementHitBlocks: BlockPosition[] | undefined;
    removalAccuracy?: number; // Stored after removal slider completes
  } | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const pinchInProgressRef = useRef(false);
  const lastPinchAngleRef = useRef<number>(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  /** Phase 4: one-pointer for block interaction. */
  const activeBlockPointerIdRef = useRef<number | null>(null);
  const pressingRef = useRef<typeof pressing>(null);
  pressingRef.current = pressing;
  const lastMoveRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const dragBlockPos = dragging?.blockPosition;

  const cancelDrag = useCallback(() => {
    const pid = activeBlockPointerIdRef.current;
    activeBlockPointerIdRef.current = null;
    setPressing(null);
    if (dragging && draggingBlockRef.current) {
      try {
        draggingBlockRef.current.releasePointerCapture(dragging.pointerId);
      } catch (_) {}
      setDragging(null);
    } else if (pressingRef.current && pressingBlockRef.current && pid != null) {
      try {
        pressingBlockRef.current.releasePointerCapture(pid);
      } catch (_) {}
    }
    placementHitsRef.current.clear();
    hasTriggeredShakeRef.current = false;
    pendingOnMoveRef.current = null;
  }, [dragging]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length >= 2) {
        pinchInProgressRef.current = true;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        lastPinchAngleRef.current = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);
        cancelDrag();
      }
    },
    [cancelDrag]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length >= 2 && pinchInProgressRef.current) {
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const curr = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);
      const delta = curr - lastPinchAngleRef.current;
      lastPinchAngleRef.current = curr;
      setCameraAngle((a) => a + (delta * 180) / Math.PI);
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchInProgressRef.current = false;
  }, []);

  /** Phase 4: pressing → tap (pointerup) or transition to grab (hold+move in pointermove). */
  useLayoutEffect(() => {
    if (!pressing || !pressingBlockRef.current) return;
    const el = pressingBlockRef.current;
    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - pressing.blockCenterX;
      const dy = e.clientY - pressing.blockCenterY;
      lastMoveRef.current = { dx, dy };
      if (
        Date.now() - pressing.pressStart >= HOLD_THRESHOLD_MS &&
        Math.hypot(dx, dy) >= PULL_THRESHOLD_PX
      ) {
        let dir = directionFromDxDy(dx, dy);
        if (!isDirectionValid(towerState, pressing.blockPosition, dir))
          dir = getDefaultDirectionForBlock(towerState, pressing.blockPosition);
        // Accuracy slider: show removal slider when pull starts
        // Store pending drag info to start dragging after removal slider completes
        pendingOnMoveRef.current = {
          blockPosition: pressing.blockPosition,
          direction: dir,
          placementHitBlocks: undefined,
        };
        setRemovalSliderActive({
          blockPosition: pressing.blockPosition,
          direction: dir,
          opts: { isTap: false },
        });
        setPressing(null);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pressing.pointerId) return;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}
      activeBlockPointerIdRef.current = null;
      const strength = Math.min(1, (Date.now() - pressing.pressStart) / STRENGTH_DURATION_MS);
      const { dx, dy } = lastMoveRef.current;
      let dir: MoveDirection =
        Math.abs(dx) + Math.abs(dy) > 2
          ? directionFromDxDy(dx, dy)
          : getDefaultDirectionForBlock(towerState, pressing.blockPosition);
      if (!isDirectionValid(towerState, pressing.blockPosition, dir))
        dir = getDefaultDirectionForBlock(towerState, pressing.blockPosition);
      // Accuracy slider: show removal slider instead of calling onMove immediately
      setRemovalSliderActive({
        blockPosition: pressing.blockPosition,
        direction: dir,
        opts: { isTap: true, strength },
      });
      setPressing(null);
    };
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    return () => {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
    };
  }, [pressing, towerState, onMove]);

  useLayoutEffect(() => {
    if (!dragBlockPos || !draggingBlockRef.current) return;
    const el = draggingBlockRef.current;
    const blockPosition = dragBlockPos;
    const top = findTopLevel(towerState);

    const onPointerMove = (e: PointerEvent) => {
      const { clientX, clientY } = e;
      const now = Date.now();
      const last = lastPointerRef.current;
      let velocity = 0;
      if (last && now > last.t) {
        const d = Math.hypot(clientX - last.x, clientY - last.y);
        velocity = d / (now - last.t);
      }
      lastPointerRef.current = { x: clientX, y: clientY, t: now };

      setDragging((prev) => {
        if (!prev) return null;
        let { direction } = prev;
        if (direction === null) {
          const dx = clientX - prev.blockCenterX;
          const dy = clientY - prev.blockCenterY;
          if (Math.hypot(dx, dy) >= PULL_THRESHOLD_PX) {
            const candidateDir = directionFromDxDy(dx, dy);
            if (isDirectionValid(towerState, blockPosition, candidateDir)) direction = candidateDir;
          }
        }
        return { ...prev, direction, ghostX: clientX, ghostY: clientY };
      });

      if (velocity < VELOCITY_THRESHOLD_PX_PER_MS) return;
      const under = document.elementFromPoint(clientX, clientY);
      const blockEl = under?.closest?.('[data-level]') as HTMLElement | null;
      if (blockEl) {
        const l = parseInt(blockEl.getAttribute('data-level') ?? '', 10);
        const r = parseInt(blockEl.getAttribute('data-row') ?? '', 10);
        const b = parseInt(blockEl.getAttribute('data-block') ?? '', 10);
        if (!Number.isNaN(l) && !Number.isNaN(r) && !Number.isNaN(b)) {
          if (blockPosition.level === l && blockPosition.row === r && blockPosition.block === b) return;
          if (l !== top && l !== top - 1) return;
          const cell = towerState[l]?.[r]?.[b];
          if (!cell || cell.removed) return;
          const k = `${l},${r},${b}`;
          if (!placementHitsRef.current.has(k)) {
            placementHitsRef.current.add(k);
            if (!hasTriggeredShakeRef.current) {
              hasTriggeredShakeRef.current = true;
              setShaking(true);
              onImpact?.();
            }
          }
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const { clientX, clientY } = e;
      activeBlockPointerIdRef.current = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}

      const dropEl = document.elementFromPoint(clientX, clientY);
      const overDrop =
        !!dropZoneRef.current &&
        !!dropEl &&
        (dropZoneRef.current === dropEl || dropZoneRef.current.contains(dropEl));

      if (!overDrop) {
        setShowDropZoneHint(true);
        setTimeout(() => setShowDropZoneHint(false), 1800);
      }

      setDragging((prev) => {
        if (!prev) return null;
        if (overDrop && prev.direction) {
          const arr = Array.from(placementHitsRef.current).map((k) => {
            const [l, r, b] = k.split(',').map(Number);
            return { level: l, row: r, block: b };
          });
          // Accuracy slider: show placement slider instead of calling onMove immediately
          // removalAccuracy should already be stored from removal slider completion
          const storedRemovalAccuracy = pendingOnMoveRef.current?.removalAccuracy ?? 50; // fallback
          setPlacementSliderActive({
            blockPosition: prev.blockPosition,
            direction: prev.direction,
            placementHitBlocks: arr.length > 0 ? arr : undefined,
            removalAccuracy: storedRemovalAccuracy,
          });
        }
        return null;
      });

      placementHitsRef.current.clear();
      hasTriggeredShakeRef.current = false;
      lastPointerRef.current = null;
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    return () => {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragBlockPos, towerState, onMove, onImpact]);

  useLayoutEffect(() => {
    if (!shaking) return;
    const t = setTimeout(() => setShaking(false), 400);
    return () => clearTimeout(t);
  }, [shaking]);

  if (!towerState || !Array.isArray(towerState)) {
    return <div className="text-center p-4" style={{ color: '#374151' }}>Loading tower...</div>;
  }

  const levelCount = towerState.length;

  /** Dark text for use on the tower's light card (bg-gray-50) so it stays readable on the dark page. */
  const textOnLight = { color: '#1a1a1a' };
  const textMutedOnLight = { color: '#4b5563' };

  return (
    <div
      className={`p-4 border rounded bg-gray-50 ${shaking || impact ? 'jenga-tower-shake' : ''}`}
      style={{ willChange: shaking || impact ? 'transform' : undefined, borderColor: 'rgba(0,0,0,0.12)' }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-lg font-semibold" style={textOnLight}>
          Jenga Tower (3D)
        </span>
        <div className="flex items-center gap-2">
          {stabilityPercent != null && (
            <span className="text-sm font-medium" style={textMutedOnLight} title="Stability %">
              {stabilityPercent}%
            </span>
          )}
          <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCameraAngle((a) => a - ROTATE_STEP)}
            className="w-9 h-9 rounded border border-amber-400 bg-amber-50 flex items-center justify-center text-amber-700 hover:bg-amber-100 active:bg-amber-200"
            title="Rotate left"
            aria-label="Rotate left"
          >
            ⟲
          </button>
          <button
            type="button"
            onClick={() => setCameraAngle((a) => a + ROTATE_STEP)}
            className="w-9 h-9 rounded border border-amber-400 bg-amber-50 flex items-center justify-center text-amber-700 hover:bg-amber-100 active:bg-amber-200"
            title="Rotate right"
            aria-label="Rotate right"
          >
            ⟳
          </button>
          </div>
        </div>
      </div>

      {dragging && (
        <div
          ref={dropZoneRef}
          className="w-full min-h-[44px] border-2 border-dashed border-amber-400 rounded flex items-center justify-center bg-amber-50/50 text-sm text-amber-700 touch-none mb-2"
        >
          Drop here to place
        </div>
      )}
      {showDropZoneHint && (
        <div className="w-full min-h-[44px] rounded flex items-center justify-center bg-amber-100/80 text-sm text-amber-800 border border-amber-300 mb-2">
          Release over the drop zone to place
        </div>
      )}

      <div
        ref={viewportRef}
        className="flex items-end justify-center touch-none"
        style={{
          minHeight: levelCount * BLOCK_THICK + 40,
          perspective: 700,
          perspectiveOrigin: '50% 50%',
          touchAction: 'pan-y',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateY(${cameraAngle}deg) rotateX(12deg) translateZ(20px)`,
            position: 'relative',
            width: 3 * BLOCK_LENGTH + 2 * BLOCK_GAP,
            height: levelCount * BLOCK_THICK,
          }}
        >
          {towerState.map((level, levelIdx) => {
            const levelRow = level?.[0] || [];
            const levelRotateY = (levelIdx % 2) * 90;

            return (
              <div
                key={levelIdx}
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: levelIdx * BLOCK_THICK,
                  transform: `translateX(-50%) rotateY(${levelRotateY}deg)`,
                  transformStyle: 'preserve-3d',
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: BLOCK_GAP,
                }}
              >
                {[0, 1, 2].map((blockIdx) => {
                  const block = levelRow[blockIdx];
                  const isRemoved = block?.removed ?? true;
                  const isDragging =
                    dragging?.blockPosition.level === levelIdx &&
                    dragging.blockPosition.row === 0 &&
                    dragging.blockPosition.block === blockIdx;
                  const isClickable = isMyTurn && !isRemoved && !disabled;

                  return (
                    <div
                      key={blockIdx}
                      ref={(node) => {
                        if (isDragging && node) draggingBlockRef.current = node;
                      }}
                      data-level={levelIdx}
                      data-row={0}
                      data-block={blockIdx}
                      onPointerDown={(e) => {
                        if (pinchInProgressRef.current || !isMyTurn || isRemoved || disabled) return;
                        if (activeBlockPointerIdRef.current != null) return;
                        e.preventDefault();
                        setShowDropZoneHint(false);
                        const t = e.currentTarget;
                        t.setPointerCapture(e.pointerId);
                        activeBlockPointerIdRef.current = e.pointerId;
                        pressingBlockRef.current = t;
                        lastMoveRef.current = { dx: 0, dy: 0 };
                        const rect = t.getBoundingClientRect();
                        const blockPosition: BlockPosition = { level: levelIdx, row: 0, block: blockIdx };
                        const orientation = (block?.orientation ?? 'horizontal') as 'horizontal' | 'vertical';
                        placementHitsRef.current.clear();
                        hasTriggeredShakeRef.current = false;
                        pendingOnMoveRef.current = null;
                        lastPointerRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
                        setPressing({
                          pressStart: Date.now(),
                          blockPosition,
                          blockCenterX: rect.left + rect.width / 2,
                          blockCenterY: rect.top + rect.height / 2,
                          orientation,
                          pointerId: e.pointerId,
                          ghostX: e.clientX,
                          ghostY: e.clientY,
                        });
                      }}
                      className={`
                        flex-shrink-0 rounded select-none
                        ${isRemoved
                          ? 'bg-gray-200 border border-gray-300 opacity-30'
                          : isDragging
                            ? 'bg-amber-300 border-2 border-amber-500 opacity-80'
                            : isClickable
                              ? 'bg-amber-200 border-2 border-amber-400 cursor-grab hover:bg-amber-300 active:cursor-grabbing'
                              : 'bg-amber-100 border-2 border-amber-300'}
                      `}
                      style={{
                        width: BLOCK_LENGTH,
                        height: BLOCK_THICK,
                        transformStyle: 'preserve-3d',
                        boxShadow: isRemoved ? 'none' : '0 2px 4px rgba(0,0,0,0.2)',
                      }}
                      title={isRemoved ? 'Removed' : `Level ${levelIdx}, Block ${blockIdx + 1}`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {isMyTurn && !disabled && !dragging && !pressing && (
        <p className="mt-3 text-sm text-center" style={textMutedOnLight}>
          <strong>Tap</strong> = quick press to push. <strong>Pull</strong> = hold, then drag to the yellow drop zone and release. Use ⟲ ⟳ or pinch to rotate.
        </p>
      )}

      {/* Removal accuracy slider */}
      {removalSliderActive && (
        <JengaAccuracySlider
          label="Remove block"
          onComplete={(accuracy) => {
            const { blockPosition, direction, opts } = removalSliderActive;
            setRemovalSliderActive(null);
            
            // For tap: call onMove immediately with removalAccuracy
            if (opts?.isTap) {
              onMove(blockPosition, direction, undefined, {
                ...opts,
                removalAccuracy: accuracy,
              });
            } else {
              // For pull: store removalAccuracy and start dragging
              // The removalAccuracy will be used when placement slider completes
              if (pendingOnMoveRef.current) {
                pendingOnMoveRef.current.removalAccuracy = accuracy;
              }
              // Start dragging after removal slider completes
              const pressingBlock = pressingBlockRef.current;
              if (pressingBlock && pendingOnMoveRef.current) {
                draggingBlockRef.current = pressingBlock;
                const rect = pressingBlock.getBoundingClientRect();
                setDragging({
                  blockPosition,
                  blockCenterX: rect.left + rect.width / 2,
                  blockCenterY: rect.top + rect.height / 2,
                  orientation: towerState[blockPosition.level]?.[blockPosition.row]?.[blockPosition.block]?.orientation ?? 'horizontal',
                  direction,
                  ghostX: rect.left + rect.width / 2,
                  ghostY: rect.top + rect.height / 2,
                  pointerId: -1, // Not from actual pointer event
                });
              }
            }
          }}
          onCancel={() => {
            setRemovalSliderActive(null);
            pendingOnMoveRef.current = null;
          }}
        />
      )}

      {/* Placement accuracy slider */}
      {placementSliderActive && (
        <JengaAccuracySlider
          label="Place block"
          onComplete={(accuracy) => {
            const { blockPosition, direction, placementHitBlocks, removalAccuracy } = placementSliderActive;
            setPlacementSliderActive(null);
            // Call onMove with both accuracies
            onMove(blockPosition, direction, placementHitBlocks, {
              removalAccuracy,
              placementAccuracy: accuracy,
            });
          }}
          onCancel={() => {
            setPlacementSliderActive(null);
            pendingOnMoveRef.current = null;
          }}
        />
      )}

      {dragging && (
        <div
          className="fixed border-2 border-amber-500 rounded bg-amber-200/90 flex items-center justify-center text-xs pointer-events-none z-50"
          style={{
            width: BLOCK_LENGTH,
            height: BLOCK_THICK,
            left: dragging.ghostX,
            top: dragging.ghostY,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  );
}
