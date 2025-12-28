'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import { formatDate } from '~/lib/utils';
import type { Club } from '~/lib/types';

export default function NewGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const { token, fid, status: authStatus, retry } = useAuth();
  const { slug: resolvedSlug } = use(params);
  const [slug] = useState<string>(resolvedSlug);
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state - ClubGG URL is required (first field)
  const [clubggLink, setClubggLink] = useState('');
  // Helper to get current date/time in correct format for inputs
  const getCurrentDateTime = () => {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toTimeString().slice(0, 5); // HH:MM
    return { date, time, combined: `${date}T${time}` };
  };

  const currentDateTime = getCurrentDateTime();
  const [scheduledTime, setScheduledTime] = useState(currentDateTime.combined);
  const [scheduledDate, setScheduledDate] = useState(currentDateTime.date);
  const [scheduledTimeOnly, setScheduledTimeOnly] = useState(currentDateTime.time);
  const [startNow, setStartNow] = useState(false);
  const [entryFeeAmount, setEntryFeeAmount] = useState('');
  const [numPlayers, setNumPlayers] = useState('');
  const [totalRewardAmount, setTotalRewardAmount] = useState('');
  const [gameCurrency, setGameCurrency] = useState('USDC');
  const [customTokenAddress, setCustomTokenAddress] = useState('');
  const [showCustomTokenInput, setShowCustomTokenInput] = useState(false);
  const [editingRewardAmount, setEditingRewardAmount] = useState(false);
  const [numPayoutSpots, setNumPayoutSpots] = useState('1'); // Default to 1 for Winner Take All
  const [payoutPercentages, setPayoutPercentages] = useState<Record<number, string>>({ 1: '100' }); // Default to 100% for position 1
  const [winnerTakeAll, setWinnerTakeAll] = useState(true); // Default to Winner Take All
  const [isPrefunded, setIsPrefunded] = useState(false);
  const [gamePassword, setGamePassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (authStatus === 'loading') {
      setLoading(true);
      setError(null);
      return;
    }
    if (authStatus === 'authed' && token) {
      loadData();
    } else if (authStatus === 'error') {
      setError('Authentication failed. Please try again.');
      setLoading(false);
    }
  }, [slug, authStatus, token, fid, retry]);

  // Auto-calculate total reward amount (only when max is set, not blank)
  useEffect(() => {
    if (entryFeeAmount && numPlayers && numPlayers.trim() !== '' && !editingRewardAmount) {
      const calculated = parseFloat(entryFeeAmount) * parseFloat(numPlayers);
      if (!isNaN(calculated)) {
        setTotalRewardAmount(calculated.toFixed(2));
      }
    } else if (numPlayers === '' || numPlayers.trim() === '') {
      // If max is blank, clear the reward amount (pot grows as players join)
      if (!editingRewardAmount) {
        setTotalRewardAmount('');
      }
    }
  }, [entryFeeAmount, numPlayers, editingRewardAmount]);

  // Set default game currency to USDC
  useEffect(() => {
    if (gameCurrency !== 'USDC' && !showCustomTokenInput) {
      setGameCurrency('USDC');
    }
  }, [showCustomTokenInput]);

  // Handle winner take all checkbox
  useEffect(() => {
    if (winnerTakeAll) {
      setNumPayoutSpots('1');
      setPayoutPercentages({ 1: '100' });
    } else {
      // When unchecking Winner Take All, if payout spots is still 1, suggest 2
      if (numPayoutSpots === '1' || numPayoutSpots === '') {
        setNumPayoutSpots('2');
        setPayoutPercentages({ 1: '60', 2: '40' }); // Default to 60/40 split
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerTakeAll]);

  // Generate payout percentage inputs when number of spots changes (only if not winner take all)
  useEffect(() => {
    if (numPayoutSpots && !winnerTakeAll) {
      const spots = parseInt(numPayoutSpots, 10);
      if (!isNaN(spots) && spots > 0) {
        setPayoutPercentages(prev => {
          const newPercentages: Record<number, string> = {};
          for (let i = 1; i <= spots; i++) {
            newPercentages[i] = prev[i] || '';
          }
          return newPercentages;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPayoutSpots, winnerTakeAll]);

  const loadData = async () => {
    if (!token || authStatus !== 'authed') {
      setError('Please sign in');
      setLoading(false);
      return;
    }
    
    // Check admin status
    try {
      const adminRes = await authedFetch('/api/admin/status', { method: 'GET' }, token);
      if (adminRes.ok) {
        const adminData = await adminRes.json();
        if (adminData.ok && adminData.data) {
          setIsAdmin(adminData.data.isAdmin || false);
        }
      }
    } catch (err) {
      // Silently fail - admin check is optional
      console.error('Failed to check admin status:', err);
    }

    try {
      // Fetch clubs to find the one matching the slug (requires auth)
      const clubsRes = await authedFetch('/api/clubs', { method: 'GET' }, token);
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      const foundClub = clubsData.data?.find((c: Club) => c.slug === slug);
      
      if (!foundClub) {
        setError('Club not found');
        return;
      }

      setClub(foundClub);

      // Verify ownership
      if (!fid || !isClubOwnerOrAdmin(fid, foundClub)) {
        setError('Only club owners can create games');
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load club');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // ClubGG link is optional - no validation needed

      if (!fid || !club) {
        throw new Error('Authentication required');
      }

      // Convert scheduled time to UTC
      let scheduledTimeUTC: string | null = null;
      if (startNow) {
        // If "start game now" is checked, set to current time
        scheduledTimeUTC = new Date().toISOString();
      } else if (scheduledDate && scheduledTimeOnly) {
        // Combine date and time inputs
        const combinedDateTime = `${scheduledDate}T${scheduledTimeOnly}`;
        const localDate = new Date(combinedDateTime);
        scheduledTimeUTC = localDate.toISOString();
      } else if (scheduledTime) {
        // Fallback to old datetime-local format if still used
        const localDate = new Date(scheduledTime);
        scheduledTimeUTC = localDate.toISOString();
      }

      // Calculate can_settle_at: scheduled_time if set, or 30 mins after creation if not
      const canSettleAt = scheduledTimeUTC 
        ? scheduledTimeUTC 
        : new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins from now

      // Handle max_participants - server will infer game_type from blank max for admins
      // If blank and admin, server treats as open-registration (large_event with NULL max, effective 99)
      // Otherwise, parse and send the number
      let maxParticipants: number | null = null;
      if (numPlayers && numPlayers.trim() !== '') {
        const parsed = parseInt(numPlayers, 10);
        if (!isNaN(parsed) && parsed >= 2) {
          // Cap at 99 for any game (standard or inferred large_event)
          maxParticipants = Math.min(99, parsed);
        }
      }
      // If blank, send null - server will infer large_event for admins
      
      const gameData: any = {
        club_id: club.id,
        creator_fid: fid,
        clubgg_link: clubggLink.trim(),
        scheduled_time: scheduledTimeUTC,
        can_settle_at: canSettleAt,
        gating_type: 'entry_fee',
        game_password: gamePassword || null,
        entry_fee_amount: entryFeeAmount ? parseFloat(entryFeeAmount) : null,
        entry_fee_currency: gameCurrency,
        max_participants: maxParticipants, // null if blank (server infers large_event for admins)
        // Don't send game_type - server infers it from blank max for admins
      };
      
      console.log('[NewGame] Submitting game data:', { 
        gameId: 'creating', 
        selectedMaxPlayers: numPlayers, 
        max_participants: gameData.max_participants 
      });

      // Add reward configuration (if total reward amount provided)
      if (totalRewardAmount) {
        gameData.total_reward_amount = parseFloat(totalRewardAmount);
        gameData.reward_currency = gameCurrency;
        gameData.is_prefunded = isPrefunded;
        if (isPrefunded) {
          gameData.prefunded_at = new Date().toISOString();
        }
      }
      
      // Add payout configuration (always set, independent of total reward amount)
      // Winner take all: {10000}
      // Multiple winners: convert percentages to basis points (e.g., 75% = 7500, 25% = 2500)
      if (winnerTakeAll) {
        gameData.payout_bps = [10000]; // Winner takes all = 100% = 10000 basis points
      } else if (numPayoutSpots) {
        const spots = parseInt(numPayoutSpots, 10);
        if (spots > 0) {
          const percentages: number[] = [];
          for (let i = 1; i <= spots; i++) {
            const pct = parseFloat(payoutPercentages[i] || '0');
            percentages.push(Math.round(pct * 100)); // Convert % to basis points (e.g., 75% -> 7500)
          }
          
          // Validate sum equals 10000 (100%)
          const sum = percentages.reduce((s, p) => s + p, 0);
          if (sum !== 10000) {
            throw new Error(`Payout percentages must sum to 100%. Current sum: ${(sum / 100).toFixed(1)}%`);
          }
          
          gameData.payout_bps = percentages;
        }
      } else {
        // Default to winner-take-all if nothing is configured
        gameData.payout_bps = [10000];
      }

      if (!token) {
        throw new Error('Authentication required');
      }

      const res = await authedFetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameData),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create game');
      }

      const createdGame = data.data;
      if (!createdGame || !createdGame.id) {
        throw new Error('Game created but no game data returned');
      }

      // Create announcement for the new game
      try {
        const announcementTitle = `New Game: ${entryFeeAmount ? `${entryFeeAmount} ${gameCurrency}` : 'Entry Fee'} Game`;
        const announcementBody = [
          entryFeeAmount ? `Entry Fee: ${entryFeeAmount} ${gameCurrency}` : 'Entry Fee: TBD',
          numPlayers ? `Max Players: ${numPlayers}` : null,
          totalRewardAmount ? `Total Prize Pool: ${totalRewardAmount} ${gameCurrency}` : null,
          scheduledTimeUTC ? `Scheduled: ${formatDate(scheduledTimeUTC)}` : startNow ? 'Starting now!' : null,
          clubggLink.trim() ? `ClubGG: ${clubggLink.trim()}` : null,
        ].filter(Boolean).join('\n');

        const annRes = await authedFetch(`/api/clubs/${club.id}/announcements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creator_fid: fid,
            title: announcementTitle,
            body: announcementBody,
            related_game_id: createdGame.id,
          }),
        }, token);

        // Don't fail game creation if announcement creation fails
        if (!annRes.ok) {
          console.error('Failed to create announcement for game:', await annRes.text());
        }
      } catch (annErr: any) {
        // Log but don't fail - game was created successfully
        console.error('Error creating announcement:', annErr);
      }

      // Redirect to club games page
      router.push(`/clubs/${slug}/games`);
    } catch (err: any) {
      setError(err.message || 'Failed to create game');
    } finally {
      setSubmitting(false);
    }
  };

  if (authStatus === 'loading' || loading) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p style={{ color: 'var(--text-muted)' }}>Signing in...</p>
        </div>
      </main>
    );
  }

  if (authStatus === 'error') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
            <div className="hl-card">
            <p className="mb-4" style={{ color: 'var(--fire-2)' }}>Authentication failed. Please try again.</p>
            {retry && (
              <button
                onClick={retry}
                className="btn-primary"
              >
                Retry Sign-In
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (error && !club) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p style={{ color: 'var(--fire-2)' }}>Error: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Create New Game - {club?.name}</h1>
        
        {error && (
          <div className="hl-card mb-4">
            <p style={{ color: 'var(--fire-2)' }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Top Action Buttons */}
          <div className="flex gap-4 pb-6" style={{ borderBottom: '1px solid var(--stroke)' }}>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Creating...' : 'Create Game'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>

          {/* Mandatory Fields - Cost to Play and Start Time */}
          <div>
            <div className="space-y-6">
              {/* Cost to Play - Entry Fee Amount */}
              <div>
                <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Cost to Play <span style={{ color: 'var(--fire-2)' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={entryFeeAmount}
                  onChange={(e) => setEntryFeeAmount(e.target.value)}
                  className="input text-base"
                  placeholder="5"
                  required
                />
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Entry fee amount in {gameCurrency === 'USD' ? 'USDC' : gameCurrency}</p>
              </div>

              {/* Start Time */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="checkbox"
                    id="startNow"
                    checked={startNow}
                    onChange={(e) => {
                      setStartNow(e.target.checked);
                      if (e.target.checked) {
                        setScheduledTime('');
                        setScheduledDate('');
                        setScheduledTimeOnly('');
                      } else {
                        // When unchecking, restore current date/time
                        const { date, time, combined } = getCurrentDateTime();
                        setScheduledDate(date);
                        setScheduledTimeOnly(time);
                        setScheduledTime(combined);
                      }
                    }}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: 'var(--fire-1)' }}
                  />
                  <label htmlFor="startNow" className="label text-base">
                    Start game now
                  </label>
                </div>
                {!startNow && (
                  <>
                    <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                      Start Time <span style={{ color: 'var(--fire-2)' }}>*</span>
                      <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                        ({(() => {
                          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                          // Convert common timezones to abbreviations
                          const tzMap: Record<string, string> = {
                            'America/Los_Angeles': 'PST/PDT',
                            'America/New_York': 'EST/EDT',
                            'America/Chicago': 'CST/CDT',
                            'America/Denver': 'MST/MDT',
                            'America/Phoenix': 'MST',
                            'America/Anchorage': 'AKST/AKDT',
                            'Pacific/Honolulu': 'HST',
                            'Europe/London': 'GMT/BST',
                            'Europe/Paris': 'CET/CEST',
                            'Asia/Tokyo': 'JST',
                            'Asia/Shanghai': 'CST',
                            'Australia/Sydney': 'AEST/AEDT',
                          };
                          return tzMap[tz] || tz.split('/').pop()?.replace(/_/g, ' ') || tz;
                        })()})
                      </span>
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Date</label>
                        <input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => {
                            setScheduledDate(e.target.value);
                            // Update combined scheduledTime for display
                            if (e.target.value && scheduledTimeOnly) {
                              setScheduledTime(`${e.target.value}T${scheduledTimeOnly}`);
                            }
                          }}
                          className="input text-base w-full"
                          required={!startNow}
                          min={new Date().toISOString().split('T')[0]} // Prevent selecting past dates
                          style={{ 
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                            touchAction: 'manipulation',
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Time</label>
                        <input
                          type="time"
                          value={scheduledTimeOnly}
                          onChange={(e) => {
                            setScheduledTimeOnly(e.target.value);
                            // Update combined scheduledTime for display
                            if (scheduledDate && e.target.value) {
                              setScheduledTime(`${scheduledDate}T${e.target.value}`);
                            }
                          }}
                          className="input text-base w-full"
                          required={!startNow}
                          style={{ 
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                            touchAction: 'manipulation',
                          }}
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {(scheduledDate && scheduledTimeOnly)
                        ? `Game can be settled after: ${formatDate(`${scheduledDate}T${scheduledTimeOnly}`)}`
                        : 'If not set, game can be settled 30 minutes after creation'}
                    </p>
                  </>
                )}
              </div>
            </div>
            
            {/* Divider bar to separate mandatory from optional */}
            <div className="mt-6 pt-6" style={{ borderTop: '2px solid var(--fire-1)' }}></div>
          </div>

          {/* Optional Fields */}
          <div>
            <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Optional</h2>
            <div className="space-y-6">
              {/* ClubGG Password */}
              <div>
                <label className="label">ClubGG Password</label>
                <input
                  type="text"
                  value={gamePassword}
                  onChange={(e) => setGamePassword(e.target.value)}
                  className="input"
                  placeholder="Leave empty to set later"
                />
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>ClubGG credentials shown to players after payment</p>
              </div>

              {/* Number of Players */}
              <div>
                <label className="label">Number of Players</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={numPlayers}
                  onChange={(e) => setNumPlayers(e.target.value)}
                  className="input"
                  placeholder="Leave blank for open registration (up to 99). Registration closes 15 minutes after start"
                />
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  {isAdmin 
                    ? "Leave blank for open registration (up to 99). Registration closes 15 minutes after start."
                    : "Used to auto-calculate total reward amount"}
                </p>
              </div>

              {/* Reward/Payout Configuration */}
              <div>
                <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Reward & Payout Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="label">Total Reward Amount (optional)</label>
                  {totalRewardAmount && !editingRewardAmount && (
                    <button
                      type="button"
                      onClick={() => setEditingRewardAmount(true)}
                      className="text-xs underline transition-colors"
                      style={{ color: 'var(--fire-1)' }}
                    >
                      Edit
                    </button>
                  )}
                </div>
                    <input
                      type="number"
                      step="0.01"
                      value={totalRewardAmount}
                      onChange={(e) => {
                        setTotalRewardAmount(e.target.value);
                        setEditingRewardAmount(true);
                      }}
                      onBlur={(e) => {
                        if (entryFeeAmount && numPlayers) {
                          // Re-enable auto-calculation if they clear the field
                          const calculated = parseFloat(entryFeeAmount) * parseFloat(numPlayers);
                          if (!e.target.value && !isNaN(calculated)) {
                            setTotalRewardAmount(calculated.toFixed(2));
                            setEditingRewardAmount(false);
                          }
                        }
                      }}
                      className="input"
                      placeholder={numPlayers && numPlayers.trim() !== '' && entryFeeAmount ? (parseFloat(entryFeeAmount) * parseFloat(numPlayers)).toFixed(2) : (numPlayers === '' || numPlayers.trim() === '') ? "Pot grows as players join" : "Enter amount"}
                    />
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {entryFeeAmount && numPlayers && numPlayers.trim() !== '' && !editingRewardAmount
                        ? `Auto-calculated: ${entryFeeAmount} × ${numPlayers} = ${totalRewardAmount} ${gameCurrency === 'USD' ? 'USDC' : gameCurrency}`
                        : numPlayers === '' || numPlayers.trim() === ''
                        ? "Pot grows as players join. Payouts will use your percentage split at settlement."
                        : `Total reward pool in ${gameCurrency === 'USD' ? 'USDC' : gameCurrency}`}
                    </p>
                    {(!totalRewardAmount || totalRewardAmount.trim() === '') && (numPlayers === '' || numPlayers.trim() === '') && (
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Pot grows as players join. Payouts will use your percentage split at settlement.
                      </p>
                    )}
                  </div>

                  {/* Payout Spots Configuration - Always visible, independent of Total Reward Amount */}
                  <div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="label"># of Payout Spots</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="winnerTakeAll"
                            checked={winnerTakeAll}
                            onChange={(e) => {
                              setWinnerTakeAll(e.target.checked);
                            }}
                            className="w-4 h-4 rounded"
                            style={{ accentColor: 'var(--fire-1)' }}
                          />
                          <label htmlFor="winnerTakeAll" className="text-xs label">
                            Winner Take All
                          </label>
                        </div>
                      </div>
                      {numPlayers ? (
                        <select
                          value={numPayoutSpots}
                          onChange={(e) => {
                            setNumPayoutSpots(e.target.value);
                            setWinnerTakeAll(false);
                          }}
                          disabled={winnerTakeAll}
                          style={{ 
                            // Ensure select is clickable and not blocked by pointer-events
                            pointerEvents: winnerTakeAll ? 'none' : 'auto',
                            // Ensure proper z-index for dropdown menu
                            position: 'relative',
                            zIndex: 1,
                          }}
                          className="input"
                        >
                          <option value="">Select number of payout spots</option>
                          {Array.from({ length: parseInt(numPlayers, 10) || 0 }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num.toString()}>{num}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={numPayoutSpots}
                          onChange={(e) => {
                            setNumPayoutSpots(e.target.value);
                            setWinnerTakeAll(false);
                          }}
                          disabled={winnerTakeAll}
                          className="input"
                          placeholder="2"
                        />
                      )}
                      <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>How many positions will receive payouts</p>
                    </div>

                    {numPayoutSpots && !winnerTakeAll && (
                      <div>
                        <label className="label">% of Pot Payout</label>
                        <div className="space-y-2">
                          {Array.from({ length: parseInt(numPayoutSpots, 10) || 0 }, (_, i) => i + 1).map(position => (
                            <div key={position} className="flex items-center gap-2">
                              <span className="text-sm w-12" style={{ color: 'var(--text-primary)' }}>{position}{position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}:</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={payoutPercentages[position] || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setPayoutPercentages(prev => ({ ...prev, [position]: value }));
                                }}
                                className="input flex-1"
                                style={{ padding: '8px 12px' }}
                                placeholder="0"
                              />
                              <span className="text-sm w-8" style={{ color: 'var(--text-primary)' }}>%</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                          Total: {Object.values(payoutPercentages).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toFixed(1)}%
                        </p>
                        {(!totalRewardAmount || totalRewardAmount.trim() === '') && (
                          <p className="mt-1 text-xs italic" style={{ color: 'var(--text-muted)' }}>
                            Amounts will be computed from actual pot at settlement.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Prefund checkbox - only show if total reward amount is set */}
                  {totalRewardAmount && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="prefund"
                        checked={isPrefunded}
                        onChange={(e) => setIsPrefunded(e.target.checked)}
                        className="w-4 h-4 rounded"
                        style={{ accentColor: 'var(--fire-1)' }}
                      />
                      <label htmlFor="prefund" className="label text-sm">
                        Prefund this game (seed reward pool now)
                      </label>
                    </div>
                  )}
                  {isPrefunded && totalRewardAmount && (
                    <p className="text-sm" style={{ color: 'var(--fire-1)' }}>
                      You will be prompted to fund the game after creation
                    </p>
                  )}
                </div>
              </div>

              {/* Game Currency */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="label">Game Currency</label>
                  <button
                    type="button"
                    onClick={() => setShowCustomTokenInput(!showCustomTokenInput)}
                    className="text-xs underline transition-colors"
                    style={{ color: 'var(--fire-1)' }}
                  >
                    {showCustomTokenInput ? 'Use Standard' : 'Custom Token'}
                  </button>
                </div>
                {showCustomTokenInput ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={customTokenAddress}
                      onChange={(e) => setCustomTokenAddress(e.target.value)}
                      className="input font-mono text-sm"
                      placeholder="0x..."
                    />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Enter custom token contract address</p>
                    {customTokenAddress && (
                      <input
                        type="text"
                        value={gameCurrency}
                        onChange={(e) => setGameCurrency(e.target.value)}
                        className="input"
                        placeholder="Token symbol (e.g., USDC, WETH)"
                      />
                    )}
                  </div>
                ) : (
                  <select
                    value={gameCurrency}
                    onChange={(e) => setGameCurrency(e.target.value)}
                    className="input"
                  >
                    <option value="ETH">ETH</option>
                    <option value="USDC">USDC</option>
                  </select>
                )}
              </div>

              {/* ClubGG Game URL */}
              <div>
                <label className="label">ClubGG Game URL</label>
                <input
                  type="text"
                  value={clubggLink}
                  onChange={(e) => setClubggLink(e.target.value)}
                  className="input"
                  placeholder="https://clubgg.com/game/..."
                />
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Paste the ClubGG game URL (optional)</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Creating...' : 'Create Game'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
