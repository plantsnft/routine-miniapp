'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import { formatDate } from '~/lib/utils';
import { getPasteText } from '~/lib/pasteSupport';
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
  
  // Simplified form state - Phase 2: Only 2 game types, prize-based
  const [gameSetupType, setGameSetupType] = useState<'sit_and_go' | 'scheduled'>('sit_and_go');
  const [numberOfWinners, setNumberOfWinners] = useState<number>(1);
  const [prizeAmounts, setPrizeAmounts] = useState<number[]>([1000000]); // Default: 1M for Sit and Go
  const [prizeCurrency, setPrizeCurrency] = useState<string>('BETR');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTimeOnly, setScheduledTimeOnly] = useState('');
  const [stakingMinAmount, setStakingMinAmount] = useState<number | null>(null);
  const [gamePassword, setGamePassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [applyStakingMultipliers, setApplyStakingMultipliers] = useState<boolean>(true);
  const [doublePayoutIfBB, setDoublePayoutIfBB] = useState<boolean>(false);
  // Phase 31: Custom game name
  const [gameTitle, setGameTitle] = useState<string>('');
  // Phase 32: Sunday High Stakes (scheduled only)
  const [isSundayHighStakes, setIsSundayHighStakes] = useState<boolean>(false);
  // Copy/paste UX (Phase 34)
  const [copyGameTitleFeedback, setCopyGameTitleFeedback] = useState(false);
  const [copyPasswordFeedback, setCopyPasswordFeedback] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

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

  // Auto-fill presets when game type is selected (must run first)
  useEffect(() => {
    if (gameSetupType === 'sit_and_go') {
      setNumberOfWinners(1);
      setPrizeAmounts([1000000]); // 1M BETR, auto-filled
      setIsSundayHighStakes(false); // Phase 32: only for scheduled
    } else if (gameSetupType === 'scheduled') {
      setNumberOfWinners(3);
      setPrizeAmounts([2000000, 1000000, 420000]); // 2M, 1M, 420k BETR, auto-filled
    }
  }, [gameSetupType]);

  // Mutual exclusivity handlers for tournament payout options
  const handleApplyMultipliersChange = (checked: boolean) => {
    setApplyStakingMultipliers(checked);
    if (checked) {
      setDoublePayoutIfBB(false); // Uncheck other if this is checked
    }
  };

  const handleDoubleBBChange = (checked: boolean) => {
    setDoublePayoutIfBB(checked);
    if (checked) {
      setApplyStakingMultipliers(false); // Uncheck other if this is checked
    }
  };

  // Initialize scheduled date/time when switching to scheduled game type
  useEffect(() => {
    if (gameSetupType === 'scheduled' && !scheduledDate) {
      const now = new Date();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const time = now.toTimeString().slice(0, 5); // HH:MM
      setScheduledDate(date);
      setScheduledTimeOnly(time);
    }
  }, [gameSetupType, scheduledDate]);

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
      // Fetch club (requires auth) - API handles fallback to old slug
      const clubsRes = await authedFetch('/api/clubs', { method: 'GET' }, token);
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      
      // API handles fallback, so just take the first club returned
      // Accept either slug during migration period
      const { HELLFIRE_CLUB_SLUG } = await import('~/lib/constants');
      const validSlugs = [HELLFIRE_CLUB_SLUG, 'hellfire'];
      const foundClub = clubsData.data?.find((c: Club) => validSlugs.includes(c.slug));
      
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
      if (!fid || !club) {
        throw new Error('Authentication required');
      }

      // Convert scheduled time to UTC (only for scheduled games)
      let scheduledTimeUTC: string | null = null;
      if (gameSetupType === 'scheduled') {
        if (scheduledDate && scheduledTimeOnly) {
          const combinedDateTime = `${scheduledDate}T${scheduledTimeOnly}`;
          const localDate = new Date(combinedDateTime);
          scheduledTimeUTC = localDate.toISOString();
        } else {
          throw new Error('Start time is required for scheduled games');
        }
      } else {
        // Sit and Go: game_date = null (starts when full)
        scheduledTimeUTC = null;
      }

      // Calculate can_settle_at: scheduled_time if set, or 30 mins after creation if not
      const canSettleAt = scheduledTimeUTC 
        ? scheduledTimeUTC 
        : new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins from now

      // Build game data with prize-based format
      const gameData: any = {
        club_id: club.id,
        creator_fid: fid,
        title: gameTitle.trim() || undefined, // Phase 31: Custom name (server falls back to auto-generated if empty)
        game_setup_type: gameSetupType, // 'sit_and_go' | 'scheduled'
        scheduled_time: scheduledTimeUTC,
        can_settle_at: canSettleAt,
        number_of_winners: numberOfWinners,
        prize_amounts: prizeAmounts,
        prize_currency: prizeCurrency,
        game_password: gamePassword || null,
        staking_min_amount: stakingMinAmount, // Token gating
        apply_staking_multipliers: gameSetupType === 'scheduled' ? applyStakingMultipliers : true, // Default true for backward compat
        double_payout_if_bb: gameSetupType === 'scheduled' ? doublePayoutIfBB : false,
        is_sunday_high_stakes: gameSetupType === 'scheduled' ? isSundayHighStakes : false, // Phase 32
        // Server will auto-configure: max_participants, game_type, game_date based on game_setup_type
        // Server will set: buy_in_amount = 0, gating_type = 'open' or 'stake_threshold'
      };

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
          {/* Phase 31: Custom Game Name */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Game Name (optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={gameTitle}
                onChange={(e) => setGameTitle(e.target.value)}
                onPaste={async (e) => {
                  const input = e.currentTarget;
                  const start = input.selectionStart ?? 0;
                  const end = input.selectionEnd ?? gameTitle.length;
                  const text = await getPasteText(e);
                  if (text != null && text !== '') {
                    e.preventDefault();
                    setGameTitle((prev) => prev.slice(0, start) + text + prev.slice(end));
                  }
                }}
                className="input text-base flex-1"
                placeholder={gameSetupType === 'sit_and_go' ? 'Sit & Go' : 'Tournament'}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(gameTitle);
                    setCopyGameTitleFeedback(true);
                    setTimeout(() => setCopyGameTitleFeedback(false), 1500);
                  } catch {
                    // ignore
                  }
                }}
                className="btn-secondary text-sm whitespace-nowrap"
              >
                {copyGameTitleFeedback ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Leave blank to use the default name
            </p>
          </div>

          {/* Game Type Selector */}
          <div>
            <label className="label text-lg font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
              Game Type <span style={{ color: 'var(--fire-2)' }}>*</span>
            </label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="sitAndGo"
                  name="gameType"
                  value="sit_and_go"
                  checked={gameSetupType === 'sit_and_go'}
                  onChange={(e) => setGameSetupType('sit_and_go')}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fire-1)' }}
                />
                <label htmlFor="sitAndGo" className="label text-base cursor-pointer">
                  Sit and Go (9 players, starts when full)
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="scheduled"
                  name="gameType"
                  value="scheduled"
                  checked={gameSetupType === 'scheduled'}
                  onChange={(e) => setGameSetupType('scheduled')}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fire-1)' }}
                />
                <label htmlFor="scheduled" className="label text-base cursor-pointer">
                  Scheduled Game (up to 99 players, set time)
                </label>
              </div>
            </div>
          </div>

          {/* Prize Configuration */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Prize Configuration <span style={{ color: 'var(--fire-2)' }}>*</span>
            </label>
            
            {/* Number of Winners */}
            <div className="mb-4">
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Number of Winners</label>
              <select
                value={numberOfWinners}
                onChange={(e) => {
                  const newCount = parseInt(e.target.value, 10);
                  setNumberOfWinners(newCount);
                  // Adjust prize amounts array to match new count
                  const newAmounts = [...prizeAmounts];
                  if (newCount > newAmounts.length) {
                    // Add zeros for new winners
                    while (newAmounts.length < newCount) {
                      newAmounts.push(0);
                    }
                  } else if (newCount < newAmounts.length) {
                    // Remove excess winners
                    newAmounts.splice(newCount);
                  }
                  setPrizeAmounts(newAmounts);
                }}
                className="input text-base"
                required
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Prize Amounts */}
            <div className="mb-2">
              <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Prize Amounts (BETR)</label>
              {pasteError && (
                <p className="text-sm mb-1" style={{ color: 'var(--fire-2)' }}>{pasteError}</p>
              )}
              <div className="space-y-2">
                {Array.from({ length: numberOfWinners }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <label className="text-sm w-20" style={{ color: 'var(--text-muted)' }}>
                      Winner {i + 1}:
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={prizeAmounts[i] || 0}
                      onChange={(e) => {
                        const newAmounts = [...prizeAmounts];
                        newAmounts[i] = parseFloat(e.target.value) || 0;
                        setPrizeAmounts(newAmounts);
                      }}
                      onPaste={async (e) => {
                        const text = await getPasteText(e);
                        if (text == null || text === '') return;
                        const cleaned = text.replace(/,/g, '').trim();
                        const num = parseFloat(cleaned);
                        if (Number.isNaN(num) || num < 0) {
                          e.preventDefault();
                          setPasteError('Invalid number');
                          setTimeout(() => setPasteError(null), 2000);
                          return;
                        }
                        e.preventDefault();
                        const newAmounts = [...prizeAmounts];
                        newAmounts[i] = num;
                        setPrizeAmounts(newAmounts);
                      }}
                      className="input text-base flex-1"
                      placeholder="0"
                      required
                    />
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>BETR</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reset to Preset Button */}
            <button
              type="button"
              onClick={() => {
                if (gameSetupType === 'sit_and_go') {
                  setNumberOfWinners(1);
                  setPrizeAmounts([1000000]);
                } else if (gameSetupType === 'scheduled') {
                  setNumberOfWinners(3);
                  setPrizeAmounts([2000000, 1000000, 420000]);
                }
              }}
              className="btn-secondary text-sm mt-2"
            >
              Reset to Preset
            </button>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              Presets auto-fill when game type is selected. You can modify amounts above.
            </p>
          </div>

          {/* Start Time (only for Scheduled) */}
          {gameSetupType === 'scheduled' && (
            <div>
              <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Start Time <span style={{ color: 'var(--fire-2)' }}>*</span>
              </label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    onPaste={async (e) => {
                      const text = await getPasteText(e);
                      if (text != null && text !== '') {
                        e.preventDefault();
                        setScheduledDate(text);
                      }
                    }}
                    className="input text-base w-full"
                    required
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Time</label>
                  <input
                    type="time"
                    value={scheduledTimeOnly}
                    onChange={(e) => setScheduledTimeOnly(e.target.value)}
                    onPaste={async (e) => {
                      const text = await getPasteText(e);
                      if (text != null && text !== '') {
                        e.preventDefault();
                        setScheduledTimeOnly(text);
                      }
                    }}
                    className="input text-base w-full"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tournament Payout Options (only for Scheduled) */}
          {gameSetupType === 'scheduled' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="sundayHighStakes"
                  checked={isSundayHighStakes}
                  onChange={(e) => setIsSundayHighStakes(e.target.checked)}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--fire-1)' }}
                />
                <label htmlFor="sundayHighStakes" className="label text-base cursor-pointer">
                  SUNDAY HIGH STAKES GAME?
                </label>
              </div>
            </div>
          )}
          {gameSetupType === 'scheduled' && (
            <div style={{ marginTop: '16px', padding: '12px', border: '1px solid var(--stroke)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Tournament Payout Options</h3>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={applyStakingMultipliers}
                  onChange={(e) => handleApplyMultipliersChange(e.target.checked)}
                />
                <span style={{ color: 'var(--text-primary)' }}>Apply staking payout multipliers (1x-5x based on staked amount)</span>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={doublePayoutIfBB}
                  onChange={(e) => handleDoubleBBChange(e.target.checked)}
                />
                <span style={{ color: 'var(--text-primary)' }}>Double payout if BB (Betr Believer, 50M+ staked)</span>
              </label>
              
              <p style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                Note: Only one option can be selected. If neither is selected, base amounts are paid with no multipliers.
              </p>
            </div>
          )}

          {/* Token Gating */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Token Gating (optional)
            </label>
            <select
              value={stakingMinAmount === null ? '' : stakingMinAmount.toString()}
              onChange={(e) => {
                const value = e.target.value;
                setStakingMinAmount(value === '' ? null : parseFloat(value));
              }}
              className="input text-base"
            >
              <option value="">None (default)</option>
              <option value="1000000">1M BETR</option>
              <option value="5000000">5M BETR</option>
              <option value="25000000">25M BETR</option>
              <option value="50000000">50M BETR</option>
              <option value="200000000">200M BETR</option>
            </select>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Require players to have staked this amount of BETR to join
            </p>
          </div>

          {/* ClubGG Password (optional) */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              ClubGG Password (optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={gamePassword}
                onChange={(e) => setGamePassword(e.target.value)}
                onPaste={async (e) => {
                  const input = e.currentTarget;
                  const start = input.selectionStart ?? 0;
                  const end = input.selectionEnd ?? gamePassword.length;
                  const text = await getPasteText(e);
                  if (text != null && text !== '') {
                    e.preventDefault();
                    setGamePassword((prev) => prev.slice(0, start) + text + prev.slice(end));
                  }
                }}
                className="input text-base flex-1"
                placeholder="Leave empty to set later"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(gamePassword);
                    setCopyPasswordFeedback(true);
                    setTimeout(() => setCopyPasswordFeedback(false), 1500);
                  } catch {
                    // ignore
                  }
                }}
                className="btn-secondary text-sm whitespace-nowrap"
              >
                {copyPasswordFeedback ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              ClubGG credentials shown to players after payment
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
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
