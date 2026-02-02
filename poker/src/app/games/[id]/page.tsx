'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch, AuthExpiredError } from '~/lib/authedFetch';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import { isPaidGame } from '~/lib/games';
import { getEffectiveMaxParticipants, getGameBadges } from '~/lib/game-registration';
import type { Game, GameParticipant, EligibilityResult } from '~/lib/types';
import { PaymentButton } from '~/components/PaymentButton';
import { PaymentButtonWrapper } from '~/components/PaymentButtonWrapper';
import { RegistrationInfoBadge } from '~/components/RegistrationInfoBadge';
import { getBaseScanTxUrl } from '~/lib/explorer';

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, fid, status: authStatus, retry } = useAuth();
  const searchParams = useSearchParams();
  const _debugMode = searchParams.get('debug') === '1' || process.env.NODE_ENV !== 'production';
  const [game, setGame] = useState<Game | null>(null);
  const [participant, setParticipant] = useState<GameParticipant | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [_joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthExpired, setIsAuthExpired] = useState(false);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [credentials, setCredentials] = useState<{ password: string | null; locked?: boolean; passwordSet?: boolean } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [participantsWithNames, setParticipantsWithNames] = useState<Array<GameParticipant & { username?: string; pfpUrl?: string }>>([]);
  const [countdown, setCountdown] = useState<string>('');
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [allParticipants, setAllParticipants] = useState<GameParticipant[]>([]);
  const [selectedWinnerFid, setSelectedWinnerFid] = useState<string>('');
  const [selectedWinnerFids, setSelectedWinnerFids] = useState<number[]>([]); // For multiple winners
  const [settling, setSettling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [gameForPayment, setGameForPayment] = useState<Game | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const paymentButtonRef = useRef<HTMLButtonElement | null>(null);

  // Refs for deep linking from notifications
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const clubggSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset credentials state when gameId changes (prevent cross-game leakage)
    setCredentials(null);
    setCredentialsError(null);
    setHasCredentials(false);
    setShowPassword(false);

    if (authStatus === 'loading') {
      // Still loading - wait
      setLoading(true);
      setError(null);
      setIsAuthExpired(false);
      return;
    }

    if (authStatus === 'authed' && token) {
      loadData();
    } else if (authStatus === 'error') {
      // Auth failed - show retry option
      setError(null);
      setIsAuthExpired(false); // Clear any previous errors
      setIsAuthExpired(false);
      setLoading(false);
    }
  }, [id, authStatus, token, fid]);

  useEffect(() => {
    if (token && currentUserFid && game) {
      authedFetch('/api/clubs', { method: 'GET' }, token)
        .then(r => r.json())
        .then(data => {
          const club = data.data?.find((c: any) => c.id === game.club_id);
          setIsOwner(club && isClubOwnerOrAdmin(currentUserFid, club));
        });
    }
  }, [currentUserFid, game]);

  // Countdown timer
  useEffect(() => {
    if (!game?.scheduled_time) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const gameTime = new Date(game.scheduled_time!).getTime();
      const diff = gameTime - now;

      if (diff <= 0) {
        setCountdown('Lobby is open');
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
  }, [game?.scheduled_time]);

  // Load participants count
  useEffect(() => {
    if (!game || !token) return;
    loadParticipantsCount();
  }, [game, token, isOwner]);

  // Handle deep linking from notifications
  useEffect(() => {
    if (!game) return;
    
    const fromNotif = searchParams.get('fromNotif');
    if (!fromNotif) return;

    // Small delay to ensure page has rendered
    setTimeout(() => {
      if (fromNotif === 'game_created' && paymentSectionRef.current) {
        // Scroll to payment section
        paymentSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (fromNotif === 'game_full' && clubggSectionRef.current) {
        // Scroll to ClubGG section and show password prominently
        clubggSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // If credentials exist, show password
        if (credentials && credentials.password) {
          setShowPassword(true);
        }
      }
    }, 500);
  }, [game, searchParams, credentials]);

  const loadParticipantsCount = async () => {
    if (!token) return;
    try {
      const res = await authedFetch(`/api/games/${id}/participants`, { 
        method: 'GET',
        cache: 'no-store', // Force fresh data, no caching
      }, token);
      if (res.ok) {
        const data = await res.json();
        const participants = data.data || [];
        // Count all participants (joined, paid, etc.)
        setParticipantsCount(participants.length);
        // Check both payment_status (legacy) and status (new schema) for paid
        // Also include participants with status 'joined' and tx_hash (they've paid)
        const paid = participants.filter((p: GameParticipant) => 
          p.payment_status === 'paid' || 
          p.status === 'paid' || 
          (p.status === 'joined' && !!(p as any)?.tx_hash) // Joined with payment tx
        );
        setPaidCount(paid.length);
        // Store all participants for settle modal (admin/owner only)
        if (isOwner) {
          setAllParticipants(participants);
        }
        
        // Fetch usernames and pfps for participants
        const fids = participants.map((p: GameParticipant) => (p as any).fid || (p as any).player_fid).filter((fid: any): fid is number => typeof fid === 'number' && fid > 0);
        if (fids.length > 0) {
          try {
            const neynarRes = await authedFetch(`/api/users/bulk?fids=${fids.join(',')}`, {
              method: 'GET',
            }, token);
            
            if (neynarRes.ok) {
              const neynarData = await neynarRes.json();
              const userMap = new Map();
              if (neynarData.data) {
                neynarData.data.forEach((user: any) => {
                  userMap.set(user.fid, { username: user.username, pfpUrl: user.avatar_url || user.pfpUrl });
                });
              }
              
              const participantsWithUserData = participants.map((p: GameParticipant) => {
                const fid = (p as any).fid || (p as any).player_fid;
                const userInfo = userMap.get(fid);
                return {
                  ...p,
                  username: userInfo?.username,
                  pfpUrl: userInfo?.pfpUrl,
                };
              });
              
              setParticipantsWithNames(participantsWithUserData);
            }
          } catch (neynarErr) {
            console.error('Failed to fetch participant usernames:', neynarErr);
            // Still set participants even if username fetch fails
            setParticipantsWithNames(participants);
          }
        } else {
          setParticipantsWithNames(participants);
        }
      }
    } catch (err) {
      console.error('Failed to load participants count:', err);
    }
  };

  // Load all participants when opening settle modal (for owner)
  const loadAllParticipantsForSettle = async () => {
    if (!token || !isOwner) return;
    try {
      const res = await authedFetch(`/api/games/${id}/participants`, { 
        method: 'GET',
        cache: 'no-store', // Force fresh data, no caching
      }, token);
      if (res.ok) {
        const data = await res.json();
        const participants = data.data || [];
        // Filter to only paid participants - check both payment_status (legacy) and status (new schema)
        // Also include participants with status 'joined' and tx_hash (they've paid)
        const paidParticipants = participants.filter((p: GameParticipant) => 
          p.payment_status === 'paid' || 
          p.status === 'paid' || 
          (p.status === 'joined' && !!(p as any)?.tx_hash) // Joined with payment tx
        );
        setAllParticipants(paidParticipants);
      }
    } catch (err) {
      console.error('Failed to load participants for settle:', err);
    }
  };

  const handleSettleGame = async () => {
    if (!token || !fid || !game) return;
    
    // Get payout structure from game config (payout_bps array)
    // Length of payout_bps determines expected winner count
    const gamePayoutBps = (game as any).payout_bps;
    const expectedWinnerCount = gamePayoutBps && Array.isArray(gamePayoutBps) && gamePayoutBps.length > 0
      ? gamePayoutBps.length
      : 1; // Default to winner-take-all if not configured
    
    // Validate winner selection matches payout structure
    if (expectedWinnerCount === 1) {
      if (!selectedWinnerFid) {
        setError('Please select a winner');
        return;
      }
    } else {
      if (selectedWinnerFids.length !== expectedWinnerCount) {
        setError(`Please select exactly ${expectedWinnerCount} winner(s) based on the game's payout structure.`);
        return;
      }
    }
    
    setSettling(true);
    setError(null);

    try {
      // Get paid participants - check both payment_status (legacy) and status (new schema)
      // Also include participants with status 'joined' and tx_hash (they've paid)
      const paidParticipants = allParticipants.filter((p: GameParticipant) => 
        p.payment_status === 'paid' || 
        p.status === 'paid' || 
        (p.status === 'joined' && !!(p as any)?.tx_hash) // Joined with payment tx
      );

      if (paidParticipants.length === 0) {
        setError('No paid participants found. Cannot settle game.');
        setSettling(false);
        return;
      }

      // Build winner FIDs array - backend will derive addresses from payment transactions and use payout_bps from game
      const winnerFids: number[] = expectedWinnerCount === 1
        ? [parseInt(selectedWinnerFid, 10)]
        : selectedWinnerFids;

      // Build request payload - only send winnerFids (backend uses payout_bps from game config)
      const payload = { winnerFids };
      
      // Dev-only debug: log payload before fetch
      console.log('[Settle Game] Request payload:', JSON.stringify(payload, null, 2));

      // Call the settle endpoint - backend uses payout_bps from game config
      let res: Response;
      try {
        res = await authedFetch(`/api/games/${id}/settle-contract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), // Backend uses payout_bps from game config
        }, token);
      } catch (authErr: any) {
        // If auth expired, show clear message and don't update UI state
        if (authErr instanceof AuthExpiredError) {
          setError('Session expired. Please refresh this mini-app and try again.');
          setShowSettleModal(false); // Close modal but don't update game state
          return;
        }
        throw authErr;
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to settle game');
      }

      setSuccessMessage('Game settled successfully!');
      setShowSettleModal(false);
      setSelectedWinnerFid('');
      setSelectedWinnerFids([]);
      await loadData();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      // Handle auth expiry separately
      if (err instanceof AuthExpiredError) {
        setError('Session expired. Please refresh this mini-app and try again.');
        setIsAuthExpired(true);
        setShowSettleModal(false);
      } else {
        setError(err.message || 'Failed to settle game');
        setIsAuthExpired(false);
      }
    } finally {
      setSettling(false);
    }
  };

  const loadData = async () => {
    if (!token || authStatus !== 'authed') {
      // Don't set error here - let the useEffect handle state
      setLoading(false);
      return;
    }

    try {
      if (fid) {
        setCurrentUserFid(fid);
      }

      const gameRes = await authedFetch(`/api/games/${id}`, { 
        method: 'GET',
        cache: 'no-store', // Force fresh data, no caching
      }, token);
      if (!gameRes.ok) throw new Error('Failed to fetch game');
      const gameData = await gameRes.json();
      setGame(gameData.data);

      if (fid) {
        const participantRes = await authedFetch(`/api/games/${id}/participants`, { method: 'GET' }, token);
        if (participantRes.ok) {
          const participantData = await participantRes.json();
          const participants = participantData.data || [];
          // API now returns ALL participants, so we need to filter by current user's FID
          // Find the participant record for the current user
          const userParticipant = participants.find((p: any) => {
            const participantFid = p.fid || p.player_fid;
            return participantFid === fid;
          }) || null;
          if (userParticipant) {
            // Verify the participant actually belongs to this game (defense in depth)
            if (userParticipant.game_id !== id) {
              console.warn(`Participant game_id mismatch: expected ${id}, got ${userParticipant.game_id}`);
              setParticipant(null);
              return;
            }
            // Normalize to use player_fid for consistency (database uses 'fid', interface uses 'player_fid')
            const normalizedParticipant: GameParticipant = {
              ...userParticipant,
              player_fid: userParticipant.player_fid || userParticipant.fid || fid,
            };
            setParticipant(normalizedParticipant);
            setEligibility({
              eligible: normalizedParticipant.is_eligible !== false,
              reason: (normalizedParticipant.join_reason as any) || 'not_eligible',
            });
            // For paid games, always try to fetch credentials if user is a participant
            // The API will enforce payment requirement and return appropriate error if not paid
            if (isPaidGame(gameData.data)) {
              fetchCredentials();
            } else if (normalizedParticipant.payment_status === 'paid' || normalizedParticipant.status === 'paid') {
              // For non-paid games, only fetch if explicitly marked as paid
              fetchCredentials();
            }
          } else {
            // No participant record found - check if user has paid on-chain (recovery scenario)
            if (isPaidGame(gameData.data)) {
              console.log('[GameDetail] No participant record found for paid game, checking on-chain state for recovery...');
              try {
                const recoverRes = await authedFetch('/api/payments/recover', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    gameId: id,
                    fid: fid,
                  }),
                }, token);

                if (recoverRes.ok) {
                  const recoverData = await recoverRes.json();
                  console.log('[GameDetail] Recovery successful, participant synced:', recoverData);
                  if (recoverData.data?.participant) {
                    // Set participant state to trigger UI update
                    const normalizedParticipant: GameParticipant = {
                      ...recoverData.data.participant,
                      player_fid: recoverData.data.participant.fid || fid,
                    };
                    setParticipant(normalizedParticipant);
                    setEligibility({
                      eligible: true,
                      reason: 'manual_override' as any, // Use manual_override as closest match
                    });
                    // Fetch credentials if password was returned
                    if (recoverData.data?.game_password) {
                      setCredentials({
                        password: recoverData.data.game_password,
                        locked: false,
                      });
                      setHasCredentials(true);
                    } else {
                      fetchCredentials();
                    }
                  }
                } else {
                  const recoverError = await recoverRes.json();
                  console.log('[GameDetail] Recovery check failed (user likely hasn\'t paid):', recoverError);
                  setParticipant(null);
                }
              } catch (recoverErr) {
                console.error('[GameDetail] Recovery check error:', recoverErr);
                setParticipant(null);
              }
            } else {
              setParticipant(null);
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load game');
    } finally {
      setLoading(false);
    }
  };

  const fetchCredentials = async () => {
    if (!token || !currentUserFid) return;

    // Clear previous error
    setCredentialsError(null);

    try {
      const res = await authedFetch(`/api/games/${id}/credentials`, { 
        method: 'GET',
        cache: 'no-store', // Force fresh data, no caching
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        // 404/403 are expected if not authorized - treat as no credentials
        if (res.status === 404 || res.status === 403) {
          setHasCredentials(false);
          setCredentials(null);
          setCredentialsError(null);
          return;
        }
        // Other errors (500, etc.) are server errors - show error message
        const errorMsg = data.error || 'Failed to fetch credentials';
        console.error('Failed to fetch credentials:', errorMsg);
        setCredentialsError('Password temporarily unavailable (server error). Try again.');
        setCredentials(null);
        return;
      }
      
      const data = await res.json();
      if (data.ok && data.data) {
        setHasCredentials(data.data.hasCredentials || false);
        
        // Check if credentials exist
        if (!data.data.hasCredentials) {
          // No credentials set - not an error, just means host hasn't set password yet
          setCredentials(null);
          setCredentialsError(null);
          return;
        }
        
        // Check if locked (credentials exist but viewer not authorized)
        if (data.data.locked === true) {
          setCredentials({ password: null, locked: true, passwordSet: data.data.passwordSet });
          setCredentialsError(null);
          return;
        }
        
        // Credentials unlocked - show password (may be null if no password set)
        setCredentials({
          password: data.data.password || null, // null means no password set
          locked: false,
          passwordSet: data.data.passwordSet,
        });
        setCredentialsError(null);
      }
    } catch (err) {
      // Network or other errors
      console.error('Failed to fetch credentials:', err);
      setCredentialsError('Password temporarily unavailable (server error). Try again.');
      setCredentials(null);
    }
  };
  
  const copyPassword = () => {
    if (credentials?.password) {
      navigator.clipboard.writeText(credentials.password);
      setSuccessMessage('Password copied to clipboard!');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import('~/lib/constants');
        const url = APP_URL + `/games/${id}`;
        await sdk.actions.composeCast({
          text: 'Join my game',
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
      const url = APP_URL + `/games/${id}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      const { APP_URL } = await import('~/lib/constants');
      alert('Copy failed. URL: ' + (APP_URL + `/games/${id}`));
    }
  };

  const handleJoin = async () => {
    if (authStatus !== 'authed' || !currentUserFid) {
      if (authStatus === 'error') {
        setError('Authentication failed. Please retry sign-in.');
      } else {
        setError('Please wait for authentication to complete.');
      }
      return;
    }

    if (!game) return;

    if (participant) {
      setError('You have already joined this game.');
      return;
    }

    if (isPaidGame(game)) {
      setError('Paid games require payment. Please use the payment flow.');
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/games/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: currentUserFid }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        const errorMsg = data.error || 'Failed to join game';
        console.error('[handleJoin] API error:', { status: res.status, error: errorMsg, data });
        throw new Error(errorMsg);
      }

      // Normalize participant data
      const normalizedParticipant: GameParticipant = {
        ...data.data.participant,
        player_fid: data.data.participant.player_fid || data.data.participant.fid || currentUserFid,
      };
      setParticipant(normalizedParticipant);
      setEligibility(data.data.eligibility);
      await loadParticipantsCount();
      
      // Clear any previous errors on success
      setError(null);
      setIsAuthExpired(false);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to join game';
      console.error('[handleJoin] Join failed:', err);
      setError(errorMsg);
    } finally {
      setJoining(false);
    }
  };

  const handlePaymentSuccess = async (txHash: string, password: string | null) => {
    // After payment success, force refresh to get updated state
    setError(null);
    
    // If password provided directly, show credentials immediately (legacy support)
    if (password !== null) {
      setCredentials({ password, locked: false });
      setHasCredentials(true);
    }
    
    // Force reload all data (no cache)
    await Promise.all([
      loadData(),
      loadParticipantsCount(),
    ]);
    
    // Fetch credentials (will use no-cache, handles locked state gracefully)
    await fetchCredentials();
  };

  const handlePaymentError = (errorMsg: string) => {
    setError(errorMsg);
  };

  // Show loading state while auth is loading or data is loading
  if (authStatus === 'loading' || (loading && !game && !error)) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--text-muted)' }}>{authStatus === 'loading' ? 'Signing in...' : 'Loading...'}</p>
        </div>
      </main>
    );
  }

  // Show error state with retry if auth failed
  if (authStatus === 'error' && !game) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="mb-4" style={{ color: 'var(--fire-2)' }}>Authentication failed. Please try again.</p>
          <button
            onClick={retry}
            className="btn-primary"
          >
            Retry sign-in
          </button>
          <Link href="/" className="mt-4 ml-4 inline-block" style={{ color: 'var(--fire-1)' }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  // Show error if game not found or other error
  if (error && !game) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--fire-2)' }}>Error: {error}</p>
          <Link href="/" className="mt-4 inline-block" style={{ color: 'var(--fire-1)' }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--text-muted)' }}>Game not found</p>
        </div>
      </main>
    );
  }

  const isEligible = eligibility?.eligible || false;
  const canJoin = currentUserFid && (!participant || !isEligible);
  // Check both payment_status (legacy) and status (new schema) for paid status
  // Also check for tx_hash as an indicator of payment
  const hasPaid = participant?.payment_status === 'paid' || participant?.status === 'paid' || !!(participant as any)?.tx_hash;
  // Use effectiveMaxParticipants from API (enriched by enrichGameWithRegistrationStatus),
  // fallback to helper function if missing (shouldn't happen in normal flow)
  const effectiveMax = game.effectiveMaxParticipants ?? getEffectiveMaxParticipants({
    game_type: game.game_type,
    max_participants: game.max_participants,
  });
  // Use spotsOpen from API, fallback to calculated value using paidCount (matches what we display in "Players Paid")
  const spotsOpen = game.spotsOpen ?? (effectiveMax !== null && effectiveMax !== undefined
    ? Math.max(effectiveMax - paidCount, 0)
    : null);

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        <Link href="/clubs" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back to Clubs
        </Link>

        {/* Game Card - matching homepage style */}
        <div className={`hl-card ${participant && currentUserFid ? 'hl-card--joined' : ''}`}>
          <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>
              <h2 className="text-lg font-semibold mb-2 text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, flex: 1, textAlign: 'center' }}>{game.title || 'Untitled Game'}</h2>
              <div style={{ display: 'flex', gap: 8, marginLeft: '12px' }}>
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
              </div>
            </div>
            {game.description && (
              <p className="text-sm text-secondary mb-2" style={{ color: 'var(--text-1)' }}>{game.description}</p>
            )}
            <div className="flex items-center gap-2 mb-2 justify-center" style={{ flexWrap: 'wrap' }}>
              {(() => {
                const badges = getGameBadges(game, paidCount);
                return (
                  <>
                    {badges.primaryLabel && (
                      <span className={`hl-badge ${
                        badges.primaryLabel === 'Open' ? '' :
                        badges.primaryLabel === 'Registration open' ? 'hl-badge--fire' :
                        badges.primaryLabel === 'In progress' ? 'hl-badge--fire' :
                        badges.primaryLabel === 'Registration closed' ? 'hl-badge--muted' :
                        badges.primaryLabel === 'Settled' ? 'hl-badge--muted' :
                        badges.primaryLabel === 'Cancelled' ? 'hl-badge--muted' :
                        badges.primaryLabel === 'Closed' ? 'hl-badge--muted' :
                        ''
                      }`}>
                        {badges.primaryLabel}
                      </span>
                    )}
                    {(badges.primaryLabel === 'Registration open' || badges.primaryLabel === 'Open') && (
                      <RegistrationInfoBadge game={game} participantCount={paidCount} />
                    )}
                    <span className={`hl-badge ${
                      game.gating_type === 'open' ? '' : 'hl-badge--fire'
                    }`}>
                      {game.gating_type === 'open' ? 'Open' : `$${game.entry_fee_amount || 0} Entry Fee`}
                    </span>
                    {/* Already Joined Badge - inline with other badges, green style */}
                    {participant && currentUserFid && (
                      <span className="hl-badge hl-badge--green">
                        ✓ You&apos;ve joined
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
            {/* Participant count and spots open */}
            <div className="text-xs text-tertiary mb-2 flex items-center gap-2 flex-wrap justify-center" style={{ color: 'var(--text-2)' }}>
              <span>
                {(() => {
                  if (effectiveMax !== null && effectiveMax !== undefined) {
                    return (
                      <>
                        {paidCount}/{effectiveMax} joined • {spotsOpen !== null && spotsOpen !== undefined ? spotsOpen : Math.max(effectiveMax - paidCount, 0)} spots open
                      </>
                    );
                  } else {
                    return <span>Unlimited spots</span>;
                  }
                })()}
              </span>
            </div>
            
            {/* Participant names with pfps - only show joined/paid participants */}
            {participantsWithNames.length > 0 && (() => {
              const activeParticipants = participantsWithNames.filter((p) => 
                p.status === 'joined' || p.status === 'paid' || p.payment_status === 'paid'
              );
              
              return activeParticipants.length > 0 ? (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2 items-center justify-center">
                    {activeParticipants.map((p) => {
                      const fid = (p as any).fid || (p as any).player_fid;
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          {p.pfpUrl && (
                            <img
                              src={p.pfpUrl}
                              alt={p.username || `FID ${fid}`}
                              className="w-6 h-6 rounded-full"
                              style={{ objectFit: 'cover' }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          <span className="text-xs" style={{ color: 'var(--text-1)' }}>
                            {p.username || `FID ${fid}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null;
            })()}
            
            {/* Game Password Section */}
            {isPaidGame(game) && game.entry_fee_amount && (
              <div className={`mb-4 ${!hasPaid || !participant || !currentUserFid ? 'password-section-locked' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {hasPaid && participant && currentUserFid ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Game Password</p>
                    {hasCredentials && credentials && !credentials.locked && credentials.password ? (
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                          {showPassword ? credentials.password : '••••••••'}
                        </p>
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '12px', minHeight: 'auto' }}
                        >
                          {showPassword ? 'Hide' : 'Reveal'}
                        </button>
                        <button
                          onClick={copyPassword}
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '12px', minHeight: 'auto' }}
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Password not set yet</p>
                    )}
                  </div>
                ) : (
                  <div 
                    className="hl-card password-locked-content" 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      padding: '16px', 
                      position: 'relative',
                      cursor: 'pointer'
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const registrationOpen = (game as any).registrationOpen !== false;
                      if (registrationOpen) {
                        setGameForPayment(game);
                      }
                    }}
                  >
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Game Password</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Pay {game.entry_fee_amount} {game.entry_fee_currency || 'USDC'} for password
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Payment Button - only show if not paid and not joined */}
            {currentUserFid && !hasPaid && !participant && (
              <div ref={paymentSectionRef} className="mt-4" style={{ display: 'flex', justifyContent: 'center' }}>
                {(() => {
                  const registrationOpen = (game as any).registrationOpen !== false; // Default to true if not set
                  const isRegistrationClosed = !registrationOpen;
                  
                  if (isRegistrationClosed) {
                    const closeAt = (game as any).registrationCloseAt;
                    const closeTime = closeAt ? new Date(closeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
                    return (
                      <div className="hl-card" style={{ textAlign: 'center' }}>
                        <p className="text-lg font-bold text-center" style={{ color: 'var(--fire-2)' }}>
                          Registration Closed
                        </p>
                        {closeTime && (
                          <p className="text-sm text-center mt-2" style={{ color: 'var(--text-muted)' }}>
                            Registration closed at {closeTime}
                          </p>
                        )}
                      </div>
                    );
                  }
                  
                  return (
                    <PaymentButton
                      game={game}
                      playerFid={currentUserFid}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      customText={`Pay ${game.entry_fee_amount} ${game.entry_fee_currency || 'USDC'}`}
                    />
                  );
                })()}
              </div>
            )}
          </div>
          
          {/* ClubGG Link - show if user has paid */}
          {hasPaid && participant && currentUserFid && (
            <div ref={clubggSectionRef} className="mt-4" style={{ display: 'flex', justifyContent: 'center' }}>
              <style jsx>{`
                @keyframes pulse-gentle {
                  0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                  }
                  50% {
                    opacity: 0.9;
                    transform: scale(1.02);
                  }
                }
                .pulse-button {
                  animation: pulse-gentle 2s ease-in-out infinite;
                }
              `}</style>
              {game.clubgg_link ? (
                <a
                  href={game.clubgg_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pulse-button btn-primary"
                >
                  Join ClubGG Game Here
                </a>
              ) : (
                <a
                  href="https://clubgg.app.link/nPkZsgIq9Yb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pulse-button btn-primary"
                >
                  Join ClubGG Game Here
                </a>
              )}
            </div>
          )}

          {/* Transaction Receipts (for participants with payment/refund/payout transactions) */}
          {participant && (
            <div className="mb-6 hl-card" style={{ padding: '6px' }}>
              <h2 className="text-xs font-bold mb-1" style={{ color: 'var(--text-primary)', fontSize: '10px' }}>Transaction Receipts</h2>
              
              {/* Payment Transaction */}
              {participant.tx_hash && (
                <div className="mb-1">
                  <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)', fontSize: '9px' }}>Payment Transaction</p>
                  {getBaseScanTxUrl(participant.tx_hash) ? (
                    <a
                      href={getBaseScanTxUrl(participant.tx_hash)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs break-all"
                      style={{ color: 'var(--fire-1)', fontSize: '9px' }}
                    >
                      {participant.tx_hash}
                    </a>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{participant.tx_hash}</p>
                  )}
                </div>
              )}

              {/* Refund Transaction (if game is cancelled) */}
              {game.status === 'cancelled' && (
                <div className="mb-1">
                  {(participant as any).refund_tx_hash ? (
                    <>
                      {/* Show refund link whenever refund_tx_hash exists */}
                      <p className="text-xs font-medium mb-0.5" style={{ color: participant.status === 'refunded' ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '9px' }}>
                        {participant.status === 'refunded' ? 'Refund Successful' : 'Refund Submitted (confirming)'}
                      </p>
                      {getBaseScanTxUrl((participant as any).refund_tx_hash) ? (
                        <a
                          href={getBaseScanTxUrl((participant as any).refund_tx_hash)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs break-all"
                          style={{ color: 'var(--fire-1)', fontSize: '9px' }}
                        >
                          {(participant as any).refund_tx_hash}
                        </a>
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{(participant as any).refund_tx_hash}</p>
                      )}
                    </>
                  ) : participant.tx_hash ? (
                    // Has payment tx but no refund tx hash - refund not yet initiated
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--fire-2)', fontSize: '9px' }}>Refund Not Initiated</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '8px' }}>
                        Missing refund transaction. {game.creator_fid === fid ? 'Please re-run cancel to retry refund.' : 'Please contact the host.'}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Settlement/Payout Transaction (deduplicated) */}
              {(() => {
                const settleTxHash = (game.status === 'settled' || game.status === 'completed') && (game as any).settle_tx_hash 
                  ? (game as any).settle_tx_hash 
                  : null;
                const payoutTxHash = (participant as any).payout_tx_hash || null;
                const isSameTx = settleTxHash && payoutTxHash && settleTxHash.toLowerCase() === payoutTxHash.toLowerCase();
                
                // Show settlement tx if it exists (deduplicated if same as payout)
                if (settleTxHash) {
                  return (
                    <div className="mb-1">
                      <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)', fontSize: '9px' }}>
                        {isSameTx ? 'Settlement / Payout Transaction' : 'Settlement Transaction'}
                      </p>
                      {getBaseScanTxUrl(settleTxHash) ? (
                        <a
                          href={getBaseScanTxUrl(settleTxHash)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs break-all"
                          style={{ color: 'var(--fire-1)', fontSize: '9px' }}
                        >
                          {settleTxHash}
                        </a>
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{settleTxHash}</p>
                      )}
                      
                      {/* Show payout amount if this participant received a payout */}
                      {isSameTx && (participant as any).payout_amount !== null && (participant as any).payout_amount !== undefined && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)', fontSize: '9px' }}>
                          Your Payout: {(participant as any).payout_amount} {game.entry_fee_currency || 'USDC'}
                        </p>
                      )}
                    </div>
                  );
                }
                
                // Show separate payout tx if different from settle tx
                if (payoutTxHash && !isSameTx) {
                  return (
                    <div className="mb-1">
                      <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-primary)', fontSize: '9px' }}>
                        Your Payout: {((participant as any).payout_amount !== null && (participant as any).payout_amount !== undefined)
                          ? `${(participant as any).payout_amount} ${game.entry_fee_currency || 'USDC'}`
                          : 'Amount not specified'}
                      </p>
                      {getBaseScanTxUrl(payoutTxHash) ? (
                        <a
                          href={getBaseScanTxUrl(payoutTxHash)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs break-all"
                          style={{ color: 'var(--fire-1)', fontSize: '9px' }}
                        >
                          {payoutTxHash}
                        </a>
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{payoutTxHash}</p>
                      )}
                    </div>
                  );
                }
                
                return null;
              })()}
            </div>
          )}

          {/* Non-paid game join - REMOVED: All games are paid in v1/v2 */}
          {/* Join button removed - all games require payment */}

          {successMessage && (
            <div className="mb-6 hl-card">
              <p style={{ color: 'var(--text-primary)' }}>{successMessage}</p>
            </div>
          )}
          {error && (
            <div className="mb-6 hl-card">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{isAuthExpired ? 'Session Expired' : 'Error'}</p>
                  <p style={{ color: isAuthExpired ? 'var(--text-muted)' : 'var(--fire-2)' }}>{error}</p>
                </div>
                {isAuthExpired && (
                  <button
                    onClick={() => window.location.reload()}
                    className="ml-4 btn-primary"
                    style={{ padding: '8px 16px', fontSize: '14px', minHeight: 'auto' }}
                  >
                    Refresh
                  </button>
                )}
              </div>
            </div>
          )}

          {eligibility && !isPaidGame(game) && (
            <div className="mb-6 hl-card">
              <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {isEligible ? '✓ You are eligible' : '⚠ Eligibility Check'}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{eligibility.message || eligibility.reason}</p>
            </div>
          )}

          {isOwner && (
            <div className="mt-6 flex gap-4">
              <Link
                href={`/games/${id}/manage`}
                className="btn-secondary"
              >
                Manage (Owner)
              </Link>
              <button
                onClick={async () => {
                  await loadAllParticipantsForSettle();
                  setShowSettleModal(true);
                }}
                className="btn-primary"
              >
                Settle Game
              </button>
              {game.status !== 'cancelled' && game.status !== 'settled' && game.status !== 'completed' && (
                <>
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="btn-secondary"
                    style={{ background: 'var(--fire-2)', borderColor: 'var(--fire-2)', color: 'var(--text-primary)' }}
                  >
                    Cancel Game
                  </button>
                  {/* Cancel Confirmation Modal */}
                  {showCancelConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="hl-card max-w-md w-full mx-4">
                        <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Cancel Game</h3>
                        <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
                          Are you sure you want to cancel this game? All paid participants will be refunded and the game will be deactivated.
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={async () => {
                              setShowCancelConfirm(false);
                              setCancelling(true);
                              setError(null);
      setIsAuthExpired(false);
                              try {
                                // Try to cancel with optional retry on auth expiry
                                let res: Response;
                                const currentToken = token;
                                
                                try {
                                  res = await authedFetch(`/api/games/${id}/cancel`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                  }, currentToken);
                                } catch (authErr: any) {
                                  // If auth expired, try refreshing token once
                                  if (authErr instanceof AuthExpiredError && retry) {
                                    await retry();
                                    // Wait a bit for token to refresh
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                    // Get updated token from context (will be refreshed on next render, but try again)
                                    // Note: In practice, retry() updates the token in AuthProvider state
                                    // Since we can't directly access the new token here, we'll show the error
                                    // and let the user refresh manually (cleaner UX)
                                    throw authErr;
                                  }
                                  throw authErr;
                                }
                                
                                const data = await res.json();
                                if (!res.ok || !data.ok) {
                                  throw new Error(data.error || 'Failed to cancel game');
                                }
                                setSuccessMessage('Game cancelled successfully. All participants have been refunded.');
                                // Force reload game and participant data to show refund receipts
                                await Promise.all([
                                  loadData(),
                                  loadParticipantsCount(),
                                ]);
                                setTimeout(() => setSuccessMessage(null), 3000);
                              } catch (err: any) {
                                // Handle auth expiry separately - don't treat as refund failure
                                if (err instanceof AuthExpiredError) {
                                  setError('Session expired. Please refresh this mini-app and try again.');
                                  setIsAuthExpired(true);
                                  // DO NOT update UI state (game remains active, participant state unchanged)
                                  // This prevents misleading "refund not initiated" messages
                                } else {
                                  setError(err.message || 'Failed to cancel game');
                                  setIsAuthExpired(false);
                                }
                              } finally {
                                setCancelling(false);
                              }
                            }}
                            disabled={cancelling}
                            className="flex-1 btn-primary"
                            style={{ background: 'var(--fire-2)', borderColor: 'var(--fire-2)' }}
                          >
                            {cancelling ? 'Cancelling...' : 'Yes, Cancel Game'}
                          </button>
                          <button
                            onClick={() => setShowCancelConfirm(false)}
                            disabled={cancelling}
                            className="flex-1 btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Settle Game Modal */}
          {showSettleModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="hl-card max-w-md w-full mx-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Settle Game</h3>
                   <button
                     onClick={() => {
                       setShowSettleModal(false);
                       setSelectedWinnerFid('');
                       setSelectedWinnerFids([]);
                     }}
                     style={{ color: 'var(--text-muted)' }}
                   >
                     ✕
                   </button>
                 </div>
                 
                 {/* Get paid participants for display */}
                 {(() => {
                   const paidParticipants = allParticipants.filter((p: GameParticipant) => 
                     p.payment_status === 'paid' || 
                     p.status === 'paid' || 
                     (p.status === 'joined' && !!(p as any)?.tx_hash)
                   );
                   
                   // Get payout structure from game config (payout_bps array)
                   const gamePayoutBps = (game as any).payout_bps;
                   const expectedWinnerCount = gamePayoutBps && Array.isArray(gamePayoutBps) && gamePayoutBps.length > 0
                     ? gamePayoutBps.length
                     : 1; // Default to winner-take-all if not configured
                   
                   // Generate description based on payout_bps
                   const getPayoutDescription = () => {
                     if (!gamePayoutBps || !Array.isArray(gamePayoutBps) || gamePayoutBps.length === 0) {
                       return 'Select 1 winner. The entire pot will be awarded to the winner.';
                     }
                     
                     if (gamePayoutBps.length === 1) {
                       return 'Select 1 winner. The entire pot will be awarded to the winner.';
                     }
                     
                     // Multiple winners - show percentages
                     const percentages = gamePayoutBps.map(bps => (bps / 100).toFixed(1));
                     if (percentages.every(p => p === percentages[0])) {
                       // Equal split
                       return `Select ${gamePayoutBps.length} winners. The pot will be split equally (${percentages[0]}% each).`;
                     } else {
                       // Weighted split
                       const breakdown = percentages.map((p, i) => `${i + 1}st: ${p}%`).join(', ');
                       return `Select ${gamePayoutBps.length} winners. Payout: ${breakdown}`;
                     }
                   };

                   const isWinnerTakeAll = expectedWinnerCount === 1;
                   
                   return (
                     <div className="space-y-4">
                       <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
                         {getPayoutDescription()}
                       </p>
                       
                       <div className="space-y-2 mb-4 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
                         {paidParticipants.map((p: GameParticipant) => {
                           const participantFid = p.player_fid || (p as any).fid;
                           const isSelected = isWinnerTakeAll
                             ? selectedWinnerFid === String(participantFid)
                             : selectedWinnerFids.includes(participantFid);
                           const canSelect = isWinnerTakeAll
                             ? true // Always can select one for winner take all
                             : selectedWinnerFids.length < expectedWinnerCount || isSelected; // Can select if under limit or already selected
                           
                           return (
                             <button
                               key={p.id}
                               onClick={() => {
                                 if (isWinnerTakeAll) {
                                   setSelectedWinnerFid(isSelected ? '' : String(participantFid));
                                 } else {
                                   if (isSelected) {
                                     setSelectedWinnerFids(selectedWinnerFids.filter(fid => fid !== participantFid));
                                   } else if (selectedWinnerFids.length < expectedWinnerCount) {
                                     setSelectedWinnerFids([...selectedWinnerFids, participantFid]);
                                   }
                                 }
                               }}
                              disabled={!canSelect}
                              className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between ${
                                isSelected ? 'hl-badge--fire' :
                                !canSelect ? 'opacity-40 cursor-not-allowed' :
                                'hl-badge'
                              }`}
                              style={isSelected ? {} : !canSelect ? { background: 'var(--bg-2)', border: '1px solid var(--stroke)', color: 'var(--text-muted)' } : {}}
                             >
                              <span>FID {participantFid}</span>
                              {isSelected && <span style={{ color: 'var(--fire-1)' }}>✓</span>}
                             </button>
                           );
                         })}
                       </div>
                       
                       {paidParticipants.length === 0 && (
                         <p className="text-sm" style={{ color: 'var(--fire-2)' }}>No paid participants found.</p>
                       )}
                       
                       {!isWinnerTakeAll && (
                         <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                           Selected: {selectedWinnerFids.length} / {expectedWinnerCount}
                         </p>
                       )}

                       <div className="flex gap-3">
                         <button
                           onClick={handleSettleGame}
                           disabled={
                             settling || 
                             paidParticipants.length === 0 ||
                             (isWinnerTakeAll && !selectedWinnerFid) ||
                             (!isWinnerTakeAll && selectedWinnerFids.length !== expectedWinnerCount)
                           }
                           className="flex-1 btn-primary"
                         >
                           {settling ? 'Settling...' : 'Settle Game'}
                         </button>
                         <button
                           onClick={() => {
                             setShowSettleModal(false);
                             setSelectedWinnerFid('');
                             setSelectedWinnerFids([]);
                             setError(null);
                             setIsAuthExpired(false);
                           }}
                           className="btn-secondary"
                         >
                           Cancel
                         </button>
                       </div>
                       {error && (
                         <p className="text-sm mt-2" style={{ color: 'var(--fire-2)' }}>{error}</p>
                       )}
                     </div>
                   );
                 })()}
              </div>
            </div>
          )}

          {/* PaymentButton - triggered when entry fee badge or password section is clicked */}
          {gameForPayment && currentUserFid && (
            <PaymentButtonWrapper
              game={gameForPayment}
              playerFid={currentUserFid}
              onSuccess={(txHash, password) => {
                setGameForPayment(null);
                handlePaymentSuccess(txHash, password);
              }}
              onError={(error) => {
                alert(error);
                console.error('Payment error:', error);
                setGameForPayment(null);
              }}
              buttonRef={paymentButtonRef}
            />
          )}

          {authStatus === 'error' && !currentUserFid && (
            <div className="mt-6 hl-card">
              <p className="mb-2" style={{ color: 'var(--text-primary)' }}>Authentication required to join this game.</p>
              <button
                onClick={retry}
                className="btn-primary"
              >
                Retry sign-in
              </button>
            </div>
          )}
          {!currentUserFid && authStatus === 'authed' && (
            <div className="mt-6 hl-card">
              <p style={{ color: 'var(--text-muted)' }}>Please wait while we load your profile...</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
