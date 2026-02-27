'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
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
import { mapCurrencyToAddress } from '~/lib/contract-ops';
import { GAME_ESCROW_CONTRACT, CLUBGG_LINK } from '~/lib/constants';
import { MandatoryClubGGStepsModal } from '~/components/MandatoryClubGGStepsModal';
import { formatPrizeWithCurrency, formatPrizeAmount, getPositionLabel, formatStakingRequirement } from '~/lib/format-prize';
import { PlayerListInline } from '~/components/PlayerListInline';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';
import { Trash2 } from 'lucide-react';
import Image from 'next/image';

const BULLIED_BY_BETR_GAME_ID = 'a47b5a0e-c614-47c3-b267-64c932838f05';

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
  const [hasCredentials, setHasCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [participantsWithNames, setParticipantsWithNames] = useState<Array<GameParticipant & { username?: string; pfpUrl?: string }>>([]);
  const [countdown, setCountdown] = useState<string>('');
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [allParticipants, setAllParticipants] = useState<GameParticipant[]>([]);
  const [allParticipantsWithNames, setAllParticipantsWithNames] = useState<Array<GameParticipant & { username?: string; pfpUrl?: string }>>([]);
  const [selectedWinnerFid, setSelectedWinnerFid] = useState<string>('');
  const [selectedWinnerFids, setSelectedWinnerFids] = useState<number[]>([]); // For multiple winners
  const [settling, setSettling] = useState(false);
  // Phase 4.4: Last Person Standing Award state
  const [showLpsAward, setShowLpsAward] = useState(false);
  const [selectedLpsFid, setSelectedLpsFid] = useState<number | null>(null);
  const [lpsAwardAmount, setLpsAwardAmount] = useState<string>('');
  const [allParticipantsForAward, setAllParticipantsForAward] = useState<Array<GameParticipant & { username?: string; pfpUrl?: string }>>([]);
  const [showPayoutStructure, setShowPayoutStructure] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [gameForPayment, setGameForPayment] = useState<Game | null>(null);
  const paymentButtonRef = useRef<HTMLButtonElement | null>(null);
  // Phase 31: Leave Game state
  const [_leaving, setLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Admin: remove participant + reserve a spot
  const [removingFid, setRemovingFid] = useState<number | null>(null);
  const [reserveSearchQuery, setReserveSearchQuery] = useState('');
  const [reserveSearchResults, setReserveSearchResults] = useState<Array<{ fid: number; username?: string; display_name?: string; pfp_url?: string }>>([]);
  const [reserveSearching, setReserveSearching] = useState(false);
  const [reserveShowDropdown, setReserveShowDropdown] = useState(false);
  const [reserveSelectedUser, setReserveSelectedUser] = useState<{ fid: number; username?: string; display_name?: string; pfp_url?: string } | null>(null);
  const [reserveAdding, setReserveAdding] = useState(false);
  // Phase 32: Sunday High Stakes signup (undefined = not loaded, null = no signup, { status } = loaded)
  const [sundayHighStakesSignup, setSundayHighStakesSignup] = useState<undefined | null | { status: string }>(undefined);
  const [sundaySignupCastUrl, setSundaySignupCastUrl] = useState('');
  const [sundaySignupSubmitting, setSundaySignupSubmitting] = useState(false);
  // Phase 32: Admin list of Sunday High Stakes signups
  const [sundaySignupsList, setSundaySignupsList] = useState<Array<{ id: string; fid: number; cast_url: string | null; status: string; approved_at: string | null }>>([]);
  const [sundaySignupsLoading, setSundaySignupsLoading] = useState(false);
  const [sundaySignupActionFid, setSundaySignupActionFid] = useState<number | null>(null);
  // Phase 32: BB confirmation for settle (double_payout_if_bb)
  const [winnerStakeCheck, setWinnerStakeCheck] = useState<Array<{ fid: number; stakedAmount: string; isBB: boolean }> | null>(null);
  const [bbConfirmedFids, setBbConfirmedFids] = useState<Set<number>>(new Set());
  // Post-registration mandatory steps modal (poker: Club GG password + steps)
  const [showMandatoryStepsModal, setShowMandatoryStepsModal] = useState<{ gameTitle: string; password: string } | null>(null);
  const [pendingShowMandatorySteps, setPendingShowMandatorySteps] = useState(false);

  // Refs for deep linking from notifications
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const clubggSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset credentials state when gameId changes (prevent cross-game leakage)
    setCredentials(null);
    setCredentialsError(null);
    setHasCredentials(false);
    setShowMandatoryStepsModal(null);
    setPendingShowMandatorySteps(false);

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
  }, [currentUserFid, game, token]);

  // Phase 32: Load Sunday High Stakes signups for admin
  useEffect(() => {
    if (!token || !isOwner || !game?.id || !(game as any).is_sunday_high_stakes) {
      setSundaySignupsList([]);
      return;
    }
    setSundaySignupsLoading(true);
    authedFetch(`/api/games/${id}/sunday-high-stakes-signups`, { method: 'GET' }, token)
      .then(r => r.json())
      .then(data => {
        if (data?.ok && Array.isArray(data.data)) setSundaySignupsList(data.data);
        else setSundaySignupsList([]);
      })
      .catch(() => setSundaySignupsList([]))
      .finally(() => setSundaySignupsLoading(false));
  }, [token, isOwner, game?.id, (game as any)?.is_sunday_high_stakes, id]);

  // Phase 32: Fetch winner stake check when settle modal open + double_payout_if_bb + winners selected
  useEffect(() => {
    if (!showSettleModal || !token || !game || !(game as any).double_payout_if_bb) {
      setWinnerStakeCheck(null);
      setBbConfirmedFids(new Set());
      return;
    }
    const expectedWinnerCount = (game as any).number_of_winners ?? 1;
    const winnerFids: number[] = expectedWinnerCount === 1
      ? (selectedWinnerFid ? [parseInt(selectedWinnerFid, 10)] : [])
      : selectedWinnerFids;
    if (winnerFids.length !== expectedWinnerCount || winnerFids.some(f => !Number.isFinite(f))) {
      setWinnerStakeCheck(null);
      setBbConfirmedFids(new Set());
      return;
    }
    setBbConfirmedFids(new Set());
    const q = winnerFids.join(',');
    authedFetch(`/api/games/${id}/winner-stake-check?fids=${q}`, { method: 'GET' }, token)
      .then(r => r.json())
      .then(data => {
        if (data?.ok && Array.isArray(data.data)) setWinnerStakeCheck(data.data);
        else setWinnerStakeCheck([]);
      })
      .catch(() => setWinnerStakeCheck([]));
  }, [showSettleModal, token, game?.id, (game as any)?.double_payout_if_bb, selectedWinnerFid, selectedWinnerFids, id]);

  // Fetch credentials when participant state is available (for users who have joined)
  // This ensures credentials are fetched when returning to a game page after joining
  useEffect(() => {
    if (token && currentUserFid && game && participant) {
      // Check if user has joined - fetch credentials if they've joined (paid or prize-based games)
      const hasJoined = participant.status === 'joined' || 
                       participant.status === 'paid' || 
                       participant.payment_status === 'paid' || 
                       !!(participant as any)?.tx_hash;
      
      if (hasJoined) {
        // Always try to fetch credentials when participant has joined
        // fetchCredentials() will handle caching/duplicate requests gracefully
        fetchCredentials();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, currentUserFid, game?.id, participant?.id]);

  // Show mandatory steps modal once after prize-based join when credentials load with password
  useEffect(() => {
    if (pendingShowMandatorySteps && credentials?.password && game) {
      setShowMandatoryStepsModal({ gameTitle: game.title || 'Untitled Game', password: credentials.password });
      setPendingShowMandatorySteps(false);
    }
  }, [pendingShowMandatorySteps, credentials?.password, game]);

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

  // Reserve a spot: search users by name
  const searchReserveUsers = useCallback(async (query: string) => {
    if (!token || query.trim().length === 0) {
      setReserveSearchResults([]);
      return;
    }
    try {
      setReserveSearching(true);
      const res = await authedFetch(`/api/games/${id}/participants/search?q=${encodeURIComponent(query.trim())}`, { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.data) {
          setReserveSearchResults(data.data);
          setReserveShowDropdown(true);
        }
      }
    } catch (err) {
      console.warn('Reserve search failed:', err);
    } finally {
      setReserveSearching(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (reserveSearchQuery.trim().length === 0) {
      setReserveSearchResults([]);
      setReserveShowDropdown(false);
      return;
    }
    const t = setTimeout(() => searchReserveUsers(reserveSearchQuery), 300);
    return () => clearTimeout(t);
  }, [reserveSearchQuery, searchReserveUsers]);

  const handleRemoveParticipant = async (participantFid: number) => {
    if (!token) return;
    setRemovingFid(participantFid);
    setError(null);
    try {
      const res = await authedFetch(`/api/games/${id}/participants/${participantFid}`, { method: 'DELETE' }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        await loadParticipantsCount();
      } else {
        setError(data.error || 'Failed to remove participant');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to remove participant');
    } finally {
      setRemovingFid(null);
    }
  };

  const handleReserveAdd = async () => {
    if (!token || !reserveSelectedUser) return;
    setReserveAdding(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/games/${id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: reserveSelectedUser.fid }),
      }, token);
      const data = await res.json();
      if (res.ok && data.ok) {
        setReserveSelectedUser(null);
        setReserveSearchQuery('');
        setReserveSearchResults([]);
        setReserveShowDropdown(false);
        await loadParticipantsCount();
        setSuccessMessage('Spot reserved.');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || 'Failed to reserve spot');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to reserve spot');
    } finally {
      setReserveAdding(false);
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
        
        // Phase 4.4: For prize-based games, use all participants (no payment required)
        // For paid games, filter to only paid participants
        const isPrizeBased = !isPaidGame(game);
        const eligibleParticipants = isPrizeBased
          ? participants.filter((p: GameParticipant) => p.status === 'joined' || p.status === 'paid')
          : participants.filter((p: GameParticipant) => 
              p.payment_status === 'paid' || 
              p.status === 'paid' || 
              (p.status === 'joined' && !!(p as any)?.tx_hash) // Joined with payment tx
            );
        
        setAllParticipants(eligibleParticipants);
        
        // Phase 4.4: Load ALL participants for Last Person Standing Award dropdown (Scheduled games only)
        const isScheduledGame = game && ((game as any).game_type === 'large_event' || ((game as any).max_participants && (game as any).max_participants > 9));
        const allParticipantsList = isScheduledGame
          ? participants.filter((p: GameParticipant) => p.status === 'joined' || p.status === 'paid' || p.status === 'refunded')
          : [];
        const allFids = allParticipantsList.map((p: GameParticipant) => (p as any).fid || (p as any).player_fid).filter((fid: any): fid is number => typeof fid === 'number' && fid > 0);
        const fids = eligibleParticipants.map((p: GameParticipant) => (p as any).fid || (p as any).player_fid).filter((fid: any): fid is number => typeof fid === 'number' && fid > 0);
        const unionFids = [...new Set([...allFids, ...fids])];

        if (unionFids.length > 0) {
          try {
            const bulkRes = await authedFetch(`/api/users/bulk?fids=${unionFids.join(',')}`, { method: 'GET' }, token);
            const bulkData = await bulkRes.json();
            const userMap = new Map<number, { username?: string; pfpUrl?: string }>();
            if (bulkRes.ok && bulkData?.data) {
              (bulkData.data as any[]).forEach((user: any) => {
                userMap.set(user.fid, { username: user.username, pfpUrl: user.avatar_url || user.pfpUrl });
              });
            }
            if (isScheduledGame) {
              const allParticipantsWithUserData = allParticipantsList.map((p: GameParticipant) => {
                const fid = (p as any).fid || (p as any).player_fid;
                const u = userMap.get(fid);
                return { ...p, username: u?.username, pfpUrl: u?.pfpUrl };
              });
              setAllParticipantsForAward(allParticipantsWithUserData);
            }
            const participantsWithUserData = eligibleParticipants.map((p: GameParticipant) => {
              const fid = (p as any).fid || (p as any).player_fid;
              const u = userMap.get(fid);
              return { ...p, username: u?.username, pfpUrl: u?.pfpUrl };
            });
            setAllParticipantsWithNames(participantsWithUserData);
          } catch (bulkErr) {
            console.error('Failed to fetch participant usernames for settle:', bulkErr);
            if (isScheduledGame) setAllParticipantsForAward(allParticipantsList);
            setAllParticipantsWithNames(eligibleParticipants);
          }
        } else {
          if (isScheduledGame) setAllParticipantsForAward(allParticipantsList);
          setAllParticipantsWithNames(eligibleParticipants);
        }
      }
    } catch (err) {
      console.error('Failed to load participants for settle:', err);
    }
  };

  const handleSettleGame = async () => {
    if (!token || !fid || !game) return;
    
    // Phase 4.4: For prize-based games, use number_of_winners and prize_amounts
    // For paid games, use payout_bps
    const isPrizeBased = !isPaidGame(game);
    const expectedWinnerCount = isPrizeBased
      ? ((game as any).number_of_winners || 1)
      : ((game as any).payout_bps && Array.isArray((game as any).payout_bps) && (game as any).payout_bps.length > 0
          ? (game as any).payout_bps.length
          : 1);
    
    // Validate winner selection matches expected count
    if (expectedWinnerCount === 1) {
      if (!selectedWinnerFid) {
        setError('Please select a winner');
        return;
      }
    } else {
      if (selectedWinnerFids.length !== expectedWinnerCount) {
        setError(`Please select exactly ${expectedWinnerCount} winner(s).`);
        return;
      }
    }
    
    // Phase 4.4: Validate Last Person Standing Award
    if (showLpsAward) {
      if (!selectedLpsFid) {
        setError('Please select a Last Person Standing Award recipient');
        return;
      }
      if (!lpsAwardAmount || parseFloat(lpsAwardAmount) <= 0) {
        setError('Please enter a valid Last Person Standing Award amount');
        return;
      }
    }
    
    // Phase 32: Require BB confirmation when double_payout_if_bb
    if ((game as any).double_payout_if_bb && winnerStakeCheck) {
      const bbWinners = winnerStakeCheck.filter(r => r.isBB);
      for (const r of bbWinners) {
        if (!bbConfirmedFids.has(r.fid)) {
          setError(`Please confirm that the selected BB winner (FID ${r.fid}) is correct before settling.`);
          return;
        }
      }
    }

    setSettling(true);
    setError(null);

    try {
      // Phase 4.4: For prize-based games, check all participants (no payment required)
      // For paid games, check paid participants
      const eligibleParticipants = isPrizeBased
        ? allParticipants.filter((p: GameParticipant) => p.status === 'joined' || p.status === 'paid')
        : allParticipants.filter((p: GameParticipant) => 
            p.payment_status === 'paid' || 
            p.status === 'paid' || 
            (p.status === 'joined' && !!(p as any)?.tx_hash)
          );

      if (eligibleParticipants.length === 0) {
        setError('No eligible participants found. Cannot settle game.');
        setSettling(false);
        return;
      }

      // Build winner FIDs array
      const winnerFids: number[] = expectedWinnerCount === 1
        ? [parseInt(selectedWinnerFid, 10)]
        : selectedWinnerFids;

      // Phase 4.4: Build request payload with Last Person Standing Award
      const payload: any = { winnerFids };
      
      if (showLpsAward && selectedLpsFid && lpsAwardAmount) {
        payload.lastPersonStandingFid = selectedLpsFid;
        payload.lastPersonStandingAwardAmount = parseFloat(lpsAwardAmount);
      }
      
      // Dev-only debug: log payload before fetch
      console.log('[Settle Game] Request payload:', JSON.stringify(payload, null, 2));

      // Call the settle endpoint
      let res: Response;
      try {
        res = await authedFetch(`/api/games/${id}/settle-contract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

      // Immediately update game state with settle_tx_hash and settle_tx_url for instant UI display
      if (data.data?.settleTxHash && game) {
        setGame({
          ...game,
          settle_tx_hash: data.data.settleTxHash,
          settle_tx_url: data.data.settleTxUrl ?? undefined,
          status: 'settled' as any,
        });
      }

      setSuccessMessage('Game settled successfully!');
      setShowSettleModal(false);
      setSelectedWinnerFid('');
      setSelectedWinnerFids([]);
      setShowLpsAward(false);
      setSelectedLpsFid(null);
      setLpsAwardAmount('');
      setWinnerStakeCheck(null);
      setBbConfirmedFids(new Set());
      await loadData(); // Full refresh for complete data, but UI already shows tx hash
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

  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import('~/lib/constants');
        const { buildShareText } = await import('~/lib/og-helpers');
        const url = APP_URL + `/games/${id}`;
        // Calculate prize from prize_amounts array or entry fee
        const prizeAmount = (game as any)?.total_prize_amount ||
          ((game as any)?.prize_amounts?.reduce((sum: number, amt: number) => sum + (amt || 0), 0)) ||
          game?.entry_fee_amount;
        const text = buildShareText(
          game?.title || 'BETR POKER',
          prizeAmount,
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
      const url = APP_URL + `/games/${id}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      const { APP_URL } = await import('~/lib/constants');
      alert('Copy failed. URL: ' + (APP_URL + `/games/${id}`));
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

      // Phase 32: Fetch Sunday High Stakes signup when applicable
      if (gameData.data?.is_sunday_high_stakes && token) {
        setSundayHighStakesSignup(undefined);
        try {
          const signupRes = await authedFetch(`/api/games/${id}/sunday-high-stakes-signup`, { method: 'GET' }, token);
          if (signupRes.ok) {
            const signupData = await signupRes.json();
            if (signupData?.data) setSundayHighStakesSignup({ status: signupData.data.status });
            else setSundayHighStakesSignup(null);
          } else {
            setSundayHighStakesSignup(null); // 404 or other = no signup / show form
          }
        } catch {
          setSundayHighStakesSignup(null);
        }
      } else {
        setSundayHighStakesSignup(undefined);
      }

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
            // For all games, fetch credentials if user has joined
            // The API will enforce authorization (joined/paid status) and return appropriate error if not authorized
            const hasJoined = normalizedParticipant.status === 'joined' || 
                             normalizedParticipant.status === 'paid' || 
                             normalizedParticipant.payment_status === 'paid' || 
                             !!(normalizedParticipant as any)?.tx_hash;
            
            if (hasJoined) {
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
    if (!token || !currentUserFid) {
      console.log('[fetchCredentials] Skipping - missing token or currentUserFid', { hasToken: !!token, hasCurrentUserFid: !!currentUserFid });
      return;
    }

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
      setPendingShowMandatorySteps(true);
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

  // Phase 31: Leave Game handler
  const handleLeave = async () => {
    if (authStatus !== 'authed' || !currentUserFid || !game || !participant) return;

    setLeaving(true);
    setError(null);
    setShowLeaveConfirm(false);

    try {
      const res = await authedFetch(`/api/games/${id}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to leave game');
      }

      // Clear participant state — UI will revert to "Join Game" state
      setParticipant(null);
      setEligibility(null);
      setCredentials(null);
      setHasCredentials(false);
      setCredentialsError(null);
      await loadParticipantsCount();
      setError(null);
    } catch (err: any) {
      console.error('[handleLeave] Leave failed:', err);
      setError(err.message || 'Failed to leave game');
    } finally {
      setLeaving(false);
    }
  };

  const handlePaymentSuccess = async (txHash: string, password: string | null) => {
    // After payment success, force refresh to get updated state
    setError(null);
    
    // If password provided directly, show credentials immediately (legacy support)
    if (password !== null) {
      setCredentials({ password, locked: false });
      setHasCredentials(true);
      if (game) {
        setShowMandatoryStepsModal({ gameTitle: game.title || 'Untitled Game', password });
      }
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

  // BULLIED BY BETR: only joined players (participant list) can see game content and password
  if (id === BULLIED_BY_BETR_GAME_ID && !participant) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <Link href="/clubs" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
            ← Back to Clubs
          </Link>
          <div className="hl-card" style={{ textAlign: 'center', padding: '24px' }}>
            <p className="text-lg font-bold" style={{ color: 'var(--fire-2)' }}>
              You are not eligible to play in this game.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const isEligible = eligibility?.eligible || false;
  const canJoin = currentUserFid && (!participant || !isEligible);
  // Check both payment_status (legacy) and status (new schema) for paid status
  // Also check for tx_hash as an indicator of payment
  // Check if user has joined (for both paid and prize-based games)
  const hasJoined = participant?.status === 'joined' || 
                   participant?.status === 'paid' || 
                   participant?.payment_status === 'paid' || 
                   !!(participant as any)?.tx_hash;
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
          <div style={{ width: '100%', maxHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Image src="/poker.png" alt="BETR POKER" width={96} height={56} style={{ maxHeight: '56px', width: 'auto', objectFit: 'contain' }} />
          </div>
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
                      {game.gating_type === 'open' ? 'Open' : (() => {
                        // For prize-based games, show total prize amount
                        if ((game as any).prize_amounts && Array.isArray((game as any).prize_amounts) && (game as any).prize_amounts.length > 0) {
                          const totalPrize = (game as any).total_prize_amount || 
                            (game as any).prize_amounts.reduce((sum: number, amt: number) => sum + (amt || 0), 0);
                          const currency = (game as any).prize_currency || 'BETR';
                          return `${formatPrizeWithCurrency(totalPrize, currency)} prize`;
                        }
                        // For paid games, show entry fee
                        const amount = game.entry_fee_amount || 0;
                        const currency = game.entry_fee_currency || (game as any).buy_in_currency || 'USDC';
                        // Format: "2 $Eggs cost" or "2 USDC cost"
                        const currencyDisplay = currency === 'EGGS' ? '$Eggs' : currency;
                        return `${amount} ${currencyDisplay} cost`;
                      })()}
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
            {/* Phase 31: Leave Game button — shown when user has joined, game is open, and game is not paid */}
            {participant && currentUserFid && game.status === 'open' && !isPaidGame(game) && (
              <div className="mb-2 flex justify-center">
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  disabled={_leaving}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 12px', minHeight: 'auto' }}
                >
                  {_leaving ? 'Leaving...' : 'Leave Game'}
                </button>
              </div>
            )}
            {/* Phase 31: Leave Game Confirmation Modal */}
            {showLeaveConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="hl-card max-w-md w-full mx-4">
                  <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Leave Game</h3>
                  <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
                    Are you sure you want to leave this game? You can rejoin later if spots are still available.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleLeave}
                      disabled={_leaving}
                      className="flex-1 btn-primary"
                      style={{ background: 'var(--fire-2)', borderColor: 'var(--fire-2)' }}
                    >
                      {_leaving ? 'Leaving...' : 'Yes, Leave Game'}
                    </button>
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      disabled={_leaving}
                      className="flex-1 btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Participant count and spots open */}
            <div className="text-xs text-tertiary mb-2 flex items-center gap-2 flex-wrap justify-center" style={{ color: 'var(--text-2)' }}>
              <span>
                {(() => {
                  if (effectiveMax !== null && effectiveMax !== undefined) {
                    return (
                      <>
                        {paidCount}/{effectiveMax} joined • {spotsOpen !== null && spotsOpen !== undefined ? spotsOpen : Math.max(effectiveMax - paidCount, 0)} spots open • {formatStakingRequirement(game.staking_min_amount)}
                      </>
                    );
                  } else {
                    return (
                      <>
                        <span>Unlimited spots</span> • {formatStakingRequirement(game.staking_min_amount)}
                      </>
                    );
                  }
                })()}
              </span>
            </div>

            {/* Settlement / Payments - Basescan URLs when game is settled (for verification) */}
            {(game.status === 'settled' || game.status === 'completed') && ((game as any).settle_tx_hash || (game as any).settle_tx_url) && (
              <div className="mb-4 text-xs" style={{ color: 'var(--text-2)' }}>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Settlement: </span>
                <a
                  href={(game as any).settle_tx_url || getBaseScanTxUrl((game as any).settle_tx_hash) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--fire-1)' }}
                >
                  View on Basescan
                </a>
                {(game as any).payouts?.length > 0 && (
                  <div className="mt-1">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Payouts: </span>
                    {(game as any).payouts.map((p: { fid: number; amount: number; txHash: string; txUrl: string | null }, i: number) => (
                      <span key={i}>
                        {i > 0 && ' • '}
                        FID {p.fid}: {p.amount}{' '}
                        {p.txUrl ? (
                          <a href={p.txUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fire-1)' }}>View tx</a>
                        ) : (
                          <span title={p.txHash}>{p.txHash?.slice(0, 10)}…</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Prize Payout Structure - Collapsible Section */}
            {(game as any).prize_amounts && Array.isArray((game as any).prize_amounts) && (game as any).prize_amounts.length > 0 && (
              <div className="mb-4 hl-card" style={{ padding: '12px' }}>
                <button
                  onClick={() => setShowPayoutStructure(!showPayoutStructure)}
                  className="w-full flex items-center justify-between text-left"
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    cursor: 'pointer',
                    padding: '4px 0'
                  }}
                >
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Prize Payout Structure
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {showPayoutStructure ? '▼' : '▶'}
                  </span>
                </button>
                {showPayoutStructure && (
                  <div className="mt-3" style={{ paddingLeft: '8px' }}>
                    <div className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {(() => {
                        const totalPrize = (game as any).total_prize_amount || 
                          (game as any).prize_amounts.reduce((sum: number, amt: number) => sum + (amt || 0), 0);
                        const currency = (game as any).prize_currency || 'BETR';
                        const numWinners = (game as any).number_of_winners || (game as any).prize_amounts.length;
                        return `Total Prize: ${formatPrizeWithCurrency(totalPrize, currency)} • ${numWinners} Winner${numWinners !== 1 ? 's' : ''}`;
                      })()}
                    </div>
                    <ul className="space-y-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {(game as any).prize_amounts.map((amount: number, index: number) => {
                        const position = index + 1;
                        const currency = (game as any).prize_currency || 'BETR';
                        return (
                          <li key={index} className="flex items-center justify-between text-sm" style={{ color: 'var(--text-primary)' }}>
                            <span>{getPositionLabel(position)}:</span>
                            <span className="font-medium">{formatPrizeWithCurrency(amount, currency)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {/* Participant names with pfps - only show joined/paid participants; name and PFP clickable to Farcaster profile (10.3.5). Admin: trash to remove when game open. */}
            {participantsWithNames.length > 0 && (() => {
              const activeParticipants = participantsWithNames.filter((p) =>
                p.status === 'joined' || p.status === 'paid' || p.payment_status === 'paid'
              );
              if (activeParticipants.length === 0) return null;
              const players = activeParticipants.map((p) => ({
                fid: Number((p as any).fid || (p as any).player_fid),
                username: p.username ?? null,
                display_name: p.username ?? null,
                pfp_url: p.pfpUrl ?? null,
              }));
              const isAdminAndOpen = isOwner && (game?.status === 'open' || game?.status === 'in_progress');
              if (isAdminAndOpen) {
                const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';
                return (
                  <div className="mb-4 flex flex-wrap justify-center items-center gap-2">
                    {activeParticipants.map((p) => {
                      const pfid = Number((p as any).fid || (p as any).player_fid);
                      const displayName = p.username ?? `FID ${pfid}`;
                      const pfpUrl = p.pfpUrl ?? DEFAULT_PFP;
                      const isRemoving = removingFid === pfid;
                      return (
                        <div key={pfid} className="flex items-center gap-1.5 rounded-full border border-transparent hover:border-[var(--bg-2)]" style={{ padding: '2px 4px 2px 2px' }}>
                          <button
                            type="button"
                            onClick={() => openFarcasterProfile(pfid, p.username ?? null)}
                            className="flex items-center gap-1.5 rounded-full hover:opacity-80 transition-opacity border-0 cursor-pointer p-0.5 bg-transparent"
                            style={{ color: 'var(--text-0)' }}
                          >
                            <img src={pfpUrl} alt={displayName} className="rounded-full object-cover flex-shrink-0" style={{ width: 24, height: 24, objectFit: 'cover' }} />
                            <span className="text-xs" style={{ color: 'var(--text-1)' }}>{displayName}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(pfid)}
                            disabled={isRemoving}
                            className="p-0.5 rounded border-0 cursor-pointer opacity-70 hover:opacity-100 disabled:opacity-50"
                            style={{ color: 'var(--fire-2)' }}
                            title="Remove from game"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return (
                <div className="mb-4 flex justify-center">
                  <PlayerListInline players={players} size="sm" />
                </div>
              );
            })()}

            {/* Reserve a spot (admin only, game open or in progress) */}
            {isOwner && (game?.status === 'open' || game?.status === 'in_progress') && (
              <div className="hl-card mb-4" style={{ padding: '16px' }}>
                <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Reserve a spot</h3>
                {reserveSelectedUser ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {reserveSelectedUser.pfp_url ? (
                        <img src={reserveSelectedUser.pfp_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-2)' }} />
                      )}
                      <span style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                        {reserveSelectedUser.display_name || reserveSelectedUser.username || `FID ${reserveSelectedUser.fid}`}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setReserveSelectedUser(null); }}
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={handleReserveAdd}
                        disabled={reserveAdding}
                        className="btn-primary"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                      >
                        {reserveAdding ? 'Adding...' : 'Reserve'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={reserveSearchQuery}
                      onChange={(e) => setReserveSearchQuery(e.target.value)}
                      onFocus={() => reserveSearchResults.length > 0 && setReserveShowDropdown(true)}
                      placeholder="Type name to search..."
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-1)',
                        border: '1px solid var(--bg-2)',
                        borderRadius: '6px',
                        color: 'var(--text-0)',
                        fontSize: '0.875rem',
                      }}
                    />
                    {reserveSearching && (
                      <span style={{ position: 'absolute', right: 12, top: 8, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Searching...</span>
                    )}
                    {reserveShowDropdown && reserveSearchResults.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        zIndex: 10,
                        width: '100%',
                        marginTop: 4,
                        background: 'var(--bg-1)',
                        border: '1px solid var(--bg-2)',
                        borderRadius: 6,
                        maxHeight: 200,
                        overflowY: 'auto',
                      }}>
                        {reserveSearchResults.map((user) => (
                          <button
                            key={user.fid}
                            type="button"
                            onClick={() => {
                              setReserveSelectedUser(user);
                              setReserveSearchQuery('');
                              setReserveSearchResults([]);
                              setReserveShowDropdown(false);
                            }}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 12px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            {user.pfp_url ? (
                              <img src={user.pfp_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-2)' }} />
                            )}
                            <div>
                              <div style={{ color: 'var(--text-0)', fontWeight: 500, fontSize: '0.875rem' }}>
                                {user.display_name || user.username || `FID ${user.fid}`}
                              </div>
                              <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>
                                {user.username && `@${user.username} • `}FID: {user.fid}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {game.max_participants != null && participantsCount >= game.max_participants && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Game is full. Remove a participant to reserve a spot.</p>
                )}
              </div>
            )}

            {/* Phase 32: Sunday High Stakes signups (admin) */}
            {isOwner && (game as any).is_sunday_high_stakes && (
              <div className="hl-card mb-4" style={{ padding: '16px' }}>
                <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Sunday High Stakes signups</h3>
                {sundaySignupsLoading ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p>
                ) : sundaySignupsList.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No signups yet.</p>
                ) : (
                  <ul className="space-y-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {sundaySignupsList.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 flex-wrap" style={{ padding: '8px 0', borderBottom: '1px solid var(--stroke)' }}>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>FID {s.fid}</span>
                          {s.cast_url && (
                            <a href={s.cast_url} target="_blank" rel="noopener noreferrer" className="text-xs block truncate mt-0.5" style={{ color: 'var(--fire-1)' }}>{s.cast_url}</a>
                          )}
                          <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>({s.status})</span>
                        </div>
                        {s.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={sundaySignupActionFid === s.fid}
                              onClick={async () => {
                                if (!token) return;
                                setSundaySignupActionFid(s.fid);
                                try {
                                  const res = await authedFetch(`/api/games/${id}/sunday-high-stakes-signups/${s.fid}/approve`, { method: 'POST' }, token);
                                  const data = await res.json();
                                  if (res.ok && data?.ok) {
                                    setSundaySignupsList(prev => prev.map(x => x.fid === s.fid ? { ...x, status: 'approved' } : x));
                                  }
                                } finally {
                                  setSundaySignupActionFid(null);
                                }
                              }}
                              className="btn-primary"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              {sundaySignupActionFid === s.fid ? '...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={sundaySignupActionFid === s.fid}
                              onClick={async () => {
                                if (!token) return;
                                setSundaySignupActionFid(s.fid);
                                try {
                                  const res = await authedFetch(`/api/games/${id}/sunday-high-stakes-signups/${s.fid}/reject`, { method: 'POST' }, token);
                                  const data = await res.json();
                                  if (res.ok && data?.ok) {
                                    setSundaySignupsList(prev => prev.map(x => x.fid === s.fid ? { ...x, status: 'rejected' } : x));
                                  }
                                } finally {
                                  setSundaySignupActionFid(null);
                                }
                              }}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            
            {/* Phase 32: Sunday High Stakes — signup form, pending, or approved (then Join below) */}
            {(game as any).is_sunday_high_stakes && !hasJoined && currentUserFid && sundayHighStakesSignup !== undefined && (
              <div className="mb-4 hl-card" style={{ padding: '16px' }}>
                {sundayHighStakesSignup?.status === 'approved' ? (
                  <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    You&apos;re approved. Click Join to get your game password.
                  </p>
                ) : sundayHighStakesSignup?.status === 'pending' ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Your signup is pending approval.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                      To sign up: 1) Cast a screenshot of your staking. 2) Enter the link to your quote cast below.
                    </p>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!token || !sundaySignupCastUrl.trim()) return;
                        setSundaySignupSubmitting(true);
                        try {
                          const res = await authedFetch(`/api/games/${id}/sunday-high-stakes-signup`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cast_url: sundaySignupCastUrl.trim() }),
                          }, token);
                          const data = await res.json();
                          if (res.ok && data?.ok) {
                            setSundayHighStakesSignup({ status: 'pending' });
                            setSundaySignupCastUrl('');
                          } else {
                            setError(data?.error || 'Failed to submit signup');
                          }
                        } catch (err: any) {
                          setError(err?.message || 'Failed to submit signup');
                        } finally {
                          setSundaySignupSubmitting(false);
                        }
                      }}
                      className="flex flex-col gap-2"
                    >
                      <input
                        type="url"
                        value={sundaySignupCastUrl}
                        onChange={(e) => setSundaySignupCastUrl(e.target.value)}
                        placeholder="https://warpcast.com/..."
                        className="input text-base"
                        required
                      />
                      <button type="submit" disabled={sundaySignupSubmitting} className="btn-primary">
                        {sundaySignupSubmitting ? 'Submitting...' : 'Submit signup'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}

            {/* Game Password Section - Show for all games if user has joined */}
            {/* Phase 32: For Sunday High Stakes, show locked card only when approved (or hasJoined) */}
            {(!(game as any).is_sunday_high_stakes || hasJoined || sundayHighStakesSignup?.status === 'approved') && (
              <div className={`mb-4 ${!hasJoined || !participant || !currentUserFid ? 'password-section-locked' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {hasJoined && participant && currentUserFid ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Game Password</p>
                    {(() => {
                      // Show password if credentials exist, are unlocked, and password is set
                      if (hasCredentials && credentials && !credentials.locked && credentials.passwordSet && credentials.password) {
                        return (
                          <div className="flex items-center gap-2">
                            <p className="text-lg font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                              {credentials.password}
                            </p>
                            <button
                              onClick={copyPassword}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '12px', minHeight: 'auto' }}
                            >
                              Copy
                            </button>
                          </div>
                        );
                      }
                      // Show "not set" if credentials were checked and password doesn't exist
                      if (hasCredentials === false || (credentials && !credentials.passwordSet)) {
                        return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Password not set yet</p>;
                      }
                      // Show "locked" if credentials exist but are locked
                      if (credentials?.locked) {
                        return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Password locked - you must join the game first</p>;
                      }
                      // Default: show loading/not set (credentials not yet fetched)
                      return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Password not set yet</p>;
                    })()}
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
                      cursor: _joining ? 'wait' : 'pointer',
                      opacity: _joining ? 0.6 : 1,
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (_joining) return;
                      const registrationOpen = (game as any).registrationOpen !== false;
                      if (registrationOpen) {
                        handleJoin();
                      }
                    }}
                  >
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Game Password</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {_joining ? 'Joining...' : 'Join game to see password'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Join/Payment Button - show appropriate button based on game type */}
            {/* Phase 3.4: For prize-based games, show join button if not a participant. For paid games, show payment button if not paid. */}
            {currentUserFid && (
              (() => {
                // For prize-based games: show join button if not a participant. Phase 32: Sunday High Stakes requires approved signup.
                const showJoinForPrizeGame = !isPaidGame(game) && !participant &&
                  (!(game as any).is_sunday_high_stakes || sundayHighStakesSignup?.status === 'approved');
                if (showJoinForPrizeGame) {
                  const registrationOpen = (game as any).registrationOpen !== false;
                  const isRegistrationClosed = !registrationOpen;
                  
                  if (isRegistrationClosed) {
                    const closeAt = (game as any).registrationCloseAt;
                    const closeTime = closeAt ? new Date(closeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
                    return (
                      <div ref={paymentSectionRef} className="mt-4" style={{ display: 'flex', justifyContent: 'center' }}>
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
                      </div>
                    );
                  }
                  
                  return (
                    <div ref={paymentSectionRef} className="mt-4" style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={handleJoin}
                        disabled={_joining}
                        className="btn-primary"
                        style={{ minWidth: '200px' }}
                      >
                        {_joining ? 'Joining...' : 'Join Game'}
                      </button>
                    </div>
                  );
                }
                
                // For paid games: show payment button if not paid and not a participant
                if (isPaidGame(game) && !hasJoined && !participant) {
                  const registrationOpen = (game as any).registrationOpen !== false;
                  const isRegistrationClosed = !registrationOpen;
                  
                  if (isRegistrationClosed) {
                    const closeAt = (game as any).registrationCloseAt;
                    const closeTime = closeAt ? new Date(closeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
                    return (
                      <div ref={paymentSectionRef} className="mt-4" style={{ display: 'flex', justifyContent: 'center' }}>
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
                      </div>
                    );
                  }
                  
                  return (
                    <div ref={paymentSectionRef} className="mt-4" style={{ display: 'flex', justifyContent: 'center' }}>
                      <PaymentButton
                        game={game}
                        playerFid={currentUserFid}
                        onSuccess={handlePaymentSuccess}
                        onError={handlePaymentError}
                        customText={`Pay ${game.entry_fee_amount} ${game.entry_fee_currency || 'USDC'}`}
                      />
                    </div>
                  );
                }
                
                return null;
              })()
            )}
          </div>
          
          {/* ClubGG Link - show if user has paid */}
          {hasJoined && participant && currentUserFid && (
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
                  href={CLUBGG_LINK}
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
                      {(() => {
                        // Build dynamic refund link based on game currency and contract address
                        const currency = game.entry_fee_currency || (game as any).buy_in_currency || 'USDC';
                        const tokenAddress = mapCurrencyToAddress(currency);
                        const contractAddress = GAME_ESCROW_CONTRACT || '0x126aac61bfabcc125e1434af7e324f9203e783af';
                        const refundUrl = `https://basescan.org/token/${tokenAddress}?a=${contractAddress}`;
                        return (
                          <a
                            href={refundUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs break-all"
                            style={{ color: 'var(--fire-1)', fontSize: '9px' }}
                          >
                            {(participant as any).refund_tx_hash}
                          </a>
                        );
                      })()}
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

          {/* Phase 3.4: Join button for prize-based games is now shown above in the Join/Payment Button section */}

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
                  {/* Show retry message for payment errors */}
                  {!isAuthExpired && (error.toLowerCase().includes('payment') || error.toLowerCase().includes('transaction') || error.toLowerCase().includes('failed')) && (
                    <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                      Please retry the payment. Sometimes the mini app fails but you have NOT been charged.
                    </p>
                  )}
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
              {!isEligible && (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{eligibility.message || eligibility.reason}</p>
              )}
            </div>
          )}

          {/* Post-registration mandatory steps modal (Club GG password + steps) */}
          {showMandatoryStepsModal && game && (
            <MandatoryClubGGStepsModal
              gameTitle={showMandatoryStepsModal.gameTitle}
              password={showMandatoryStepsModal.password}
              clubggUrl={game.clubgg_link || CLUBGG_LINK}
              onClose={() => setShowMandatoryStepsModal(null)}
              onCopy={() => {
                setSuccessMessage('Password copied!');
                setTimeout(() => setSuccessMessage(null), 2000);
              }}
            />
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
                                  // API returned error - this includes partial refund failures
                                  throw new Error(data.error || 'Failed to cancel game');
                                }
                                // Check if all refunds succeeded from response data
                                const refundsSucceeded = data.data?.refundsSucceeded || 0;
                                const eligibleForRefund = data.data?.eligibleForRefund || 0;
                                const allRefunded = refundsSucceeded === eligibleForRefund && eligibleForRefund > 0;
                                
                                if (allRefunded) {
                                  setSuccessMessage('Game cancelled successfully. All participants have been refunded.');
                                } else if (eligibleForRefund === 0) {
                                  setSuccessMessage('Game cancelled (no refunds needed).');
                                } else {
                                  // Partial refunds - show error with details
                                  setError(data.error || `Game cancelled. ${refundsSucceeded}/${eligibleForRefund} refunds succeeded.`);
                                }
                                // Force reload game and participant data to show refund receipts
                                await Promise.all([
                                  loadData(),
                                  loadParticipantsCount(),
                                ]);
                                if (allRefunded || eligibleForRefund === 0) {
                                  setTimeout(() => setSuccessMessage(null), 3000);
                                }
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
                       setShowLpsAward(false);
                       setSelectedLpsFid(null);
                       setLpsAwardAmount('');
                     }}
                     style={{ color: 'var(--text-muted)' }}
                   >
                     ✕
                   </button>
                 </div>
                 
                 {/* Phase 4.4: Settlement form for prize-based and paid games */}
                 {(() => {
                   const isPrizeBased = !isPaidGame(game);
                   const isScheduledGame = (game as any).game_type === 'large_event' || ((game as any).max_participants && (game as any).max_participants > 9);
                   
                   // Use participants with names if available, otherwise fall back to allParticipants
                   const participantsToDisplay = allParticipantsWithNames.length > 0 
                     ? allParticipantsWithNames 
                     : allParticipants.map(p => ({ ...p }));
                   
                   // Phase 4.4: For prize-based games, use all joined participants; for paid games, use paid participants
                   const eligibleParticipants = participantsToDisplay.filter((p: GameParticipant) => {
                     if (isPrizeBased) {
                       return p.status === 'joined' || p.status === 'paid';
                     } else {
                       return p.payment_status === 'paid' || 
                              p.status === 'paid' || 
                              (p.status === 'joined' && !!(p as any)?.tx_hash);
                     }
                   });
                   
                   // Phase 4.4: Get expected winner count and prize info
                   const expectedWinnerCount = isPrizeBased
                     ? ((game as any).number_of_winners || 1)
                     : ((game as any).payout_bps && Array.isArray((game as any).payout_bps) && (game as any).payout_bps.length > 0
                         ? (game as any).payout_bps.length
                         : 1);
                   
                   const prizeAmounts = (game as any).prize_amounts || [];
                   const prizeCurrency = (game as any).prize_currency || 'BETR';
                   
                   // Generate description
                   const getPayoutDescription = () => {
                     if (isPrizeBased) {
                       if (prizeAmounts.length === 0) {
                         return `Select ${expectedWinnerCount} winner(s). Prizes will be distributed.`;
                       }
                       const prizes = prizeAmounts.map((amt: number, idx: number) => {
                         const amtStr = amt >= 1000000 
                           ? `${(amt / 1000000).toFixed(amt % 1000000 === 0 ? 0 : 1)}M`
                           : amt >= 1000
                           ? `${(amt / 1000).toFixed(amt % 1000 === 0 ? 0 : 1)}K`
                           : amt.toString();
                         const doubledStr = isScheduledGame ? ` (doubled to ${(amt * 2) >= 1000000 ? `${((amt * 2) / 1000000).toFixed((amt * 2) % 1000000 === 0 ? 0 : 1)}M` : `${((amt * 2) / 1000).toFixed((amt * 2) % 1000 === 0 ? 0 : 1)}K`} if 50M+ staked)` : '';
                         return `Winner ${idx + 1}: ${amtStr} ${prizeCurrency}${doubledStr}`;
                       }).join(', ');
                       return `Select ${expectedWinnerCount} winner(s). Prizes: ${prizes}.${isScheduledGame ? ' Prize doubling happens automatically during settlement.' : ''}`;
                     } else {
                       // Paid games - use payout_bps
                       const gamePayoutBps = (game as any).payout_bps;
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
                     }
                   };

                   const isWinnerTakeAll = expectedWinnerCount === 1;
                   
                   return (
                     <div className="space-y-4">
                       <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
                         {getPayoutDescription()}
                       </p>
                       
                       <div className="space-y-2 mb-4 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
                         {eligibleParticipants.map((p: GameParticipant & { username?: string; pfpUrl?: string }) => {
                           const participantFid = p.player_fid || (p as any).fid;
                           const username = (p as any).username;
                           const pfpUrl = (p as any).pfpUrl;
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
                              className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 ${
                                isSelected ? 'hl-badge--fire' :
                                !canSelect ? 'opacity-40 cursor-not-allowed' :
                                'hl-badge'
                              }`}
                              style={isSelected ? {} : !canSelect ? { background: 'var(--bg-2)', border: '1px solid var(--stroke)', color: 'var(--text-muted)' } : {}}
                             >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {pfpUrl && (
                                  <img 
                                    src={pfpUrl} 
                                    alt={username || `FID ${participantFid}`}
                                    className="w-8 h-8 rounded-full flex-shrink-0"
                                    onError={(e) => {
                                      // Hide image if it fails to load
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                )}
                                <div className="flex flex-col min-w-0 flex-1">
                                  {username ? (
                                    <>
                                      <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>@{username}</span>
                                      <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>FID {participantFid}</span>
                                    </>
                                  ) : (
                                    <span style={{ color: 'var(--text-primary)' }}>FID {participantFid}</span>
                                  )}
                                </div>
                              </div>
                              {isSelected && <span style={{ color: 'var(--fire-1)' }}>✓</span>}
                             </button>
                           );
                         })}
                       </div>
                       
                       {eligibleParticipants.length === 0 && (
                         <p className="text-sm" style={{ color: 'var(--fire-2)' }}>
                           {isPrizeBased ? 'No eligible participants found.' : 'No paid participants found.'}
                         </p>
                       )}
                       
                       {!isWinnerTakeAll && (
                         <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                           Selected: {selectedWinnerFids.length} / {expectedWinnerCount}
                         </p>
                       )}

                       {/* Phase 4.4: Last Person Standing Award section (Scheduled games only) */}
                       {isScheduledGame && (
                         <div className="mb-4 p-4 border border-gray-200 rounded-lg" style={{ background: 'var(--bg-2)' }}>
                           <div className="flex items-center gap-2 mb-3">
                             <input
                               type="checkbox"
                               id="lps-award-checkbox"
                               checked={showLpsAward}
                               onChange={(e) => {
                                 setShowLpsAward(e.target.checked);
                                 if (!e.target.checked) {
                                   setSelectedLpsFid(null);
                                   setLpsAwardAmount('');
                                 }
                               }}
                               className="w-4 h-4"
                             />
                             <label htmlFor="lps-award-checkbox" className="font-medium" style={{ color: 'var(--text-primary)' }}>
                               Last Person Standing Award (optional)
                             </label>
                           </div>
                           
                           {showLpsAward && (
                             <div className="space-y-3 mt-3">
                               <div>
                                 <label className="block text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                                   Award Recipient
                                 </label>
                                 <select
                                   value={selectedLpsFid || ''}
                                   onChange={(e) => setSelectedLpsFid(e.target.value ? parseInt(e.target.value, 10) : null)}
                                   className="w-full px-3 py-2 rounded-lg border"
                                   style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-primary)' }}
                                 >
                                   <option value="">Select participant...</option>
                                   {allParticipantsForAward.map((p: GameParticipant & { username?: string; pfpUrl?: string }) => {
                                     const participantFid = p.player_fid || (p as any).fid;
                                     const username = (p as any).username;
                                     return (
                                       <option key={p.id} value={participantFid}>
                                         {username ? `@${username} (FID ${participantFid})` : `FID ${participantFid}`}
                                       </option>
                                     );
                                   })}
                                 </select>
                               </div>
                               
                               <div>
                                 <label className="block text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                                   Award Amount ({prizeCurrency})
                                 </label>
                                 <input
                                   type="number"
                                   value={lpsAwardAmount}
                                   onChange={(e) => setLpsAwardAmount(e.target.value)}
                                   placeholder="Enter amount"
                                   min="0"
                                   step="0.01"
                                   className="w-full px-3 py-2 rounded-lg border"
                                   style={{ background: 'var(--bg-1)', borderColor: 'var(--stroke)', color: 'var(--text-primary)' }}
                                 />
                                 <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                   Award can go to any participant (winner or non-winner)
                                 </p>
                               </div>
                             </div>
                           )}
                         </div>
                       )}

                       {/* Phase 32: BB confirmation when double_payout_if_bb */}
                       {(game as any).double_payout_if_bb && winnerStakeCheck && winnerStakeCheck.filter(r => r.isBB).length > 0 && (
                         <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--stroke)' }}>
                           <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Betr Believer (50M+ staked) — confirm before settling</p>
                           {winnerStakeCheck.filter(r => r.isBB).map((r) => {
                             const name = allParticipantsWithNames.find((p: any) => (p.fid || p.player_fid) === r.fid)?.username
                               ? `@${(allParticipantsWithNames.find((p: any) => (p.fid || p.player_fid) === r.fid) as any).username}`
                               : `FID ${r.fid}`;
                             return (
                               <div key={r.fid} className="flex items-center gap-2 mt-2">
                                 <input
                                   type="checkbox"
                                   id={`bb-confirm-${r.fid}`}
                                   checked={bbConfirmedFids.has(r.fid)}
                                   onChange={(e) => {
                                     setBbConfirmedFids(prev => {
                                       const next = new Set(prev);
                                       if (e.target.checked) next.add(r.fid);
                                       else next.delete(r.fid);
                                       return next;
                                     });
                                   }}
                                   className="w-4 h-4"
                                 />
                                 <label htmlFor={`bb-confirm-${r.fid}`} className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                   Are you sure {name} is a BB? They have {r.stakedAmount} BETR staked.
                                 </label>
                               </div>
                             );
                           })}
                         </div>
                       )}

                       <div className="flex gap-3">
                         <button
                           onClick={handleSettleGame}
                           disabled={
                             settling || 
                             eligibleParticipants.length === 0 ||
                             (isWinnerTakeAll && !selectedWinnerFid) ||
                             (!isWinnerTakeAll && selectedWinnerFids.length !== expectedWinnerCount) ||
                             (showLpsAward && (!selectedLpsFid || !lpsAwardAmount || parseFloat(lpsAwardAmount) <= 0)) ||
                             ((game as any).double_payout_if_bb && winnerStakeCheck && winnerStakeCheck.some(r => r.isBB && !bbConfirmedFids.has(r.fid)))
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
                             setShowLpsAward(false);
                             setSelectedLpsFid(null);
                             setLpsAwardAmount('');
                             setError(null);
                             setIsAuthExpired(false);
                             setWinnerStakeCheck(null);
                             setBbConfirmedFids(new Set());
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
