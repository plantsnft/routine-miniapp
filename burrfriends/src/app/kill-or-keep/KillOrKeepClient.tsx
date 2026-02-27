'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';

type Profile = { fid: number; username: string; display_name: string; pfp_url: string };
type ActionRow = {
  sequence: number;
  actor_fid: number;
  action: string;
  target_fid: number;
  actor_display_name: string;
  actor_pfp_url?: string;
  target_display_name: string;
  target_pfp_url?: string;
};
type Game = {
  id: string;
  title: string;
  status: string;
  is_preview?: boolean;
  currentTurnFid: number | null;
  currentTurnEndsAt?: string | null;
  safeFids?: number[];
  turnOrderWithProfiles: Array<{ position: number; fid: number; username: string; display_name: string; pfp_url: string }>;
  remainingWithProfiles: Profile[];
  eliminatedWithProfiles: Profile[];
  actionsWithProfiles: ActionRow[];
  amountByFid: Record<string, number> | null;
};
type StatusData = { registered: boolean; canPlay: boolean; gameId: string | null; gameStatus: string | null; myTurn: boolean; remainingCount: number };
const RULES = 'The starting order was set 1\u201316 by least to most $BETR taken in game #5. In round one, you each will have a choice to keep someone (not yourself) or eliminate someone from the game. You cannot keep yourself. The game ends when 10 or fewer players remain and everyone has had a turn. If there are more than 10 players remaining after round 1 we will start round 2. In this round the order will be random and we will play until 10 players remain. The player whose turn it is will decide to keep or eliminate another player. If they choose to keep then EVERYONE else (including the player who made the choice) will be eligible to be eliminated via Russian Roulette.';

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function KillOrKeepClient() {
  const { token, status: authStatus, fid: currentFid } = useAuth();
  const searchParams = useSearchParams();
  const urlGameId = searchParams.get('gameId')?.trim() || null;

  const [activeGames, setActiveGames] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [orderFidsText, setOrderFidsText] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [tftpGames, setTftpGames] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [selectedTftpGameId, setSelectedTftpGameId] = useState<string | null>(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [rouletteSubmitting, setRouletteSubmitting] = useState(false);
  const [randomizeSubmitting, setRandomizeSubmitting] = useState(false);
  const [skipSubmitting, setSkipSubmitting] = useState(false);
  const [endSubmitting, setEndSubmitting] = useState(false);
  const [chatMessages, setChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [actionTargetFid, setActionTargetFid] = useState<number | null>(null);
  const [actionType, setActionType] = useState<'keep' | 'kill'>('keep');

  // Timer
  const [turnTimerRemainingMs, setTurnTimerRemainingMs] = useState<number | null>(null);
  const refetchedAtZeroRef = useRef<string | null>(null);

  // Roulette result modal
  const [rouletteResult, setRouletteResult] = useState<{ fid: number; display_name: string; pfp_url: string } | null>(null);

  // Customize order panel
  const [customizeOrderVisible, setCustomizeOrderVisible] = useState(false);
  const [customOrderItems, setCustomOrderItems] = useState<Array<{ fid: number; display_name: string }>>([]);
  const [customizeSubmitting, setCustomizeSubmitting] = useState(false);

  useEffect(() => {
    if (urlGameId) setSelectedGameId(urlGameId);
  }, [urlGameId]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        const [activeRes, statusRes, adminRes] = await Promise.all([
          fetch('/api/kill-or-keep/games/active').then((r) => r.json()),
          token ? authedFetch('/api/kill-or-keep/status', { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve({ ok: false }),
          token ? authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve({ isAdmin: false }),
        ]);
        if (activeRes?.ok && Array.isArray(activeRes?.data)) {
          setActiveGames(activeRes.data);
          if (urlGameId) setSelectedGameId(urlGameId);
          else if (activeRes.data.length > 0 && !selectedGameId) setSelectedGameId(activeRes.data[0].id);
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

  const refreshGame = async () => {
    if (!selectedGameId) return;
    try {
      const res = await fetch(`/api/kill-or-keep/games/${selectedGameId}`).then((r) => r.json());
      if (res?.ok && res?.data) setGame(res.data);
    } catch (e) {
      console.error('Failed to refresh game:', e);
    }
  };

  useEffect(() => {
    if (!selectedGameId) return;
    setGame((prev) => (prev?.id === selectedGameId ? prev : null));
    refreshGame();
    const interval = setInterval(refreshGame, 8000);
    return () => clearInterval(interval);
  }, [selectedGameId]);

  useEffect(() => {
    if (game?.status === 'open' && isAdmin) {
      fetch('/api/take-from-the-pile/games').then((r) => r.json()).then((res) => {
        if (res?.ok && Array.isArray(res?.data)) {
          const settled = (res.data as Array<{ id: string; title: string; status: string }>).filter((g) => g.status === 'settled');
          setTftpGames(settled);
        }
      }).catch(() => {});
    }
  }, [game?.status, isAdmin]);

  useEffect(() => {
    if (!token || !selectedGameId || !game) return;
    if (game.status !== 'open' && game.status !== 'in_progress') return;
    (async () => {
      try {
        const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && Array.isArray(res?.data)) setChatMessages(res.data);
      } catch (e) {
        console.error('Chat load failed:', e);
      }
    })();
    const interval = setInterval(async () => {
      try {
        const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && Array.isArray(res?.data)) setChatMessages(res.data);
      } catch {}
    }, 8000);
    return () => clearInterval(interval);
  }, [token, selectedGameId, game?.status]);

  // 60-minute turn countdown timer
  useEffect(() => {
    if (game?.status !== 'in_progress') {
      setTurnTimerRemainingMs(null);
      refetchedAtZeroRef.current = null;
      return;
    }
    const endsAt = game?.currentTurnEndsAt;
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
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [game?.status, game?.currentTurnEndsAt]);

  const handleSetOrder = async () => {
    const fids = orderFidsText.split(/[\n,]/).map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
    if (!token || !selectedGameId || fids.length === 0) return;
    setOrderSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnOrderFids: fids }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await refreshGame();
      } else setError(data.error || 'Failed to set order');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set order');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleImportFromTftp = async () => {
    if (!token || !selectedGameId || !selectedTftpGameId) return;
    setImportSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tftpGameId: selectedTftpGameId }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await refreshGame();
      } else setError(data.error || 'Failed to import order');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import order');
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleStart = async () => {
    if (!token || !selectedGameId) return;
    setStartSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/start`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await refreshGame();
      } else setError(data.error || 'Failed to start');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setStartSubmitting(false);
    }
  };

  const handleAction = async () => {
    if (!token || !selectedGameId || actionTargetFid == null) return;
    setActionSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, targetFid: actionTargetFid }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setActionTargetFid(null);
        await refreshGame();
      } else setError(data.error || 'Failed to submit');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleRoulette = async () => {
    if (!token || !selectedGameId) return;
    // Capture pre-roulette remaining list for result modal
    const preRouletteRemaining = game?.remainingWithProfiles ?? [];
    setRouletteSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/roulette`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        const eliminatedFid = data.data?.eliminatedFid;
        if (eliminatedFid != null) {
          const profile = preRouletteRemaining.find((p) => p.fid === eliminatedFid);
          if (profile) setRouletteResult(profile);
        }
        await refreshGame();
      } else setError(data.error || 'Failed to run roulette');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run roulette');
    } finally {
      setRouletteSubmitting(false);
    }
  };

  const handleRandomizeOrder = async () => {
    if (!token || !selectedGameId) return;
    setRandomizeSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/order/randomize`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await refreshGame();
      } else setError(data.error || 'Failed to randomize order');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to randomize order');
    } finally {
      setRandomizeSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!token || !selectedGameId) return;
    setSkipSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/skip`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await refreshGame();
      } else setError(data.error || 'Failed to skip player');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to skip player');
    } finally {
      setSkipSubmitting(false);
    }
  };

  const initCustomizeOrder = () => {
    if (!game) return;
    const remainingFidSet = new Set((game.remainingWithProfiles || []).map((p) => p.fid));
    const items = (game.turnOrderWithProfiles || [])
      .filter((p) => remainingFidSet.has(p.fid))
      .map((p) => ({ fid: p.fid, display_name: p.display_name }));
    setCustomOrderItems(items);
    setCustomizeOrderVisible(true);
  };

  const moveCustomOrderItem = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= customOrderItems.length) return;
    const updated = [...customOrderItems];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setCustomOrderItems(updated);
  };

  const handleCustomizeOrder = async () => {
    if (!token || !selectedGameId || customOrderItems.length === 0) return;
    setCustomizeSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/order/customize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnOrderFids: customOrderItems.map((p) => p.fid) }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setCustomizeOrderVisible(false);
        await refreshGame();
      } else setError(data.error || 'Failed to customize order');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to customize order');
    } finally {
      setCustomizeSubmitting(false);
    }
  };

  const handleEnd = async () => {
    if (!token || !selectedGameId) return;
    setEndSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/end`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await refreshGame();
      } else setError(data.error || 'Failed to end');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end');
    } finally {
      setEndSubmitting(false);
    }
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!token || !selectedGameId || !text) return;
    setChatSending(true);
    try {
      const res = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setChatInput('');
        const chatRes = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
        if (chatRes?.ok && Array.isArray(chatRes.data)) setChatMessages(chatRes.data);
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
        `/api/kill-or-keep/games/${selectedGameId}/chat/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      const chatRes = await authedFetch(`/api/kill-or-keep/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (chatRes?.ok && Array.isArray(chatRes.data)) setChatMessages(chatRes.data);
    } catch (e) {
      console.error('Reaction failed:', e);
    }
  };

  if (loading) {
    return (
      <div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>
    );
  }

  const canPlay = statusData?.canPlay ?? false;
  const myTurn = statusData?.myTurn ?? false;

  // Turn order strip: remaining players in upcoming turn order
  const remainingFidSet = new Set((game?.remainingWithProfiles || []).map((p) => p.fid));
  const upcomingTurnOrder = (game?.turnOrderWithProfiles || []).filter((p) => remainingFidSet.has(p.fid));

  return (
    <div className="p-4 max-w-2xl mx-auto" style={{ color: 'var(--text-0)' }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>← Back</Link>

      {/* Hero images */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <Image src="/keeporkill.png" alt="KILL OR KEEP" width={400} height={400} style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px' }} priority />
      </div>
      <div style={{ textAlign: 'center' }}>
        <h1 className="text-xl font-semibold mb-2">KILL OR KEEP</h1>
        <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>{RULES}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <div style={{ borderRadius: '16px', boxShadow: '0 0 24px #14B8A6, 0 0 60px rgba(20,184,166,0.4)', overflow: 'hidden', display: 'inline-block' }}>
          <Image src="/takepileresult.png" alt="Take from the Pile Results" width={240} height={240} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>{error}</div>
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
              <option key={g.id} value={g.id}>{g.title || 'KILL OR KEEP'} — {g.status === 'in_progress' ? 'In progress' : 'Open'}</option>
            ))}
          </select>
        </div>
      )}

      {!selectedGameId && activeGames.length === 0 && (
        <p style={{ color: 'var(--text-1)' }}>No active KILL OR KEEP game. Admins can create one from the dashboard.</p>
      )}

      {selectedGameId && game && (
        <>
          {game.status === 'open' && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
              <h2 className="font-semibold mb-2">Game open</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>{RULES}</p>
              {isAdmin && (
                <>
                  <div className="mb-4">
                    <label className="text-sm block mb-1" style={{ color: 'var(--text-1)' }}>Import order from Take from the Pile</label>
                    <div className="flex gap-2 flex-wrap items-center">
                      <select
                        value={selectedTftpGameId ?? ''}
                        onChange={(e) => setSelectedTftpGameId(e.target.value || null)}
                        className="p-2 rounded-lg border flex-1 min-w-0 max-w-md"
                        style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
                      >
                        <option value="">Select a settled TFTP game</option>
                        {tftpGames.map((g) => (
                          <option key={g.id} value={g.id}>{g.title || 'TAKE FROM THE PILE'} — {g.id.slice(0, 8)}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleImportFromTftp}
                        disabled={importSubmitting || !selectedTftpGameId}
                        className="px-4 py-2 rounded-lg font-medium"
                        style={{ background: importSubmitting || !selectedTftpGameId ? 'var(--bg-1)' : '#14B8A6', color: importSubmitting || !selectedTftpGameId ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: importSubmitting || !selectedTftpGameId ? 'not-allowed' : 'pointer' }}
                      >
                        {importSubmitting ? 'Importing…' : 'Import order'}
                      </button>
                    </div>
                  </div>
                  <label className="text-sm block mb-1" style={{ color: 'var(--text-1)' }}>Turn order (FIDs, one per line or comma-separated)</label>
                  <textarea
                    value={orderFidsText}
                    onChange={(e) => setOrderFidsText(e.target.value)}
                    placeholder="e.g. 123&#10;456&#10;789"
                    rows={4}
                    className="w-full p-2 rounded-lg border mb-2"
                    style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={handleSetOrder}
                      disabled={orderSubmitting}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{ background: orderSubmitting ? 'var(--bg-1)' : 'var(--fire-1)', color: orderSubmitting ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: orderSubmitting ? 'not-allowed' : 'pointer' }}
                    >
                      {orderSubmitting ? 'Saving…' : 'Set order'}
                    </button>
                    <button
                      onClick={handleStart}
                      disabled={startSubmitting || (game.turnOrderWithProfiles?.length ?? 0) === 0}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{ background: startSubmitting ? 'var(--bg-1)' : '#14B8A6', color: startSubmitting ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: startSubmitting ? 'not-allowed' : 'pointer' }}
                    >
                      {startSubmitting ? 'Starting…' : 'Start game'}
                    </button>
                  </div>
                  {game.turnOrderWithProfiles?.length === 0 && (
                    <p className="text-sm mt-2" style={{ color: 'var(--text-2)' }}>Set order before starting.</p>
                  )}
                </>
              )}
            </div>
          )}

          {game.status === 'in_progress' && (
            <>
              {/* Timer + current turn */}
              <div className="mb-4 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <strong>Remaining: {game.remainingWithProfiles?.length ?? 0}</strong>
                  {game.currentTurnFid != null && (
                    <span style={{ color: 'var(--fire-1)', fontSize: '0.9rem' }}>
                      {game.currentTurnFid === currentFid
                        ? "It's your turn!"
                        : `Turn: ${upcomingTurnOrder.find((p) => p.fid === game.currentTurnFid)?.display_name ?? `FID ${game.currentTurnFid}`}`}
                    </span>
                  )}
                </div>
                {game.currentTurnEndsAt && (
                  <div
                    style={{
                      fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                      fontWeight: 700,
                      color: 'var(--fire-1)',
                      textShadow: '0 0 8px var(--fire-1), 0 0 16px var(--fire-1)',
                      lineHeight: 1,
                    }}
                  >
                    {turnTimerRemainingMs !== null && turnTimerRemainingMs > 0
                      ? formatCountdown(turnTimerRemainingMs)
                      : '0:00'}
                  </div>
                )}
                {turnTimerRemainingMs === 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>Time's up — advancing soon…</p>
                )}
              </div>

              {/* Chat */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Chat</h3>
                <div className="mb-2 max-h-48 overflow-y-auto rounded-lg border p-2" style={{ background: 'var(--bg-2)', borderColor: 'var(--stroke)' }}>
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
                    placeholder="Message"
                    className="flex-1 p-2 rounded-lg border"
                    style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={chatSending || !chatInput.trim()}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ background: chatSending || !chatInput.trim() ? 'var(--bg-1)' : 'var(--fire-1)', color: chatSending || !chatInput.trim() ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: chatSending || !chatInput.trim() ? 'not-allowed' : 'pointer' }}
                  >
                    Send
                  </button>
                </div>
              </div>

              {game.actionsWithProfiles && game.actionsWithProfiles.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Activity</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {game.actionsWithProfiles.map((a) => (
                      <div key={a.sequence} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '4px 0' }}>
                        {a.action === 'roulette' ? (
                          <>
                            {a.target_pfp_url && <img src={a.target_pfp_url} alt="" width={20} height={20} style={{ borderRadius: '50%', flexShrink: 0 }} />}
                            <span><strong>{a.target_display_name}</strong> <span style={{ color: 'var(--fire-1)' }}>eliminated by Russian Roulette</span></span>
                          </>
                        ) : a.action === 'skip' ? (
                          <>
                            {a.target_pfp_url && <img src={a.target_pfp_url} alt="" width={20} height={20} style={{ borderRadius: '50%', flexShrink: 0 }} />}
                            <span style={{ color: 'var(--text-2)' }}><strong style={{ color: 'var(--text-1)' }}>{a.target_display_name}</strong> was skipped</span>
                          </>
                        ) : (
                          <>
                            {a.actor_pfp_url && <img src={a.actor_pfp_url} alt="" width={20} height={20} style={{ borderRadius: '50%', flexShrink: 0 }} />}
                            <span>
                              <strong>{a.actor_display_name}</strong>
                              {a.action === 'kill'
                                ? <span style={{ color: 'var(--fire-1)' }}> killed </span>
                                : <span style={{ color: '#14B8A6' }}> kept </span>}
                              {a.target_pfp_url && <img src={a.target_pfp_url} alt="" width={16} height={16} style={{ borderRadius: '50%', display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />}
                              <strong>{a.target_display_name}</strong>
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Turn order strip */}
              {upcomingTurnOrder.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2 text-sm" style={{ color: 'var(--text-1)' }}>Turn Order</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {upcomingTurnOrder.map((p, idx) => (
                      <div
                        key={p.fid}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          background: p.fid === game.currentTurnFid ? 'rgba(239,68,68,0.12)' : 'var(--bg-2)',
                          border: p.fid === game.currentTurnFid ? '1px solid var(--fire-1)' : '1px solid var(--stroke)',
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)', minWidth: '20px' }}>#{idx + 1}</span>
                        {p.pfp_url && <img src={p.pfp_url} alt="" width={20} height={20} style={{ borderRadius: '50%' }} />}
                        <span style={{ fontSize: '0.875rem' }}>{p.display_name}</span>
                        {game.safeFids?.includes(p.fid) && (
                          <span style={{ fontSize: '0.7rem', color: '#14B8A6', fontWeight: 600 }}>Safe</span>
                        )}
                        {p.fid === game.currentTurnFid && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--fire-1)', marginLeft: 'auto', fontWeight: 600 }}>NOW</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <h3 className="font-semibold mb-2">Remaining</h3>
                <div className="flex flex-wrap gap-2">
                  {game.remainingWithProfiles?.map((p) => (
                    <button
                      key={p.fid}
                      type="button"
                      onClick={() => openFarcasterProfile(p.fid, p.username)}
                      className="flex items-center gap-2 px-2 py-1 rounded-lg"
                      style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)', color: 'var(--text-0)', cursor: 'pointer' }}
                    >
                      {p.pfp_url ? <img src={p.pfp_url} alt="" width={24} height={24} style={{ borderRadius: '50%' }} /> : null}
                      <span>{p.display_name}</span>
                      {game.safeFids?.includes(p.fid) && (
                        <span style={{ fontSize: '0.7rem', color: '#14B8A6', fontWeight: 600 }}>Safe</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {(canPlay || (isAdmin && game?.is_preview)) && myTurn && game.remainingWithProfiles && game.remainingWithProfiles.length > 0 && (
                <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                  <h2 className="font-semibold mb-2">Your move</h2>
                  <p className="text-sm mb-2" style={{ color: 'var(--text-1)' }}>Keep or kill one player (not yourself).</p>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setActionType('keep')}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: actionType === 'keep' ? '2px solid #14B8A6' : '1px solid var(--stroke)', background: actionType === 'keep' ? 'rgba(20,184,166,0.2)' : 'var(--bg-1)', color: 'var(--text-0)', cursor: 'pointer' }}
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionType('kill')}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: actionType === 'kill' ? '2px solid #ef4444' : '1px solid var(--stroke)', background: actionType === 'kill' ? 'rgba(239,68,68,0.2)' : 'var(--bg-1)', color: 'var(--text-0)', cursor: 'pointer' }}
                    >
                      Kill
                    </button>
                  </div>
                  <select
                    value={actionTargetFid ?? ''}
                    onChange={(e) => setActionTargetFid(e.target.value ? Number(e.target.value) : null)}
                    className="w-full p-2 rounded-lg border mb-2"
                    style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
                  >
                    <option value="">Select player</option>
                    {game.remainingWithProfiles
                      .filter((p) => p.fid !== currentFid && !game.safeFids?.includes(p.fid))
                      .map((p) => (
                        <option key={p.fid} value={p.fid}>{p.display_name} (@{p.username})</option>
                      ))}
                  </select>
                  <button
                    onClick={handleAction}
                    disabled={actionSubmitting || actionTargetFid == null}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ background: actionSubmitting || actionTargetFid == null ? 'var(--bg-1)' : 'var(--fire-1)', color: actionSubmitting || actionTargetFid == null ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: actionSubmitting || actionTargetFid == null ? 'not-allowed' : 'pointer' }}
                  >
                    {actionSubmitting ? 'Submitting…' : `Submit ${actionType}`}
                  </button>
                </div>
              )}

              {isAdmin && (
                <div className="mb-4 flex gap-2 flex-wrap">
                  <button
                    onClick={handleRandomizeOrder}
                    disabled={randomizeSubmitting}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ background: randomizeSubmitting ? 'var(--bg-1)' : '#14B8A6', color: randomizeSubmitting ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: randomizeSubmitting ? 'not-allowed' : 'pointer' }}
                  >
                    {randomizeSubmitting ? 'Shuffling…' : 'Randomize order'}
                  </button>
                  <button
                    onClick={initCustomizeOrder}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ background: '#14B8A6', color: 'var(--bg-0)', border: 'none', cursor: 'pointer' }}
                  >
                    Customize order
                  </button>
                  <button
                    onClick={handleSkip}
                    disabled={skipSubmitting}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ background: skipSubmitting ? 'var(--bg-1)' : 'var(--fire-1)', color: skipSubmitting ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: skipSubmitting ? 'not-allowed' : 'pointer' }}
                  >
                    {skipSubmitting ? 'Skipping…' : 'Skip player'}
                  </button>
                  {game.remainingWithProfiles && game.remainingWithProfiles.length > 10 && (
                    <button
                      onClick={handleRoulette}
                      disabled={rouletteSubmitting}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{ background: rouletteSubmitting ? 'var(--bg-1)' : '#14B8A6', color: rouletteSubmitting ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: rouletteSubmitting ? 'not-allowed' : 'pointer' }}
                    >
                      {rouletteSubmitting ? 'Running…' : 'Russian Roulette'}
                    </button>
                  )}
                  <button
                    onClick={handleEnd}
                    disabled={endSubmitting}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ background: endSubmitting ? 'var(--bg-1)' : 'var(--text-2)', color: 'var(--bg-0)', border: 'none', cursor: endSubmitting ? 'not-allowed' : 'pointer' }}
                  >
                    {endSubmitting ? 'Ending…' : 'End game'}
                  </button>
                </div>
              )}

            </>
          )}

          {game.status === 'settled' && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
              <h2 className="font-semibold mb-2">Final 10</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {game.remainingWithProfiles?.map((p) => (
                  <button
                    key={p.fid}
                    type="button"
                    onClick={() => openFarcasterProfile(p.fid, p.username)}
                    className="flex items-center gap-2 px-2 py-1 rounded-lg"
                    style={{ background: 'var(--bg-1)', border: '1px solid var(--stroke)', color: 'var(--text-0)', cursor: 'pointer' }}
                  >
                    {p.pfp_url ? <img src={p.pfp_url} alt="" width={24} height={24} style={{ borderRadius: '50%' }} /> : null}
                    <span>{p.display_name}</span>
                  </button>
                ))}
              </div>
              <Link href="/results" className="text-sm" style={{ color: 'var(--fire-1)' }}>View Results</Link>
            </div>
          )}

          {game.status === 'open' && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">Chat</h3>
              <div className="mb-2 max-h-48 overflow-y-auto rounded-lg border p-2" style={{ background: 'var(--bg-2)', borderColor: 'var(--stroke)' }}>
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
                  placeholder="Message"
                  className="flex-1 p-2 rounded-lg border"
                  style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
                />
                <button
                  onClick={handleSendChat}
                  disabled={chatSending || !chatInput.trim()}
                  className="px-4 py-2 rounded-lg font-medium"
                  style={{ background: chatSending || !chatInput.trim() ? 'var(--bg-1)' : 'var(--fire-1)', color: chatSending || !chatInput.trim() ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: chatSending || !chatInput.trim() ? 'not-allowed' : 'pointer' }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Customize order modal */}
      {customizeOrderVisible && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setCustomizeOrderVisible(false)}
        >
          <div
            style={{ background: 'var(--bg-1)', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '360px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold mb-1" style={{ fontSize: '1rem' }}>Customize Turn Order</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-2)' }}>Use ↑↓ to reorder. Player #1 goes next.</p>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
              {customOrderItems.map((item, idx) => (
                <div key={item.fid} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', minWidth: '24px', fontWeight: 700 }}>#{idx + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.875rem' }}>{item.display_name}</span>
                  <button
                    type="button"
                    onClick={() => moveCustomOrderItem(idx, -1)}
                    disabled={idx === 0}
                    style={{ padding: '4px 8px', background: idx === 0 ? 'var(--bg-1)' : 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: idx === 0 ? 'var(--text-2)' : 'var(--text-0)', cursor: idx === 0 ? 'default' : 'pointer', fontSize: '0.875rem', lineHeight: 1 }}
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveCustomOrderItem(idx, 1)}
                    disabled={idx === customOrderItems.length - 1}
                    style={{ padding: '4px 8px', background: idx === customOrderItems.length - 1 ? 'var(--bg-1)' : 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: idx === customOrderItems.length - 1 ? 'var(--text-2)' : 'var(--text-0)', cursor: idx === customOrderItems.length - 1 ? 'default' : 'pointer', fontSize: '0.875rem', lineHeight: 1 }}
                  >↓</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleCustomizeOrder}
                disabled={customizeSubmitting}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: customizeSubmitting ? 'var(--bg-2)' : '#14B8A6', color: customizeSubmitting ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', cursor: customizeSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                {customizeSubmitting ? 'Saving…' : 'Save order'}
              </button>
              <button
                onClick={() => setCustomizeOrderVisible(false)}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--stroke)', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Russian Roulette result modal */}
      {rouletteResult && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setRouletteResult(null)}
        >
          <div
            style={{ background: 'var(--bg-1)', borderRadius: '16px', padding: '32px 24px', textAlign: 'center', maxWidth: '300px', width: '90%', boxShadow: '0 0 40px rgba(239,68,68,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {rouletteResult.pfp_url && (
              <img
                src={rouletteResult.pfp_url}
                alt={rouletteResult.display_name}
                style={{ width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 12px', display: 'block', border: '3px solid var(--fire-1)' }}
              />
            )}
            <p className="font-bold text-lg mb-1">{rouletteResult.display_name}</p>
            <p style={{ color: 'var(--fire-1)', fontWeight: 700, fontSize: '1.1rem', textShadow: '0 0 8px var(--fire-1)', marginBottom: '20px' }}>
              ELIMINATED by Russian Roulette
            </p>
            <button
              onClick={() => setRouletteResult(null)}
              style={{ background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', borderRadius: '8px', padding: '8px 24px', fontWeight: 600, cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
