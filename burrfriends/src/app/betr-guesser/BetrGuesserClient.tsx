'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getBaseScanTxUrl } from '~/lib/explorer';
import { formatStakingRequirement } from '~/lib/format-prize';
import Image from 'next/image';
import { BetrGuesserGameChatModal } from '~/components/BetrGuesserGameChatModal';

type Game = {
  id: string;
  title: string;
  prize_amount: number;
  staking_min_amount?: number | null;
  guesses_close_at: string;
  status: string;
  winner_fid?: number;
  winner_guess?: number;
  winner_display_name?: string | null;
  winner_pfp_url?: string | null;
  userGuess?: number | null;
  userSubmittedAt?: string | null;
  settle_tx_hash?: string | null; // Transaction hash for game settlement
  settle_tx_url?: string | null;
  payouts?: Array<{ fid: number; amount: number; txHash: string; txUrl: string | null }>;
  min_players_to_start?: number | null;
  start_condition?: string | null;
  guess_count?: number;
  whitelist_fids?: number[] | null;
};

type Status = {
  registered: boolean;
  activeGames: Array<{
    gameId: string;
    gameStatus: string;
    guessesCloseAt: string;
    hasGuessed: boolean;
    myGuess: number | null;
  }>;
};

function BetrGuesserContent() {
  const searchParams = useSearchParams();
  const urlGameId = searchParams.get('gameId')?.trim() || null;
  const { token, status: authStatus } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [guess, setGuess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [calculatedWinner, setCalculatedWinner] = useState<{ winnerFid: number; winnerGuess: number } | null>(null);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [allGuesses, setAllGuesses] = useState<Array<{ fid: number; guess: number; submitted_at: string; username?: string | null; display_name?: string | null; pfp_url?: string | null }>>([]);
  const [showAllGuesses, setShowAllGuesses] = useState(false);
  const [loadingGuesses, setLoadingGuesses] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Deep link: open specific game when URL has ?gameId=...
  useEffect(() => {
    if (urlGameId) setSelectedGameId(urlGameId);
  }, [urlGameId]);

  // Load active games and status
  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        const [gamesRes, statusRes, adminRes] = await Promise.all([
          fetch('/api/betr-guesser/games/active').then((r) => r.json()),
          authStatus === 'authed' && token
            ? authedFetch('/api/betr-guesser/status', { method: 'GET' }, token).then((r) => r.json())
            : Promise.resolve({ ok: true, data: { registered: false, activeGames: [] } }),
          authStatus === 'authed' && token
            ? authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json())
            : Promise.resolve({ ok: true, data: { isAdmin: false } }),
        ]);

        if (gamesRes?.ok && Array.isArray(gamesRes?.data)) {
          setActiveGames(gamesRes.data);
          // Deep link: ?gameId=... opens that game; otherwise default to first active game
          if (urlGameId) {
            setSelectedGameId(urlGameId);
          } else if (gamesRes.data.length > 0 && !selectedGameId) {
            setSelectedGameId(gamesRes.data[0].id);
          }
        }

        if (statusRes?.ok && statusRes?.data) {
          setStatus(statusRes.data);
        }

        if (adminRes?.ok && adminRes?.data?.isAdmin) {
          setIsAdmin(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [authStatus, token, selectedGameId]);

  // Load selected game details
  useEffect(() => {
    if (!selectedGameId) return;
    (async () => {
      try {
        const res = await fetch(`/api/betr-guesser/games/${selectedGameId}`).then((r) => r.json());
        if (res?.ok && res?.data) {
          setGame(res.data);
        }
      } catch (e) {
        console.error('Failed to load game:', e);
      }
    })();
  }, [selectedGameId]);

  // Countdown timer
  const [countdown, setCountdown] = useState<string>('');
  useEffect(() => {
    if (!game?.guesses_close_at) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date().getTime();
      const closeTime = new Date(game.guesses_close_at).getTime();
      const diff = closeTime - now;

      if (diff <= 0) {
        setCountdown('Guesses closed');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [game?.guesses_close_at]);

  const handleSubmit = async () => {
    if (!token || !selectedGameId) return;
    const g = parseInt(guess, 10);
    if (isNaN(g) || g < 1 || g > 100) {
      setSubmitError('Guess must be between 1 and 100.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await authedFetch('/api/betr-guesser/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: selectedGameId, guess: g }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit guess');
      }

      setSubmitSuccess(data.message || `Your guess of ${g} has been submitted`);
      setGuess('');
      // Reload game to show user's guess
      const gameRes = await fetch(`/api/betr-guesser/games/${selectedGameId}`).then((r) => r.json());
      if (gameRes?.ok && gameRes?.data) {
        setGame(gameRes.data);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit guess');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCalculateWinner = async () => {
    if (!token || !selectedGameId) return;
    try {
      const res = await authedFetch(`/api/betr-guesser/games/${selectedGameId}/calculate-winner`, { method: 'GET' }, token);
      const data = await res.json();
      if (res.ok && data.ok && data.data) {
        setCalculatedWinner(data.data);
      } else {
        setSettleError('No winner found (no unique guesses)');
      }
    } catch (e) {
      setSettleError(e instanceof Error ? e.message : 'Failed to calculate winner');
    }
  };

  const handleSettle = async () => {
    if (!token || !selectedGameId || !calculatedWinner) return;
    setSettling(true);
    setSettleError(null);

    try {
      const res = await authedFetch(`/api/betr-guesser/games/${selectedGameId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmWinner: true }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to settle game');
      }

      // Immediately update game state with settle_tx_hash and settle_tx_url for instant UI display
      if (data.data?.settleTxHash && game) {
        setGame({
          ...game,
          settle_tx_hash: data.data.settleTxHash,
          settle_tx_url: data.data.settleTxUrl ?? undefined,
          status: 'settled',
        });
      }

      // Reload game for complete data (payouts, etc.)
      const gameRes = await fetch(`/api/betr-guesser/games/${selectedGameId}`).then((r) => r.json());
      if (gameRes?.ok && gameRes?.data) {
        setGame(gameRes.data);
      }
      setCalculatedWinner(null);
      alert(`Game settled! View on Basescan in the game card.`);
    } catch (e) {
      setSettleError(e instanceof Error ? e.message : 'Failed to settle game');
    } finally {
      setSettling(false);
    }
  };

  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import('~/lib/constants');
        const { buildShareText } = await import('~/lib/og-helpers');
        const url = APP_URL + `/betr-guesser${selectedGameId ? `?gameId=${selectedGameId}` : ''}`;
        const text = buildShareText(
          'BETR GUESSER',
          game?.prize_amount,
          game?.staking_min_amount
        );
        await sdk.actions.composeCast({
          text,
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
      const url = APP_URL + `/betr-guesser${selectedGameId ? `?gameId=${selectedGameId}` : ''}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      const { APP_URL } = await import('~/lib/constants');
      alert('Copy failed. URL: ' + (APP_URL + `/betr-guesser${selectedGameId ? `?gameId=${selectedGameId}` : ''}`));
    }
  };

  // Poll chat active (unread count) when game is open and user has access (guessed or admin)
  useEffect(() => {
    if (!selectedGameId || !game || game.status !== 'open' || !token) return;
    const hasAccess = game.userGuess != null || isAdmin;
    if (!hasAccess) return;
    const loadActive = async () => {
      try {
        const res = await authedFetch(`/api/betr-guesser/games/${selectedGameId}/chat/active`, { method: 'GET' }, token);
        const data = await res.json();
        if (data?.ok && data.data?.unreadChatCount != null) setUnreadChatCount(data.data.unreadChatCount);
      } catch {
        // ignore
      }
    };
    loadActive();
    const interval = setInterval(loadActive, 10000);
    return () => clearInterval(interval);
  }, [selectedGameId, game?.id, game?.status, game?.userGuess, isAdmin, token]);

  const handleViewAllGuesses = async () => {
    if (!token || !selectedGameId) return;
    if (showAllGuesses) {
      setShowAllGuesses(false);
      return;
    }

    setLoadingGuesses(true);
    try {
      const res = await authedFetch(`/api/betr-guesser/games/${selectedGameId}/guesses`, { method: 'GET' }, token);
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.data)) {
        setAllGuesses(data.data);
        setShowAllGuesses(true);
      } else {
        setError('Failed to load guesses');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load guesses');
    } finally {
      setLoadingGuesses(false);
    }
  };

  const handleCancel = async () => {
    if (!token || !selectedGameId) return;
    if (!confirm('Are you sure you want to cancel this game?')) return;

    try {
      const res = await authedFetch(`/api/betr-guesser/games/${selectedGameId}/cancel`, {
        method: 'POST',
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to cancel game');
      }

      // Reload games
      const gamesRes = await fetch('/api/betr-guesser/games/active').then((r) => r.json());
      if (gamesRes?.ok && Array.isArray(gamesRes?.data)) {
        setActiveGames(gamesRes.data);
        if (gamesRes.data.length > 0) {
          setSelectedGameId(gamesRes.data[0].id);
        } else {
          setSelectedGameId(null);
          setGame(null);
        }
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to cancel game');
    }
  };

  if (authStatus === 'loading' || loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '720px', margin: '0 auto' }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <Image src="/guesser.png" alt="BETR GUESSER" width={400} height={400} style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px' }} priority />
      </div>
      <h1 style={{ marginBottom: '8px' }}>BETR GUESSER</h1>
      <p style={{ color: 'var(--text-1)', marginBottom: '16px' }}>Guess a number 1-100. Highest unique guess wins!</p>

      {error && <p style={{ color: 'var(--ember-2)', marginBottom: '12px' }}>{error}</p>}

      {activeGames.length === 0 ? (
        <p style={{ color: 'var(--text-1)' }}>No active games. Check back soon!</p>
      ) : (
        <>
          {activeGames.length > 1 && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Select game:</label>
              <select
                value={selectedGameId || ''}
                onChange={(e) => setSelectedGameId(e.target.value)}
                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', maxWidth: '400px' }}
              >
                {activeGames.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} - Prize: {g.prize_amount} BETR - Closes: {new Date(g.guesses_close_at).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {game && (
            <>
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--text-0)' }}>Prize: {game.prize_amount} BETR</strong>
                  {game.status === 'closed' || countdown === 'Guesses closed' ? (
                    <span className="hl-badge hl-badge--muted" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                      GUESSES CLOSED
                    </span>
                  ) : (
                    <span style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>{countdown}</span>
                  )}
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '8px' }}>{formatStakingRequirement(game.staking_min_amount)}</p>
                {game.whitelist_fids != null && game.whitelist_fids.length === 5 && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '8px' }}>Invite-only · 5 players</p>
                )}
                {game.guesses_close_at && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '4px' }}>
                    Closes: {game.start_condition === 'min_players' && game.min_players_to_start != null
                      ? `When ${game.min_players_to_start} guesses submitted`
                      : game.start_condition === 'whichever_first' && (game.min_players_to_start != null || game.guesses_close_at)
                        ? `When ${game.min_players_to_start ?? 'N'} guesses or at ${new Date(game.guesses_close_at).toLocaleString()}, whichever first`
                        : `At ${new Date(game.guesses_close_at).toLocaleString()}`}
                  </p>
                )}
                {game.guess_count !== undefined && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '4px' }}>
                    {game.guess_count} guess{game.guess_count !== 1 ? 'es' : ''} so far
                  </p>
                )}
                <div style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '8px' }}>
                  Status: <strong style={{ color: game.status === 'closed' ? 'var(--ember-2)' : 'var(--text-0)' }}>{game.status}</strong>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                  {game.status === 'open' && (game.userGuess != null || isAdmin) && (
                    <button
                      onClick={() => {
                        setChatModalOpen(true);
                        setUnreadChatCount(0);
                      }}
                      className="btn-secondary"
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                        minHeight: 'auto',
                        color: unreadChatCount > 0 ? '#ef4444' : undefined,
                      }}
                    >
                      Chat{unreadChatCount > 0 ? ` (${unreadChatCount})` : ''}
                    </button>
                  )}
                </div>
              </div>

              {game.status === 'settled' && game.winner_fid != null && (
                <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)' }}>
                  <p style={{ color: 'var(--text-0)', margin: 0 }}>
                    <strong>Winner:</strong>{' '}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {game.winner_pfp_url && (
                        <img src={game.winner_pfp_url} alt="" style={{ width: 20, height: 20, borderRadius: 10, verticalAlign: 'middle' }} />
                      )}
                      {game.winner_display_name ?? `FID ${game.winner_fid}`} guessed {game.winner_guess}
                    </span>
                  </p>
                  {(game.settle_tx_hash || (game as any).settle_tx_url) && (
                    <p style={{ color: 'var(--text-1)', margin: '8px 0 0', fontSize: '0.875rem' }}>
                      Settlement: <a href={(game as any).settle_tx_url || getBaseScanTxUrl(game.settle_tx_hash!) || '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fire-1)' }}>View on Basescan</a>
                      {(game as any).payouts?.length > 0 && (game as any).payouts[0].txUrl && (
                        <> • <a href={(game as any).payouts[0].txUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fire-1)' }}>Payout tx</a></>
                      )}
                    </p>
                  )}
                </div>
              )}

              {authStatus !== 'authed' ? (
                <p style={{ color: 'var(--text-1)' }}>Sign in to submit a guess.</p>
              ) : !status?.registered ? (
                <p style={{ color: 'var(--text-1)' }}>
                  <Link href="/clubs/burrfriends/games" style={{ color: 'var(--fire-1)' }}>Register for BETR GAMES</Link> first to submit guesses.
                </p>
              ) : game.status === 'open' ? (
                <>
                  {game.userGuess ? (
                    <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)' }}>
                      <p style={{ color: 'var(--text-0)', margin: 0 }}>
                        <strong>You guessed: {game.userGuess}</strong>
                      </p>
                    </div>
                  ) : (
                    <section style={{ marginBottom: '24px' }}>
                      <h2 style={{ fontSize: '1rem', marginBottom: '8px' }}>Submit your guess</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Your guess (1-100)</label>
                          <input
                            type="number"
                            placeholder="Enter a number 1-100"
                            value={guess}
                            onChange={(e) => setGuess(e.target.value)}
                            min={1}
                            max={100}
                            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
                          />
                        </div>
                        <button onClick={handleSubmit} disabled={submitting} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
                          {submitting ? 'Submitting…' : 'Submit Guess'}
                        </button>
                      </div>
                      {submitError && <p style={{ color: 'var(--ember-2)', marginTop: '8px', fontSize: '0.875rem' }}>{submitError}</p>}
                      {submitSuccess && <p style={{ color: 'var(--fire-1)', marginTop: '8px', fontSize: '0.875rem' }}>{submitSuccess}</p>}
                    </section>
                  )}
                </>
              ) : game.status === 'closed' ? (
                <p style={{ color: 'var(--text-1)' }}>Guesses are closed. Winner calculation pending...</p>
              ) : null}

              {/* Admin section */}
              {isAdmin && game.status !== 'settled' && game.status !== 'cancelled' && (
                <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)' }}>
                  <h2 style={{ fontSize: '1rem', marginBottom: '12px' }}>Admin Actions</h2>
                  
                  <button 
                    onClick={handleViewAllGuesses} 
                    disabled={loadingGuesses}
                    className="btn-secondary" 
                    style={{ marginRight: '8px', marginBottom: '8px' }}
                  >
                    {loadingGuesses ? 'Loading…' : showAllGuesses ? 'Hide All Guesses' : 'View All Guesses'}
                  </button>

                  {showAllGuesses && allGuesses.length > 0 && (
                    <div style={{ marginTop: '12px', marginBottom: '12px', padding: '12px', background: 'var(--bg-0)', borderRadius: 'var(--radius-sm)' }}>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '8px' }}>
                        <strong>{allGuesses.length}</strong> guesses submitted, <strong>{new Set(allGuesses.map(g => g.guess)).size}</strong> unique guesses
                      </p>
                      <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--stroke)', borderRadius: 'var(--radius-sm)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--stroke)', background: 'var(--bg-2)' }}>
                              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-0)' }}>#</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-0)' }}>Player</th>
                              <th style={{ textAlign: 'right', padding: '8px', color: 'var(--text-0)' }}>Guess</th>
                              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-0)' }}>Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allGuesses.map((g, idx) => {
                              // Check if this guess is a duplicate
                              const duplicateCount = allGuesses.filter(gg => gg.guess === g.guess).length;
                              const isDuplicate = duplicateCount > 1;
                              
                              return (
                                <tr 
                                  key={`${g.fid}-${g.submitted_at}`} 
                                  style={{ 
                                    borderBottom: '1px solid var(--stroke)',
                                    opacity: isDuplicate ? 0.6 : 1,
                                    background: isDuplicate ? 'rgba(255, 0, 0, 0.05)' : 'transparent'
                                  }}
                                >
                                  <td style={{ padding: '8px', color: 'var(--text-1)' }}>{idx + 1}</td>
                                  <td style={{ padding: '8px', color: 'var(--text-0)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {g.pfp_url && (
                                        <img 
                                          src={g.pfp_url} 
                                          alt="" 
                                          style={{ width: 20, height: 20, borderRadius: 10, verticalAlign: 'middle' }} 
                                        />
                                      )}
                                      <span>{g.display_name || g.username || `FID ${g.fid}`}</span>
                                      {isDuplicate && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ember-2)', marginLeft: '4px' }}>(duplicate)</span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '8px', color: 'var(--text-0)', fontWeight: 600 }}>{g.guess}</td>
                                  <td style={{ padding: '8px', color: 'var(--text-1)', fontSize: '0.75rem' }}>
                                    {new Date(g.submitted_at).toLocaleString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {showAllGuesses && allGuesses.length === 0 && (
                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-0)', borderRadius: 'var(--radius-sm)' }}>
                      <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No guesses submitted yet.</p>
                    </div>
                  )}

                  {game.status === 'closed' && (
                    <>
                      <button onClick={handleCalculateWinner} className="btn-primary" style={{ marginRight: '8px', marginBottom: '8px' }}>
                        Calculate Winner
                      </button>
                      {calculatedWinner && (() => {
                        const winnerRow = allGuesses.find((g) => g.fid === calculatedWinner.winnerFid);
                        const winnerName = winnerRow?.display_name || winnerRow?.username || `FID ${calculatedWinner.winnerFid}`;
                        const winnerPfp = winnerRow?.pfp_url;
                        return (
                        <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-0)', borderRadius: 'var(--radius-sm)' }}>
                          <p style={{ color: 'var(--text-0)', margin: '0 0 8px 0' }}>
                            <strong>Winner:</strong>{' '}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {winnerPfp && (
                                <img src={winnerPfp} alt="" style={{ width: 20, height: 20, borderRadius: 10, verticalAlign: 'middle' }} />
                              )}
                              {winnerName} guessed {calculatedWinner.winnerGuess}
                            </span>
                          </p>
                          <button onClick={handleSettle} disabled={settling} className="btn-primary">
                            {settling ? 'Settling…' : 'Settle Game'}
                          </button>
                        </div>
                        );
                      })()}
                      {settleError && <p style={{ color: 'var(--ember-2)', marginTop: '8px', fontSize: '0.875rem' }}>{settleError}</p>}
                    </>
                  )}
                  <button onClick={handleCancel} className="btn-secondary" style={{ marginTop: '8px' }}>
                    Cancel Game
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      <BetrGuesserGameChatModal
        gameId={selectedGameId}
        isOpen={chatModalOpen}
        onClose={() => setChatModalOpen(false)}
      />
    </div>
  );
}

export default function BetrGuesserClient() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--fire-2)' }}>Loading…</div>}>
      <BetrGuesserContent />
    </Suspense>
  );
}
