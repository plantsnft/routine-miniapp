'use client';

import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getBaseScanTxUrl } from '~/lib/explorer';
import { formatStakingRequirement } from '~/lib/format-prize';
import { PlayerListInline } from '~/components/PlayerListInline';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';
import JengaTimer from '~/components/JengaTimer';
import JengaTower from '~/components/JengaTower';
import JengaTower3D from '~/components/JengaTower3D';
import JengaAdminControls from '~/components/JengaAdminControls';
import { JengaHowToPlayModal } from '~/components/JengaHowToPlayModal';
import { RegisterForBetrGamesModal } from '~/components/RegisterForBetrGamesModal';
import { isTowerStateV2, towerStateV2ToV1Like, initializeTowerV2, type TowerStateV2 } from '~/lib/jenga-tower-state-v2';
import { validateMove, removeBlock, placeBlock } from '~/lib/jenga-official-rules';
import { runPlacementSimulation, runPushWithFallSimulation, runRemoveSimulation } from '~/lib/jenga-physics';
import { computeStabilityPercent } from '~/lib/jenga-stability';

type Game = {
  id: string;
  title: string;
  prize_amount: number;
  staking_min_amount?: number | null;
  turn_time_seconds: number;
  status: string;
  current_turn_fid: number | null;
  current_turn_started_at: string | null;
  turn_order: number[];
  eliminated_fids: number[];
  tower_state: any;
  move_count: number;
  hasSignedUp?: boolean;
  isMyTurn?: boolean;
  timeRemaining?: number | null;
  /** V2: set on each place; 10s handoff after. */
  last_placement_at?: string | null;
  signups?: Array<{
    fid: number;
    username: string | null;
    display_name: string | null;
    pfp_url: string | null;
    signed_up_at: string;
  }>;
  settle_tx_hash?: string | null;
  settle_tx_url?: string | null;
  payouts?: Array<{ fid: number; amount: number; txHash: string; txUrl: string | null }>;
  requiresRegistration?: boolean;
};

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

function JengaPracticeContent() {
  const [towerState, setTowerState] = useState<TowerStateV2>(() => initializeTowerV2());
  const [gameOver, setGameOver] = useState(false);
  const [moveCount, setMoveCount] = useState(0);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [impact, setImpact] = useState(false);
  /** Phase 2: 5s between turns (default) or "No limit". */
  const [noLimit, setNoLimit] = useState(false);
  /** Seconds left before next turn (5→4→3→2→1→null). Only when !noLimit. */
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);
  /** For Phase 5 "any block fell" exclusion. Set during move, cleared after. */
  const [movedBlockIdThisTurn, setMovedBlockIdThisTurn] = useState<number | null>(null);
  const [jengaHowToPlayOpen, setJengaHowToPlayOpen] = useState(false);
  /** Phase 5: collapse animation (in-memory). */
  const [collapseAnimating, setCollapseAnimating] = useState(false);
  /** Shown for 1s after a successful move. */
  const [showSuccessFeedback, setShowSuccessFeedback] = useState(false);
  const successFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cooldown tick: every 1s when cooldownRemaining > 0; at 1 we go to null after 1s.
  useEffect(() => {
    if (cooldownRemaining === null) return;
    const id = setInterval(() => {
      setCooldownRemaining((c) => (c === null || c <= 1 ? null : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownRemaining]);

  useEffect(() => () => {
    if (successFeedbackTimeoutRef.current) clearTimeout(successFeedbackTimeoutRef.current);
  }, []);

  /** Phase 4: pushed block hit the tower → game over, loser. */
  const onPushHitTower = useCallback(() => {
    setCollapseAnimating(true);
    setTimeout(() => setCollapseAnimating(false), 500);
    setGameOver(true);
    setMoveError('Pushed block hit the tower');
  }, []);

  /** Phase 5: short collapse animation before game over. */
  const onCollapse = useCallback(() => {
    setCollapseAnimating(true);
    setTimeout(() => setCollapseAnimating(false), 500);
  }, []);

  const onMove = useCallback(
    (
      blockPosition: { level: number; row: number; block: number },
      direction: 'left' | 'right' | 'forward' | 'back',
      _placementHitBlocks?: { level: number; row: number; block: number }[],
      opts?: { isTap?: boolean; strength?: number; removalAccuracy?: number; placementAccuracy?: number }
    ) => {
      // Phase 5: tap-to-push: run Cannon-es push-with-fall sim. If hit tower → game over.
      if (opts?.isTap && opts.strength != null) {
        const push = runPushWithFallSimulation(towerState.tower, blockPosition, direction, opts.strength);
        if (push.hitTower) {
          onPushHitTower();
          return;
        }
      }

      const slot = { level: blockPosition.level, row: blockPosition.row, block: blockPosition.block };
      const vr = validateMove(towerState.tower, slot);
      if (!vr.ok) {
        setGameOver(true);
        setMoveError(vr.reason ?? 'Invalid move');
        return;
      }
      const { tower: t1, blockId, removedFrom } = removeBlock(towerState.tower, slot.level, slot.row, slot.block);
      setMovedBlockIdThisTurn(blockId);

      // Phase 5: on-remove physics sim with accuracy
      const removeSim = runRemoveSimulation(t1, blockId, removedFrom.level, removedFrom.row, removedFrom.block, undefined, opts?.removalAccuracy);
      if (removeSim.collapse) {
        onCollapse();
        setGameOver(true);
        setMoveError('Tower fell');
        setMovedBlockIdThisTurn(null);
        return;
      }

      const newTower = placeBlock(t1, blockId);

      // Phase 5: placement collapse check (physics + impact/stability; revert if collapse) with accuracy
      const sim = runPlacementSimulation(t1, blockId, opts?.placementAccuracy);
      if (sim.collapse) {
        onCollapse();
        setGameOver(true);
        setMoveError(sim.reason === 'tower_fell' ? 'Tower fell' : 'Collapse');
        setMovedBlockIdThisTurn(null);
        return;
      }

      setTowerState({ version: 2, tower: newTower, blockInHand: null, removedFrom: null });
      setMoveCount((c) => c + 1);
      setMovedBlockIdThisTurn(null);
      if (!noLimit) setCooldownRemaining(5);
      setShowSuccessFeedback(true);
      if (successFeedbackTimeoutRef.current) clearTimeout(successFeedbackTimeoutRef.current);
      successFeedbackTimeoutRef.current = setTimeout(() => {
        setShowSuccessFeedback(false);
        successFeedbackTimeoutRef.current = null;
      }, 1000);
    },
    [towerState, noLimit, onPushHitTower, onCollapse]
  );

  const restart = useCallback(() => {
    setTowerState(initializeTowerV2());
    setGameOver(false);
    setMoveError(null);
    setMoveCount(0);
    setCooldownRemaining(null);
    setMovedBlockIdThisTurn(null);
  }, []);

  const onImpact = useCallback(() => {
    setImpact(true);
    setTimeout(() => setImpact(false), 400);
  }, []);

  const inCooldown = cooldownRemaining !== null;
  const canMove = !gameOver && !inCooldown;

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-0)' }}>JENGA — Practice</h1>
      <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>Remove a block and place it on top. Do not topple the tower.</p>
      {gameOver ? (
        <div className="hl-card mb-6 p-4 text-center">
          <div className="text-lg font-semibold mb-2" style={{ color: '#f87171' }}>You lose</div>
          {moveError && <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>{moveError}</p>}
          <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>Moves: {moveCount}</p>
          <button type="button" onClick={restart} className="btn-primary">
            Restart
          </button>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-sm" style={{ color: 'var(--text-1)' }}>Moves: {moveCount}</span>
            <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-1)' }}>
              <input
                type="checkbox"
                checked={noLimit}
                onChange={(e) => {
                  const v = e.target.checked;
                  setNoLimit(v);
                  if (v) setCooldownRemaining(null);
                }}
                className="rounded"
              />
              No limit (no delay between turns)
            </label>
            <button
              type="button"
              onClick={() => setJengaHowToPlayOpen(true)}
              style={{ fontSize: '0.8rem', background: 'none', border: 'none', color: 'var(--fire-1)', cursor: 'pointer', padding: 0 }}
            >
              How to Play
            </button>
          </div>
          {inCooldown && (
            <p className="text-sm mb-2" style={{ color: 'var(--fire-1)' }}>Next turn in {cooldownRemaining}s</p>
          )}
          {showSuccessFeedback && (
            <p className="text-sm mb-2" style={{ color: 'var(--fire-1)', fontWeight: 600 }}>✓ Good move!</p>
          )}
          <div className={collapseAnimating ? 'jenga-collapse-animate' : ''}>
            <JengaTower3D
              towerState={towerStateV2ToV1Like(towerState)}
              isMyTurn={canMove}
              onMove={onMove}
              impact={impact}
              disabled={!canMove}
              onImpact={onImpact}
              onPushHitTower={onPushHitTower}
              stabilityPercent={computeStabilityPercent(towerState.tower)}
            />
          </div>
          <JengaHowToPlayModal isOpen={jengaHowToPlayOpen} onClose={() => setJengaHowToPlayOpen(false)} />
        </div>
      )}
    </div>
  );
}

function JengaPageContent() {
  const { token, fid, status: authStatus } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameIdFromUrl = searchParams.get('gameId');
  const isPractice = searchParams.get('practice') === '1';

  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(!isPractice);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [submittingMove, setSubmittingMove] = useState(false);
  const [impact, setImpact] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [betrGamesRegistered, setBetrGamesRegistered] = useState<boolean | null>(null);
  const [betrGamesModalOpen, setBetrGamesModalOpen] = useState(false);
  const [activeGamesList, setActiveGamesList] = useState<any[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  /** Phase 5: collapse animation (in-memory) for real game. */
  const [collapseAnimating, setCollapseAnimating] = useState(false);

  // Load active games (always on mount, like BUDDY UP/BETR GUESSER). Skip when in practice mode.
  useEffect(() => {
    if (authStatus === 'loading') return;
    if (isPractice) return; // Don't fetch or redirect when in practice — preserves /jenga?practice=1
    (async () => {
      setLoading(true);
      try {
        // Always use plain fetch for public endpoint (matches BUDDY UP / BETR GUESSER pattern)
        // Endpoint: /api/jenga/games/active
        const fetchUrl = '/api/jenga/games/active';
        const response = await fetch(fetchUrl);
        
        // Check HTTP status before parsing JSON
        if (!response.ok) {
          console.error('[jenga] Active games fetch failed:', response.status, response.statusText);
          // Try to parse error response for more details
          try {
            const errorRes = await response.json();
            console.error('[jenga] Error response:', errorRes);
          } catch {
            // If JSON parsing fails, just log the status
          }
          setActiveGamesList([]);
          return;
        }
        
        const activeRes = await response.json();
        
        if (activeRes?.ok && Array.isArray(activeRes?.data)) {
          const activeGames = activeRes.data;
          setActiveGamesList(activeGames);
          
          // If no gameId in URL and exactly one game, auto-redirect to it (never when practice=1)
          const currentGameId = searchParams.get('gameId');
          if (!currentGameId && activeGames.length === 1) {
            router.push(`/jenga?gameId=${activeGames[0].id}`);
          }
        } else {
          // API returned 200 but with error in response body
          console.error('[jenga] Active games API error:', activeRes?.error || 'Unknown error');
          setActiveGamesList([]);
        }
      } catch (e) {
        console.error('[jenga] Failed to fetch active games:', e);
        setActiveGamesList([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, token, isPractice]);

  // Load specific game data (only when gameIdFromUrl exists)
  const loadGame = useCallback(async () => {
    if (!gameIdFromUrl) {
      // No gameId - active games are handled by separate useEffect above
      setLoading(false);
      return;
    }

    try {
      const [gameRes, adminRes] = await Promise.all([
        token
          ? authedFetch(`/api/jenga/games/${gameIdFromUrl}`, { method: 'GET' }, token).then((r) => r.json())
          : fetch(`/api/jenga/games/${gameIdFromUrl}`).then((r) => r.json()),
        token
          ? authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json())
          : Promise.resolve({ ok: true, data: { isAdmin: false } }),
      ]);

      if (gameRes?.ok && gameRes?.data) {
        setGame(gameRes.data);
        // If game requires registration, check user's registration status
        if (gameRes.data.requiresRegistration) {
          if (token && authStatus === 'authed') {
            // Check if user is registered
            try {
              const regRes = await authedFetch('/api/betr-games/register/status', { method: 'GET' }, token).then((r) => r.json());
              if (regRes?.ok && regRes?.data?.registered === true) {
                setBetrGamesRegistered(true);
                // User is registered - reload game with full data
                // This will fetch again with auth, getting full data
                const fullGameRes = await authedFetch(`/api/jenga/games/${gameIdFromUrl}`, { method: 'GET' }, token).then((r) => r.json());
                if (fullGameRes?.ok && fullGameRes?.data) {
                  setGame(fullGameRes.data);
                }
              } else {
                setBetrGamesRegistered(false);
              }
            } catch {
              setBetrGamesRegistered(false);
            }
          } else {
            setBetrGamesRegistered(false);
          }
          setError(null); // Clear error, UI will show registration prompt
        } else {
          // Game doesn't require registration, user is registered
          setBetrGamesRegistered(true);
        }
      } else {
        // If 401/403 and no gameId fallback, try active games fallback
        if ((gameRes?.error?.includes('Authentication') || gameRes?.error?.includes('Register')) && !gameIdFromUrl) {
          // Already handled in fallback logic above
          return;
        }
        setError(gameRes?.error || 'Failed to load game');
      }

      if (adminRes?.ok && adminRes?.data?.isAdmin) {
        setIsAdmin(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, [gameIdFromUrl, token, authStatus]);

  // Load specific game when gameIdFromUrl changes
  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!gameIdFromUrl) {
      // No gameId - active games list is handled by separate useEffect (which manages loading state)
      return;
    }
    loadGame();
  }, [authStatus, token, gameIdFromUrl, loadGame]);

  // Poll game state every 2-3 seconds when in progress
  useEffect(() => {
    if (!gameIdFromUrl || !game || game.status !== 'in_progress') return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = token
          ? await authedFetch(`/api/jenga/games/${gameIdFromUrl}`, { method: 'GET' }, token).then((r) => r.json())
          : await fetch(`/api/jenga/games/${gameIdFromUrl}`).then((r) => r.json());
        
        if (res?.ok && res?.data) {
          setGame(res.data);
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
    };

    // Poll every 2.5 seconds
    const interval = setInterval(poll, 2500);
    poll(); // Initial poll

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gameIdFromUrl, game?.status, token]);

  // Update timeRemaining in real-time (client-side countdown)
  const [clientTimeRemaining, setClientTimeRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (game?.timeRemaining === null || game?.timeRemaining === undefined) {
      setClientTimeRemaining(null);
      return;
    }

    setClientTimeRemaining(game.timeRemaining);
    const interval = setInterval(() => {
      setClientTimeRemaining((prev) => {
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [game?.timeRemaining]);

  // V2 handoff: countdown for "Touch to start (Xs)" when inHandoff and last_placement_at exists
  const [handoffSecondsRemaining, setHandoffSecondsRemaining] = useState<number | null>(null);
  useEffect(() => {
    const v2 = isTowerStateV2(game?.tower_state);
    const inH = Boolean(v2 && !game?.current_turn_started_at && game?.current_turn_fid === fid && fid);
    if (!inH || !game?.last_placement_at) {
      setHandoffSecondsRemaining(null);
      return;
    }
    const lp = game.last_placement_at;
    const update = () => setHandoffSecondsRemaining(Math.max(0, 10 - (Date.now() - new Date(lp).getTime()) / 1000));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [game?.tower_state, game?.current_turn_started_at, game?.current_turn_fid, game?.last_placement_at, fid]);

  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import('~/lib/constants');
        const url = APP_URL + `/jenga?gameId=${gameIdFromUrl}`;
        await sdk.actions.composeCast({
          text: 'Join me in the BETR WITH BURR mini-app',
          embeds: [url],
        });
      } else {
        alert('This feature requires Warpcast. Please open this mini app in Warpcast to share.');
      }
    } catch (error) {
      console.error('Failed to open cast composer:', error);
      alert('Failed to open cast composer. Please try again.');
    }
  };

  const handleCopyGameUrl = async () => {
    try {
      const { APP_URL } = await import('~/lib/constants');
      const url = APP_URL + `/jenga?gameId=${gameIdFromUrl}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      const { APP_URL } = await import('~/lib/constants');
      alert('Copy failed. URL: ' + (APP_URL + `/jenga?gameId=${gameIdFromUrl}`));
    }
  };

  // Handle signup
  const handleSignup = async () => {
    if (!token || !gameIdFromUrl) {
      setError('Authentication required');
      return;
    }

    setSigningUp(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/jenga/games/${gameIdFromUrl}/signup`, { method: 'POST' }, token).then((r) => r.json());
      
      if (res?.ok) {
        await loadGame();
      } else {
        setError(res?.error || 'Failed to sign up');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sign up');
    } finally {
      setSigningUp(false);
    }
  };

  /** Phase 5: short collapse animation before game-over / eliminated UX. */
  const onCollapse = useCallback(() => {
    setCollapseAnimating(true);
    setTimeout(() => setCollapseAnimating(false), 500);
  }, []);

  /** Phase 4: pushed block hit the tower → game over, loser. Phase 5: collapse animation. */
  const onPushHitTower = useCallback(() => {
    setMoveError('Pushed block hit the tower. You lose.');
    onCollapse();
  }, [onCollapse]);

  // Handle move submission: onMove(blockPosition, direction, placementHitBlocks?, opts?) from JengaTower3D.
  // V2 (official rules): send { remove: { level, row, block } } only. V1: { blockPosition, direction, placementHitBlocks? }.
  // Phase 5: when opts?.isTap && opts.strength != null, run runPushWithFallSimulation client-side first; if hitTower, onPushHitTower and return.
  const handleSubmitMove = useCallback(
    async (
      blockPosition: { level: number; row: number; block: number },
      _direction: 'left' | 'right' | 'forward' | 'back',
      _placementHitBlocks?: { level: number; row: number; block: number }[],
      opts?: { isTap?: boolean; strength?: number; removalAccuracy?: number; placementAccuracy?: number }
    ) => {
      if (!token || !gameIdFromUrl) {
        setMoveError('Authentication required');
        return;
      }

      if (!game?.isMyTurn) {
        setMoveError("It's not your turn");
        return;
      }

      // Phase 5: tap-to-push – run Cannon-es push-with-fall sim. If hit tower, game over (no API call).
      if (opts?.isTap && opts.strength != null && isTowerStateV2(game?.tower_state)) {
        const tower = (game.tower_state as { version: 2; tower: (number | null)[][][] }).tower;
        const push = runPushWithFallSimulation(tower, blockPosition, _direction, opts.strength);
        if (push.hitTower) {
          onPushHitTower();
          return;
        }
      }

      setSubmittingMove(true);
      setMoveError(null);

      try {
        // V2 only: always send { remove } (create uses initializeTowerV2)
        const body: {
          remove: { level: number; row: number; block: number };
          removalAccuracy?: number;
          placementAccuracy?: number;
        } = { remove: { level: blockPosition.level, row: blockPosition.row, block: blockPosition.block } };
        if (opts?.removalAccuracy != null) {
          body.removalAccuracy = opts.removalAccuracy;
        }
        if (opts?.placementAccuracy != null) {
          body.placementAccuracy = opts.placementAccuracy;
        }

        const res = await authedFetch(
          `/api/jenga/games/${gameIdFromUrl}/move`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
          token
        ).then((r) => r.json());

        if (res?.ok) {
          if (res?.data?.collapse || (res?.data?.eliminated && res?.data?.gameEnded)) {
            onCollapse();
          }
          if (res?.data?.blocksRemoved?.length) {
            setImpact(true);
            setTimeout(() => setImpact(false), 450);
          }
          await loadGame();
        } else {
          setMoveError(res?.error || 'Failed to submit move');
          if (res?.data?.eliminated) {
            setTimeout(() => loadGame(), 1000);
          }
        }
      } catch (e) {
        setMoveError(e instanceof Error ? e.message : 'Failed to submit move');
      } finally {
        setSubmittingMove(false);
      }
    },
    [token, gameIdFromUrl, game, loadGame, onPushHitTower, onCollapse]
  );

  // During-drag impact: parent state for tower hit with sufficient speed (plan 15.8). Matches shake duration.
  const onImpact = useCallback(() => {
    setImpact(true);
    setTimeout(() => setImpact(false), 400);
  }, []);

  // V2 handoff: next player must touch (or wait 10s) to start their turn. Touch button calls POST /touch.
  const isV2 = isTowerStateV2(game?.tower_state);
  const inHandoff = Boolean(isV2 && !game?.current_turn_started_at && game?.current_turn_fid === fid && fid);
  const handleTouch = useCallback(async () => {
    if (!token || !gameIdFromUrl) return;
    setSubmittingMove(true);
    setMoveError(null);
    try {
      const r = await authedFetch(`/api/jenga/games/${gameIdFromUrl}/touch`, { method: 'POST' }, token).then((x) => x.json());
      if (r?.ok) await loadGame();
      else setMoveError(r?.error || 'Touch failed');
    } finally {
      setSubmittingMove(false);
    }
  }, [token, gameIdFromUrl, loadGame]);

  if (isPractice) return <JengaPracticeContent />;

  if (loading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back
        </Link>
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  // Show active games list if no gameId and we have games
  if (!gameIdFromUrl && !loading && activeGamesList.length > 0) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back
        </Link>
        <h1 className="text-2xl font-bold mb-6">JENGA Games</h1>
        <div className="space-y-4">
          {activeGamesList.map((g: any) => (
            <div
              key={g.id}
              className="hl-card cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => router.push(`/jenga?gameId=${g.id}`)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-2">{g.title || `JENGA Game ${g.id.substring(0, 8)}`}</h3>
                  <div className="text-sm text-gray-500">
                    <div>Prize: {g.prize_amount} BETR</div>
                    <div>Status: <span className="uppercase">{g.status}</span></div>
                    {g.signups && (
                      <div>Signups: {Array.isArray(g.signups) ? g.signups.length : 0} / 10</div>
                    )}
                  </div>
                </div>
                <button
                  className="btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/jenga?gameId=${g.id}`);
                  }}
                >
                  View Game
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !game && !gameIdFromUrl) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back
        </Link>
        <h1 className="text-2xl font-bold mb-6">JENGA Games</h1>
        <div className="hl-card text-center">
          <div className="text-red-500 mb-4">{error}</div>
          <p className="text-gray-500 mb-4">No active games found. Please create a game or check back later.</p>
        </div>
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back
        </Link>
        <div className="text-red-500 text-center">{error}</div>
      </div>
    );
  }

  if (!game && gameIdFromUrl) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back
        </Link>
        <div className="text-center">Game not found</div>
      </div>
    );
  }

  if (!game && !gameIdFromUrl && !loading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back
        </Link>
        <h1 className="text-2xl font-bold mb-6">JENGA Games</h1>
        <div className="hl-card text-center">
          <p className="text-gray-500 mb-4">No active games found. Please create a game or check back later.</p>
        </div>
      </div>
    );
  }

  // Final null check to satisfy TypeScript strict null checks
  if (!game) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center">Game not found</div>
      </div>
    );
  }

  const currentPlayer = game.signups?.find((s) => s.fid === game.current_turn_fid);
  const isEliminated = fid ? (game.eliminated_fids || []).includes(fid) : false;
  const showRegistrationOverlay = game.requiresRegistration && betrGamesRegistered === false;

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      {game && (
        <div style={{ width: '100%', maxHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', color: 'var(--text-2)', fontSize: '0.875rem' }}>
          JENGA
        </div>
      )}
      {/* Registration Overlay */}
      {showRegistrationOverlay && (
        <div className="mb-6 p-4 border-2 border-yellow-500 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-0)' }}>
              Register for BETR GAMES
            </h3>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-1)' }}>
            You need to register for BETR GAMES to view full game details and participate.
          </p>
          {token && authStatus === 'authed' ? (
            <button
              onClick={() => setBetrGamesModalOpen(true)}
              className="btn-primary"
              style={{ background: 'var(--fire-1)' }}
            >
              Register for BETR GAMES
            </button>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Please sign in to register for BETR GAMES.
            </p>
          )}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{game.title}</h1>
        <div className="text-lg mb-2">Prize: {game.prize_amount} BETR</div>
        <p className="text-sm text-gray-500 mb-2">{formatStakingRequirement(game.staking_min_amount)}</p>
        <div className="text-sm text-gray-500">
          Status: <span className="uppercase">{game.status}</span>
          {game.settle_tx_hash && (
            <span className="ml-2">• <a href={(game as any).settle_tx_url || getBaseScanTxUrl(game.settle_tx_hash) || '#'} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">View settlement on Basescan</a></span>
          )}
          {(game as any).payouts?.length > 0 && (
            <span className="ml-2">• Payouts: {(game as any).payouts.map((p: any, i: number) => (
              <span key={i}>{i > 0 && ', '}FID {p.fid} {p.txUrl ? <a href={p.txUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">tx</a> : null}</span>
            ))}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: '8px' }}>
          <button
            onClick={handleShare}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}
          >
            Share
          </button>
          <button
            onClick={handleCopyGameUrl}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}
          >
            {linkCopied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* Signup phase */}
      {game.status === 'signup' && !showRegistrationOverlay && (
        <div className="mb-6 p-4 border rounded">
          <div className="mb-4">
            <div className="text-lg mb-2">Signups: {game.signups?.length || 0} / 10</div>
            {game.signups && game.signups.length > 0 && (
              <div className="mb-3">
                <PlayerListInline players={game.signups} defaultPfp={DEFAULT_PFP} size="sm" />
              </div>
            )}
            {!game.hasSignedUp && token && !game.requiresRegistration && (
              <button
                onClick={handleSignup}
                disabled={signingUp}
                className="btn-primary px-4 py-2 rounded"
              >
                {signingUp ? 'Signing up...' : 'Sign Up'}
              </button>
            )}
            {game.hasSignedUp && (
              <div className="text-green-500">You&apos;ve signed up!</div>
            )}
          </div>
          {isAdmin && (
            <div className="mt-4">
              <button
                onClick={async () => {
                  if (!token) return;
                  const res = await authedFetch(`/api/jenga/games/${gameIdFromUrl}/start`, { method: 'POST' }, token).then((r) => r.json());
                  if (res?.ok) {
                    await loadGame();
                  } else {
                    setError(res?.error || 'Failed to start game');
                  }
                }}
                className="btn-primary px-4 py-2 rounded"
              >
                Start Game
              </button>
            </div>
          )}
        </div>
      )}

      {/* In progress game */}
      {game.status === 'in_progress' && !showRegistrationOverlay && (
        <>
          {/* Timer */}
          <div className="mb-6">
            <JengaTimer
              timeRemaining={clientTimeRemaining !== null ? clientTimeRemaining : (game.timeRemaining || null)}
              isMyTurn={game.isMyTurn || false}
              currentPlayer={currentPlayer}
              inHandoff={inHandoff}
              handoffSecondsRemaining={handoffSecondsRemaining}
            />
          </div>

          {/* Player queue */}
          <div className="mb-6">
            <div className="text-lg font-semibold mb-2">Turn Order</div>
            <div className="flex flex-wrap gap-2">
              {(game.turn_order || []).map((fid) => {
                const signup = game.signups?.find((s) => s.fid === fid);
                const isElim = (game.eliminated_fids || []).includes(fid);
                const isCurrent = fid === game.current_turn_fid;
                return (
                  <div
                    key={fid}
                    className={`relative ${isCurrent ? 'ring-2 ring-yellow-400' : ''} ${isElim ? 'opacity-50' : ''}`}
                  >
                    <img
                      src={signup?.pfp_url || DEFAULT_PFP}
                      alt={signup?.display_name || signup?.username || `FID ${fid}`}
                      className="w-12 h-12 rounded-full cursor-pointer"
                      onClick={() => openFarcasterProfile(fid, signup?.username || null)}
                    />
                    {isElim && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 rounded">ELIM</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Game board (plan 15.8: one continuous drag, top drop zone, onMove). V2: normalized tower + { remove } body. */}
          <div className="mb-6">
            {moveError && (game.isMyTurn || inHandoff) && !isEliminated && (
              <div className="text-red-500 text-sm mb-2">{moveError}</div>
            )}
            {submittingMove && (
              <div className="text-sm text-amber-600 mb-2">Submitting move...</div>
            )}
            {inHandoff && (
              <div className="mb-3 p-3 border border-amber-400 rounded bg-amber-50">
                <p className="text-sm text-amber-800 mb-2">Touch the tower to start your turn (or wait for the 10s handoff).</p>
                <button type="button" onClick={handleTouch} disabled={submittingMove} className="btn-primary">
                  Touch to start
                </button>
              </div>
            )}
            <div className={collapseAnimating ? 'jenga-collapse-animate' : ''}>
              {isTowerStateV2(game.tower_state) ? (
                <JengaTower3D
                  towerState={towerStateV2ToV1Like(game.tower_state as { version: 2; tower: (number | null)[][][] })}
                  isMyTurn={game.isMyTurn || false}
                  onMove={handleSubmitMove}
                  impact={impact}
                  disabled={submittingMove || inHandoff}
                  onImpact={onImpact}
                  onPushHitTower={onPushHitTower}
                  stabilityPercent={computeStabilityPercent((game.tower_state as { version: 2; tower: (number | null)[][][] }).tower)}
                />
              ) : (
                <JengaTower
                  towerState={game.tower_state}
                  isMyTurn={game.isMyTurn || false}
                  onMove={handleSubmitMove}
                  impact={impact}
                  disabled={submittingMove || inHandoff}
                  onImpact={onImpact}
                />
              )}
            </div>
          </div>

          {/* Status display */}
          <div className="mb-6">
            {isEliminated && (
              <div className="text-red-500 text-lg font-semibold">You have been eliminated</div>
            )}
            {!game.isMyTurn && !isEliminated && (
              <div className="text-gray-500">Waiting for your turn...</div>
            )}
            {currentPlayer && (
              <div className="text-sm text-gray-500">
                Current player: {currentPlayer.display_name || currentPlayer.username || `FID ${game.current_turn_fid}`}
              </div>
            )}
          </div>
        </>
      )}

      {/* Admin controls */}
      {isAdmin && !showRegistrationOverlay && (
        <div className="mt-6">
          <JengaAdminControls
            game={game}
            gameId={gameIdFromUrl || ''}
            token={token || ''}
            onGameUpdate={loadGame}
          />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 text-red-500 text-center">{error}</div>
      )}

      {/* Registration Modal */}
      {token && (
        <RegisterForBetrGamesModal
          isOpen={betrGamesModalOpen}
          onClose={async () => {
            setBetrGamesModalOpen(false);
            // Check registration status after modal closes
            if (token && authStatus === 'authed') {
              try {
                const regRes = await authedFetch('/api/betr-games/register/status', { method: 'GET' }, token).then((r) => r.json());
                if (regRes?.ok && regRes?.data?.registered === true) {
                  setBetrGamesRegistered(true);
                  // Reload game with full data now that user is registered
                  if (gameIdFromUrl) {
                    const fullGameRes = await authedFetch(`/api/jenga/games/${gameIdFromUrl}`, { method: 'GET' }, token).then((r) => r.json());
                    if (fullGameRes?.ok && fullGameRes?.data) {
                      setGame(fullGameRes.data);
                    }
                  }
                }
              } catch {
                // Ignore errors
              }
            }
          }}
          alreadyRegistered={betrGamesRegistered === true}
          error={false}
        />
      )}
    </div>
  );
}

export default function JengaPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-4"><div className="text-center">Loading...</div></div>}>
      <JengaPageContent />
    </Suspense>
  );
}
