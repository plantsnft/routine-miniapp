'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import Image from 'next/image';

type Game = {
  id: string;
  title: string;
  total_prize_pool: number;
  status: 'setup' | 'claiming' | 'locked' | 'settled' | 'cancelled';
  tier1_min_stake: number;
  tier1_squares_per_user: number;
  tier1_opens_at: string | null;
  tier1_closes_at: string | null;
  tier2_min_stake: number;
  tier2_squares_per_user: number;
  tier2_opens_at: string | null;
  tier2_closes_at: string | null;
  tier3_min_stake: number;
  tier3_squares_per_user: number;
  tier3_opens_at: string | null;
  auto_squares_limit: number;
  admin_squares_limit: number;
  row_numbers: number[] | null;
  col_numbers: number[] | null;
  numbers_randomized_at: string | null;
  prize_q1_pct: number;
  prize_q2_pct: number;
  prize_halftime_pct: number;
  prize_final_pct: number;
  score_q1_team1: number | null;
  score_q1_team2: number | null;
  score_halftime_team1: number | null;
  score_halftime_team2: number | null;
  score_q3_team1: number | null;
  score_q3_team2: number | null;
  score_final_team1: number | null;
  score_final_team2: number | null;
};

type Claim = {
  fid: number;
  displayName: string | null;
  pfpUrl: string | null;
  claimType: string;
  claimedAt: string;
};

type Settlement = {
  quarter: string;
  winner_fid: number;
  prize_amount: number;
  square_index: number;
  row_digit: number;
  col_digit: number;
  tx_hash: string | null;
};

function formatBetr(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(0)}M`;
  }
  return amount.toLocaleString();
}

function SuperbowlSquaresContent() {
  const { token, status: authStatus, fid: userFid } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [grid, setGrid] = useState<(Claim | null)[]>(Array(100).fill(null));
  const [stats, setStats] = useState<{ totalClaimed: number; availableAutoSquares: number; availableAdminSquares: number }>({ totalClaimed: 0, availableAutoSquares: 90, availableAdminSquares: 10 });
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedSquares, setSelectedSquares] = useState<number[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Phase 23.1: Admin action states
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [adminAddFid, setAdminAddFid] = useState('');
  const [scores, setScores] = useState({
    q1Team1: '', q1Team2: '',
    halftimeTeam1: '', halftimeTeam2: '',
    q3Team1: '', q3Team2: '',
    finalTeam1: '', finalTeam2: '',
  });

  // Phase 23.2: Cancel game states
  const [cancellingGame, setCancellingGame] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);

  // User's tier info
  const [userTier, setUserTier] = useState<{ tier: string; squaresAllowed: number; squaresClaimed: number } | null>(null);

  // Settlement preview/pay-one states
  const [settlementPreview, setSettlementPreview] = useState<any[] | null>(null);
  const [paidQuarters, setPaidQuarters] = useState<Set<string>>(new Set());
  const [payingIndex, setPayingIndex] = useState<number | null>(null);
  const [payResults, setPayResults] = useState<Map<string, { txHash: string; txUrl: string }>>(new Map());

  // Read gameId from URL query params (used by "See Full Results" link on Results page)
  const searchParams = useSearchParams();
  const urlGameId = searchParams.get('gameId')?.trim() || null;

  // Load active game
  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        // Check admin status
        if (authStatus === 'authed' && token) {
          try {
            const adminRes = await authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json());
            if (adminRes?.ok && adminRes?.data?.isAdmin) {
              setIsAdmin(true);
            }
          } catch { /* ignore admin check failure */ }
        }

        if (urlGameId) {
          // Direct game ID from URL — load specific game (works for settled games)
          await loadGameDetails(urlGameId);
        } else {
          // No URL param — find active game
          const gamesRes = await fetch('/api/superbowl-squares/games/active').then((r) => r.json());
          if (gamesRes?.ok && Array.isArray(gamesRes?.data) && gamesRes.data.length > 0) {
            const activeGame = gamesRes.data[0];
            await loadGameDetails(activeGame.id);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [authStatus, token, urlGameId]);

  const loadGameDetails = async (gameId: string) => {
    try {
      const res = await fetch(`/api/superbowl-squares/games/${gameId}`).then((r) => r.json());
      if (res?.ok && res?.data) {
        setGame(res.data.game);
        setGrid(res.data.grid || Array(100).fill(null));
        setStats(res.data.stats || { totalClaimed: 0, availableAutoSquares: 90, availableAdminSquares: 10 });
        setSettlements(res.data.settlements || []);

        // Calculate user's claims
        if (userFid) {
          const userClaims = (res.data.claims || []).filter((c: any) => c.fid === userFid);
          if (userClaims.length > 0) {
            const claimType = userClaims[0].claim_type;
            const squaresAllowed = claimType === 'tier1' ? res.data.game.tier1_squares_per_user :
                                   claimType === 'tier2' ? res.data.game.tier2_squares_per_user :
                                   claimType === 'tier3' ? res.data.game.tier3_squares_per_user : 1;
            setUserTier({
              tier: claimType,
              squaresAllowed,
              squaresClaimed: userClaims.length,
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed to load game:', e);
    }
  };

  const handleSquareClick = (index: number) => {
    if (!game || game.status !== 'claiming' || grid[index]) return;
    
    setSelectedSquares(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      }
      return [...prev, index];
    });
  };

  const handleClaim = async () => {
    if (!token || !game || selectedSquares.length === 0) return;
    
    setClaiming(true);
    setClaimError(null);
    setClaimSuccess(null);

    try {
      const res = await authedFetch('/api/superbowl-squares/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, squareIndices: selectedSquares }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to claim squares');
      }

      setClaimSuccess(`Successfully claimed ${selectedSquares.length} square(s)!`);
      setSelectedSquares([]);
      // Reload game
      await loadGameDetails(game.id);
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : 'Failed to claim squares');
    } finally {
      setClaiming(false);
    }
  };

  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import('~/lib/constants');
        const { buildShareText } = await import('~/lib/og-helpers');
        const url = APP_URL + '/superbowl-squares';
        const text = buildShareText(
          'SUPERBOWL SQUARES',
          game?.total_prize_pool,
          null // No staking minimum for this game type
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

  const handleCopyLink = async () => {
    try {
      const { APP_URL } = await import('~/lib/constants');
      const url = APP_URL + '/superbowl-squares';
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Ignore
    }
  };

  // Phase 23.2: Helper to show confirmation modal (replaces confirm())
  const showConfirm = (
    message: string,
    onConfirm: () => void,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel'
  ) => {
    setConfirmConfig({ message, onConfirm, confirmText, cancelText });
    setShowConfirmModal(true);
  };

  // Phase 23.2: Cancel game handler
  const handleCancelGame = () => {
    if (!token || !game) {
      setAdminError('Please sign in to cancel the game');
      return;
    }
    showConfirm(
      'Cancel this game? This cannot be undone.',
      async () => {
        setCancellingGame(true);
        setAdminError(null);
        setAdminSuccess(null);
        try {
          const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/cancel`, {
            method: 'POST',
          }, token);
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Failed to cancel game');
          }
          setAdminSuccess('Game cancelled.');
          await loadGameDetails(game.id);
        } catch (e: any) {
          setAdminError(e.message || 'Failed to cancel game');
        } finally {
          setCancellingGame(false);
        }
      },
      'Cancel Game',
      'Keep Game'
    );
  };

  const getSquareStyle = (index: number): React.CSSProperties => {
    const claim = grid[index];
    const isSelected = selectedSquares.includes(index);
    const row = Math.floor(index / 10);
    const col = index % 10;

    let backgroundColor = 'rgba(0, 255, 200, 0.05)';
    let borderColor = 'rgba(0, 255, 200, 0.3)';
    let boxShadow = 'none';

    if (claim) {
      // Claimed square
      backgroundColor = claim.claimType === 'admin' 
        ? 'rgba(255, 200, 0, 0.3)' 
        : 'rgba(0, 255, 200, 0.25)';
      borderColor = claim.claimType === 'admin'
        ? 'rgba(255, 200, 0, 0.6)'
        : 'rgba(0, 255, 200, 0.6)';
    } else if (isSelected) {
      // Selected for claiming
      backgroundColor = 'rgba(0, 255, 200, 0.4)';
      borderColor = '#00ffc8';
      boxShadow = '0 0 10px rgba(0, 255, 200, 0.5)';
    }

    // Highlight winning squares when settled
    const isWinningSquare = game?.status === 'settled' && settlements.some(s => s.square_index === index);
    if (isWinningSquare) {
      borderColor = '#eab308';
      boxShadow = '0 0 8px rgba(234, 179, 8, 0.6)';
    }

    return {
      width: '100%',
      aspectRatio: '1',
      backgroundColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: game?.status === 'claiming' && !claim ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
      boxShadow,
      fontSize: '0.65rem',
      overflow: 'hidden',
    };
  };

  const getTierStatus = () => {
    if (!game || game.status !== 'claiming') return null;
    
    const now = new Date();
    
    // Tier 1
    if (game.tier1_opens_at && game.tier1_closes_at) {
      const opens = new Date(game.tier1_opens_at);
      const closes = new Date(game.tier1_closes_at);
      if (now >= opens && now < closes) {
        return { tier: 'Tier 1', minStake: game.tier1_min_stake, squares: game.tier1_squares_per_user, status: 'ACTIVE' };
      }
    }
    
    // Tier 2
    if (game.tier2_opens_at && game.tier2_closes_at) {
      const opens = new Date(game.tier2_opens_at);
      const closes = new Date(game.tier2_closes_at);
      if (now >= opens && now < closes) {
        return { tier: 'Tier 2', minStake: game.tier2_min_stake, squares: game.tier2_squares_per_user, status: 'ACTIVE' };
      }
    }
    
    // Tier 3
    if (game.tier3_opens_at) {
      const opens = new Date(game.tier3_opens_at);
      if (now >= opens) {
        return { tier: 'Tier 3', minStake: game.tier3_min_stake, squares: game.tier3_squares_per_user, status: 'ACTIVE' };
      }
    }
    
    return null;
  };

  if (authStatus === 'loading' || loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading…</p>
      </div>
    );
  }

  const tierStatus = getTierStatus();

  return (
    <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      
      {game && (
        <div style={{ width: '100%', maxHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
          <Image src="/superbowlsquares.png" alt="SUPERBOWL SQUARES" width={500} height={420} style={{ maxHeight: '280px', width: 'auto', objectFit: 'contain' }} />
        </div>
      )}
      <h1 style={{ 
        marginBottom: '8px', 
        background: 'linear-gradient(90deg, #00ffc8, #00c8ff)', 
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        fontSize: '1.5rem'
      }}>
        SUPERBOWL SQUARES
      </h1>
      <p style={{ color: 'var(--text-1)', marginBottom: '16px', fontSize: '0.875rem' }}>
        10x10 grid. Claim squares based on your staking tier. Numbers randomized at lock. Win when score digits match!
      </p>

      {error && <p style={{ color: 'var(--ember-2)', marginBottom: '12px' }}>{error}</p>}

      {!game ? (
        <div style={{ padding: '24px', textAlign: 'center', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ color: 'var(--text-1)' }}>No active Super Bowl Squares game. Check back soon!</p>
        </div>
      ) : (
        <>
          {/* Game Info Card */}
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'var(--bg-1)', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid rgba(0, 255, 200, 0.3)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ color: '#00ffc8' }}>Prize Pool: {formatBetr(game.total_prize_pool)} BETR</strong>
              <span style={{ 
                fontSize: '0.75rem', 
                padding: '4px 8px', 
                borderRadius: '4px',
                background: game.status === 'claiming' ? 'rgba(0, 255, 200, 0.2)' : 'rgba(255, 200, 0, 0.2)',
                color: game.status === 'claiming' ? '#00ffc8' : '#ffc800'
              }}>
                {game.status.toUpperCase()}
              </span>
            </div>
            
            <div style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '8px' }}>
              <p style={{ margin: '4px 0' }}>Q1: {Math.round(game.prize_q1_pct * 100)}% ({formatBetr(game.total_prize_pool * game.prize_q1_pct)})</p>
              <p style={{ margin: '4px 0' }}>Halftime: {Math.round(game.prize_halftime_pct * 100)}% ({formatBetr(game.total_prize_pool * game.prize_halftime_pct)})</p>
              <p style={{ margin: '4px 0' }}>Q3: {Math.round(game.prize_q2_pct * 100)}% ({formatBetr(game.total_prize_pool * game.prize_q2_pct)})</p>
              <p style={{ margin: '4px 0' }}>Final: {Math.round(game.prize_final_pct * 100)}% ({formatBetr(game.total_prize_pool * game.prize_final_pct)})</p>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '4px' }}>
              Squares claimed: {stats.totalClaimed}/100 ({stats.availableAutoSquares} auto + {stats.availableAdminSquares} admin remaining)
            </p>

            {tierStatus && (
              <div style={{ 
                marginTop: '8px', 
                padding: '8px', 
                background: 'rgba(0, 255, 200, 0.1)', 
                borderRadius: '4px' 
              }}>
                <p style={{ color: '#00ffc8', fontWeight: 600, margin: 0 }}>
                  {tierStatus.tier} ACTIVE - {formatBetr(tierStatus.minStake)}+ stakers get {tierStatus.squares} square(s)
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: '8px' }}>
              <button
                onClick={handleShare}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}
              >
                Share
              </button>
              <button
                onClick={handleCopyLink}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}
              >
                {linkCopied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>

          {/* Final Board label when settled */}
          {game.status === 'settled' && (
            <h3 style={{ color: '#00ffc8', marginBottom: '8px', marginTop: '16px', fontSize: '1rem', fontWeight: 700 }}>
              Final Board
            </h3>
          )}

          {/* Row/Column Numbers (shown if randomized) */}
          {game.row_numbers && game.col_numbers && (
            <div style={{ marginBottom: '8px' }}>
              {/* Phase 23.3: PATRIOTS label above column numbers */}
              <p style={{ 
                textAlign: 'center', 
                marginLeft: '48px', 
                fontSize: '0.7rem', 
                fontWeight: 700, 
                color: '#00c8ff',
                letterSpacing: '2px',
                marginBottom: '4px',
                marginTop: 0
              }}>
                PATRIOTS
              </p>
              <div style={{ display: 'flex', gap: '2px', marginLeft: '48px', marginBottom: '4px' }}>
                {game.col_numbers.map((num, i) => (
                  <div key={i} style={{ 
                    width: 'calc((100% - 18px) / 10)', 
                    textAlign: 'center', 
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    color: '#00ffc8' 
                  }}>
                    {num}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grid */}
          <div style={{ display: 'flex', marginBottom: '16px' }}>
            {/* Phase 23.3: SEAHAWKS label - rotated vertically */}
            {game.row_numbers && (
              <div style={{ 
                width: '16px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                position: 'relative'
              }}>
                <span style={{ 
                  position: 'absolute',
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center center',
                  whiteSpace: 'nowrap',
                  fontSize: '0.65rem', 
                  fontWeight: 700, 
                  color: '#00c8ff',
                  letterSpacing: '2px'
                }}>
                  SEAHAWKS
                </span>
              </div>
            )}
            {/* Row numbers */}
            {game.row_numbers && (
              <div style={{ width: '28px', display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '4px' }}>
                {game.row_numbers.map((num, i) => (
                  <div key={i} style={{ 
                    height: 'calc((100vw - 80px) / 10)', 
                    maxHeight: '52px',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    color: '#00ffc8' 
                  }}>
                    {num}
                  </div>
                ))}
              </div>
            )}
            
            {/* Main grid */}
            <div style={{ 
              flex: 1,
              display: 'grid', 
              gridTemplateColumns: 'repeat(10, 1fr)', 
              gap: '2px',
              background: 'rgba(0, 255, 200, 0.1)',
              padding: '4px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 255, 200, 0.3)'
            }}>
              {grid.map((claim, index) => (
                <div
                  key={index}
                  style={getSquareStyle(index)}
                  onClick={() => handleSquareClick(index)}
                  title={claim ? `${claim.displayName || `FID ${claim.fid}`} (${claim.claimType})` : `Square ${index}`}
                >
                  {claim && claim.pfpUrl ? (
                    <img 
                      src={claim.pfpUrl} 
                      alt="" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                        borderRadius: '3px'
                      }} 
                    />
                  ) : claim ? (
                    <span style={{ color: 'var(--text-0)', fontSize: '0.5rem' }}>
                      {(claim.displayName || String(claim.fid)).substring(0, 3)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Claim Controls */}
          {authStatus === 'authed' && game.status === 'claiming' && (
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'var(--bg-1)', 
              borderRadius: 'var(--radius-md)' 
            }}>
              {stats.availableAutoSquares <= 0 ? (
                <p style={{ color: '#00ffc8', fontWeight: 600, fontSize: '1rem', textAlign: 'center', margin: '8px 0' }}>
                  All public squares have been claimed!
                </p>
              ) : (<>
              {userTier && (
                <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '8px' }}>
                  Your tier: <strong style={{ color: '#00ffc8' }}>{userTier.tier.toUpperCase()}</strong> - 
                  {userTier.squaresClaimed}/{userTier.squaresAllowed} squares claimed
                </p>
              )}
              
              {selectedSquares.length > 0 && (
                <>
                  <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '8px' }}>
                    Selected: {selectedSquares.length} square(s) - {selectedSquares.join(', ')}
                  </p>
                  <button
                    onClick={handleClaim}
                    disabled={claiming}
                    className="btn-primary"
                    style={{ 
                      background: 'linear-gradient(90deg, #00ffc8, #00c8ff)',
                      color: '#000',
                      fontWeight: 600
                    }}
                  >
                    {claiming ? 'Claiming...' : `Claim ${selectedSquares.length} Square(s)`}
                  </button>
                </>
              )}
              
              {claimError && <p style={{ color: 'var(--ember-2)', marginTop: '8px', fontSize: '0.875rem' }}>{claimError}</p>}
              {claimSuccess && <p style={{ color: '#00ffc8', marginTop: '8px', fontSize: '0.875rem' }}>{claimSuccess}</p>}
              </>)}
            </div>
          )}

          {authStatus !== 'authed' && game.status === 'claiming' && (
            <p style={{ color: 'var(--text-1)', marginBottom: '16px' }}>Sign in to claim squares.</p>
          )}

          {/* Settlements (if game is settled) */}
          {game.status === 'settled' && settlements.length > 0 && (() => {
            const quarterScores: Record<string, { team1: number | null; team2: number | null; label: string }> = {
              q1: { team1: game.score_q1_team1, team2: game.score_q1_team2, label: 'Q1' },
              halftime: { team1: game.score_halftime_team1, team2: game.score_halftime_team2, label: 'Halftime' },
              q3: { team1: game.score_q3_team1, team2: game.score_q3_team2, label: 'Q3' },
              final: { team1: game.score_final_team1, team2: game.score_final_team2, label: 'Final' },
            };
            return (
            <div style={{ 
              marginTop: '16px', 
              padding: '12px', 
              background: 'var(--bg-1)', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(0, 255, 200, 0.3)'
            }}>
              <h3 style={{ color: '#00ffc8', marginBottom: '12px' }}>Game Results</h3>
              {settlements.map((s, i) => {
                const qs = quarterScores[s.quarter];
                return (
                <div key={i} style={{ 
                  padding: '10px', 
                  marginBottom: '6px', 
                  background: 'rgba(0, 255, 200, 0.1)', 
                  borderRadius: '6px' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <strong style={{ color: '#00ffc8', fontSize: '1rem' }}>{qs?.label || s.quarter.toUpperCase()}</strong>
                    {qs && qs.team1 !== null && qs.team2 !== null && (
                      <span style={{ color: 'var(--text-0)', fontWeight: 700, fontSize: '0.95rem' }}>
                        Seahawks {qs.team1} - Patriots {qs.team2}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {grid[s.square_index]?.pfpUrl && (
                      <img src={grid[s.square_index]!.pfpUrl!} alt=""
                        style={{ width: '28px', height: '28px', borderRadius: '50%', marginRight: '8px' }} />
                    )}
                    <div>
                      <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                        {grid[s.square_index]?.displayName || `FID ${s.winner_fid}`}
                      </span>
                      <span style={{ color: 'var(--text-2)', fontSize: '0.8rem', marginLeft: '8px' }}>
                        Square {s.square_index} ({s.row_digit}-{s.col_digit})
                      </span>
                      <span style={{ color: '#eab308', fontWeight: 600, marginLeft: '8px' }}>
                        {formatBetr(s.prize_amount)} BETR
                      </span>
                    </div>
                  </div>
                  {s.tx_hash && (
                    <a
                      href={`https://basescan.org/tx/${s.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#00ffc8', fontSize: '0.75rem', marginTop: '4px', display: 'inline-block' }}
                    >
                      View on Basescan ↗
                    </a>
                  )}
                </div>
                );
              })}
            </div>
            );
          })()}

          {/* Phase 23.1: Inline Admin Controls */}
          {isAdmin && game.status !== 'settled' && game.status !== 'cancelled' && (
            <div style={{ 
              marginTop: '24px', 
              padding: '16px', 
              background: 'var(--bg-1)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid var(--stroke)' 
            }}>
              <h2 style={{ fontSize: '1rem', marginBottom: '12px' }}>Admin Actions</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '12px' }}>
                Status: <strong>{game.status}</strong> | Numbers: {game.row_numbers ? 'Randomized ✓' : 'Not randomized'}
              </p>

              {adminError && <p style={{ color: 'var(--ember-2)', marginBottom: '8px', fontSize: '0.875rem' }}>{adminError}</p>}
              {adminSuccess && <p style={{ color: '#00ffc8', marginBottom: '8px', fontSize: '0.875rem' }}>{adminSuccess}</p>}

              {/* Start Claiming - only in setup */}
              {game.status === 'setup' && (
                <button
                  onClick={async () => {
                    if (!token) return;
                    setAdminLoading(true);
                    setAdminError(null);
                    setAdminSuccess(null);
                    try {
                      const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/start`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tierDurationMinutes: 60 }),
                      }, token);
                      const data = await res.json();
                      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to start');
                      setAdminSuccess('Claiming phase started!');
                      await loadGameDetails(game.id);
                    } catch (e: any) {
                      setAdminError(e.message || 'Failed to start');
                    } finally {
                      setAdminLoading(false);
                    }
                  }}
                  disabled={adminLoading}
                  className="btn-primary"
                  style={{ marginBottom: '12px' }}
                >
                  {adminLoading ? 'Starting...' : 'Start Claiming'}
                </button>
              )}

              {/* Admin Add FID - setup or claiming */}
              {(game.status === 'setup' || game.status === 'claiming') && (
                <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(0, 255, 200, 0.05)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginBottom: '8px' }}>
                    Admin squares used: {10 - stats.availableAdminSquares}/10
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="FID to add"
                      value={adminAddFid}
                      onChange={(e) => setAdminAddFid(e.target.value)}
                      style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)' }}
                    />
                    <button
                      onClick={async () => {
                        if (!token || !adminAddFid) return;
                        setAdminLoading(true);
                        setAdminError(null);
                        setAdminSuccess(null);
                        try {
                          const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/admin-add`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fid: parseInt(adminAddFid, 10) }),
                          }, token);
                          const data = await res.json();
                          if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to add');
                          setAdminSuccess(`Added FID ${adminAddFid} to grid`);
                          setAdminAddFid('');
                          await loadGameDetails(game.id);
                        } catch (e: any) {
                          setAdminError(e.message || 'Failed to add');
                        } finally {
                          setAdminLoading(false);
                        }
                      }}
                      disabled={adminLoading || !adminAddFid}
                      className="btn-secondary"
                    >
                      {adminLoading ? 'Adding...' : 'Add to Grid'}
                    </button>
                  </div>
                </div>
              )}

              {/* Lock Grid - only in claiming */}
              {game.status === 'claiming' && (
                <button
                  onClick={async () => {
                    if (!token) return;
                    setAdminLoading(true);
                    setAdminError(null);
                    setAdminSuccess(null);
                    try {
                      const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/lock`, {
                        method: 'POST',
                      }, token);
                      const data = await res.json();
                      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to lock');
                      setAdminSuccess('Grid locked!');
                      await loadGameDetails(game.id);
                    } catch (e: any) {
                      setAdminError(e.message || 'Failed to lock');
                    } finally {
                      setAdminLoading(false);
                    }
                  }}
                  disabled={adminLoading}
                  className="btn-secondary"
                  style={{ marginBottom: '12px' }}
                >
                  {adminLoading ? 'Locking...' : 'Lock Grid'}
                </button>
              )}

              {/* Randomize - locked without numbers */}
              {game.status === 'locked' && !game.row_numbers && (
                <button
                  onClick={async () => {
                    if (!token) return;
                    setAdminLoading(true);
                    setAdminError(null);
                    setAdminSuccess(null);
                    try {
                      const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/randomize`, {
                        method: 'POST',
                      }, token);
                      const data = await res.json();
                      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to randomize');
                      setAdminSuccess('Numbers randomized!');
                      await loadGameDetails(game.id);
                    } catch (e: any) {
                      setAdminError(e.message || 'Failed to randomize');
                    } finally {
                      setAdminLoading(false);
                    }
                  }}
                  disabled={adminLoading}
                  className="btn-primary"
                  style={{ marginBottom: '12px' }}
                >
                  {adminLoading ? 'Randomizing...' : 'Randomize Numbers'}
                </button>
              )}

              {/* Enter Scores - locked with numbers */}
              {game.status === 'locked' && game.row_numbers && (
                <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(0, 255, 200, 0.05)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px', color: '#00ffc8' }}>Enter Scores</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '8px', alignItems: 'center', fontSize: '0.75rem' }}>
                    <span></span>
                    <span style={{ textAlign: 'center', fontWeight: 600 }}>SEAHAWKS</span>
                    <span style={{ textAlign: 'center', fontWeight: 600 }}>PATRIOTS</span>
                    
                    <span>Q1:</span>
                    <input type="number" placeholder="0" value={scores.q1Team1} onChange={(e) => setScores(s => ({ ...s, q1Team1: e.target.value }))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)', textAlign: 'center' }} />
                    <input type="number" placeholder="0" value={scores.q1Team2} onChange={(e) => setScores(s => ({ ...s, q1Team2: e.target.value }))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)', textAlign: 'center' }} />
                    
                    <span>Halftime:</span>
                    <input type="number" placeholder="0" value={scores.halftimeTeam1} onChange={(e) => setScores(s => ({ ...s, halftimeTeam1: e.target.value }))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)', textAlign: 'center' }} />
                    <input type="number" placeholder="0" value={scores.halftimeTeam2} onChange={(e) => setScores(s => ({ ...s, halftimeTeam2: e.target.value }))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)', textAlign: 'center' }} />
                    
                    <span>Q3:</span>
                    <input type="number" placeholder="0" value={scores.q3Team1} onChange={(e) => setScores(s => ({ ...s, q3Team1: e.target.value }))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)', textAlign: 'center' }} />
                    <input type="number" placeholder="0" value={scores.q3Team2} onChange={(e) => setScores(s => ({ ...s, q3Team2: e.target.value }))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)', textAlign: 'center' }} />
                    
                    <span>Final:</span>
                    <input type="number" placeholder="0" value={scores.finalTeam1} onChange={(e) => setScores(s => ({ ...s, finalTeam1: e.target.value }))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)', textAlign: 'center' }} />
                    <input type="number" placeholder="0" value={scores.finalTeam2} onChange={(e) => setScores(s => ({ ...s, finalTeam2: e.target.value }))} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--stroke)', background: 'var(--bg-0)', color: 'var(--text-0)', textAlign: 'center' }} />
                  </div>
                  <button
                    onClick={async () => {
                      if (!token) return;
                      setAdminLoading(true);
                      setAdminError(null);
                      setAdminSuccess(null);
                      try {
                        const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/results`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            scoreQ1Team1: scores.q1Team1 ? parseInt(scores.q1Team1, 10) : undefined,
                            scoreQ1Team2: scores.q1Team2 ? parseInt(scores.q1Team2, 10) : undefined,
                            scoreHalftimeTeam1: scores.halftimeTeam1 ? parseInt(scores.halftimeTeam1, 10) : undefined,
                            scoreHalftimeTeam2: scores.halftimeTeam2 ? parseInt(scores.halftimeTeam2, 10) : undefined,
                            scoreQ3Team1: scores.q3Team1 ? parseInt(scores.q3Team1, 10) : undefined,
                            scoreQ3Team2: scores.q3Team2 ? parseInt(scores.q3Team2, 10) : undefined,
                            scoreFinalTeam1: scores.finalTeam1 ? parseInt(scores.finalTeam1, 10) : undefined,
                            scoreFinalTeam2: scores.finalTeam2 ? parseInt(scores.finalTeam2, 10) : undefined,
                          }),
                        }, token);
                        const data = await res.json();
                        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save scores');
                        setAdminSuccess('Scores saved!');
                        await loadGameDetails(game.id);
                      } catch (e: any) {
                        setAdminError(e.message || 'Failed to save scores');
                      } finally {
                        setAdminLoading(false);
                      }
                    }}
                    disabled={adminLoading}
                    className="btn-secondary"
                    style={{ marginTop: '12px', width: '100%' }}
                  >
                    {adminLoading ? 'Saving...' : 'Save Scores'}
                  </button>
                </div>
              )}

              {/* Settle - locked with numbers and all scores entered */}
              {game.status === 'locked' && game.row_numbers && 
               game.score_q1_team1 !== null && game.score_halftime_team1 !== null && 
               game.score_q3_team1 !== null && game.score_final_team1 !== null && (
                <div style={{ marginTop: '12px' }}>
                  {/* Preview button */}
                  {!settlementPreview && (
                    <button
                      onClick={async () => {
                        if (!token) return;
                        setAdminLoading(true);
                        setAdminError(null);
                        try {
                          const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/settle`, {
                            method: 'POST',
                            body: JSON.stringify({ preview: true }),
                          }, token);
                          const data = await res.json();
                          if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load preview');
                          setSettlementPreview(data.data.winners);
                          // Mark already paid quarters
                          const paid = new Set<string>();
                          const results = new Map<string, { txHash: string; txUrl: string }>();
                          for (const w of data.data.winners) {
                            if (w.alreadyPaid) {
                              paid.add(w.quarter);
                              if (w.txHash) results.set(w.quarter, { txHash: w.txHash, txUrl: `https://basescan.org/tx/${w.txHash}` });
                            }
                          }
                          setPaidQuarters(paid);
                          setPayResults(results);
                        } catch (e: any) {
                          setAdminError(e.message || 'Failed to load preview');
                        } finally {
                          setAdminLoading(false);
                        }
                      }}
                      disabled={adminLoading}
                      className="btn-primary"
                      style={{ background: 'linear-gradient(90deg, #00ffc8, #00c8ff)', color: '#000', fontWeight: 600, width: '100%' }}
                    >
                      {adminLoading ? 'Loading...' : 'Preview Settlement'}
                    </button>
                  )}

                  {/* Preview cards */}
                  {settlementPreview && (
                    <div>
                      <h4 style={{ color: '#00ffc8', marginBottom: '12px' }}>Settlement Preview</h4>
                      {settlementPreview.map((w: any, i: number) => (
                        <div key={i} style={{
                          padding: '12px',
                          marginBottom: '8px',
                          background: paidQuarters.has(w.quarter) ? 'rgba(34, 197, 94, 0.1)' : 'rgba(0, 255, 200, 0.05)',
                          border: `1px solid ${paidQuarters.has(w.quarter) ? '#22c55e' : 'rgba(0, 255, 200, 0.3)'}`,
                          borderRadius: '8px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <strong style={{ color: '#00ffc8', fontSize: '1rem' }}>{w.quarterLabel}</strong>
                            <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{formatBetr(w.prizeAmount)} BETR</span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: '1.6' }}>
                            <div>Winner: <strong style={{ color: 'var(--text-1)' }}>{w.displayName || `FID ${w.fid}`}</strong> (FID {w.fid})</div>
                            <div>Square: {w.squareIndex} (digits: {w.rowDigit}-{w.colDigit})</div>
                            <div style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>Wallet: {w.walletAddress}</div>
                          </div>

                          {paidQuarters.has(w.quarter) ? (
                            <div style={{ marginTop: '8px' }}>
                              <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '0.85rem' }}>Paid ✓</span>
                              {payResults.get(w.quarter) && (
                                <a
                                  href={payResults.get(w.quarter)!.txUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#00ffc8', fontSize: '0.75rem', marginLeft: '12px' }}
                                >
                                  View on Basescan ↗
                                </a>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={async () => {
                                if (!token || payingIndex !== null) return;
                                setPayingIndex(i);
                                setAdminError(null);
                                try {
                                  const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/settle`, {
                                    method: 'POST',
                                    body: JSON.stringify({ preview: false, payIndex: i }),
                                  }, token);
                                  const data = await res.json();
                                  if (!res.ok || !data.ok) throw new Error(data.error || 'Payment failed');
                                  setPaidQuarters(prev => new Set([...prev, w.quarter]));
                                  setPayResults(prev => new Map([...prev, [w.quarter, { txHash: data.data.txHash, txUrl: data.data.txUrl }]]));
                                  setAdminSuccess(`${w.quarterLabel} paid!`);
                                } catch (e: any) {
                                  setAdminError(e.message || 'Payment failed');
                                } finally {
                                  setPayingIndex(null);
                                }
                              }}
                              disabled={payingIndex !== null}
                              style={{
                                marginTop: '8px',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#eab308',
                                color: '#000',
                                fontWeight: 600,
                                cursor: payingIndex !== null ? 'not-allowed' : 'pointer',
                                opacity: payingIndex !== null ? 0.5 : 1,
                                width: '100%',
                              }}
                            >
                              {payingIndex === i ? 'Paying...' : `Pay ${formatBetr(w.prizeAmount)} to ${w.displayName || `FID ${w.fid}`}`}
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Finalize button - appears when all 4 are paid */}
                      {paidQuarters.size >= 4 && (
                        <button
                          onClick={async () => {
                            if (!token) return;
                            setAdminLoading(true);
                            setAdminError(null);
                            try {
                              const res = await authedFetch(`/api/superbowl-squares/games/${game.id}/settle`, {
                                method: 'POST',
                                body: JSON.stringify({ finalize: true }),
                              }, token);
                              const data = await res.json();
                              if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to finalize');
                              setAdminSuccess('Game finalized! Status set to settled.');
                              setSettlementPreview(null);
                              await loadGameDetails(game.id);
                            } catch (e: any) {
                              setAdminError(e.message || 'Failed to finalize');
                            } finally {
                              setAdminLoading(false);
                            }
                          }}
                          disabled={adminLoading}
                          className="btn-primary"
                          style={{
                            marginTop: '12px',
                            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                            color: '#fff',
                            fontWeight: 700,
                            width: '100%',
                            padding: '12px',
                            fontSize: '1rem',
                          }}
                        >
                          {adminLoading ? 'Finalizing...' : 'Finalize Game ✓'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Phase 23.2: Cancel Game - always available for admins when not settled/cancelled */}
              <button
                onClick={handleCancelGame}
                disabled={adminLoading || cancellingGame}
                className="btn-secondary"
                style={{ marginTop: '12px', width: '100%', background: 'var(--fire-2)', color: 'var(--text-0)' }}
              >
                {cancellingGame ? 'Cancelling...' : 'Cancel Game'}
              </button>
            </div>
          )}

          {/* Phase 23.2: Confirmation Modal */}
          {showConfirmModal && confirmConfig && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '20px',
              }}
              onClick={() => {
                setShowConfirmModal(false);
                setConfirmConfig(null);
              }}
            >
              <div
                className="hl-card"
                style={{
                  maxWidth: '90%',
                  width: '400px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ color: 'var(--text-0)', marginBottom: '16px', fontSize: '1.125rem' }}>
                  Confirm Action
                </h3>
                <p style={{ color: 'var(--text-1)', marginBottom: '24px', lineHeight: '1.5' }}>
                  {confirmConfig.message}
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setShowConfirmModal(false);
                      setConfirmConfig(null);
                    }}
                    className="btn-secondary"
                  >
                    {confirmConfig.cancelText || 'Cancel'}
                  </button>
                  <button
                    onClick={() => {
                      confirmConfig.onConfirm();
                      setShowConfirmModal(false);
                      setConfirmConfig(null);
                    }}
                    className="btn-primary"
                    style={{ background: 'var(--fire-1)' }}
                  >
                    {confirmConfig.confirmText || 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SuperbowlSquaresClient() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--fire-2)' }}>Loading…</div>}>
      <SuperbowlSquaresContent />
    </Suspense>
  );
}
