'use client';

import { useRef, useState, useLayoutEffect } from 'react';
import { findTopLevel, isDirectionValid } from '~/lib/jenga-game-logic';

type TowerBlock = {
  removed: boolean;
  orientation: 'horizontal' | 'vertical';
};

type TowerState = TowerBlock[][][];

type BlockPosition = { level: number; row: number; block: number };
type MoveDirection = 'left' | 'right' | 'forward' | 'back';

type JengaTowerProps = {
  towerState: TowerState;
  isMyTurn: boolean;
  onMove: (blockPosition: BlockPosition, direction: MoveDirection, placementHitBlocks?: BlockPosition[]) => void;
  impact?: boolean;
  disabled?: boolean;
  /** Optional: called when the tower is hit during drag with sufficient speed (plan 15.8). Parent can set impact state. */
  onImpact?: () => void;
};

/* Tuning (15.16 step 5): impact threshold, (dx,dy) mapping. Adjust after playtesting on target devices if needed. */
const PULL_THRESHOLD_PX = 5;
/** Min velocity (px/ms) to count placement hit + shake. Kept high so a normal drag to the drop zone does not hit; only a fast swipe into the tower counts. */
const VELOCITY_THRESHOLD_PX_PER_MS = 0.5;

/** (dx,dy)→direction: |dx|>|dy| → dx>0 ? 'right' : 'left'; else dy>0 ? 'back' : 'forward'. Screen: dx+ = right, dy+ = down; forward = away = dy<0 (up). */
function directionFromDxDy(dx: number, dy: number): MoveDirection {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'back' : 'forward';
}

export default function JengaTower({ towerState, isMyTurn, onMove, impact = false, disabled = false, onImpact }: JengaTowerProps) {
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
  const [shaking, setShaking] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const draggingBlockRef = useRef<HTMLElement | null>(null);
  const placementHitsRef = useRef<Set<string>>(new Set());
  const hasTriggeredShakeRef = useRef(false);
  const pendingOnMoveRef = useRef<{
    blockPosition: BlockPosition;
    direction: MoveDirection;
    placementHitBlocks: BlockPosition[] | undefined;
  } | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Block position is stable for the whole drag; avoid re-running on ghost/direction updates
  const dragBlockPos = dragging?.blockPosition;

  // When dragging starts, attach pointermove/pointerup to the captured block
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

      // Placement hits: only when sufficient speed/force (plan 15.8); element on top or top-1, not primary, not removed
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
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}

      setDragging((prev) => {
        if (!prev) return null;
        const dropEl = document.elementFromPoint(clientX, clientY);
        const overDrop =
          !!dropZoneRef.current &&
          !!dropEl &&
          (dropZoneRef.current === dropEl || dropZoneRef.current.contains(dropEl));
        if (overDrop && prev.direction) {
          const arr = Array.from(placementHitsRef.current).map((k) => {
            const [l, r, b] = k.split(',').map(Number);
            return { level: l, row: r, block: b };
          });
          pendingOnMoveRef.current = {
            blockPosition: prev.blockPosition,
            direction: prev.direction,
            placementHitBlocks: arr.length > 0 ? arr : undefined,
          };
        }
        return null;
      });

      placementHitsRef.current.clear();
      hasTriggeredShakeRef.current = false;
      lastPointerRef.current = null;

      const pending = pendingOnMoveRef.current;
      if (pending) {
        pendingOnMoveRef.current = null;
        onMove(pending.blockPosition, pending.direction, pending.placementHitBlocks);
      }
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    return () => {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragBlockPos, towerState, onMove, onImpact]);

  // Clear shaking after animation
  useLayoutEffect(() => {
    if (!shaking) return;
    const t = setTimeout(() => setShaking(false), 400);
    return () => clearTimeout(t);
  }, [shaking]);

  if (!towerState || !Array.isArray(towerState)) {
    return <div className="text-center p-4">Loading tower...</div>;
  }

  // Top drop zone above the rendered top; levels from top (high index) to bottom (0)
  const levelsReversed = towerState.map((_, i) => i).reverse();

  return (
    <div
      className={`p-4 border rounded bg-gray-50 ${shaking || impact ? 'jenga-tower-shake' : ''}`}
      style={{ willChange: shaking || impact ? 'transform' : undefined }}
    >
      <div className="text-lg font-semibold mb-2 text-center">Jenga Tower (Top-Down View)</div>
      <div className="flex flex-col items-center gap-1">
        {/* Top drop zone: release here commits the move (plan 15.8). touch-none for miniapp/touch E2E. */}
        <div
          ref={dropZoneRef}
          className="w-full min-h-[48px] border-2 border-dashed border-amber-400 rounded flex items-center justify-center bg-amber-50/50 text-sm text-amber-700 touch-none"
        >
          Drop here to place
        </div>

        {levelsReversed.map((levelIdx) => {
          const level = towerState[levelIdx];
          const levelRow = level?.[0] || [];

          return (
            <div key={levelIdx} className="flex gap-1 items-center">
              <div className="text-xs text-gray-500 w-8 text-right">L{levelIdx}</div>
              {levelRow.map((block, blockIdx) => {
                const isRemoved = block?.removed ?? false;
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
                      if (!isMyTurn || isRemoved || disabled) return;
                      e.preventDefault();
                      const t = e.currentTarget;
                      t.setPointerCapture(e.pointerId);
                      const rect = t.getBoundingClientRect();
                      const blockPosition: BlockPosition = { level: levelIdx, row: 0, block: blockIdx };
                      const orientation = (block?.orientation ?? 'horizontal') as 'horizontal' | 'vertical';
                      draggingBlockRef.current = t;
                      placementHitsRef.current.clear();
                      hasTriggeredShakeRef.current = false;
                      pendingOnMoveRef.current = null;
                      lastPointerRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
                      setDragging({
                        blockPosition,
                        blockCenterX: rect.left + rect.width / 2,
                        blockCenterY: rect.top + rect.height / 2,
                        orientation,
                        direction: null,
                        ghostX: e.clientX,
                        ghostY: e.clientY,
                        pointerId: e.pointerId,
                      });
                    }}
                    className={`
                      w-12 h-12 border-2 rounded select-none touch-none
                      ${isRemoved
                        ? 'bg-gray-200 border-gray-300 opacity-30'
                        : isDragging
                          ? 'bg-amber-300 border-amber-500 opacity-60'
                          : isClickable
                            ? 'bg-amber-200 border-amber-400 cursor-grab hover:bg-amber-300 active:cursor-grabbing'
                            : 'bg-amber-100 border-amber-300'}
                    `}
                    title={isRemoved ? 'Removed' : `Level ${levelIdx}, Block ${blockIdx + 1}`}
                  >
                    {isRemoved ? (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">×</div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs pointer-events-none">
                        {block?.orientation === 'horizontal' ? '━' : '│'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {isMyTurn && !disabled && !dragging && (
        <div className="mt-4 text-sm text-center text-gray-600">
          Drag a block out, then to the drop zone to place it on top
        </div>
      )}

      {/* Ghost block following the pointer during drag */}
      {dragging && (
        <div
          className="fixed w-12 h-12 border-2 border-amber-500 rounded bg-amber-200/90 flex items-center justify-center text-xs pointer-events-none z-50"
          style={{
            left: dragging.ghostX,
            top: dragging.ghostY,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {dragging.orientation === 'horizontal' ? '━' : '│'}
        </div>
      )}
    </div>
  );
}
