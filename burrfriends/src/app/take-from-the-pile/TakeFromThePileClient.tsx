'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';
import { formatRelativeTime } from '~/lib/utils';

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

type TurnOrderEntry = { position: number; fid: number; username: string; display_name: string; pfp_url: string };

type GameEvent = {
  sequence: number;
  fid: number;
  event_type: string;
  amount_taken: number | null;
  display_name?: string;
  username?: string;
  pfp_url?: string;
};

type Game = {
  id: string;
  title: string;
  status: string;
  is_preview?: boolean;
  prize_pool_amount?: number;
  current_pot_amount?: number;
  turn_order_fids?: number[];
  turnOrderWithProfiles?: TurnOrderEntry[];
  current_turn_ends_at?: string | null;
  timer_paused_at?: string | null;
  timer_paused_remaining_seconds?: number | null;
  pick_deadline_minutes?: number;
  currentTurnFid?: number | null;
  nextTurnFid?: number | null;
  eligibleCount?: number;
  events?: GameEvent[];
};

type StatusData = {
  registered: boolean;
  canPlay: boolean;
  gameId: string | null;
  gameStatus: string | null;
  myTurn: boolean;
  currentTurnEndsAt: string | null;
  timerPaused: boolean;
  currentPot: number;
  myTotalTaken: number;
  myPreloadAmount?: number | null;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TakeFromThePileClient() {
  const { token, status: authStatus, fid: currentFid } = useAuth();
  const searchParams = useSearchParams();
  const urlGameId = searchParams.get('gameId')?.trim() || null;

  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [turnTimerRemainingMs, setTurnTimerRemainingMs] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  const [pickAmount, setPickAmount] = useState('');
  const [pickSubmitting, setPickSubmitting] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [cancellingGame, setCancellingGame] = useState(false);
  const [settlingGame, setSettlingGame] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [unpausing, setUnpausing] = useState(false);
  const [showFullOrderModal, setShowFullOrderModal] = useState(false);
  const [preloadAmountInput, setPreloadAmountInput] = useState('');
  const [preloadSubmitting, setPreloadSubmitting] = useState(false);
  const refetchedAtZeroRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlGameId) setSelectedGameId(urlGameId);
  }, [urlGameId]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        const [activeRes, statusRes, adminRes] = await Promise.all([
          fetch('/api/take-from-the-pile/games/active').then((r) => r.json()),
          token ? authedFetch('/api/take-from-the-pile/status', { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve({ ok: false }),
          token ? authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve({ isAdmin: false }),
        ]);
        if (activeRes?.ok && Array.isArray(activeRes?.data)) {
          const sorted = [...activeRes.data].sort((a: Game, b: Game) =>
            (a.status === 'in_progress' ? 0 : 1) - (b.status === 'in_progress' ? 0 : 1)
          );
          setActiveGames(sorted);
          if (urlGameId) setSelectedGameId(urlGameId);
          else if (sorted.length > 0 && !selectedGameId) setSelectedGameId(sorted[0].id);
        }
        if (statusRes?.ok && statusRes?.data) setStatusData(statusRes.data);
        if (adminRes?.ok && adminRes?.data?.isAdmin) setIsAdmin(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [authStatus, token, urlGameId]);

  useEffect(() => {
    if (!selectedGameId) return;
    setGame((prev) => (prev?.id === selectedGameId ? prev : null));
    (async () => {
      try {
        const res = token
          ? await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json())
          : await fetch(`/api/take-from-the-pile/games/${selectedGameId}`).then((r) => r.json());
        if (res?.ok && res?.data) setGame(res.data);
      } catch (e) {
        console.error('Failed to load game:', e);
      }
    })();
  }, [selectedGameId, token]);

  useEffect(() => {
    if (game?.status !== 'in_progress' || game?.timer_paused_at) {
      setTurnTimerRemainingMs(null);
      refetchedAtZeroRef.current = null;
      return;
    }
    const endsAt = game?.current_turn_ends_at;
    if (!endsAt) {
      setTurnTimerRemainingMs(0);
      return;
    }
    refetchedAtZeroRef.current = null;
    const update = () => {
      const remaining = new Date(endsAt).getTime() - Date.now();
      setTurnTimerRemainingMs(remaining <= 0 ? 0 : remaining);
      if (remaining <= 0 && refetchedAtZeroRef.current !== endsAt) {
        refetchedAtZeroRef.current = endsAt;
        refreshGame().catch(() => {});
        if (token) {
          authedFetch('/api/take-from-the-pile/status', { method: 'GET' }, token)
            .then((r) => r.json())
            .then((res) => { if (res?.ok && res?.data) setStatusData(res.data); })
            .catch(() => {});
        }
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [game?.status, game?.current_turn_ends_at, game?.timer_paused_at]);

  const loadChat = async () => {
    if (!token || !selectedGameId) return;
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && Array.isArray(res?.data)) {
        const sorted = res.data.slice().sort(
          (a: MessageWithReactionsPayload, b: MessageWithReactionsPayload) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setChatMessages(sorted);
      }
    } catch (e) {
      console.error('Failed to load chat:', e);
    }
  };

  useEffect(() => {
    if (!token || !selectedGameId || (game?.status !== 'open' && game?.status !== 'in_progress')) return;
    loadChat();
    const interval = setInterval(loadChat, 8000);
    return () => clearInterval(interval);
  }, [token, selectedGameId, game?.status]);

  useEffect(() => {
    if (!selectedGameId || game?.status !== 'in_progress') return;
    const id = setInterval(refreshGame, 8000);
    return () => clearInterval(id);
  }, [selectedGameId, game?.status]);

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!token || !selectedGameId || !text) return;
    setChatSending(true);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok && data.data) {
        setChatMessages((prev) => [data.data, ...prev]);
        setChatInput('');
      }
    } catch (e) {
      console.error('Send chat failed:', e);
    } finally {
      setChatSending(false);
    }
  };

  const handleReactionClick = async (messageId: string, reaction: 'thumbs_up' | 'x' | 'fire' | 'scream') => {
    if (!token || !selectedGameId) return;
    try {
      const res = await authedFetch(
        `/api/take-from-the-pile/games/${selectedGameId}/chat/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      const chatRes = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (chatRes?.ok && Array.isArray(chatRes.data)) setChatMessages(chatRes.data);
    } catch (e) {
      console.error('Reaction failed:', e);
    }
  };

  const refreshGame = async () => {
    if (!selectedGameId) return;
    try {
      const res = token
        ? await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json())
        : await fetch(`/api/take-from-the-pile/games/${selectedGameId}`).then((r) => r.json());
      if (res?.ok && res?.data) setGame(res.data);
    } catch (e) {
      console.error('Refresh game failed:', e);
    }
  };

  const handlePick = async () => {
    const amount = parseInt(pickAmount.replace(/\D/g, ''), 10);
    if (!token || !selectedGameId || !Number.isFinite(amount) || amount < 0) return;
    setPickSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setPickAmount('');
        await refreshGame();
        const statusRes = await authedFetch('/api/take-from-the-pile/status', { method: 'GET' }, token).then((r) => r.json());
        if (statusRes?.ok && statusRes?.data) setStatusData(statusRes.data);
      } else {
        setError(data.error || 'Failed to take');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to take');
    } finally {
      setPickSubmitting(false);
    }
  };

  const handleSetPreload = async () => {
    if (!token || !selectedGameId) return;
    const amount = parseInt(preloadAmountInput.replace(/\D/g, ''), 10);
    if (!Number.isFinite(amount) || amount < 0) return;
    setPreloadSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/preload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        const statusRes = await authedFetch('/api/take-from-the-pile/status', { method: 'GET' }, token).then((r) => r.json());
        if (statusRes?.ok && statusRes?.data) setStatusData(statusRes.data);
      } else {
        setError(data.error || 'Failed to set preload');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set preload');
    } finally {
      setPreloadSubmitting(false);
    }
  };

  const handleClearPreload = async () => {
    if (!token || !selectedGameId) return;
    setPreloadSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/preload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 0 }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setPreloadAmountInput('');
        const statusRes = await authedFetch('/api/take-from-the-pile/status', { method: 'GET' }, token).then((r) => r.json());
        if (statusRes?.ok && statusRes?.data) setStatusData(statusRes.data);
      } else {
        setError(data.error || 'Failed to clear preload');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear preload');
    } finally {
      setPreloadSubmitting(false);
    }
  };

  const handleStart = async () => {
    if (!token || !selectedGameId) return;
    setStartingGame(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/start`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await refreshGame();
        const statusRes = await authedFetch('/api/take-from-the-pile/status', { method: 'GET' }, token).then((r) => r.json());
        if (statusRes?.ok && statusRes?.data) setStatusData(statusRes.data);
      } else {
        setError(data.error || 'Failed to start');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setStartingGame(false);
    }
  };

  const handleCancel = async () => {
    if (!token || !selectedGameId) return;
    setCancellingGame(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/cancel`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setGame((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
      } else {
        setError(data.error || 'Failed to cancel');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel');
    } finally {
      setCancellingGame(false);
    }
  };

  const handleEnd = async () => {
    if (!token || !selectedGameId) return;
    setEndingGame(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/end`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setGame((prev) => (prev ? { ...prev, status: 'settled' } : null));
      } else {
        setError(data.error || 'Failed to end');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end');
    } finally {
      setEndingGame(false);
    }
  };

  const handleSettle = async () => {
    if (!token || !selectedGameId) return;
    setSettlingGame(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/settle`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setGame((prev) => (prev ? { ...prev, status: 'settled' } : null));
      } else {
        setError(data.error || 'Failed to settle');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to settle');
    } finally {
      setSettlingGame(false);
    }
  };

  const handleSkip = async () => {
    if (!token || !selectedGameId) return;
    setSkipping(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/skip`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await refreshGame();
      } else {
        setError(data.error || 'Failed to skip');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to skip');
    } finally {
      setSkipping(false);
    }
  };

  const handlePause = async () => {
    if (!token || !selectedGameId) return;
    setPausing(true);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/timer-pause`, { method: 'PATCH' }, token);
      if (res.ok) await refreshGame();
    } catch (e) {
      console.error('Pause failed:', e);
    } finally {
      setPausing(false);
    }
  };

  const handleUnpause = async () => {
    if (!token || !selectedGameId) return;
    setUnpausing(true);
    try {
      const res = await authedFetch(`/api/take-from-the-pile/games/${selectedGameId}/timer-unpause`, { method: 'PATCH' }, token);
      if (res.ok) await refreshGame();
    } catch (e) {
      console.error('Unpause failed:', e);
    } finally {
      setUnpausing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4" style={{ color: 'var(--text-0)' }}>
        Loading…
      </div>
    );
  }

  const canPlay = statusData?.canPlay ?? false;
  const myTurn = statusData?.myTurn ?? false;
  const currentPot = game?.current_pot_amount ?? statusData?.currentPot ?? 0;
  const timerPaused = !!game?.timer_paused_at;

  return (
    <div className="p-4 max-w-2xl mx-auto" style={{ color: 'var(--text-0)' }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <Image src="/takefrompile.png" alt="TAKE FROM THE PILE" width={400} height={400} style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px' }} priority />
      </div>
      <h1 className="text-xl font-semibold mb-2">TAKE FROM THE PILE</h1>
      <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>
        Take as much as you want from the pile (0 to current pot). Random turn order. Miss your turn → move to the back. Manual payout after game ends.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {activeGames.length > 0 && (
        <div className="mb-4">
          <label className="text-sm block mb-1" style={{ color: 'var(--text-1)' }}>Game</label>
          <select
            value={selectedGameId || ''}
            onChange={(e) => setSelectedGameId(e.target.value || null)}
            className="w-full p-2 rounded-lg border"
            style={{ background: 'var(--bg-2)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
          >
            {activeGames.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title || 'TAKE FROM THE PILE'} — {g.status === 'in_progress' ? 'In progress' : 'Open'}
              </option>
            ))}
          </select>
        </div>
      )}

      {!selectedGameId && activeGames.length === 0 && (
        <p style={{ color: 'var(--text-1)' }}>No active TAKE FROM THE PILE game. Admins can create one from the dashboard.</p>
      )}

      {selectedGameId && game && (
        <>
          {game.status === 'open' && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
              <h2 className="font-semibold mb-2">Game open</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>
                Prize pool: {(game.prize_pool_amount ?? 0).toLocaleString()} BETR. Admin will start the game; then players take turns in random order.
              </p>
              {isAdmin && (
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={handleStart}
                    disabled={startingGame}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{
                      background: startingGame ? 'var(--bg-1)' : 'var(--fire-1)',
                      color: startingGame ? 'var(--text-2)' : 'var(--bg-0)',
                      border: 'none',
                      cursor: startingGame ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {startingGame ? 'Starting…' : 'Start game'}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancellingGame}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{
                      background: cancellingGame ? 'var(--bg-1)' : '#6b7280',
                      color: '#fff',
                      border: 'none',
                      cursor: cancellingGame ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {cancellingGame ? 'Cancelling…' : 'Cancel game'}
                  </button>
                </div>
              )}
            </div>
          )}

          {game.status === 'in_progress' && (
            <>
              <div className="mb-4 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                <div className="text-sm mb-2" style={{ color: 'var(--text-1)' }}>
                  Current pot: <strong style={{ color: 'var(--fire-1)' }}>{currentPot.toLocaleString()} BETR</strong>
                </div>
                {timerPaused ? (
                  <div style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)', fontWeight: 700, color: 'var(--fire-1)' }}>
                    Game is paused
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                      fontWeight: 700,
                      color: 'var(--fire-1)',
                      textShadow: '0 0 8px var(--fire-1), 0 0 16px var(--fire-1)',
                    }}
                  >
                    {turnTimerRemainingMs !== null && turnTimerRemainingMs > 0
                      ? formatCountdown(turnTimerRemainingMs)
                      : '0:00'}
                  </div>
                )}
                <p className="text-sm mt-2" style={{ color: 'var(--text-1)' }}>
                  {game.currentTurnFid === currentFid ? "Your turn" : game.currentTurnFid ? "Someone else's turn" : "—"}
                  {game.nextTurnFid && game.currentTurnFid !== currentFid && " · You're up next"}
                </p>
              </div>

              {game.turnOrderWithProfiles && game.turnOrderWithProfiles.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2" style={{ gap: '8px' }}>
                    {game.turnOrderWithProfiles.slice(0, 5).map((entry) => {
                      const isCurrent = entry.position === 1;
                      return (
                        <button
                          key={`${entry.fid}-${entry.position}`}
                          type="button"
                          onClick={() => openFarcasterProfile(entry.fid, entry.username ?? null)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: isCurrent ? 'var(--bg-2)' : 'transparent',
                            border: isCurrent ? `2px solid var(--fire-1)` : '1px solid var(--stroke)',
                            borderRadius: '8px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.8125rem',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: 'var(--text-1)', minWidth: '1.25rem' }}>{entry.position}.</span>
                          <img
                            src={entry.pfp_url || DEFAULT_PFP}
                            alt={entry.display_name || entry.username || `FID ${entry.fid}`}
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                          <span style={{ color: 'var(--text-0)', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.display_name || entry.username || `FID ${entry.fid}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFullOrderModal(true)}
                    className="text-sm font-medium"
                    style={{ color: 'var(--fire-1)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    View all order
                  </button>
                </div>
              )}

              {showFullOrderModal && game.turnOrderWithProfiles && game.turnOrderWithProfiles.length > 0 && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Full turn order"
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 50,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)',
                    padding: '16px',
                  }}
                  onClick={() => setShowFullOrderModal(false)}
                >
                  <div
                    style={{
                      background: 'var(--bg-2)',
                      border: '1px solid var(--stroke)',
                      borderRadius: '12px',
                      maxWidth: '400px',
                      width: '100%',
                      maxHeight: '80vh',
                      overflow: 'auto',
                      padding: '16px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 className="font-semibold" style={{ margin: 0, color: 'var(--text-0)' }}>Turn order</h3>
                      <button
                        type="button"
                        onClick={() => setShowFullOrderModal(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-2)', padding: '0 4px' }}
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>
                    <div className="space-y-2">
                      {game.turnOrderWithProfiles.map((entry) => {
                        const isCurrent = entry.position === 1;
                        return (
                          <button
                            key={`${entry.fid}-${entry.position}`}
                            type="button"
                            onClick={() => openFarcasterProfile(entry.fid, entry.username ?? null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: isCurrent ? '2px solid var(--fire-1)' : '1px solid var(--stroke)',
                              background: isCurrent ? 'var(--bg-1)' : 'transparent',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--text-1)', minWidth: '1.5rem' }}>{entry.position}.</span>
                            <img
                              src={entry.pfp_url || DEFAULT_PFP}
                              alt={entry.display_name || entry.username || `FID ${entry.fid}`}
                              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                            />
                            <span style={{ color: 'var(--text-0)', flex: 1 }}>{entry.display_name || entry.username || `FID ${entry.fid}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {(canPlay || (isAdmin && game?.is_preview)) && !myTurn && (game?.turn_order_fids?.includes(Number(currentFid)) || game?.turnOrderWithProfiles?.some((p) => Number(p.fid) === Number(currentFid))) && (
                <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                  <h2 className="font-semibold mb-2">Preload</h2>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-1)' }}>
                    If the pot is at least your preload when your turn starts, that amount is taken automatically. Otherwise you have 60 minutes to pick or you&apos;ll be skipped.
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={preloadAmountInput}
                      onChange={(e) => setPreloadAmountInput(e.target.value.replace(/\D/g, ''))}
                      placeholder={statusData?.myPreloadAmount != null ? String(statusData.myPreloadAmount) : '0'}
                      className="flex-1 min-w-[80px] p-2 rounded border"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
                    />
                    <button
                      onClick={handleSetPreload}
                      disabled={preloadSubmitting}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{
                        background: preloadSubmitting ? 'var(--bg-1)' : 'var(--fire-1)',
                        color: preloadSubmitting ? 'var(--text-2)' : 'var(--bg-0)',
                        border: 'none',
                        cursor: preloadSubmitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {preloadSubmitting ? 'Saving…' : 'Set preload'}
                    </button>
                    {statusData?.myPreloadAmount != null && (
                      <button
                        onClick={handleClearPreload}
                        disabled={preloadSubmitting}
                        className="px-4 py-2 rounded-lg font-medium"
                        style={{
                          background: 'transparent',
                          color: 'var(--text-1)',
                          border: '1px solid var(--stroke)',
                          cursor: preloadSubmitting ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {statusData?.myPreloadAmount != null && (
                    <p className="text-sm mt-2" style={{ color: 'var(--text-1)' }}>
                      Preload set to {Number(statusData.myPreloadAmount).toLocaleString()} BETR.
                    </p>
                  )}
                </div>
              )}

              {(canPlay || (isAdmin && game?.is_preview)) && myTurn && (
                <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                  <h2 className="font-semibold mb-2">Take from the pile</h2>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-1)' }}>
                    Enter amount (0 to {currentPot.toLocaleString()} BETR).
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pickAmount}
                      onChange={(e) => setPickAmount(e.target.value.replace(/\D/g, ''))}
                      placeholder="0"
                      className="flex-1 min-w-[100px] p-2 rounded border"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
                    />
                    <button
                      onClick={handlePick}
                      disabled={pickSubmitting || (parseInt(pickAmount.replace(/\D/g, ''), 10) > currentPot)}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{
                        background: pickSubmitting ? 'var(--bg-1)' : 'var(--fire-1)',
                        color: pickSubmitting ? 'var(--text-2)' : 'var(--bg-0)',
                        border: 'none',
                        cursor: pickSubmitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {pickSubmitting ? 'Taking…' : 'Take'}
                    </button>
                  </div>
                  {statusData?.myTotalTaken != null && statusData.myTotalTaken > 0 && (
                    <p className="text-sm mt-2" style={{ color: 'var(--text-1)' }}>
                      You&apos;ve taken {statusData.myTotalTaken.toLocaleString()} BETR so far.
                    </p>
                  )}
                </div>
              )}

              <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                <h2 className="font-semibold mb-2">Activity</h2>
                {!game?.events?.length ? (
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>No picks yet.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {game.events.map((ev) => {
                      const name = ev.display_name || ev.username || `FID ${ev.fid}`;
                      return (
                        <li
                          key={ev.sequence}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 0',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                          }}
                          onClick={() => openFarcasterProfile(ev.fid, ev.username ?? null)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openFarcasterProfile(ev.fid, ev.username ?? null);
                            }
                          }}
                        >
                          {ev.event_type === 'skip' ? (
                            <span style={{ color: 'var(--text-1)' }}>{name} — Skipped</span>
                          ) : (
                            <span style={{ color: 'var(--text-0)' }}>{name} — {(ev.amount_taken ?? 0).toLocaleString()} BETR</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {(canPlay || (isAdmin && game?.is_preview) || isAdmin) && (
                <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                  <h2 className="font-semibold mb-2">Chat</h2>
                  <div className="mb-3 max-h-48 overflow-y-auto space-y-2">
                    {chatMessages.length === 0 && <p className="text-sm" style={{ color: 'var(--text-2)' }}>No messages yet.</p>}
                    {chatMessages.map((m) => (
                      <MessageWithReactions
                        key={m.id}
                        message={m}
                        onReactionClick={(messageId, reaction) => handleReactionClick(messageId, reaction)}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                      placeholder="Message…"
                      className="flex-1 p-2 rounded border text-sm"
                      style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={chatSending || !chatInput.trim()}
                      className="px-3 py-2 rounded text-sm font-medium"
                      style={{
                        background: chatSending ? 'var(--bg-1)' : 'var(--fire-1)',
                        color: chatSending ? 'var(--text-2)' : 'var(--bg-0)',
                        border: 'none',
                        cursor: chatSending ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="mb-6 flex gap-3 flex-wrap">
                  {timerPaused ? (
                    <button
                      onClick={handleUnpause}
                      disabled={unpausing}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{ background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', cursor: unpausing ? 'not-allowed' : 'pointer' }}
                    >
                      {unpausing ? 'Resuming…' : 'Unpause timer'}
                    </button>
                  ) : (
                    <button
                      onClick={handlePause}
                      disabled={pausing}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{ background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--stroke)', cursor: pausing ? 'not-allowed' : 'pointer' }}
                    >
                      {pausing ? 'Pausing…' : 'Pause timer'}
                    </button>
                  )}
                  <button
                    onClick={handleSkip}
                    disabled={skipping}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--stroke)', cursor: skipping ? 'not-allowed' : 'pointer' }}
                  >
                    {skipping ? 'Skipping…' : 'Skip current turn'}
                  </button>
                  <button
                    onClick={handleEnd}
                    disabled={endingGame}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{
                      background: endingGame ? 'var(--bg-1)' : '#dc2626',
                      color: '#fff',
                      border: 'none',
                      cursor: endingGame ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {endingGame ? 'Ending…' : 'End game'}
                  </button>
                </div>
              )}
            </>
          )}

          {game.status === 'settled' && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
              <h2 className="font-semibold mb-2">Game ended</h2>
              <p className="text-sm mb-3" style={{ color: 'var(--text-1)' }}>This game is settled. See results below.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/results"
                  className="inline-block px-4 py-2 rounded-lg font-medium"
                  style={{ background: 'var(--fire-1)', color: 'var(--bg-0)', textDecoration: 'none' }}
                >
                  View Results
                </Link>
                {isAdmin && (
                  <button
                    onClick={handleSettle}
                    disabled={settlingGame}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{
                      background: settlingGame ? 'var(--bg-1)' : '#059669',
                      color: '#fff',
                      border: 'none',
                      cursor: settlingGame ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {settlingGame ? 'Settling…' : 'Settle (record payouts)'}
                  </button>
                )}
              </div>
            </div>
          )}

          {game.status === 'cancelled' && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
              <h2 className="font-semibold mb-2">Game cancelled</h2>
              <p className="text-sm" style={{ color: 'var(--text-1)' }}>This game was cancelled by an admin.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
