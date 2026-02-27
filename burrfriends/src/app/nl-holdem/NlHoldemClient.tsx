'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';
import { PlayingCard } from '~/components/PlayingCard';

type Game = {
  id: string;
  title: string;
  status: string;
  is_preview?: boolean;
  signupFids?: number[];
  starting_stacks?: number;
  max_participants?: number;
  prize_amounts?: number[];
  prize_currency?: string;
  staking_min_amount?: number | null;
  [key: string]: unknown;
};

const NL_HOLDEM_RULES = 'No-Limit Hold\'em Sit & Go. Blinds increase on a schedule. Last player(s) with chips win prizes.';

function formatPrizeAmount(amounts: number[] | undefined, currency: string = 'BETR'): string {
  if (!amounts?.length) return '';
  const parts = amounts.map((a) => (a >= 1_000_000 ? `${a / 1_000_000}M` : a >= 1_000 ? `${a / 1_000}K` : String(a)));
  return parts.join(' / ') + ' ' + currency;
}

export default function NlHoldemClient() {
  const { token, status: authStatus, fid: currentFid } = useAuth();
  const searchParams = useSearchParams();
  const urlGameId = searchParams.get('gameId')?.trim() || null;
  const urlSpectator = searchParams.get('spectator') === '1';

  const [spectatorMode, setSpectatorMode] = useState(urlSpectator);
  const [activeGames, setActiveGames] = useState<Array<{ id: string; title: string; status: string; unreadChatCount?: number }>>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [joinPassword, setJoinPassword] = useState('');
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [chatMessages, setChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [actSubmitting, setActSubmitting] = useState(false);
  const [actAmount, setActAmount] = useState('');
  const [actError, setActError] = useState<string | null>(null);
  const [revealSubmitting, setRevealSubmitting] = useState(false);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null);
  const [blindsRaiseInSec, setBlindsRaiseInSec] = useState<number | null>(null);
  const [handCompleteOverlay, setHandCompleteOverlay] = useState(false);
  const lastAnnouncedHandIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlGameId) setSelectedGameId(urlGameId);
  }, [urlGameId]);
  useEffect(() => {
    if (urlSpectator) setSpectatorMode(true);
  }, [urlSpectator]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        const fetchActive = token
          ? authedFetch('/api/nl-holdem/games/active', { method: 'GET' }, token).then((r) => r.json())
          : fetch('/api/nl-holdem/games/active').then((r) => r.json());
        const [activeRes, statusRes, adminRes] = await Promise.all([
          fetchActive,
          token ? authedFetch('/api/nl-holdem/status', { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve({ ok: false }),
          token ? authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve({ isAdmin: false }),
        ]);
        type GameListItem = { id: string; title: string; status: string; unreadChatCount?: number };
        const fromActive: GameListItem[] = (activeRes?.ok && Array.isArray(activeRes?.data)
          ? activeRes.data
          : []).map((g: { id: string; title?: string; status: string; unreadChatCount?: number }) => ({
            id: g.id,
            title: g.title ?? `Game ${g.id.slice(0, 8)}`,
            status: g.status,
            unreadChatCount: g.unreadChatCount ?? 0,
          }));
        const fromStatus = (statusRes?.ok && Array.isArray(statusRes?.data?.activeGames)
          ? statusRes.data.activeGames
          : []) as Array<{ gameId: string; title?: string; gameStatus: string; unreadChatCount?: number }>;
        const activeIds = new Set(fromActive.map((g) => g.id));
        const merged = [...fromActive];
        for (const g of fromStatus) {
          if (!activeIds.has(g.gameId)) {
            merged.push({
              id: g.gameId,
              title: g.title ?? `Game ${g.gameId.slice(0, 8)}`,
              status: g.gameStatus,
              unreadChatCount: g.unreadChatCount ?? 0,
            });
            activeIds.add(g.gameId);
          }
        }
        setActiveGames(merged);
        if (urlGameId) setSelectedGameId(urlGameId);
        else if (merged.length > 0 && !selectedGameId) setSelectedGameId(merged[0].id);
        if (statusRes?.ok && statusRes?.data) setRegistered(Boolean(statusRes.data.registered));
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
      const spectatorQ = spectatorMode ? '?spectator=1' : '';
      const res = token
        ? await authedFetch(`/api/nl-holdem/games/${selectedGameId}${spectatorQ}`, { method: 'GET' }, token).then((r) => r.json())
        : await fetch(`/api/nl-holdem/games/${selectedGameId}${spectatorQ}`).then((r) => r.json());
      if (res?.ok && res?.data) setGame(res.data);
      else setGame(null);
    } catch (e) {
      console.error('Failed to refresh game:', e);
      setGame(null);
    }
  };

  const currentHandForPoll = game?.status === 'in_progress' ? (game as Record<string, unknown>).currentHand as { actorFid?: number } | null : null;
  const isMyTurn = currentFid != null && currentHandForPoll?.actorFid === currentFid;
  useEffect(() => {
    if (!selectedGameId) return;
    setGame((prev) => (prev?.id === selectedGameId ? prev : null));
    refreshGame();
    const intervalMs = isMyTurn ? 2500 : 10000;
    const id = setInterval(refreshGame, intervalMs);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshGame stable via selectedGameId/token/spectatorMode
  }, [selectedGameId, token, spectatorMode, isMyTurn]);

  useEffect(() => {
    if (!token || !selectedGameId || !game) return;
    if (game.status !== 'open' && game.status !== 'in_progress') return;
    (async () => {
      try {
        const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/chat`, { method: 'GET' }, token);
        const data = await res.json();
        if (res.ok && data?.ok && Array.isArray(data?.data)) setChatMessages(data.data);
      } catch (e) {
        console.error('Failed to load chat:', e);
      }
    })();
  }, [token, selectedGameId, game?.status]);

  const isInGame = game && currentFid && (game.signupFids || []).includes(currentFid);
  const chatVisible = Boolean(
    token &&
    selectedGameId &&
    game &&
    (game.status === 'open' || game.status === 'in_progress') &&
    (isInGame || (spectatorMode && game.status === 'in_progress'))
  );

  const currentHand = game?.status === 'in_progress' ? (game as Record<string, unknown>).currentHand as {
    handId?: string; actorEndsAt?: string | null; actorFid?: number;
    actions?: Array<{ fid: number; actionType: string }>;
    actorSeatIndex?: number;
  } | null : null;
  const actorEndsAt = currentHand && typeof currentHand.actorEndsAt === 'string' ? currentHand.actorEndsAt : null;
  useEffect(() => {
    if (currentHand && currentFid && currentHand.actorFid !== currentFid) setActError(null);
  }, [currentHand?.actorFid, currentFid]);
  const nextBlindRaiseAt = game?.status === 'in_progress' && typeof (game as Record<string, unknown>).nextBlindRaiseAt === 'string' ? (game as Record<string, unknown>).nextBlindRaiseAt as string : null;

  useEffect(() => {
    if (!actorEndsAt) {
      setTurnSecondsLeft(null);
      return;
    }
    const tick = () => {
      const end = new Date(actorEndsAt).getTime();
      const now = Date.now();
      setTurnSecondsLeft(Math.max(0, Math.floor((end - now) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [actorEndsAt, currentHand?.handId]);

  useEffect(() => {
    if (!nextBlindRaiseAt) {
      setBlindsRaiseInSec(null);
      return;
    }
    const tick = () => {
      const end = new Date(nextBlindRaiseAt).getTime();
      const now = Date.now();
      setBlindsRaiseInSec(Math.max(0, Math.floor((end - now) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextBlindRaiseAt]);

  const lastCompletedHand = game?.status === 'in_progress' ? (game as Record<string, unknown>).lastCompletedHand as { handId?: string; handNumber?: number } | null | undefined : null;
  useEffect(() => {
    const handId = lastCompletedHand?.handId;
    if (!handId || lastAnnouncedHandIdRef.current === handId) return;
    lastAnnouncedHandIdRef.current = handId;
    setHandCompleteOverlay(true);
    const t = setTimeout(() => setHandCompleteOverlay(false), 2500);
    return () => clearTimeout(t);
  }, [lastCompletedHand?.handId]);

  useEffect(() => {
    if (!chatVisible || !token || !selectedGameId) return;
    const heartbeat = (inChat: boolean) => {
      authedFetch(`/api/nl-holdem/games/${selectedGameId}/chat/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inChat }),
      }, token).catch((e) => console.error('Heartbeat failed:', e));
    };
    heartbeat(true);
    const interval = setInterval(() => heartbeat(true), 28000);
    return () => {
      clearInterval(interval);
      heartbeat(false);
    };
  }, [chatVisible, token, selectedGameId]);

  useEffect(() => {
    if (!chatVisible || !token || !selectedGameId) return;
    const poll = () => {
      authedFetch(`/api/nl-holdem/games/${selectedGameId}/chat`, { method: 'GET' }, token)
        .then((r) => r.json())
        .then((data) => { if (data?.ok && Array.isArray(data?.data)) setChatMessages(data.data); })
        .catch(() => {});
    };
    const interval = setInterval(poll, 9000);
    return () => clearInterval(interval);
  }, [chatVisible, token, selectedGameId]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedGameId) return;
    setJoinSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: joinPassword.trim() || undefined }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to join');
      await refreshGame();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoinSubmitting(false);
    }
  };

  const handleStart = async () => {
    if (!token || !selectedGameId) return;
    setStartSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/start`, { method: 'POST' }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to start');
      await refreshGame();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setStartSubmitting(false);
    }
  };

  const handleDeal = async () => {
    if (!token || !selectedGameId) return;
    setDealSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/deal`, { method: 'POST' }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to deal');
      await refreshGame();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deal');
    } finally {
      setDealSubmitting(false);
    }
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || !token || !selectedGameId) return;
    setChatSending(true);
    try {
      const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      }, token);
      const data = await res.json();
      if (res.ok && data?.ok) {
        setChatInput('');
        setChatMessages((prev) => [...prev, { id: data.data.id, senderFid: currentFid ?? 0, message: msg, createdAt: data.data.createdAt, sender: { fid: currentFid ?? 0, username: '', display_name: '', pfp_url: '' }, reactions: { thumbs_up: 0, x: 0, fire: 0, scream: 0 }, myReaction: null }]);
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
        `/api/nl-holdem/games/${selectedGameId}/chat/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      const chatRes = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (chatRes?.ok && Array.isArray(chatRes.data)) setChatMessages(chatRes.data);
    } catch (e) {
      console.error('Reaction failed:', e);
    }
  };

  if (loading) {
    return <div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>;
  }

  return (
    <div className="p-4" style={{ maxWidth: '640px', margin: '0 auto' }}>
      <h1 style={{ color: 'var(--text-0)', marginBottom: '16px', fontSize: '1.5rem' }}>NL HOLDEM</h1>

      {activeGames.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: 'var(--text-1)', fontSize: '0.875rem', display: 'block', marginBottom: '6px' }}>Game</label>
          <select
            value={selectedGameId || ''}
            onChange={(e) => setSelectedGameId(e.target.value || null)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '8px', color: 'var(--text-0)' }}
          >
            {activeGames.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} ({g.status}){typeof g.unreadChatCount === 'number' && g.unreadChatCount > 0 ? ` · ${g.unreadChatCount} unread` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {authStatus !== 'loading' && authStatus !== 'authed' && selectedGameId && (
        <p style={{ color: 'var(--text-1)', marginBottom: '12px', fontSize: '0.875rem' }}>Sign in to join or view your games.</p>
      )}

      {error && <p style={{ color: '#ef4444', marginBottom: '12px', fontSize: '0.875rem' }}>{error}</p>}

      {!game && selectedGameId && <p style={{ color: 'var(--text-1)' }}>Game not found.</p>}

      {game && (game.status === 'open' || game.status === 'in_progress') && (
        <p style={{ color: 'var(--text-2)', fontSize: '0.8125rem', marginBottom: '12px' }}>{NL_HOLDEM_RULES}</p>
      )}

      {game && game.status === 'open' && (
        <>
          <div style={{ background: 'var(--bg-2)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid var(--stroke)' }}>
            <p style={{ color: 'var(--text-0)', margin: '0 0 8px 0' }}>{game.title}</p>
            {game.prize_amounts?.length ? (
              <p style={{ color: 'var(--fire-1)', fontSize: '0.875rem', margin: '0 0 4px 0' }}>Prizes: {formatPrizeAmount(game.prize_amounts, game.prize_currency || 'BETR')}</p>
            ) : null}
            {(game.staking_min_amount ?? 0) > 0 && (
              <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', margin: '0 0 4px 0' }}>Requires {game.staking_min_amount} BETR staked to join.</p>
            )}
            <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', margin: 0 }}>
              {(game.signupFids || []).length} / {game.max_participants ?? 9} players · Starting stacks: {game.starting_stacks ?? 1500}
            </p>
            {!registered && (
              <p style={{ color: '#eab308', fontSize: '0.875rem', marginTop: '8px' }}>Register for BETR GAMES first to join.</p>
            )}
            {registered && !isInGame && (
              <form onSubmit={handleJoin} style={{ marginTop: '12px' }}>
                {(game as { hasPassword?: boolean }).hasPassword && (
                  <input type="text" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="Game password" style={{ width: '100%', padding: '8px 10px', marginBottom: '8px', background: 'var(--bg-1)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
                )}
                <button type="submit" disabled={joinSubmitting} style={{ padding: '10px 16px', background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: joinSubmitting ? 'not-allowed' : 'pointer' }}>
                  {joinSubmitting ? 'Joining…' : 'Join game'}
                </button>
              </form>
            )}
            {registered && isInGame && <p style={{ color: 'var(--text-1)', marginTop: '8px' }}>You are in this game. Admin can start when ready.</p>}
            {isAdmin && (
              <button type="button" onClick={handleStart} disabled={startSubmitting || (game.signupFids?.length ?? 0) < 2} style={{ marginTop: '12px', padding: '10px 16px', background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: startSubmitting ? 'not-allowed' : 'pointer' }}>
                {startSubmitting ? 'Starting…' : 'Start game'}
              </button>
            )}
          </div>
        </>
      )}

      {game && game.status === 'in_progress' && (
        <div style={{ background: 'var(--bg-2)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid var(--stroke)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <p style={{ color: 'var(--text-0)', margin: 0 }}>
              {spectatorMode ? 'Spectating · ' : ''}Game in progress.
            </p>
            {token && !isInGame && !spectatorMode && (
              <button
                type="button"
                onClick={() => setSpectatorMode(true)}
                style={{ padding: '8px 14px', background: 'var(--bg-1)', color: 'var(--text-0)', border: '1px solid var(--stroke)', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem' }}
              >
                View as spectator
              </button>
            )}
            {spectatorMode && (
              <button
                type="button"
                onClick={() => setSpectatorMode(false)}
                style={{ padding: '8px 14px', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--stroke)', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                Exit spectator
              </button>
            )}
          </div>
          {(() => {
            const currentHand = (game as Record<string, unknown>).currentHand as {
              handId?: string;
              handNumber?: number;
              pot?: number;
              communityCards?: string[];
              currentStreet?: string;
              currentBet?: number;
              toCall?: number;
              minRaise?: number;
              status?: string;
              holeCards?: string[];
              stacks?: Array<{ seatIndex: number; fid: number; stack: number }>;
              actorFid?: number;
              legalActions?: string[];
              dealerSeatIndex?: number;
              bbSeatIndex?: number;
              actorEndsAt?: string | null;
              preActions?: { fold: boolean; check: boolean };
              myPendingAction?: string | null;
              actions?: Array<{ fid: number; actionType: string }>;
            } | null;
            const smallBlind = typeof (game as Record<string, unknown>).smallBlind === 'number' ? (game as Record<string, unknown>).smallBlind : null;
            const bigBlind = typeof (game as Record<string, unknown>).bigBlind === 'number' ? (game as Record<string, unknown>).bigBlind : null;
            const seats = (game as Record<string, unknown>).seatOrderWithProfiles as Array<{ seat: number; fid: number; display_name: string; pfp_url?: string }> | undefined;
            const lastCompletedHand = (game as Record<string, unknown>).lastCompletedHand as {
              handId?: string;
              handNumber?: number;
              pot?: number;
              communityCards?: string[];
              revealedCardsByFid?: Record<number, string[]>;
            } | null | undefined;
            if (!currentHand) {
              return (
                <>
                  {seats && seats.length > 0 ? (
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: 'var(--text-1)', fontSize: '0.875rem' }}>
                      {seats.map((s) => <li key={s.seat}>Seat {s.seat}: {s.display_name}</li>)}
                    </ul>
                  ) : (
                    <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginTop: '4px' }}>No hand in progress.</p>
                  )}
                  {(isInGame || isAdmin) && (
                    <button type="button" onClick={handleDeal} disabled={dealSubmitting} style={{ marginTop: '12px', padding: '10px 16px', background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: dealSubmitting ? 'not-allowed' : 'pointer' }}>
                      {dealSubmitting ? 'Dealing…' : 'Deal first hand'}
                    </button>
                  )}
                  {lastCompletedHand && lastCompletedHand.handId && (
                    <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
                      <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', margin: '0 0 8px 0' }}>Hand #{lastCompletedHand.handNumber} complete · Pot {lastCompletedHand.pot}</p>
                      {lastCompletedHand.communityCards && lastCompletedHand.communityCards.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {lastCompletedHand.communityCards.map((c) => (
                            <PlayingCard key={c} code={c} size="sm" />
                          ))}
                        </div>
                      )}
                      {lastCompletedHand.revealedCardsByFid && Object.keys(lastCompletedHand.revealedCardsByFid).length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          {seats?.filter((s) => lastCompletedHand.revealedCardsByFid?.[s.fid]).map((s) => (
                            <div key={s.fid} style={{ marginBottom: '4px', fontSize: '0.8rem' }}>
                              <span style={{ color: 'var(--text-2)' }}>{s.display_name}: </span>
                              {(lastCompletedHand.revealedCardsByFid?.[s.fid] ?? []).map((c) => (
                                <PlayingCard key={c} code={c} size="sm" style={{ marginRight: '2px' }} />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      {isInGame && token && currentFid && lastCompletedHand.handId && (
                        lastCompletedHand.revealedCardsByFid?.[currentFid] ? (
                          <p style={{ color: 'var(--text-2)', fontSize: '0.8rem', margin: 0 }}>Your cards revealed</p>
                        ) : (
                          <button
                            type="button"
                            disabled={revealSubmitting}
                            onClick={async () => {
                              if (!token || !selectedGameId || !lastCompletedHand.handId) return;
                              setRevealSubmitting(true);
                              try {
                                const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/hands/${lastCompletedHand.handId}/reveal`, { method: 'POST' }, token);
                                const data = await res.json();
                                if (res.ok && data?.ok) await refreshGame();
                              } finally {
                                setRevealSubmitting(false);
                              }
                            }}
                            style={{ padding: '6px 12px', background: 'var(--bg-1)', color: 'var(--text-0)', border: '1px solid var(--stroke)', borderRadius: '6px', fontSize: '0.8rem', cursor: revealSubmitting ? 'not-allowed' : 'pointer' }}
                          >
                            {revealSubmitting ? 'Revealing…' : 'Show my cards'}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </>
              );
            }
            const stacks = currentHand.stacks ?? [];
            const stackByFid = new Map((currentHand.stacks ?? []).map((s) => [s.fid, s.stack]));
            const N = seats?.length ?? 0;
            const mySeatIndex = currentFid != null && seats ? seats.findIndex((s) => Number(s.fid) === Number(currentFid)) : -1;
            const displayOrder: Array<{ seatIndex: number; seat: number; fid: number; display_name: string; pfp_url?: string; stack: number }> = [];
            if (seats) {
              for (let i = 0; i < seats.length; i++) {
                const s = seats[i];
                const stack = stackByFid.get(s.fid) ?? 0;
                if (i === mySeatIndex) displayOrder.unshift({ seatIndex: i, seat: s.seat, fid: s.fid, display_name: s.display_name, pfp_url: s.pfp_url, stack });
                else displayOrder.push({ seatIndex: i, seat: s.seat, fid: s.fid, display_name: s.display_name, pfp_url: s.pfp_url, stack });
              }
            }
            const dealerSeatIndex = currentHand.dealerSeatIndex ?? 0;
            const bbSeatIndex = currentHand.bbSeatIndex ?? 0;
            const pot = currentHand.pot ?? 0;
            const communityCards = Array.isArray(currentHand.communityCards) ? currentHand.communityCards : [];
            const holeCards = Array.isArray(currentHand.holeCards) ? currentHand.holeCards : [];
            const actorSeatIndex = seats ? seats.findIndex((s) => Number(s.fid) === Number(currentHand.actorFid)) : -1;
            const foldedFids = new Set(
              (currentHand.actions ?? []).filter((a) => String(a.actionType) === 'fold').map((a) => Number(a.fid))
            );

            return (
              <>
                <div style={{ marginTop: '12px', position: 'relative', maxWidth: 'min(420px, calc(100vw - 32px))', marginLeft: 'auto', marginRight: 'auto', paddingBottom: '60px' }}>
                  {handCompleteOverlay && lastCompletedHand?.handNumber != null && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 20,
                        background: 'rgba(0,0,0,0.75)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: 'var(--fire-1)',
                      }}
                    >
                      Hand #{lastCompletedHand.handNumber} complete
                    </div>
                  )}
                  <div style={{ width: '100%', aspectRatio: '1.6', borderRadius: '50%', background: 'linear-gradient(180deg, #0d5c2e 0%, #0a4a25 100%)', border: '4px solid #2d3748', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)' }} />
                  {displayOrder.map((player, idx) => {
                    const angle = N <= 1 ? -90 : -90 + (idx / N) * 360;
                    const rad = (angle * Math.PI) / 180;
                    const cx = 50, cy = 50, rx = 42, ry = 38;
                    const x = cx + rx * Math.cos(rad);
                    const y = cy + ry * Math.sin(rad);
                    const isYou = player.seatIndex === mySeatIndex;
                    const showHoleCards = isYou && holeCards.length > 0;
                    const isDealer = player.seatIndex === dealerSeatIndex;
                    const isBB = player.seatIndex === bbSeatIndex;
                    const isActor = player.seatIndex === actorSeatIndex;
                    const isFolded = foldedFids.has(player.fid);
                    const pfpSize = isYou ? 36 : Math.max(24, 40 - N * 2);
                    const slotMaxWidth = isYou ? 88 : Math.max(56, 100 - N * 6);
                    return (
                      <div
                        key={player.seat}
                        style={{
                          position: 'absolute',
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: 'translate(-50%, -50%)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          marginTop: idx === 0 ? '-8%' : undefined,
                          maxWidth: `${slotMaxWidth}px`,
                          minWidth: isYou ? 64 : undefined,
                          boxShadow: isActor ? '0 0 0 3px var(--fire-1)' : undefined,
                          borderRadius: isActor ? '12px' : undefined,
                          opacity: isFolded ? 0.5 : 1,
                          filter: isFolded ? 'grayscale(0.8)' : undefined,
                          transition: 'opacity 0.2s, filter 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                          {isDealer && <span style={{ background: '#eab308', color: '#1a1a1a', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '10px' }}>D</span>}
                          {isBB && <span style={{ background: 'var(--fire-1)', color: 'var(--bg-0)', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '10px' }}>BB</span>}
                        </div>
                        <img
                          src={player.pfp_url || 'https://i.imgur.com/1Q9yQYp.png'}
                          alt=""
                          style={{ width: `${pfpSize}px`, height: `${pfpSize}px`, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--stroke)', flexShrink: 0 }}
                        />
                        <span style={{ color: 'var(--text-0)', fontSize: isYou ? '0.7rem' : '0.65rem', fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{player.display_name}</span>
                        <span style={{ color: 'var(--fire-1)', fontSize: isYou ? '0.7rem' : '0.65rem' }}>{player.stack}</span>
                        {showHoleCards && (
                          <div style={{ display: 'flex', gap: '2px', marginTop: '2px', flexWrap: 'nowrap' }}>
                            {holeCards.map((c) => (
                              <PlayingCard key={c} code={c} size="sm" />
                            ))}
                          </div>
                        )}
                        {!showHoleCards && N > 1 && (
                          <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
                            <span style={{ background: 'var(--bg-1)', color: 'var(--text-2)', padding: '2px 4px', borderRadius: '4px', fontSize: '0.65rem' }}>??</span>
                            <span style={{ background: 'var(--bg-1)', color: 'var(--text-2)', padding: '2px 4px', borderRadius: '4px', fontSize: '0.65rem' }}>??</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', maxWidth: '90%' }}>
                    <div style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-0)', padding: '6px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Pot {pot}</div>
                    {communityCards.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {communityCards.map((c) => (
                          <PlayingCard key={c} code={c} size="sm" />
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-2)' }}>
                      <span>#{currentHand.handNumber} · {currentHand.currentStreet}</span>
                      {(smallBlind != null && bigBlind != null) && <span>{Number(smallBlind)}/{Number(bigBlind)}</span>}
                      {blindsRaiseInSec != null && <span>Blinds +{Math.floor(blindsRaiseInSec / 60)}:{(blindsRaiseInSec % 60).toString().padStart(2, '0')}</span>}
                      {turnSecondsLeft != null && (
                        <span style={{ color: turnSecondsLeft <= 10 ? '#ef4444' : 'var(--text-0)', fontWeight: 600 }}>
                          {turnSecondsLeft > 30 ? '10s' : `0:${turnSecondsLeft.toString().padStart(2, '0')}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {currentFid && currentHand.actorFid === currentFid && Array.isArray(currentHand.legalActions) && currentHand.legalActions.length > 0 && (
                  <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--stroke)' }}>
                    {actError != null && (
                      <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '8px' }}>{actError}</p>
                    )}
                    <p style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '10px' }}>Your action</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    {currentHand.legalActions.includes('fold') && (
                      <button
                        type="button"
                        disabled={actSubmitting}
                        onClick={async () => {
                          if (!token || !selectedGameId) return;
                          setActSubmitting(true);
                          setActError(null);
                          try {
                            const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/act`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'fold' }),
                            }, token);
                            const data = await res.json();
                            if (res.ok && data?.ok) { setActError(null); await refreshGame(); }
                            else setActError(typeof data?.error === 'string' ? data.error : 'Action failed');
                          } finally {
                            setActSubmitting(false);
                          }
                        }}
                        style={{ padding: '8px 12px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '6px', cursor: actSubmitting ? 'not-allowed' : 'pointer' }}
                      >
                        Fold
                      </button>
                    )}
                    {currentHand.legalActions.includes('check') && (
                      <button
                        type="button"
                        disabled={actSubmitting}
                        onClick={async () => {
                          if (!token || !selectedGameId) return;
                          setActSubmitting(true);
                          setActError(null);
                          try {
                            const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/act`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'check' }),
                            }, token);
                            const data = await res.json();
                            if (res.ok && data?.ok) { setActError(null); await refreshGame(); }
                            else setActError(typeof data?.error === 'string' ? data.error : 'Action failed');
                          } finally {
                            setActSubmitting(false);
                          }
                        }}
                        style={{ padding: '8px 12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: actSubmitting ? 'not-allowed' : 'pointer' }}
                      >
                        Check
                      </button>
                    )}
                    {currentHand.legalActions.includes('call') && (
                      <button
                        type="button"
                        disabled={actSubmitting}
                        onClick={async () => {
                          if (!token || !selectedGameId) return;
                          setActSubmitting(true);
                          setActError(null);
                          try {
                            const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/act`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'call' }),
                            }, token);
                            const data = await res.json();
                            if (res.ok && data?.ok) { setActError(null); await refreshGame(); }
                            else setActError(typeof data?.error === 'string' ? data.error : 'Action failed');
                          } finally {
                            setActSubmitting(false);
                          }
                        }}
                        style={{ padding: '8px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: actSubmitting ? 'not-allowed' : 'pointer' }}
                      >
                        Call {currentHand.toCall != null && currentHand.toCall > 0 ? currentHand.toCall : ''}
                      </button>
                    )}
                    {(currentHand.legalActions.includes('bet') || currentHand.legalActions.includes('raise')) && (() => {
                      const pot = currentHand.pot ?? 0;
                      const myStack = stackByFid.get(currentFid!) ?? 0;
                      const minAmount = currentHand.legalActions.includes('raise') ? ((currentHand.toCall ?? 0) + (currentHand.minRaise ?? 0)) : 1;
                      const shortcuts = [
                        { label: '½ Pot', amount: Math.floor(pot / 2) },
                        { label: 'Pot', amount: pot },
                        { label: '2× Pot', amount: pot * 2 },
                        { label: 'All-in', amount: myStack },
                      ].map(({ label, amount }) => ({ label, amount: Math.max(minAmount, Math.min(amount, myStack)) }));
                      return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          value={actAmount}
                          onChange={(e) => setActAmount(e.target.value)}
                          placeholder={currentHand.legalActions.includes('raise') ? `Min ${minAmount}` : 'Amount'}
                          style={{ width: '72px', padding: '6px 8px', background: 'var(--bg-1)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)', fontSize: '0.875rem' }}
                        />
                        {shortcuts.map(({ label, amount }) => (
                          <button
                            key={label}
                            type="button"
                            disabled={actSubmitting || amount < minAmount || amount > myStack}
                            onClick={() => setActAmount(String(amount))}
                            style={{ padding: '6px 10px', background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--stroke)', borderRadius: '6px', fontSize: '0.75rem', cursor: amount < minAmount || amount > myStack ? 'not-allowed' : 'pointer' }}
                          >
                            {label}
                          </button>
                        ))}
                        {currentHand.legalActions.includes('bet') && (
                          <button
                            type="button"
                            disabled={actSubmitting || !actAmount}
                            onClick={async () => {
                              if (!token || !selectedGameId || !actAmount) return;
                              setActSubmitting(true);
                              setActError(null);
                              try {
                                const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/act`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'bet', amount: Number(actAmount) }),
                                }, token);
                                const data = await res.json();
                                if (res.ok && data?.ok) { setActError(null); setActAmount(''); await refreshGame(); }
                                else setActError(typeof data?.error === 'string' ? data.error : 'Action failed');
                              } finally {
                                setActSubmitting(false);
                              }
                            }}
                            style={{ padding: '8px 12px', background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', borderRadius: '6px', cursor: actSubmitting ? 'not-allowed' : 'pointer' }}
                          >
                            Bet
                          </button>
                        )}
                        {currentHand.legalActions.includes('raise') && (
                          <button
                            type="button"
                            disabled={actSubmitting || !actAmount}
                            onClick={async () => {
                              if (!token || !selectedGameId || !actAmount) return;
                              setActSubmitting(true);
                              setActError(null);
                              try {
                                const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/act`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'raise', amount: Number(actAmount) }),
                                }, token);
                                const data = await res.json();
                                if (res.ok && data?.ok) { setActError(null); setActAmount(''); await refreshGame(); }
                                else setActError(typeof data?.error === 'string' ? data.error : 'Action failed');
                              } finally {
                                setActSubmitting(false);
                              }
                            }}
                            style={{ padding: '8px 12px', background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', borderRadius: '6px', cursor: actSubmitting ? 'not-allowed' : 'pointer' }}
                          >
                            Raise
                          </button>
                        )}
                      </div>
                    );
                    })()}
                    </div>
                  </div>
                )}
                {currentFid && currentHand.actorFid !== currentFid && currentHand.preActions && (
                  <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--stroke)' }}>
                    {actError != null && (
                      <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '8px' }}>{actError}</p>
                    )}
                    <p style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '10px' }}>
                      {currentHand.myPendingAction === 'check' ? 'Pre-action (pending: Check)' : 'Pre-action — act before your turn'}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {currentHand.preActions.fold && (
                        <button
                          type="button"
                          disabled={actSubmitting}
                          onClick={async () => {
                            if (!token || !selectedGameId) return;
                            setActSubmitting(true);
                            setActError(null);
                            try {
                              const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/act`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'fold' }),
                              }, token);
                              const data = await res.json();
                              if (res.ok && data?.ok) { setActError(null); await refreshGame(); }
                              else setActError(typeof data?.error === 'string' ? data.error : 'Action failed');
                            } finally {
                              setActSubmitting(false);
                            }
                          }}
                          style={{ padding: '8px 12px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '6px', cursor: actSubmitting ? 'not-allowed' : 'pointer' }}
                        >
                          Fold
                        </button>
                      )}
                      {currentHand.preActions.check && (
                        <button
                          type="button"
                          disabled={actSubmitting}
                          onClick={async () => {
                            if (!token || !selectedGameId) return;
                            setActSubmitting(true);
                            setActError(null);
                            try {
                              const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/act`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'check' }),
                              }, token);
                              const data = await res.json();
                              if (res.ok && data?.ok) { setActError(null); await refreshGame(); }
                              else setActError(typeof data?.error === 'string' ? data.error : 'Action failed');
                            } finally {
                              setActSubmitting(false);
                            }
                          }}
                          style={{ padding: '8px 12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: actSubmitting ? 'not-allowed' : 'pointer' }}
                        >
                          Check
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {lastCompletedHand && lastCompletedHand.handId && (
                  <div style={{ marginTop: '24px', padding: '12px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
                    <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', margin: '0 0 8px 0' }}>Hand #{lastCompletedHand.handNumber} complete · Pot {lastCompletedHand.pot}</p>
                    {lastCompletedHand.communityCards && lastCompletedHand.communityCards.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {lastCompletedHand.communityCards.map((c) => (
                          <PlayingCard key={c} code={c} size="sm" />
                        ))}
                      </div>
                    )}
                    {lastCompletedHand.revealedCardsByFid && Object.keys(lastCompletedHand.revealedCardsByFid).length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        {seats?.filter((s) => lastCompletedHand.revealedCardsByFid?.[s.fid]).map((s) => (
                          <div key={s.fid} style={{ marginBottom: '4px', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--text-2)' }}>{s.display_name}: </span>
                            {(lastCompletedHand.revealedCardsByFid?.[s.fid] ?? []).map((c) => (
                              <PlayingCard key={c} code={c} size="sm" style={{ marginRight: '2px' }} />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    {isInGame && token && currentFid && lastCompletedHand.handId && (
                      lastCompletedHand.revealedCardsByFid?.[currentFid] ? (
                        <p style={{ color: 'var(--text-2)', fontSize: '0.8rem', margin: 0 }}>Your cards revealed</p>
                      ) : (
                        <button
                          type="button"
                          disabled={revealSubmitting}
                          onClick={async () => {
                            if (!token || !selectedGameId || !lastCompletedHand.handId) return;
                            setRevealSubmitting(true);
                            try {
                              const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/hands/${lastCompletedHand.handId}/reveal`, { method: 'POST' }, token);
                              const data = await res.json();
                              if (res.ok && data?.ok) await refreshGame();
                            } finally {
                              setRevealSubmitting(false);
                            }
                          }}
                          style={{ padding: '6px 12px', background: 'var(--bg-1)', color: 'var(--text-0)', border: '1px solid var(--stroke)', borderRadius: '6px', fontSize: '0.8rem', cursor: revealSubmitting ? 'not-allowed' : 'pointer' }}
                        >
                          {revealSubmitting ? 'Revealing…' : 'Show my cards'}
                        </button>
                      )
                    )}
                  </div>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!token || !selectedGameId) return;
                      try {
                        const res = await authedFetch(`/api/nl-holdem/games/${selectedGameId}/settle`, { method: 'POST' }, token);
                        const data = await res.json();
                        if (res.ok && data?.ok) await refreshGame();
                      } catch (e) {
                        console.error('Settle failed:', e);
                      }
                    }}
                    style={{ marginTop: '12px', padding: '8px 14px', background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Settle game
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {game && chatVisible && (
        <div style={{ background: 'var(--bg-2)', borderRadius: '12px', padding: '16px', border: '1px solid var(--stroke)' }}>
          <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '1rem' }}>
            Chat {spectatorMode && <span style={{ color: 'var(--text-2)', fontSize: '0.8rem', fontWeight: 400 }}>(spectator)</span>}
            {typeof (game as Record<string, unknown>).unreadChatCount === 'number' && Number((game as Record<string, unknown>).unreadChatCount) > 0 && (
              <span style={{ color: '#ef4444', marginLeft: '6px' }}>({Number((game as Record<string, unknown>).unreadChatCount)})</span>
            )}
          </h3>
          <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {chatMessages.length === 0 ? <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>No messages yet.</p> : chatMessages.map((m) => (
              <MessageWithReactions key={m.id} message={m} onReactionClick={(messageId, reaction) => handleReactionClick(messageId, reaction)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} placeholder="Message…" style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            <button type="button" onClick={sendChat} disabled={chatSending} style={{ padding: '8px 14px', background: 'var(--fire-1)', color: 'var(--bg-0)', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: chatSending ? 'not-allowed' : 'pointer' }}>Send</button>
          </div>
        </div>
      )}

      {game && game.status === 'settled' && (
        <div style={{ background: 'var(--bg-2)', borderRadius: '12px', padding: '16px', border: '1px solid var(--stroke)' }}>
          <p style={{ color: 'var(--text-0)', margin: 0 }}>Game ended.</p>
          <Link href="/results" style={{ color: 'var(--fire-1)', marginTop: '8px', display: 'inline-block' }}>View results</Link>
        </div>
      )}

      {!selectedGameId && activeGames.length === 0 && !loading && (
        <p style={{ color: 'var(--text-1)' }}>No active NL HOLDEM games. Check back later or create one from the admin dashboard.</p>
      )}
    </div>
  );
}
