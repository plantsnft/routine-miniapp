'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isAdmin } from '~/lib/admin';
import { SUPERBOWL_PROPS } from '~/lib/superbowl-props-constants';
import { APP_URL } from '~/lib/constants';
import { buildShareText } from '~/lib/og-helpers';

interface Game {
  id: string;
  title: string;
  total_prize_pool: number;
  staking_min_amount: number | null;
  submissions_close_at: string;
  actual_total_score: number | null;
  answers_json: number[] | null;
  status: 'open' | 'closed' | 'settled';
  submissionCount?: number;
}

interface LeaderboardEntry {
  rank: number;
  fid: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  score: number;
  totalScoreGuess: number;
  diff: number | null;
}

export default function SuperbowlPropsClient() {
  const { fid, token, status: authStatus } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // User picks
  const [picks, setPicks] = useState<(number | null)[]>(Array(25).fill(null));
  const [totalScoreGuess, setTotalScoreGuess] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [userSubmission, setUserSubmission] = useState<any>(null);
  // Phase 26.14: User's picks and group percentages
  const [userPicks, setUserPicks] = useState<{ picks: number[]; totalScoreGuess: number } | null>(null);
  const [pickPercentages, setPickPercentages] = useState<{ a: number; b: number }[] | null>(null);
  
  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  
  // Admin
  const [adminAnswers, setAdminAnswers] = useState<(number | null)[]>(Array(25).fill(null));
  const [adminTotalScore, setAdminTotalScore] = useState<string>('');
  const [adminLoading, setAdminLoading] = useState(false);
  
  // Share
  const [linkCopied, setLinkCopied] = useState(false);

  const userIsAdmin = fid ? isAdmin(fid) : false;

  // Read gameId from URL query params (used by "See Full Results" link on Results page)
  const searchParams = useSearchParams();
  const urlGameId = searchParams.get('gameId')?.trim() || null;

  // Load game data
  useEffect(() => {
    if (authStatus !== 'authed' || !token) return;
    
    const loadGame = async () => {
      try {
        let gameId: string | null = null;

        if (urlGameId) {
          // Direct game ID from URL — load specific game (works for settled games)
          gameId = urlGameId;
        } else {
          // No URL param — find active game
          const res = await authedFetch('/api/superbowl-props/games/active', { method: 'GET' }, token);
          const data = await res.json();
          if (data.ok && data.data?.game) {
            setGame(data.data.game);
            gameId = data.data.game.id;
          }
        }

        if (gameId) {
          // Load full game details
          const detailRes = await authedFetch(`/api/superbowl-props/games/${gameId}`, { method: 'GET' }, token);
          const detailData = await detailRes.json();
          
          if (detailData.ok) {
            // Set game from detail response (covers both URL-param and active-game paths)
            if (detailData.data.game) {
              setGame(detailData.data.game);
            }
            setLeaderboard(detailData.data.leaderboard || []);
            setPropsSettlements(detailData.data.settlements || []);
            
            // Phase 26.14: Store user's picks (works even during open game)
            if (detailData.data.userPicks) {
              setSubmitted(true);
              setUserPicks(detailData.data.userPicks);
            }
            // Phase 26.14: Store group pick percentages (only available when game not open)
            if (detailData.data.pickPercentages) {
              setPickPercentages(detailData.data.pickPercentages);
            }
            
            // Check if user has submitted (leaderboard-based, for closed/settled games)
            const userEntry = detailData.data.leaderboard?.find((e: LeaderboardEntry) => e.fid === fid);
            if (userEntry) {
              setSubmitted(true);
              setUserSubmission(userEntry);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load game:', e);
        setError('Failed to load game');
      } finally {
        setLoading(false);
      }
    };
    
    loadGame();
  }, [authStatus, token, fid, urlGameId]);

  // Handle pick selection
  const handlePick = (index: number, value: number) => {
    const newPicks = [...picks];
    newPicks[index] = value;
    setPicks(newPicks);
  };

  // Submit picks
  const handleSubmit = async () => {
    if (!game || !token) return;
    
    // Validate all picks made
    if (picks.some(p => p === null)) {
      alert('Please make a selection for all 25 props');
      return;
    }
    
    const totalGuess = parseInt(totalScoreGuess);
    if (isNaN(totalGuess) || totalGuess < 0 || totalGuess > 200) {
      alert('Please enter a valid total score guess (0-200)');
      return;
    }
    
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/superbowl-props/submit', {
        method: 'POST',
        body: JSON.stringify({
          gameId: game.id,
          picks,
          totalScoreGuess: totalGuess,
        }),
      }, token);
      
      const data = await res.json();
      
      if (data.ok) {
        setSubmitted(true);
        alert('Your picks have been submitted!');
      } else {
        alert(data.error || 'Failed to submit');
      }
    } catch (e) {
      console.error('Submit error:', e);
      alert('Failed to submit picks');
    } finally {
      setSubmitting(false);
    }
  };

  // Share
  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const url = APP_URL + '/superbowl-props';
        const text = buildShareText(
          'SUPERBOWL PROPS',
          game?.total_prize_pool,
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

  const handleCopyLink = async () => {
    try {
      const url = APP_URL + '/superbowl-props';
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Ignore
    }
  };

  // Admin: Close game
  const handleClose = async () => {
    if (!game || !token) return;
    setAdminLoading(true);
    try {
      const res = await authedFetch(`/api/superbowl-props/games/${game.id}/close`, { method: 'POST' }, token);
      const data = await res.json();
      if (data.ok) {
        setGame({ ...game, status: 'closed' });
        alert('Game closed');
      } else {
        alert(data.error || 'Failed to close');
      }
    } catch (e) {
      alert('Failed to close game');
    } finally {
      setAdminLoading(false);
    }
  };

  // Admin: Enter results
  const handleEnterResults = async () => {
    if (!game || !token) return;
    
    if (adminAnswers.some(a => a === null)) {
      alert('Please select an answer for all 25 props');
      return;
    }
    
    const totalScore = parseInt(adminTotalScore);
    if (isNaN(totalScore) || totalScore < 0) {
      alert('Please enter the actual total score');
      return;
    }
    
    setAdminLoading(true);
    try {
      const res = await authedFetch(`/api/superbowl-props/games/${game.id}/results`, {
        method: 'POST',
        body: JSON.stringify({
          answers: adminAnswers,
          actualTotalScore: totalScore,
        }),
      }, token);
      
      const data = await res.json();
      if (data.ok) {
        alert(`Results saved! Scored ${data.data.scoredCount} submissions.`);
        // Reload
        window.location.reload();
      } else {
        alert(data.error || 'Failed to enter results');
      }
    } catch (e) {
      alert('Failed to enter results');
    } finally {
      setAdminLoading(false);
    }
  };

  // Settlement preview/pay-one states
  const [settlementPreview, setSettlementPreview] = useState<any[] | null>(null);
  const [paidWinners, setPaidWinners] = useState<Set<number>>(new Set());
  const [payingIndex, setPayingIndex] = useState<number | null>(null);
  const [payResults, setPayResults] = useState<Map<number, { txHash: string; txUrl: string }>>(new Map());
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleSuccess, setSettleSuccess] = useState<string | null>(null);

  // Settlement records (for Basescan links on leaderboard)
  const [propsSettlements, setPropsSettlements] = useState<any[]>([]);

  if (authStatus !== 'authed') {
    return (
      <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto text-center py-12">
          <h1 style={{ color: 'var(--fire-1)', fontSize: '1.5rem', fontWeight: 700 }}>BETR SUPERBOWL: PROPS</h1>
          <p style={{ color: 'var(--text-2)', marginTop: '1rem' }}>Sign in to play</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto text-center py-12">
          <p style={{ color: 'var(--text-2)' }}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto text-center py-12">
          <h1 style={{ color: 'var(--fire-1)', fontSize: '1.5rem', fontWeight: 700 }}>BETR SUPERBOWL: PROPS</h1>
          <p style={{ color: 'var(--text-2)', marginTop: '1rem' }}>No active game</p>
        </div>
      </main>
    );
  }

  const deadline = new Date(game.submissions_close_at);
  const isOpen = game.status === 'open' && new Date() < deadline;
  const canSubmit = isOpen && !submitted;

  return (
    <main className="min-h-screen p-4 pb-24" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-2xl mx-auto">
        <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back
        </Link>

        {/* Game artwork */}
        <div style={{ width: '100%', maxHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
          <Image src="/superbowlprops.png" alt="SUPERBOWL PROPS" width={500} height={420} style={{ maxHeight: '280px', width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ color: 'var(--fire-1)', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.05em' }}>
            BETR SUPERBOWL: PROPS
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', marginTop: '4px' }}>
            Seahawks vs Patriots • 25 Props + Tiebreaker
          </p>
          <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-1)' }}>
            <div>Payout: 20M + 20M potentially</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: '2px' }}>Must be staking 1M $BETR to play</div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.5' }}>
            <div>Most correct answers — 10M</div>
            <div>2nd — 5M</div>
            <div>3rd — 4.2M</div>
            <div>Least correct — 4.2M</div>
            <div style={{ color: '#D946EF', fontWeight: 600, marginTop: '4px' }}>Betr believer bonus: add 5M $BETR to any prize if you stake 50M</div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <span style={{
              padding: '4px 12px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: game.status === 'open' ? 'rgba(34, 197, 94, 0.2)' : game.status === 'settled' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: game.status === 'open' ? '#22c55e' : game.status === 'settled' ? '#eab308' : '#ef4444',
            }}>
              {game.status === 'open' ? 'OPEN' : game.status === 'settled' ? 'SETTLED' : 'CLOSED'}
            </span>
            <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', marginLeft: '12px' }}>
              {game.submissionCount || 0} submissions
            </span>
          </div>
          
          {/* Share buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: '12px', justifyContent: 'center' }}>
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

        {/* Submitted message */}
        {submitted && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            textAlign: 'center',
          }}>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ You have submitted your picks!</span>
            {userSubmission?.score !== undefined && (
              <div style={{ color: 'var(--text-2)', fontSize: '0.875rem', marginTop: '4px' }}>
                Score: {userSubmission.score}/25 • Tiebreaker: {userSubmission.totalScoreGuess}
              </div>
            )}
          </div>
        )}

        {/* Phase 26.14: Your Picks (shown after submission) */}
        {submitted && userPicks && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ color: 'var(--fire-1)', fontSize: '1.125rem', fontWeight: 600, marginBottom: '12px' }}>
              Your Picks
            </h2>
            {SUPERBOWL_PROPS.map((prop, i) => {
              const userPick = userPicks.picks[i]; // 0 = option A, 1 = option B
              const pct = pickPercentages?.[i];
              return (
                <div key={i} style={{
                  background: 'var(--bg-1)',
                  border: '1px solid var(--stroke)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '8px',
                }}>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-3)', marginRight: '8px' }}>{i + 1}.</span>
                    {prop.q}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Option A */}
                    <div style={{
                      position: 'relative',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: userPick === 0 ? '2px solid var(--fire-1)' : '1px solid var(--stroke)',
                      background: userPick === 0 ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-2)',
                      overflow: 'hidden',
                    }}>
                      {pct && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          bottom: 0,
                          width: `${pct.a}%`,
                          background: userPick === 0 ? 'rgba(20, 184, 166, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          transition: 'width 0.3s ease',
                        }} />
                      )}
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          color: userPick === 0 ? 'var(--fire-1)' : 'var(--text-2)',
                          fontSize: '0.875rem',
                          fontWeight: userPick === 0 ? 600 : 400,
                        }}>
                          {userPick === 0 && '✓ '}{prop.a}
                        </span>
                        {pct && (
                          <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontWeight: 600 }}>
                            {pct.a}%
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Option B */}
                    <div style={{
                      position: 'relative',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: userPick === 1 ? '2px solid var(--fire-1)' : '1px solid var(--stroke)',
                      background: userPick === 1 ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-2)',
                      overflow: 'hidden',
                    }}>
                      {pct && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          bottom: 0,
                          width: `${pct.b}%`,
                          background: userPick === 1 ? 'rgba(20, 184, 166, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          transition: 'width 0.3s ease',
                        }} />
                      )}
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          color: userPick === 1 ? 'var(--fire-1)' : 'var(--text-2)',
                          fontSize: '0.875rem',
                          fontWeight: userPick === 1 ? 600 : 400,
                        }}>
                          {userPick === 1 && '✓ '}{prop.b}
                        </span>
                        {pct && (
                          <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontWeight: 600 }}>
                            {pct.b}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Tiebreaker display */}
            <div style={{
              background: 'var(--bg-1)',
              border: '2px solid var(--fire-1)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginTop: '8px',
            }}>
              <span style={{ color: 'var(--fire-1)', fontWeight: 600, fontSize: '0.875rem' }}>
                TIEBREAKER: Your Total Score Guess — {userPicks.totalScoreGuess}
              </span>
            </div>
          </div>
        )}

        {/* Props list */}
        {(canSubmit || game.status === 'open') && !submitted && (
          <div style={{ marginBottom: '24px' }}>
            {SUPERBOWL_PROPS.map((prop, i) => (
              <div key={i} style={{
                background: 'var(--bg-1)',
                border: '1px solid var(--stroke)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '8px',
              }}>
                <div style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-3)', marginRight: '8px' }}>{i + 1}.</span>
                  {prop.q}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handlePick(i, 0)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: picks[i] === 0 ? '2px solid var(--fire-1)' : '1px solid var(--stroke)',
                      background: picks[i] === 0 ? 'rgba(20, 184, 166, 0.2)' : 'var(--bg-2)',
                      color: picks[i] === 0 ? 'var(--fire-1)' : 'var(--text-2)',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    {prop.a}
                  </button>
                  <button
                    onClick={() => handlePick(i, 1)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: picks[i] === 1 ? '2px solid var(--fire-1)' : '1px solid var(--stroke)',
                      background: picks[i] === 1 ? 'rgba(20, 184, 166, 0.2)' : 'var(--bg-2)',
                      color: picks[i] === 1 ? 'var(--fire-1)' : 'var(--text-2)',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    {prop.b}
                  </button>
                </div>
              </div>
            ))}

            {/* Total Score Tiebreaker */}
            <div style={{
              background: 'var(--bg-1)',
              border: '2px solid var(--fire-1)',
              borderRadius: '8px',
              padding: '16px',
              marginTop: '16px',
            }}>
              <div style={{ color: 'var(--fire-1)', fontWeight: 600, marginBottom: '8px' }}>
                TIEBREAKER: Total Game Score
              </div>
              <input
                type="number"
                value={totalScoreGuess}
                onChange={(e) => setTotalScoreGuess(e.target.value)}
                placeholder="Enter your guess (0-200)"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--stroke)',
                  background: 'var(--bg-2)',
                  color: 'var(--text-1)',
                  fontSize: '1rem',
                }}
              />
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: '100%',
                marginTop: '16px',
                padding: '16px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--fire-1)',
                color: 'white',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Picks'}
            </button>
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h2 style={{ color: 'var(--fire-1)', fontSize: '1.125rem', fontWeight: 600, marginBottom: '12px' }}>
              Leaderboard
            </h2>
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--stroke)', borderRadius: '8px', overflow: 'hidden' }}>
              {leaderboard.map((entry, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  borderBottom: i < leaderboard.length - 1 ? '1px solid var(--stroke)' : 'none',
                  background: entry.fid === fid ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
                }}>
                  <div style={{
                    width: '32px',
                    color: entry.rank <= 5 ? '#eab308' : 'var(--text-3)',
                    fontWeight: 600,
                  }}>
                    #{entry.rank}
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-1)' }}>
                    {entry.pfpUrl && (
                      <img src={entry.pfpUrl} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0 }} />
                    )}
                    <span>
                      {entry.displayName || entry.username || `FID ${entry.fid}`}
                      {entry.fid === fid && <span style={{ color: 'var(--fire-1)', marginLeft: '8px' }}>(you)</span>}
                    </span>
                  </div>
                  <div style={{ color: 'var(--fire-1)', fontWeight: 600, marginRight: '16px' }}>
                    {entry.score}/25
                  </div>
                  <div style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>
                    TB: {entry.totalScoreGuess}
                    {entry.diff !== null && <span> (±{entry.diff})</span>}
                  </div>
                  {(() => {
                    const settlement = propsSettlements.find((s: any) => s.winner_fid === entry.fid);
                    if (!settlement?.tx_hash) return null;
                    return (
                      <a
                        href={`https://basescan.org/tx/${settlement.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--fire-1)', fontSize: '0.7rem', marginLeft: 'auto' }}
                      >
                        Basescan ↗
                      </a>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin controls */}
        {userIsAdmin && (
          <div style={{
            marginTop: '32px',
            padding: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
          }}>
            <h3 style={{ color: '#ef4444', fontWeight: 600, marginBottom: '16px' }}>Admin Controls</h3>
            
            {game.status === 'open' && (
              <button
                onClick={handleClose}
                disabled={adminLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#ef4444',
                  color: 'white',
                  cursor: 'pointer',
                  marginRight: '8px',
                }}
              >
                Close Submissions
              </button>
            )}

            {game.status === 'closed' && !game.answers_json && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ color: 'var(--text-1)', marginBottom: '8px' }}>Enter Results</h4>
                {SUPERBOWL_PROPS.map((prop, i) => (
                  <div key={i} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text-3)', width: '24px' }}>{i + 1}.</span>
                    <button
                      onClick={() => {
                        const newAnswers = [...adminAnswers];
                        newAnswers[i] = 0;
                        setAdminAnswers(newAnswers);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: adminAnswers[i] === 0 ? '2px solid #22c55e' : '1px solid var(--stroke)',
                        background: adminAnswers[i] === 0 ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-2)',
                        color: adminAnswers[i] === 0 ? '#22c55e' : 'var(--text-2)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {prop.a}
                    </button>
                    <button
                      onClick={() => {
                        const newAnswers = [...adminAnswers];
                        newAnswers[i] = 1;
                        setAdminAnswers(newAnswers);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: adminAnswers[i] === 1 ? '2px solid #22c55e' : '1px solid var(--stroke)',
                        background: adminAnswers[i] === 1 ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-2)',
                        color: adminAnswers[i] === 1 ? '#22c55e' : 'var(--text-2)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {prop.b}
                    </button>
                  </div>
                ))}
                <div style={{ marginTop: '16px' }}>
                  <label style={{ color: 'var(--text-1)', display: 'block', marginBottom: '4px' }}>Actual Total Score:</label>
                  <input
                    type="number"
                    value={adminTotalScore}
                    onChange={(e) => setAdminTotalScore(e.target.value)}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid var(--stroke)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-1)',
                      width: '120px',
                    }}
                  />
                </div>
                <button
                  onClick={handleEnterResults}
                  disabled={adminLoading}
                  style={{
                    marginTop: '16px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#22c55e',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Save Results & Score
                </button>
              </div>
            )}

            {game.status === 'closed' && game.answers_json && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ color: 'var(--text-1)', marginBottom: '8px' }}>Settle Game</h4>
                <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', marginBottom: '8px' }}>
                  Actual Total Score: {game.actual_total_score}
                </p>

                {/* Preview button */}
                {!settlementPreview && (
                  <button
                    onClick={async () => {
                      if (!token) return;
                      setAdminLoading(true);
                      setSettleError(null);
                      try {
                        const res = await authedFetch(`/api/superbowl-props/games/${game.id}/settle`, {
                          method: 'POST',
                          body: JSON.stringify({ preview: true }),
                        }, token);
                        const data = await res.json();
                        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load preview');
                        setSettlementPreview(data.data.winners);
                        // Mark already paid winners
                        const paid = new Set<number>();
                        const results = new Map<number, { txHash: string; txUrl: string }>();
                        for (const w of data.data.winners) {
                          if (w.alreadyPaid) {
                            paid.add(w.index);
                            if (w.txHash) results.set(w.index, { txHash: w.txHash, txUrl: `https://basescan.org/tx/${w.txHash}` });
                          }
                        }
                        setPaidWinners(paid);
                        setPayResults(results);
                      } catch (e: any) {
                        setSettleError(e.message || 'Failed to load preview');
                      } finally {
                        setAdminLoading(false);
                      }
                    }}
                    disabled={adminLoading}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--fire-1)',
                      color: '#000',
                      fontWeight: 600,
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    {adminLoading ? 'Loading...' : 'Preview Settlement'}
                  </button>
                )}

                {settleError && <p style={{ color: '#ef4444', marginTop: '8px', fontSize: '0.875rem' }}>{settleError}</p>}
                {settleSuccess && <p style={{ color: '#22c55e', marginTop: '8px', fontSize: '0.875rem' }}>{settleSuccess}</p>}

                {/* Preview cards */}
                {settlementPreview && (
                  <div>
                    <h4 style={{ color: 'var(--fire-1)', marginBottom: '12px', marginTop: '12px' }}>Settlement Preview</h4>
                    {settlementPreview.map((w: any, i: number) => (
                      <div key={i} style={{
                        padding: '12px',
                        marginBottom: '8px',
                        background: paidWinners.has(i) ? 'rgba(34, 197, 94, 0.1)' : 'rgba(20, 184, 166, 0.05)',
                        border: `1px solid ${paidWinners.has(i) ? '#22c55e' : 'var(--stroke)'}`,
                        borderRadius: '8px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <strong style={{ color: 'var(--fire-1)', fontSize: '1rem' }}>{w.label}</strong>
                          <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{(w.totalAmount / 1_000_000).toFixed(1)}M BETR</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          {w.pfpUrl && (
                            <img src={w.pfpUrl} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                          )}
                          <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{w.displayName || w.username || `FID ${w.fid}`}</span>
                          <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>Score: {w.score}/25</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.5' }}>
                          <div>Base: {(w.baseAmount / 1_000_000).toFixed(1)}M{w.hasBetrBelieverBonus && ` + Bonus: ${(w.bonusAmount / 1_000_000).toFixed(0)}M`}</div>
                          {w.hasBetrBelieverBonus && (
                            <div style={{ color: '#D946EF', fontWeight: 600, fontSize: '0.75rem' }}>BETR Believer Bonus ✓ (staked: {(Number(w.stakedAmount) / 1_000_000).toFixed(0)}M)</div>
                          )}
                          <div style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>Wallet: {w.walletAddress}</div>
                        </div>

                        {paidWinners.has(i) ? (
                          <div style={{ marginTop: '8px' }}>
                            <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '0.85rem' }}>Paid ✓</span>
                            {payResults.get(i) && (
                              <a
                                href={payResults.get(i)!.txUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--fire-1)', fontSize: '0.75rem', marginLeft: '12px' }}
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
                              setSettleError(null);
                              try {
                                const res = await authedFetch(`/api/superbowl-props/games/${game.id}/settle`, {
                                  method: 'POST',
                                  body: JSON.stringify({ preview: false, payIndex: i }),
                                }, token);
                                const data = await res.json();
                                if (!res.ok || !data.ok) throw new Error(data.error || 'Payment failed');
                                setPaidWinners(prev => new Set([...prev, i]));
                                setPayResults(prev => new Map([...prev, [i, { txHash: data.data.txHash, txUrl: data.data.txUrl }]]));
                                setSettleSuccess(`${w.label} paid!`);
                              } catch (e: any) {
                                setSettleError(e.message || 'Payment failed');
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
                            {payingIndex === i ? 'Paying...' : `Pay ${(w.totalAmount / 1_000_000).toFixed(1)}M to ${w.displayName || w.username || `FID ${w.fid}`}`}
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Finalize button */}
                    {paidWinners.size >= 4 && (
                      <button
                        onClick={async () => {
                          if (!token) return;
                          setAdminLoading(true);
                          setSettleError(null);
                          try {
                            const res = await authedFetch(`/api/superbowl-props/games/${game.id}/settle`, {
                              method: 'POST',
                              body: JSON.stringify({ finalize: true }),
                            }, token);
                            const data = await res.json();
                            if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to finalize');
                            setSettleSuccess('Game finalized! Status set to settled.');
                            setSettlementPreview(null);
                            window.location.reload();
                          } catch (e: any) {
                            setSettleError(e.message || 'Failed to finalize');
                          } finally {
                            setAdminLoading(false);
                          }
                        }}
                        disabled={adminLoading}
                        style={{
                          marginTop: '12px',
                          padding: '12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                          color: '#fff',
                          fontWeight: 700,
                          cursor: 'pointer',
                          width: '100%',
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
          </div>
        )}
      </div>
    </main>
  );
}
