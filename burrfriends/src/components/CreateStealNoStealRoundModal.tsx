'use client';

import { useState, useEffect } from 'react';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

type Player = {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
};

type MatchPairing = {
  playerAFid: number;
  playerBFid: number;
  briefcaseAmount: number;
  briefcaseLabel?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (roundId: string) => void;
  gameId: string;
  currentRound: number;
  prizeAmount: number;
  token: string;
};

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

export function CreateStealNoStealRoundModal({
  isOpen,
  onClose,
  onSuccess,
  gameId,
  currentRound,
  prizeAmount,
  token,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligiblePlayers, setEligiblePlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchPairing[]>([]);
  const [byePlayerFid, setByePlayerFid] = useState<number | null>(null);

  // Load eligible players when modal opens
  useEffect(() => {
    if (!isOpen || !token || !gameId) return;
    
    const loadPlayers = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch eligible players from signups endpoint (R1) or progress (R2+)
        if (currentRound === 1) {
          const res = await authedFetch(`/api/steal-no-steal/games/${gameId}/signups`, { method: 'GET' }, token);
          const data = await res.json();
          if (data?.ok && Array.isArray(data?.data)) {
            setEligiblePlayers(data.data.map((s: any) => ({
              fid: Number(s.fid),
              username: s.username,
              display_name: s.display_name,
              pfp_url: s.pfp_url,
            })));
          } else {
            throw new Error(data?.error || 'Failed to load signups');
          }
        } else {
          // For later rounds, get progress to find previous round winners + bye player
          const res = await authedFetch(`/api/steal-no-steal/games/${gameId}/progress`, { method: 'GET' }, token);
          const data = await res.json();
          if (data?.ok && data?.data) {
            const prevRound = data.data.rounds?.find((r: any) => r.round_number === currentRound - 1);
            if (prevRound) {
              // Get winners from previous round matches
              const winners: Player[] = [];
              for (const m of prevRound.matches || []) {
                if (m.winner_fid) {
                  const player = m.player_a_fid === m.winner_fid ? m.playerA : m.playerB;
                  winners.push({
                    fid: Number(m.winner_fid),
                    username: player?.username || null,
                    display_name: player?.display_name || null,
                    pfp_url: player?.pfp_url || null,
                  });
                }
              }
              // Include bye player from previous round
              if (prevRound.bye_player_fid) {
                const byeFid = Number(prevRound.bye_player_fid);
                // Find their profile from signups
                const signup = data.data.signups?.find((s: any) => Number(s.fid) === byeFid);
                if (!winners.some(w => w.fid === byeFid)) {
                  winners.push({
                    fid: byeFid,
                    username: signup?.username || null,
                    display_name: signup?.display_name || null,
                    pfp_url: signup?.pfp_url || null,
                  });
                }
              }
              setEligiblePlayers(winners);
            } else {
              throw new Error('Previous round not found');
            }
          } else {
            throw new Error(data?.error || 'Failed to load progress');
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load players');
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [isOpen, token, gameId, currentRound]);

  // Auto-generate pairings when eligible players change
  useEffect(() => {
    if (eligiblePlayers.length < 2) {
      setMatches([]);
      setByePlayerFid(null);
      return;
    }
    randomizePairings();
  }, [eligiblePlayers]);

  const randomizePairings = () => {
    if (eligiblePlayers.length < 2) return;

    // Fisher-Yates shuffle
    const shuffled = [...eligiblePlayers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // If odd number, last player gets a bye
    const isOdd = shuffled.length % 2 === 1;
    const playersForMatches = isOdd ? shuffled.slice(0, -1) : shuffled;
    const newByePlayer = isOdd ? shuffled[shuffled.length - 1].fid : null;

    // Create match pairings
    const numMatches = Math.floor(playersForMatches.length / 2);
    const defaultAmount = numMatches > 0 ? prizeAmount / numMatches : prizeAmount;
    
    const newMatches: MatchPairing[] = [];
    for (let i = 0; i < playersForMatches.length; i += 2) {
      // Randomly assign roles
      const [a, b] = Math.random() < 0.5 
        ? [playersForMatches[i], playersForMatches[i + 1]]
        : [playersForMatches[i + 1], playersForMatches[i]];
      newMatches.push({
        playerAFid: a.fid,
        playerBFid: b.fid,
        briefcaseAmount: defaultAmount,
        briefcaseLabel: '',
      });
    }

    setMatches(newMatches);
    setByePlayerFid(newByePlayer);
  };

  const handlePlayerChange = (matchIndex: number, role: 'A' | 'B', newFid: number) => {
    setMatches(prev => {
      const updated = [...prev];
      if (role === 'A') {
        updated[matchIndex] = { ...updated[matchIndex], playerAFid: newFid };
      } else {
        updated[matchIndex] = { ...updated[matchIndex], playerBFid: newFid };
      }
      return updated;
    });
  };

  const handleAmountChange = (matchIndex: number, amount: number) => {
    setMatches(prev => {
      const updated = [...prev];
      updated[matchIndex] = { ...updated[matchIndex], briefcaseAmount: amount };
      return updated;
    });
  };

  const handleBriefcaseLabelChange = (matchIndex: number, label: string) => {
    setMatches(prev => {
      const updated = [...prev];
      updated[matchIndex] = { ...updated[matchIndex], briefcaseLabel: label };
      return updated;
    });
  };

  const handleByeChange = (fid: number | null) => {
    setByePlayerFid(fid);
    // Recalculate matches to exclude new bye player
    if (fid === null) {
      // No bye - pair everyone
      const numMatches = Math.floor(eligiblePlayers.length / 2);
      const defaultAmount = numMatches > 0 ? prizeAmount / numMatches : prizeAmount;
      const newMatches: MatchPairing[] = [];
      const players = [...eligiblePlayers];
      for (let i = 0; i < players.length - (players.length % 2); i += 2) {
        newMatches.push({
          playerAFid: players[i].fid,
          playerBFid: players[i + 1].fid,
          briefcaseAmount: defaultAmount,
          briefcaseLabel: '',
        });
      }
      setMatches(newMatches);
    } else {
      // Remove bye player from matches and repair if needed
      const remainingPlayers = eligiblePlayers.filter(p => p.fid !== fid);
      const numMatches = Math.floor(remainingPlayers.length / 2);
      const defaultAmount = numMatches > 0 ? prizeAmount / numMatches : prizeAmount;
      
      // Keep existing matches but remove any that include the bye player
      const updatedMatches = matches.filter(
        m => m.playerAFid !== fid && m.playerBFid !== fid
      );
      
      // Find any unmatched players
      const matchedFids = new Set<number>();
      updatedMatches.forEach(m => {
        matchedFids.add(m.playerAFid);
        matchedFids.add(m.playerBFid);
      });
      const unmatchedPlayers = remainingPlayers.filter(p => !matchedFids.has(p.fid));
      
      // Pair unmatched players
      for (let i = 0; i + 1 < unmatchedPlayers.length; i += 2) {
        updatedMatches.push({
          playerAFid: unmatchedPlayers[i].fid,
          playerBFid: unmatchedPlayers[i + 1].fid,
          briefcaseAmount: defaultAmount,
          briefcaseLabel: '',
        });
      }
      
      setMatches(updatedMatches);
    }
  };

  const handleConfirm = async () => {
    if (matches.length === 0) {
      setError('No matches to create');
      return;
    }

    // Validate no duplicate players across matches
    const usedFids = new Set<number>();
    for (const m of matches) {
      if (usedFids.has(m.playerAFid) || usedFids.has(m.playerBFid)) {
        setError('Each player can only appear in one match');
        return;
      }
      if (m.playerAFid === m.playerBFid) {
        setError('Player A and B must be different');
        return;
      }
      if (m.briefcaseLabel?.trim()) {
        if (m.briefcaseAmount < 0) {
          setError('Briefcase amount must be >= 0 when label is set');
          return;
        }
      } else if (m.briefcaseAmount <= 0) {
        setError('Briefcase amount must be positive');
        return;
      }
      usedFids.add(m.playerAFid);
      usedFids.add(m.playerBFid);
    }

    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        customMatches: matches.map(m => ({
          playerAFid: m.playerAFid,
          playerBFid: m.playerBFid,
          briefcaseAmount: m.briefcaseAmount,
          ...(m.briefcaseLabel?.trim() && { briefcaseLabel: m.briefcaseLabel.trim() }),
        })),
      };
      if (byePlayerFid !== null) {
        body.byePlayerFid = byePlayerFid;
      }

      const res = await authedFetch(
        `/api/steal-no-steal/games/${gameId}/rounds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        token
      );
      const data = await res.json();
      if (!data?.ok) {
        throw new Error(data?.error || 'Failed to create round');
      }
      onSuccess(data.data.roundId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create round');
    } finally {
      setCreating(false);
    }
  };

  const getPlayerDisplay = (fid: number) => {
    const player = eligiblePlayers.find(p => p.fid === fid);
    return player?.display_name || player?.username || `FID ${fid}`;
  };

  const getPlayerPfp = (fid: number) => {
    const player = eligiblePlayers.find(p => p.fid === fid);
    return player?.pfp_url || DEFAULT_PFP;
  };

  // Get available players for dropdowns (exclude bye and already-used in other matches)
  const getAvailablePlayers = (matchIndex: number, excludeFid?: number) => {
    const usedInOtherMatches = new Set<number>();
    matches.forEach((m, idx) => {
      if (idx !== matchIndex) {
        usedInOtherMatches.add(m.playerAFid);
        usedInOtherMatches.add(m.playerBFid);
      }
    });
    return eligiblePlayers.filter(p => 
      p.fid !== byePlayerFid && 
      !usedInOtherMatches.has(p.fid) &&
      p.fid !== excludeFid
    );
  };

  if (!isOpen) return null;

  const isOdd = eligiblePlayers.length % 2 === 1;

  return (
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
      onClick={() => !loading && !creating && onClose()}
    >
      <div
        className="hl-card"
        style={{
          maxWidth: '95%',
          width: '700px',
          maxHeight: '90vh',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: 'var(--text-0)', margin: 0 }}>Set Up Round {currentRound}</h2>
          <button
            onClick={onClose}
            disabled={loading || creating}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-1)',
              fontSize: '24px',
              cursor: loading || creating ? 'not-allowed' : 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ color: '#ef4444', marginBottom: '12px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-1)' }}>
            Loading eligible players...
          </div>
        )}

        {/* Content */}
        {!loading && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Player count */}
            <div style={{ marginBottom: '16px', color: 'var(--text-1)', fontSize: '0.875rem' }}>
              {eligiblePlayers.length} eligible players
            </div>

            {/* Odd player warning + bye selection */}
            {isOdd && (
              <div style={{
                padding: '12px',
                marginBottom: '16px',
                background: 'var(--bg-1)',
                border: '1px solid var(--fire-1)',
                borderRadius: 'var(--radius-md)',
              }}>
                <p style={{ color: 'var(--fire-1)', fontWeight: 600, marginBottom: '8px' }}>
                  ⚠️ There are {eligiblePlayers.length} players (odd number)
                </p>
                <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '8px' }}>
                  Select who gets a bye (advances to next round without playing):
                </p>
                <select
                  value={byePlayerFid ?? ''}
                  onChange={(e) => handleByeChange(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--stroke)',
                    background: 'var(--bg-2)',
                    color: 'var(--text-0)',
                  }}
                >
                  <option value="">Select bye player...</option>
                  {eligiblePlayers.map((p) => (
                    <option key={p.fid} value={p.fid}>
                      {p.display_name || p.username || `FID ${p.fid}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Matches */}
            {matches.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ color: 'var(--text-0)', margin: 0 }}>Match Pairings</h3>
                  <button
                    onClick={randomizePairings}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                  >
                    🔀 Randomize
                  </button>
                </div>

                {matches.map((match, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      background: 'var(--bg-1)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--stroke)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginBottom: '8px' }}>
                      Match {idx + 1}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Player A (Holder) */}
                      <div style={{ flex: '1 1 200px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--fire-1)', display: 'block', marginBottom: '4px' }}>
                          💼 HOLDER (Player A)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <img
                            src={getPlayerPfp(match.playerAFid)}
                            alt=""
                            style={{ width: 28, height: 28, borderRadius: '50%' }}
                          />
                          <select
                            value={match.playerAFid}
                            onChange={(e) => handlePlayerChange(idx, 'A', Number(e.target.value))}
                            style={{
                              flex: 1,
                              padding: '6px',
                              borderRadius: '4px',
                              border: '1px solid var(--stroke)',
                              background: 'var(--bg-2)',
                              color: 'var(--text-0)',
                              fontSize: '0.875rem',
                            }}
                          >
                            <option value={match.playerAFid}>{getPlayerDisplay(match.playerAFid)}</option>
                            {getAvailablePlayers(idx, match.playerBFid).map((p) => (
                              p.fid !== match.playerAFid && (
                                <option key={p.fid} value={p.fid}>
                                  {p.display_name || p.username || `FID ${p.fid}`}
                                </option>
                              )
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* VS */}
                      <div style={{ color: 'var(--text-1)', fontSize: '0.75rem', padding: '0 4px' }}>vs</div>

                      {/* Player B (Decider) */}
                      <div style={{ flex: '1 1 200px' }}>
                        <label style={{ fontSize: '0.7rem', color: '#f59e0b', display: 'block', marginBottom: '4px' }}>
                          🎯 DECIDER (Player B)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <img
                            src={getPlayerPfp(match.playerBFid)}
                            alt=""
                            style={{ width: 28, height: 28, borderRadius: '50%' }}
                          />
                          <select
                            value={match.playerBFid}
                            onChange={(e) => handlePlayerChange(idx, 'B', Number(e.target.value))}
                            style={{
                              flex: 1,
                              padding: '6px',
                              borderRadius: '4px',
                              border: '1px solid var(--stroke)',
                              background: 'var(--bg-2)',
                              color: 'var(--text-0)',
                              fontSize: '0.875rem',
                            }}
                          >
                            <option value={match.playerBFid}>{getPlayerDisplay(match.playerBFid)}</option>
                            {getAvailablePlayers(idx, match.playerAFid).map((p) => (
                              p.fid !== match.playerBFid && (
                                <option key={p.fid} value={p.fid}>
                                  {p.display_name || p.username || `FID ${p.fid}`}
                                </option>
                              )
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Briefcase Amount */}
                      <div style={{ flex: '0 0 auto' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-1)', display: 'block', marginBottom: '4px' }}>
                          Briefcase
                        </label>
                        <div className="neon-briefcase">
                          <span className="neon-briefcase-icon">💼</span>
                          <input
                            type="number"
                            value={match.briefcaseAmount}
                            onChange={(e) => handleAmountChange(idx, parseFloat(e.target.value) || 0)}
                            onPaste={async (e) => {
                              const text = await getPasteText(e);
                              if (text == null || text === '') return;
                              const num = parseFloat(text.replace(/,/g, '').trim());
                              if (Number.isNaN(num) || num < 0) {
                                e.preventDefault();
                                return;
                              }
                              e.preventDefault();
                              handleAmountChange(idx, num);
                            }}
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>

                      {/* Briefcase label (optional, Phase 17 special) */}
                      <div style={{ flex: '1 1 120px', minWidth: '100px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-1)', display: 'block', marginBottom: '4px' }}>
                          Label (optional)
                        </label>
                        <input
                          type="text"
                          value={match.briefcaseLabel ?? ''}
                          onChange={(e) => handleBriefcaseLabelChange(idx, e.target.value)}
                          placeholder="e.g. YOU LOSE or YOU WIN"
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--stroke)',
                            background: 'var(--bg-2)',
                            color: 'var(--text-0)',
                            fontSize: '0.875rem',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bye player display */}
            {byePlayerFid && (
              <div style={{
                padding: '12px',
                marginBottom: '16px',
                background: 'var(--bg-1)',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--fire-1)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img
                    src={getPlayerPfp(byePlayerFid)}
                    alt=""
                    style={{ width: 32, height: 32, borderRadius: '50%' }}
                  />
                  <div>
                    <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>
                      {getPlayerDisplay(byePlayerFid)}
                    </span>
                    <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem', marginLeft: '8px' }}>
                      🎟️ BYE - Advances to next round
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--stroke)' }}>
          <button
            onClick={onClose}
            disabled={creating}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || creating || matches.length === 0}
            className="btn-primary"
          >
            {creating ? 'Creating...' : `Confirm & Create Round ${currentRound}`}
          </button>
        </div>
      </div>
    </div>
  );
}
