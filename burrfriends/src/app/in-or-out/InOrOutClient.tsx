'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';
import { formatRelativeTime } from '~/lib/utils';

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

type Game = {
  id: string;
  title: string;
  status: string;
  is_preview?: boolean;
  created_at?: string;
  room_timer_ends_at?: string | null;
  quitterCount?: number;
  amountPerQuitter?: number;
  eligibleCount?: number;
};

type StatusData = {
  registered: boolean;
  canPlay: boolean;
  gameId: string | null;
  gameStatus: string | null;
  myChoice: 'quit' | 'stay' | null;
};

type AlivePlayer = { fid: number; username: string; display_name: string; pfp_url: string };

type AdminChoice = { fid: number; choice: string; updated_at: string };

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function InOrOutClient() {
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

  const [roomTimerRemainingMs, setRoomTimerRemainingMs] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  const [choiceSubmitting, setChoiceSubmitting] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [showAdminChoicesModal, setShowAdminChoicesModal] = useState(false);
  const [adminChoices, setAdminChoices] = useState<{ choices: AdminChoice[]; quitterCount: number; amountPerQuitter: number } | null>(null);
  const [alivePlayers, setAlivePlayers] = useState<AlivePlayer[] | null>(null);
  const [showRemainingModal, setShowRemainingModal] = useState(false);
  const [remainingPlayers, setRemainingPlayers] = useState<AlivePlayer[] | null>(null);
  const [showRoomTimerModal, setShowRoomTimerModal] = useState(false);
  const [roomTimerMinutes, setRoomTimerMinutes] = useState('60');
  const [roomTimerSubmitting, setRoomTimerSubmitting] = useState(false);

  useEffect(() => {
    if (urlGameId) setSelectedGameId(urlGameId);
  }, [urlGameId]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        const [activeRes, statusRes, adminRes] = await Promise.all([
          fetch('/api/in-or-out/games/active').then((r) => r.json()),
          token ? authedFetch('/api/in-or-out/status', { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve({ ok: false }),
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
        const res = await fetch(`/api/in-or-out/games/${selectedGameId}`).then((r) => r.json());
        if (res?.ok && res?.data) setGame(res.data);
      } catch (e) {
        console.error('Failed to load game:', e);
      }
    })();
  }, [selectedGameId]);

  useEffect(() => {
    if (game?.status !== 'in_progress') {
      setRoomTimerRemainingMs(null);
      return;
    }
    const endsAt = game?.room_timer_ends_at;
    if (!endsAt) {
      setRoomTimerRemainingMs(0);
      return;
    }
    const update = () => {
      const remaining = new Date(endsAt).getTime() - Date.now();
      setRoomTimerRemainingMs(remaining <= 0 ? 0 : remaining);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [game?.status, game?.room_timer_ends_at]);

  const loadChat = async () => {
    if (!token || !selectedGameId) return;
    try {
      const res = await authedFetch(`/api/in-or-out/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
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
    if (!showAdminChoicesModal || !selectedGameId || !token) return;
    const interval = setInterval(loadAdminChoices, 5000);
    return () => clearInterval(interval);
  }, [showAdminChoicesModal, selectedGameId, token]);

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!token || !selectedGameId || !text) return;
    setChatSending(true);
    try {
      const res = await authedFetch(`/api/in-or-out/games/${selectedGameId}/chat`, {
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
        `/api/in-or-out/games/${selectedGameId}/chat/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      const chatRes = await authedFetch(`/api/in-or-out/games/${selectedGameId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (chatRes?.ok && Array.isArray(chatRes.data)) setChatMessages(chatRes.data);
    } catch (e) {
      console.error('Reaction failed:', e);
    }
  };

  const handleChoice = async (choice: 'quit' | 'stay') => {
    if (!token || !selectedGameId) return;
    setChoiceSubmitting(true);
    try {
      const res = await authedFetch(`/api/in-or-out/games/${selectedGameId}/choice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setError(null);
        setStatusData((prev) => prev ? { ...prev, myChoice: choice } : null);
        const gameRes = await fetch(`/api/in-or-out/games/${selectedGameId}`).then((r) => r.json());
        if (gameRes?.ok && gameRes?.data) setGame(gameRes.data);
      } else {
        setError(data.error || 'Failed to submit choice');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit choice');
    } finally {
      setChoiceSubmitting(false);
    }
  };

  const handleStartGame = async () => {
    if (!token || !selectedGameId) return;
    setStartingGame(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/in-or-out/games/${selectedGameId}/start`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        const gameRes = await fetch(`/api/in-or-out/games/${selectedGameId}`).then((r) => r.json());
        if (gameRes?.ok && gameRes?.data) setGame(gameRes.data);
        const statusRes = await authedFetch('/api/in-or-out/status', { method: 'GET' }, token).then((r) => r.json());
        if (statusRes?.ok && statusRes?.data) setStatusData(statusRes.data);
      } else {
        setError(data.error || 'Failed to start game');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start game');
    } finally {
      setStartingGame(false);
    }
  };

  const handleEndGame = async () => {
    if (!token || !selectedGameId) return;
    setEndingGame(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/in-or-out/games/${selectedGameId}/end`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setGame((prev) => prev ? { ...prev, status: 'settled' } : null);
      } else {
        setError(data.error || 'Failed to end game');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end game');
    } finally {
      setEndingGame(false);
    }
  };

  const loadAdminChoices = async () => {
    if (!token || !selectedGameId) return;
    try {
      const res = await authedFetch(`/api/in-or-out/games/${selectedGameId}/choices`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && res?.data) setAdminChoices(res.data);
    } catch (e) {
      console.error('Failed to load choices:', e);
    }
  };

  const loadAlivePlayers = async () => {
    if (!token) return;
    try {
      const res = await authedFetch('/api/betr-games/tournament/alive', { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && res?.data?.players) setAlivePlayers(res.data.players);
      else setAlivePlayers([]);
    } catch (e) {
      console.error('Failed to load alive players:', e);
      setAlivePlayers([]);
    }
  };

  const loadRemainingPlayers = async () => {
    if (!token) return;
    try {
      const res = await authedFetch('/api/betr-games/tournament/alive', { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && res?.data?.players) setRemainingPlayers(res.data.players);
      else setRemainingPlayers([]);
    } catch (e) {
      console.error('Failed to load remaining players:', e);
      setRemainingPlayers([]);
    }
  };

  const handleOpenAdminChoices = async () => {
    setShowAdminChoicesModal(true);
    setAdminChoices(null);
    setAlivePlayers(null);
    await Promise.all([loadAdminChoices(), loadAlivePlayers()]);
  };

  const handleOpenRemaining = () => {
    setShowRemainingModal(true);
    setRemainingPlayers(null);
    loadRemainingPlayers();
  };

  const handleSetRoomTimer = async () => {
    const minutes = parseInt(roomTimerMinutes, 10);
    if (!token || !selectedGameId || !Number.isFinite(minutes) || minutes < 1) return;
    setRoomTimerSubmitting(true);
    try {
      const res = await authedFetch(`/api/in-or-out/games/${selectedGameId}/room-timer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok && data.data?.room_timer_ends_at) {
        setGame((prev) => prev ? { ...prev, room_timer_ends_at: data.data.room_timer_ends_at } : null);
        setShowRoomTimerModal(false);
      }
    } catch (e) {
      console.error('Set room timer failed:', e);
    } finally {
      setRoomTimerSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4" style={{ color: 'var(--text-0)' }}>
        Loading…
      </div>
    );
  }

  const registered = statusData?.registered ?? false;
  const canPlay = statusData?.canPlay ?? false;
  const myChoice = statusData?.myChoice ?? null;

  return (
    <div className="p-4 max-w-2xl mx-auto" style={{ color: 'var(--text-0)' }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <Image src="/inorout.png" alt="IN OR OUT" width={400} height={400} style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px' }} priority />
      </div>
      <div style={{ textAlign: 'center' }}>
        <h1 className="text-xl font-semibold mb-2">IN OR OUT</h1>
        <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>
          Choose Quit to receive a proportional share of $10M BETR or Stay to remain in the game and proceed to game #5. You may change your decision up until the timer ends OR everyone makes their decision.
        </p>
      </div>

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
                {g.title || 'IN OR OUT'} — {g.status === 'in_progress' ? 'In progress' : 'Open'}
              </option>
            ))}
          </select>
        </div>
      )}

      {!selectedGameId && activeGames.length === 0 && (
        <p style={{ color: 'var(--text-1)' }}>No active IN OR OUT game. Admins can create one from the dashboard.</p>
      )}

      {selectedGameId && game && (
        <>
          {game.status === 'open' && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
              <h2 className="font-semibold mb-2">Game open</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-1)' }}>
                Choose Quit to receive a proportional share of $10M BETR or Stay to remain in the game and proceed to game #5. You may change your decision up until the timer ends OR everyone makes their decision.
              </p>
              {isAdmin && (
                <button
                  onClick={handleStartGame}
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
              )}
            </div>
          )}

          {game.status === 'in_progress' && (
            <>
              {/* Clickable "X players remaining" (admin only) */}
              {isAdmin && typeof game.eligibleCount === 'number' && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={handleOpenRemaining}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--fire-1)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    {game.eligibleCount} players remaining
                  </button>
                </div>
              )}
              {/* BULLIED-style neon countdown or Results in Process */}
              <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                {(() => {
                  const displayMs = roomTimerRemainingMs !== null
                    ? roomTimerRemainingMs
                    : (game.room_timer_ends_at ? Math.max(0, new Date(game.room_timer_ends_at).getTime() - Date.now()) : 0);
                  const showResultsInProcess = !game.room_timer_ends_at || displayMs <= 0;
                  return showResultsInProcess ? (
                    <div
                      className="neon-results-in-process"
                      style={{
                        fontSize: 'clamp(1.25rem, 4vw, 2rem)',
                        fontWeight: 700,
                        color: 'var(--fire-1)',
                        cursor: isAdmin ? 'pointer' : 'default',
                      }}
                      onClick={isAdmin ? () => setShowRoomTimerModal(true) : undefined}
                      role={isAdmin ? 'button' : undefined}
                    >
                      Results in Process
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                        fontWeight: 700,
                        color: 'var(--fire-1)',
                        textShadow: '0 0 8px var(--fire-1), 0 0 16px var(--fire-1)',
                        cursor: isAdmin ? 'pointer' : 'default',
                      }}
                      onClick={isAdmin ? () => setShowRoomTimerModal(true) : undefined}
                      role={isAdmin ? 'button' : undefined}
                    >
                      {displayMs >= 60 * 60 * 1000
                        ? `${Math.floor(displayMs / (60 * 60 * 1000))}h ${Math.floor((displayMs % (60 * 60 * 1000)) / (60 * 1000))}m`
                        : `${Math.floor(displayMs / (60 * 1000))}m ${Math.floor((displayMs % (60 * 1000)) / 1000)}s`}
                    </div>
                  );
                })()}
              </div>

              {(canPlay || (isAdmin && game?.is_preview)) && (
                <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                  <h2 className="font-semibold mb-2">Your choice</h2>
                  {game.amountPerQuitter != null && game.amountPerQuitter > 0 && (
                    <p className="text-sm mb-3" style={{ color: 'var(--text-1)' }}>
                      If you quit, your share would be ${game.amountPerQuitter.toLocaleString()} BETR.
                    </p>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => handleChoice('quit')}
                      disabled={choiceSubmitting || myChoice === 'quit'}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{
                        background: myChoice === 'quit' ? 'var(--fire-1)' : 'var(--bg-1)',
                        color: myChoice === 'quit' ? 'var(--bg-0)' : 'var(--text-0)',
                        border: `2px solid ${myChoice === 'quit' ? 'var(--fire-1)' : 'var(--stroke)'}`,
                        cursor: choiceSubmitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Quit
                    </button>
                    <button
                      onClick={() => handleChoice('stay')}
                      disabled={choiceSubmitting || myChoice === 'stay'}
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{
                        background: myChoice === 'stay' ? 'var(--fire-1)' : 'var(--bg-1)',
                        color: myChoice === 'stay' ? 'var(--bg-0)' : 'var(--text-0)',
                        border: `2px solid ${myChoice === 'stay' ? 'var(--fire-1)' : 'var(--stroke)'}`,
                        cursor: choiceSubmitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Stay
                    </button>
                  </div>
                  {myChoice === 'quit' && (
                    <p className="text-sm mt-2" style={{ color: 'var(--text-1)' }}>
                      You can change to Stay until the admin ends the game.
                    </p>
                  )}
                </div>
              )}

              {!canPlay && registered && (
                <p className="mb-4" style={{ color: 'var(--text-1)' }}>You are not an eligible (alive) player for this game.</p>
              )}

              {/* Chat */}
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
                  <button
                    onClick={handleOpenAdminChoices}
                    className="px-4 py-2 rounded-lg font-medium"
                    style={{ background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--stroke)', cursor: 'pointer' }}
                  >
                    View current status
                  </button>
                  <button
                    onClick={handleEndGame}
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
              <Link
                href="/results"
                className="inline-block px-4 py-2 rounded-lg font-medium"
                style={{ background: 'var(--fire-1)', color: 'var(--bg-0)', textDecoration: 'none' }}
              >
                View Results
              </Link>
            </div>
          )}
        </>
      )}

      {/* Admin: View current status modal */}
      {showAdminChoicesModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowAdminChoicesModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-1)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid var(--stroke)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.125rem' }}>Current status</h2>
              <button onClick={() => setShowAdminChoicesModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            {alivePlayers === null ? (
              <p style={{ color: 'var(--text-1)' }}>Loading…</p>
            ) : (
              <>
                {adminChoices && (
                  <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '12px' }}>
                    Quitters: {adminChoices.quitterCount} — Amount per quitter: ${adminChoices.amountPerQuitter.toLocaleString()} BETR
                  </p>
                )}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {alivePlayers.map((p) => {
                    const choice = adminChoices?.choices.find((c) => c.fid === p.fid);
                    const status = choice ? (choice.choice === 'quit' ? 'Quit' : 'Stay') : 'No pick yet';
                    return (
                      <li
                        key={p.fid}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 0',
                          borderBottom: '1px solid var(--stroke)',
                          fontSize: '0.875rem',
                        }}
                      >
                        <img
                          src={p.pfp_url || DEFAULT_PFP}
                          alt={p.display_name || p.username}
                          style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        />
                        <button
                          onClick={() => openFarcasterProfile(p.fid, p.username ?? null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--fire-1)',
                            cursor: 'pointer',
                            padding: 0,
                            textAlign: 'left',
                            flex: 1,
                          }}
                        >
                          {p.display_name || p.username || `FID ${p.fid}`}
                        </button>
                        <span style={{ color: 'var(--text-1)' }}>{status}</span>
                      </li>
                    );
                  })}
                </ul>
                {alivePlayers.length === 0 && <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>No active players.</p>}
              </>
            )}
          </div>
        </div>
      )}

      {/* Players remaining modal (X players remaining click) */}
      {showRemainingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowRemainingModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-1)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid var(--stroke)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.125rem' }}>Players remaining</h2>
              <button onClick={() => setShowRemainingModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            {remainingPlayers === null ? (
              <p style={{ color: 'var(--text-1)' }}>Loading…</p>
            ) : remainingPlayers.length === 0 ? (
              <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>No players remaining.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {remainingPlayers.map((p) => (
                  <li
                    key={p.fid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--stroke)',
                      cursor: 'pointer',
                    }}
                    onClick={() => openFarcasterProfile(p.fid, p.username ?? null)}
                  >
                    <img
                      src={p.pfp_url || DEFAULT_PFP}
                      alt={p.display_name || p.username}
                      style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                    <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>
                      {p.display_name || p.username || `FID ${p.fid}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Admin: Set room timer modal */}
      {showRoomTimerModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowRoomTimerModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-1)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '320px',
              width: '100%',
              border: '1px solid var(--stroke)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.125rem' }}>Set countdown (minutes)</h2>
              <button onClick={() => setShowRoomTimerModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            <input
              type="number"
              min={1}
              max={10080}
              value={roomTimerMinutes}
              onChange={(e) => setRoomTimerMinutes(e.target.value)}
              className="w-full p-2 rounded border mb-4"
              style={{ background: 'var(--bg-2)', borderColor: 'var(--stroke)', color: 'var(--text-0)' }}
            />
            <button
              onClick={handleSetRoomTimer}
              disabled={roomTimerSubmitting}
              className="w-full py-2 rounded-lg font-medium"
              style={{
                background: roomTimerSubmitting ? 'var(--bg-2)' : 'var(--fire-1)',
                color: roomTimerSubmitting ? 'var(--text-2)' : 'var(--bg-0)',
                border: 'none',
                cursor: roomTimerSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {roomTimerSubmitting ? 'Setting…' : 'Set timer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
