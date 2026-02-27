'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getBaseScanTxUrl } from '~/lib/explorer';
import { formatStakingRequirement } from '~/lib/format-prize';
import { PlayerListInline } from '~/components/PlayerListInline';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';
import { formatRelativeTime } from '~/lib/utils';

type Game = {
  id: string;
  title: string;
  prize_amount: number;
  staking_min_amount?: number | null;
  status: string;
  current_round: number;
  started_at?: string;
  hasSignedUp?: boolean;
  settle_tx_hash?: string | null; // Transaction hash for game settlement
  settle_tx_url?: string | null;
  tx_urls?: string[];
  payouts?: Array<{ fid: number; amount: number; txHash: string; txUrl: string | null }>;
  /** When to show "Advancing in X:XX" (set on Complete with delay, cleared when next round created) */
  advance_at?: string | null;
  min_players_to_start?: number | null;
  signup_closes_at?: string | null;
  start_condition?: string | null;
  signup_count?: number;
  /** When status is signup, API may include list of signups with profiles (for all viewers) */
  signups?: Array<{ fid: number; signed_up_at: string; username: string | null; display_name: string | null; pfp_url: string | null }>;
};

type MyGroup = {
  groupId: string;
  groupNumber: number;
  roundId: string;
  roundNumber: number;
  fids: number[];
  members: Array<{
    fid: number;
    username: string | null;
    display_name: string | null;
    pfp_url: string | null;
  }>;
  status: string;
  hasVoted: boolean;
  myVote: number | null;
  voteCount: number;
  totalMembers: number;
  votes?: Array<{ voterFid: number; votedForFid: number }>;
};

type Group = {
  id: string;
  groupNumber: number;
  fids: number[];
  members: Array<{
    fid: number;
    username: string | null;
    display_name: string | null;
    pfp_url: string | null;
  }>;
  status: string;
  winnerFid: number | null;
  votes: Array<{ voterFid: number; votedForFid: number | null }>;
  voteCount: number;
  totalMembers: number;
};

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

export default function BuddyUpV2Client() {
  const { token, status: authStatus } = useAuth();
  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myGroup, setMyGroup] = useState<MyGroup | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [selectedVote, setSelectedVote] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creatingRound, setCreatingRound] = useState(false);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [completingRound, setCompletingRound] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [cancellingGame, setCancellingGame] = useState(false);
  const [showSettleForm, setShowSettleForm] = useState(false);
  const [winners, setWinners] = useState<Array<{ fid: string; amount: string }>>([{ fid: '', amount: '' }]);
  const [settling, setSettling] = useState(false);
  const [settlementSignups, setSettlementSignups] = useState<Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>>([]);
  const [loadingSettlementSignups, setLoadingSettlementSignups] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progressData, setProgressData] = useState<any>(null);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [chatMessages, setChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [selectedGroupChatId, setSelectedGroupChatId] = useState<string | null>(null);
  const [selectedGroupChatMessages, setSelectedGroupChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [selectedGroupChatInput, setSelectedGroupChatInput] = useState('');
  const [sendingSelectedGroupMessage, setSendingSelectedGroupMessage] = useState(false);
  const [loadingSelectedGroupChat, setLoadingSelectedGroupChat] = useState(false);
  const [signupCount, setSignupCount] = useState<number | null>(null);
  const [showSignupsModal, setShowSignupsModal] = useState(false);
  const [signupsList, setSignupsList] = useState<Array<{ fid: number; signed_up_at: string; username: string | null; display_name: string | null; pfp_url: string | null }>>([]);
  const [loadingSignups, setLoadingSignups] = useState(false);
  const [totalSignups, setTotalSignups] = useState<number | null>(null);
  const [signupClosesCountdown, setSignupClosesCountdown] = useState<string>('');
  const [eligiblePlayersCount, setEligiblePlayersCount] = useState<number | null>(null);
  const [showGroupSetupModal, setShowGroupSetupModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [showCompleteRoundModal, setShowCompleteRoundModal] = useState(false);
  const [, setAdvanceCountdownTick] = useState(0);
  const [previewGroupSize, setPreviewGroupSize] = useState<string>('3');
  const [previewGroups, setPreviewGroups] = useState<Array<{ groupNumber: number; fids: number[] }>>([]);
  const [eligiblePlayers, setEligiblePlayers] = useState<Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>>([]);
  const [loadingEligiblePlayers, setLoadingEligiblePlayers] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [gameNotFound, setGameNotFound] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showRules, setShowRules] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const urlGameId = searchParams.get('gameId')?.trim() || null;

  // Deep link: open specific game when URL has ?gameId=...
  useEffect(() => {
    if (urlGameId) setSelectedGameId(urlGameId);
  }, [urlGameId]);

  // Load active games
  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        const [gamesRes, adminRes] = await Promise.all([
          fetch('/api/buddy-up/games/active').then((r) => r.json()),
          authStatus === 'authed' && token
            ? authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json())
            : Promise.resolve({ ok: true, data: { isAdmin: false } }),
        ]);

        if (gamesRes?.ok && Array.isArray(gamesRes?.data)) {
          // 5.1: sort in_progress > signup > settled so game in progress is at top
          const rank = (s: string) => (s === 'in_progress' ? 0 : s === 'signup' ? 1 : 2);
          const sorted = [...gamesRes.data].sort((a: Game, b: Game) => rank(a.status) - rank(b.status));
          setActiveGames(sorted);
          if (urlGameId) {
            setSelectedGameId(urlGameId);
          } else if (sorted.length > 0 && !selectedGameId) {
            setSelectedGameId(sorted[0].id);
          }
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
  }, [authStatus, token, selectedGameId, urlGameId, refreshTrigger]);

  // Load selected game details
  useEffect(() => {
    if (!selectedGameId) return;
    setGame((prev) => (prev?.id === selectedGameId ? prev : null));
    setGameNotFound(false);
    (async () => {
      try {
        // Use authedFetch if token exists to get accurate hasSignedUp status
        const res = token
          ? await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json())
          : await fetch(`/api/buddy-up/games/${selectedGameId}`).then((r) => r.json());
        if (res?.ok && res?.data) {
          setGame(res.data);
          // When API returns signups (for all viewers when status is signup), show them inline
          if (res.data.status === 'signup' && Array.isArray(res.data.signups)) {
            setSignupsList(res.data.signups);
            setSignupCount(res.data.signups.length);
          } else if (res.data.status === 'signup' && isAdmin && token) {
            try {
              const signupsRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
              if (signupsRes?.ok && Array.isArray(signupsRes?.data)) {
                setSignupCount(signupsRes.data.length);
                setSignupsList(signupsRes.data);
              } else {
                setSignupCount(res.data.signup_count ?? null);
                setSignupsList([]);
              }
            } catch (e) {
              console.error('Failed to load signup count:', e);
              setSignupCount(res.data.signup_count ?? null);
              setSignupsList([]);
            }
          } else if (res.data.status === 'signup') {
            setSignupCount(res.data.signup_count ?? null);
            setSignupsList([]);
          } else {
            setSignupCount(null);
            setSignupsList([]);
          }
          
          // If in progress, load my group and current round groups
          if (res.data.status === 'in_progress' && token) {
            const myGroupRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());

            if (myGroupRes?.ok && myGroupRes?.data) {
              setMyGroup(myGroupRes.data);
              setRoundId(myGroupRes.data.roundId);
            } else if (isAdmin) {
              // Admin: try to find current round even if not in a group
              // Fetch rounds to find the current one
              const roundsRes = token
                ? await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json())
                : await fetch(`/api/buddy-up/games/${selectedGameId}`).then((r) => r.json());
              if (roundsRes?.ok && roundsRes?.data?.current_round) {
                // We'll fetch groups via the progress endpoint or by finding the round
                // For now, we'll let the admin create a round if none exists
              }
            }
          }
        } else {
          setGameNotFound(true);
        }
      } catch (e) {
        console.error('Failed to load game:', e);
      }
    })();
  }, [selectedGameId, token, isAdmin]);

  // Sync signups list from game when API returns signups (e.g. after refetch post-signup)
  useEffect(() => {
    if (game?.status === 'signup' && Array.isArray(game.signups)) {
      setSignupsList(game.signups);
      setSignupCount(game.signups.length);
    }
  }, [game?.id, game?.status, game?.signups]);

  // Countdown to signup_closes_at when in signup phase
  useEffect(() => {
    if (!game || game.status !== 'signup' || !game.signup_closes_at) {
      setSignupClosesCountdown('');
      return;
    }
    const closesAt = new Date(game.signup_closes_at).getTime();
    const update = () => {
      const now = Date.now();
      if (now >= closesAt) {
        setSignupClosesCountdown('Signups closed');
        return;
      }
      const d = Math.floor((closesAt - now) / 1000);
      const m = Math.floor(d / 60);
      const s = d % 60;
      const h = Math.floor(m / 60);
      const mins = m % 60;
      if (h > 0) setSignupClosesCountdown(`${h}h ${mins}m ${s}s`);
      else if (mins > 0) setSignupClosesCountdown(`${mins}m ${s}s`);
      else setSignupClosesCountdown(`${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [game?.status, game?.signup_closes_at]);

  const handleViewOpenGames = () => {
    setGameNotFound(false);
    setSelectedGameId(activeGames[0]?.id || null);
    router.replace('/buddy-up');
  };

  // Load all groups for current round (if roundId is known)
  useEffect(() => {
    if (!roundId || !token || !selectedGameId) return;
    (async () => {
      try {
        const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/rounds/${roundId}/groups`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && Array.isArray(res?.data)) {
          setAllGroups(res.data);
        }
      } catch (e) {
        console.error('Failed to load groups:', e);
      }
    })();
  }, [roundId, selectedGameId, token, refreshTrigger]);

  // Poll my-group (and groups for admin) on voting view so "X/Y voted" and "You voted" stay in sync (Phase 1 fix 1.1)
  useEffect(() => {
    if (!selectedGameId || !token || game?.status !== 'in_progress') return;
    if (!myGroup && !(isAdmin && roundId)) return;
    const interval = setInterval(async () => {
      try {
        const [myRes, groupsRes] = await Promise.all([
          authedFetch(`/api/buddy-up/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json()),
          isAdmin && roundId
            ? authedFetch(`/api/buddy-up/games/${selectedGameId}/rounds/${roundId}/groups`, { method: 'GET' }, token).then((r) => r.json())
            : Promise.resolve({ ok: false }),
        ]);
        if (myRes?.ok && myRes?.data) setMyGroup(myRes.data);
        if (groupsRes?.ok && Array.isArray(groupsRes?.data)) setAllGroups(groupsRes.data);
      } catch {
        // ignore
      }
    }, 7000);
    return () => clearInterval(interval);
  }, [selectedGameId, token, game?.status, myGroup, isAdmin, roundId]);

  // Auto-refresh when focused (Phase 2 fix 1.2): every 12s refresh games + game details
  useEffect(() => {
    if (!selectedGameId) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setRefreshTrigger((t) => t + 1);
      }
    }, 12000);
    return () => clearInterval(id);
  }, [selectedGameId]);

  // Advance countdown tick for "Advancing in X:XX" (Phase 4, 2.2 in-round)
  useEffect(() => {
    if (!game?.advance_at) return;
    const id = setInterval(() => setAdvanceCountdownTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [game?.advance_at]);

  // Calculate eligible players count when round or groups change
  useEffect(() => {
    if (!game || game.status !== 'in_progress' || !token || !selectedGameId) {
      setEligiblePlayersCount(null);
      return;
    }
    calculateEligiblePlayersCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, allGroups, game?.current_round, game?.status, totalSignups, selectedGameId, token]);

  // For admin: if no roundId but game is in progress, try to find current round
  useEffect(() => {
    if (!isAdmin || !token || !selectedGameId || !game || game.status !== 'in_progress' || roundId) return;
    (async () => {
      try {
        // Try to get progress data to find current round
        const progressRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/progress`, { method: 'GET' }, token).then((r) => r.json());
        if (progressRes?.ok && progressRes?.data?.rounds) {
          const currentRound = progressRes.data.rounds.find((r: any) => r.round_number === game.current_round);
          if (currentRound?.id) {
            setRoundId(currentRound.id);
            // Also load groups
            const groupsRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/rounds/${currentRound.id}/groups`, { method: 'GET' }, token).then((r) => r.json());
            if (groupsRes?.ok && Array.isArray(groupsRes?.data)) {
              setAllGroups(groupsRes.data);
            }
          }
        }
      } catch (e) {
        console.error('Failed to find current round:', e);
      }
    })();
  }, [isAdmin, token, selectedGameId, game, roundId]);

  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import('~/lib/constants');
        const { buildShareText } = await import('~/lib/og-helpers');
        const url = APP_URL + `/buddy-up?gameId=${selectedGameId}`;
        const text = buildShareText(
          'BUDDY UP',
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
      const url = APP_URL + `/buddy-up?gameId=${selectedGameId}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      const { APP_URL } = await import('~/lib/constants');
      alert('Copy failed. URL: ' + (APP_URL + `/buddy-up?gameId=${selectedGameId}`));
    }
  };

  const handleSignup = async () => {
    if (!token || !selectedGameId) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/buddy-up/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: selectedGameId }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to sign up');
      }

      // Reload game with auth to get updated hasSignedUp status
      const gameRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
      if (gameRes?.ok && gameRes?.data) {
        setGame(gameRes.data);
        // Update signup count if admin
            if (isAdmin && gameRes.data.status === 'signup') {
              try {
                const signupsRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
                if (signupsRes?.ok && Array.isArray(signupsRes?.data)) {
                  setSignupCount(signupsRes.data.length);
                }
              } catch (e) {
                console.error('Failed to reload signup count:', e);
              }
            }
            // Load total signups for remaining players count (only when game is in progress)
            if (gameRes.data.status === 'in_progress' && token) {
              try {
                const signupsRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
                if (signupsRes?.ok && Array.isArray(signupsRes?.data)) {
                  setTotalSignups(signupsRes.data.length);
                }
              } catch (e) {
                console.error('Failed to load total signups:', e);
              }
            } else {
              setTotalSignups(null);
            }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sign up');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartGame = async () => {
    if (!token || !selectedGameId) return;
    setSubmitting(true);
    try {
      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/start`, {
        method: 'POST',
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to start game');
      }

      // Reload game with auth to get updated status
      const gameRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
      if (gameRes?.ok && gameRes?.data) {
        setGame(gameRes.data);
        // Update signup count if still in signup phase
        if (gameRes.data.status === 'signup' && isAdmin) {
          try {
            const signupsRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
            if (signupsRes?.ok && Array.isArray(signupsRes?.data)) {
              setSignupCount(signupsRes.data.length);
            }
          } catch (e) {
            console.error('Failed to reload signup count:', e);
          }
        } else {
          setSignupCount(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start game');
    } finally {
      setSubmitting(false);
    }
  };


  const handleVote = async () => {
    if (!token || !selectedGameId || !myGroup || !selectedVote) return;
    setSubmitting(true);
    try {
      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: myGroup.roundId,
          groupId: myGroup.groupId,
          votedForFid: selectedVote,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit vote');
      }

      // Reload my group
      const myGroupRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
      if (myGroupRes?.ok && myGroupRes?.data) {
        setMyGroup(myGroupRes.data);
      }
      setSelectedVote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit vote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteRound = () => {
    if (!token) { setError('Please sign in to complete the round'); return; }
    if (!selectedGameId) { setError('No game selected. Please refresh the page.'); return; }
    if (!roundId) { setError('No round selected. Please refresh the page.'); return; }
    setShowCompleteRoundModal(true);
  };

  const runCompleteRound = async (advanceInSeconds?: number) => {
    if (!token || !selectedGameId || !roundId) return;
    setShowCompleteRoundModal(false);
    setCompletingRound(true);
    try {
      const body = (advanceInSeconds != null && [60, 120, 180, 300].includes(advanceInSeconds))
        ? { advanceInSeconds }
        : {};
      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/rounds/${roundId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to complete round');
      }
      const gameRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
      if (gameRes?.ok && gameRes?.data) {
        setGame(gameRes.data);
        setRoundId(null);
        setAllGroups([]);
        const myGroupRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
        if (myGroupRes?.ok && myGroupRes?.data) {
          setMyGroup(myGroupRes.data);
          setRoundId(myGroupRes.data.roundId);
        } else {
          setMyGroup(null);
        }
      }
      showSuccess(`Round completed! ${data.data.winners.length} winner${data.data.winners.length !== 1 ? 's' : ''} advanced.`);
      setError(null);
      setTimeout(() => calculateEligiblePlayersCount(), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete round');
    } finally {
      setCompletingRound(false);
    }
  };

  const handleEndGame = async () => {
    if (!token || !selectedGameId) return;
    showConfirm(
      'End this game? You will be able to settle winners after ending.',
      async () => {
        setEndingGame(true);
        try {
          const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cancel: false }),
          }, token);

          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Failed to end game');
          }

          // Reload game
          const gameRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
          if (gameRes?.ok && gameRes?.data) {
            setGame(gameRes.data);
          }
          showSuccess('Game ended. You can now settle winners.');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to end game');
        } finally {
          setEndingGame(false);
        }
      },
      undefined,
      'End Game',
      'Cancel'
    );
  };

  const handleCancelGame = async () => {
    // Defensive checks with user feedback
    if (!token) {
      setError('Please sign in to cancel the game');
      console.warn('[Cancel] Missing token');
      return;
    }
    if (!selectedGameId) {
      setError('No game selected. Please refresh the page.');
      console.warn('[Cancel] Missing selectedGameId');
      return;
    }

    // Show confirmation modal (replaces confirm())
    showConfirm(
      'Cancel this game? This cannot be undone.',
      async () => {
        console.log('[Cancel] Starting cancellation', { gameId: selectedGameId, hasToken: !!token });
        setCancellingGame(true);
        try {
          const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/cancel`, {
            method: 'POST',
          }, token);

          console.log('[Cancel] API response', { ok: res.ok });

          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Failed to cancel game');
          }

          // Reload game
          const gameRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
          if (gameRes?.ok && gameRes?.data) {
            setGame(gameRes.data);
          }
          showSuccess('Game cancelled.');
          setError(null); // Clear any previous errors
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'Failed to cancel game';
          setError(errorMsg);
          console.error('[Cancel] Error', e);
        } finally {
          setCancellingGame(false);
        }
      },
      undefined,
      'Cancel Game',
      'Keep Game'
    );
  };

  // Phase 3: Load signups for settlement dropdown
  const loadSettlementSignups = async () => {
    if (!selectedGameId || !token) return;
    
    setLoadingSettlementSignups(true);
    try {
      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && Array.isArray(res?.data)) {
        setSettlementSignups(res.data);
        // Pre-select first signup if no winners selected yet
        if (winners.length === 1 && !winners[0].fid && res.data.length > 0) {
          setWinners([{ fid: String(res.data[0].fid), amount: '' }]);
        }
      }
    } catch (e) {
      console.error('Failed to load signups for settlement:', e);
    } finally {
      setLoadingSettlementSignups(false);
    }
  };

  const handleSettle = async () => {
    if (!token || !selectedGameId) return;
    const validWinners = winners.filter((w) => w.fid && w.amount && !isNaN(parseFloat(w.amount)) && parseFloat(w.amount) > 0);
    if (validWinners.length === 0) {
      setError('Please add at least one winner with a valid amount');
      return;
    }
    showConfirm(
      `Settle game with ${validWinners.length} winner${validWinners.length !== 1 ? 's' : ''}? This will transfer BETR tokens.`,
      async () => {
        setSettling(true);
        try {
          const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              winners: validWinners.map((w) => ({ fid: parseInt(w.fid, 10), amount: parseFloat(w.amount) })),
              confirmWinners: true,
            }),
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

          // Reload game for complete data (payouts, tx_urls, etc.)
          const gameRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
          if (gameRes?.ok && gameRes?.data) {
            setGame(gameRes.data);
          }
          setShowSettleForm(false);
          setWinners([{ fid: '', amount: '' }]);
          showSuccess(`Game settled! View on Basescan in the game card.`);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to settle game');
        } finally {
          setSettling(false);
        }
      },
      undefined,
      'Settle Game',
      'Cancel'
    );
  };

  const handleViewProgress = async () => {
    if (!token || !selectedGameId) return;
    setLoadingProgress(true);
    try {
      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/progress`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && res?.data) {
        setProgressData(res.data);
        setShowProgress(true);
      } else {
        setError('Failed to load progress');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load progress');
    } finally {
      setLoadingProgress(false);
    }
  };

  const handleViewSignups = async () => {
    if (!token || !selectedGameId) return;
    setLoadingSignups(true);
    setShowSignupsModal(true);
    try {
      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && Array.isArray(res?.data)) {
        setSignupsList(res.data);
        setSignupCount(res.data.length);
      } else {
        setError('Failed to load signups');
        setShowSignupsModal(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load signups');
      setShowSignupsModal(false);
    } finally {
      setLoadingSignups(false);
    }
  };

  const handleCloseSignupsModal = () => {
    setShowSignupsModal(false);
    setSignupsList([]);
  };

  // Helper to show confirmation modal (replaces confirm())
  const showConfirm = (
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel'
  ) => {
    setConfirmConfig({ message, onConfirm, onCancel, confirmText, cancelText });
    setShowConfirmModal(true);
  };

  // Helper to show success message (replaces alert())
  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
  };

  // Calculate eligible players count for current round
  const calculateEligiblePlayersCount = async () => {
    if (!game || !selectedGameId || !token || game.status !== 'in_progress') {
      setEligiblePlayersCount(null);
      return;
    }

    // If round is active, count from allGroups
    if (roundId && allGroups.length > 0) {
      const count = allGroups
        .filter((g) => g.status !== 'eliminated')
        .reduce((sum, g) => sum + g.fids.length, 0);
      setEligiblePlayersCount(count);
      return;
    }

    // No active round - calculate based on round number
    if (game.current_round === 1) {
      // Round 1: use total signups (all signups are eligible)
      if (totalSignups !== null) {
        setEligiblePlayersCount(totalSignups);
      } else {
        // Fetch if not loaded yet
        try {
          const signupsRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
          if (signupsRes?.ok && Array.isArray(signupsRes?.data)) {
            const count = signupsRes.data.length;
            setTotalSignups(count);
            setEligiblePlayersCount(count);
          }
        } catch (e) {
          console.error('Failed to fetch signups for eligible count:', e);
        }
      }
    } else {
      // Round 2+: fetch winners from previous round
      try {
        const progressRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/progress`, { method: 'GET' }, token).then((r) => r.json());
        if (progressRes?.ok && progressRes?.data?.rounds) {
          const prevRound = progressRes.data.rounds.find((r: any) => r.round_number === game.current_round - 1);
          if (prevRound?.id) {
            const groupsRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/rounds/${prevRound.id}/groups`, { method: 'GET' }, token).then((r) => r.json());
            if (groupsRes?.ok && Array.isArray(groupsRes?.data)) {
              const winners = groupsRes.data.filter((g: any) => g.status === 'completed' && g.winnerFid);
              setEligiblePlayersCount(winners.length);
            }
          }
        }
      } catch (e) {
        console.error('Failed to calculate eligible players count:', e);
      }
    }
  };

  // Shuffle array (Fisher-Yates)
  const shuffle = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const handleOpenGroupSetup = async () => {
    if (!token || !selectedGameId || !game) return;
    setLoadingEligiblePlayers(true);
    setShowGroupSetupModal(true);
    try {
      let players: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }> = [];

      if (game.current_round === 1) {
        // Round 1: fetch signups
        const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && Array.isArray(res?.data)) {
          players = res.data.map((s: any) => ({
            fid: Number(s.fid),
            username: s.username,
            display_name: s.display_name,
            pfp_url: s.pfp_url,
          }));
        }
      } else {
        // Later rounds: fetch winners from previous round
        // First, get previous round
        const progressRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/progress`, { method: 'GET' }, token).then((r) => r.json());
        if (progressRes?.ok && progressRes?.data?.rounds) {
          const prevRound = progressRes.data.rounds.find((r: any) => r.round_number === game.current_round - 1);
          if (prevRound?.id) {
            // Get groups from previous round
            const groupsRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}/rounds/${prevRound.id}/groups`, { method: 'GET' }, token).then((r) => r.json());
            if (groupsRes?.ok && Array.isArray(groupsRes?.data)) {
              // Extract winners (completed groups with winner_fid)
              const winnerFids = new Set<number>();
              for (const group of groupsRes.data) {
                if (group.status === 'completed' && group.winnerFid) {
                  winnerFids.add(Number(group.winnerFid));
                }
              }
              // Get profiles for winners (via /api/users/bulk; avoids client-side Neynar)
              if (winnerFids.size > 0) {
                const fidsArray = Array.from(winnerFids);
                try {
                  const bulkRes = await authedFetch(`/api/users/bulk?fids=${fidsArray.join(',')}`, { method: 'GET' }, token);
                  const bulkData = await bulkRes.json();
                  const userByFid = new Map<number, { username?: string; display_name?: string; avatar_url?: string }>();
                  if (bulkData?.ok && Array.isArray(bulkData?.data)) {
                    for (const u of bulkData.data) {
                      if (u?.fid != null) userByFid.set(Number(u.fid), { username: u.username, display_name: u.display_name, avatar_url: u.avatar_url });
                    }
                  }
                  for (const fid of fidsArray) {
                    const u = userByFid.get(fid);
                    players.push({
                      fid,
                      username: u?.username ?? null,
                      display_name: u?.display_name ?? null,
                      pfp_url: u?.avatar_url ?? null,
                    });
                  }
                } catch (e) {
                  console.error('Failed to fetch winner profiles:', e);
                  for (const fid of fidsArray) {
                    players.push({ fid, username: null, display_name: null, pfp_url: null });
                  }
                }
              }
            }
          }
        }
      }

      if (players.length === 0) {
        setError('No eligible players for this round');
        setShowGroupSetupModal(false);
        return;
      }

      setEligiblePlayers(players);
      // Auto-calculate preview groups with default size
      const defaultSize = parseInt(previewGroupSize, 10) || 3;
      calculatePreviewGroups(defaultSize, players);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load eligible players');
      setShowGroupSetupModal(false);
    } finally {
      setLoadingEligiblePlayers(false);
    }
  };

  const calculatePreviewGroups = (groupSize: number, playersToUse?: Array<{ fid: number }>) => {
    const players = playersToUse || eligiblePlayers;
    if (players.length === 0) return;

    const shuffled = shuffle(players.map((p) => p.fid));
    const groups: Array<{ groupNumber: number; fids: number[] }> = [];

    let groupNumber = 1;
    for (let i = 0; i < shuffled.length; i += groupSize) {
      groups.push({
        groupNumber,
        fids: shuffled.slice(i, i + groupSize),
      });
      groupNumber++;
    }

    setPreviewGroups(groups);
  };

  const movePlayerToGroup = (playerFid: number, targetGroupNumber: number) => {
    const newGroups = [...previewGroups];
    
    // Find and remove player from current group
    for (const group of newGroups) {
      const index = group.fids.indexOf(playerFid);
      if (index !== -1) {
        group.fids.splice(index, 1);
        break;
      }
    }

    // Add player to target group
    const targetGroup = newGroups.find((g) => g.groupNumber === targetGroupNumber);
    if (targetGroup) {
      targetGroup.fids.push(playerFid);
    } else {
      // Create new group if it doesn't exist
      newGroups.push({ groupNumber: targetGroupNumber, fids: [playerFid] });
    }

    setPreviewGroups(newGroups);
  };

  const handleConfirmCreateRound = async () => {
    if (!token || !selectedGameId) return;
    setCreatingRound(true);
    try {
      const size = parseInt(previewGroupSize, 10);
      if (isNaN(size) || size < 1 || size > 10) {
        throw new Error('Group size must be between 1 and 10');
      }

      // Validate all players are assigned
      const assignedFids = new Set<number>();
      for (const group of previewGroups) {
        for (const fid of group.fids) {
          if (assignedFids.has(fid)) {
            throw new Error(`Player ${fid} appears in multiple groups`);
          }
          assignedFids.add(fid);
        }
      }

      const allEligibleFids = new Set(eligiblePlayers.map((p) => p.fid));
      for (const fid of allEligibleFids) {
        if (!assignedFids.has(fid)) {
          throw new Error(`Player ${fid} is not assigned to any group`);
        }
      }

      // Filter out empty groups and renumber groups sequentially
      const nonEmptyGroups = previewGroups.filter((g) => g.fids.length > 0);
      if (nonEmptyGroups.length === 0) {
        throw new Error('At least one group must have players');
      }
      
      // Renumber groups sequentially (1, 2, 3, ...)
      const renumberedGroups = nonEmptyGroups.map((g, index) => ({
        groupNumber: index + 1,
        fids: g.fids,
      }));

      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          groupSize: size,
          customGroups: renumberedGroups,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create round');
      }

      setRoundId(data.data.roundId);
      setShowGroupSetupModal(false);
      setPreviewGroups([]);
      setEligiblePlayers([]);
      
      // Reload game to get updated current_round
      const gameRes = await authedFetch(`/api/buddy-up/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
      if (gameRes?.ok && gameRes?.data) {
        setGame(gameRes.data);
      }
      // Reload groups and user's group
      if (data.data.roundId) {
        const [groupsRes, myGroupRes] = await Promise.all([
          authedFetch(`/api/buddy-up/games/${selectedGameId}/rounds/${data.data.roundId}/groups`, { method: 'GET' }, token).then((r) => r.json()),
          authedFetch(`/api/buddy-up/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json()),
        ]);
        if (groupsRes?.ok && Array.isArray(groupsRes?.data)) {
          setAllGroups(groupsRes.data);
        }
        if (myGroupRes?.ok && myGroupRes?.data) {
          setMyGroup(myGroupRes.data);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create round');
    } finally {
      setCreatingRound(false);
    }
  };

  // Load chat messages (for user's own group or selected group)
  const loadChatMessages = async (groupId?: string) => {
    const targetGroupId = groupId || myGroup?.groupId;
    if (!token || !selectedGameId || !targetGroupId) return;
    try {
      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/groups/${targetGroupId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && Array.isArray(res?.data)) {
        // Newest first (safeguard in case API order differs; createdAt is ISO string)
        const list = res.data.slice().sort(
          (a: { createdAt?: string }, b: { createdAt?: string }) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        if (groupId) {
          setSelectedGroupChatMessages(list);
        } else {
          setChatMessages(list);
        }
      }
    } catch (e) {
      console.error('Failed to load chat messages:', e);
    }
  };

  // Load selected group chat (admin viewing another group)
  const loadSelectedGroupChat = async (groupId: string) => {
    if (!token || !selectedGameId) return;
    setLoadingSelectedGroupChat(true);
    try {
      await loadChatMessages(groupId);
    } catch (e) {
      console.error('Failed to load selected group chat:', e);
    } finally {
      setLoadingSelectedGroupChat(false);
    }
  };

  // Send chat message (for user's own group or selected group)
  const handleSendMessage = async (groupId?: string, messageInput?: string) => {
    const targetGroupId = groupId || myGroup?.groupId;
    const message = messageInput || chatInput;
    if (!token || !selectedGameId || !targetGroupId || !message.trim()) return;

    const isSelectedGroup = !!groupId;
    if (isSelectedGroup) {
      setSendingSelectedGroupMessage(true);
    } else {
      setSendingMessage(true);
    }

    try {
      const res = await authedFetch(`/api/buddy-up/games/${selectedGameId}/groups/${targetGroupId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      // Add new message to top of list (newest first) and clear input
      if (data.data) {
        if (isSelectedGroup) {
          setSelectedGroupChatMessages((prev) => [data.data, ...prev]);
          setSelectedGroupChatInput('');
        } else {
          setChatMessages((prev) => [data.data, ...prev]);
          setChatInput('');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      if (isSelectedGroup) {
        setSendingSelectedGroupMessage(false);
      } else {
        setSendingMessage(false);
      }
    }
  };

  // Handle viewing a group's chat (admin)
  const handleViewGroupChat = async (groupId: string) => {
    setSelectedGroupChatId(groupId);
    setSelectedGroupChatMessages([]);
    await loadSelectedGroupChat(groupId);
  };

  // Close selected group chat modal
  const handleCloseGroupChat = () => {
    setSelectedGroupChatId(null);
    setSelectedGroupChatMessages([]);
    setSelectedGroupChatInput('');
  };

  // App-wide chat reactions: set/change/remove reaction, then refetch messages
  const handleReactionClick = async (groupId: string, messageId: string, reaction: 'thumbs_up' | 'x' | 'fire' | 'scream') => {
    if (!token || !selectedGameId) return;
    try {
      const res = await authedFetch(
        `/api/buddy-up/games/${selectedGameId}/groups/${groupId}/chat/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      // Refetch this group's chat to get updated counts
      await loadChatMessages(groupId);
    } catch (e) {
      console.error('Failed to set reaction:', e);
    }
  };

  // Poll chat messages every 8 seconds when in a group
  useEffect(() => {
    if (!token || !selectedGameId || !myGroup?.groupId || game?.status !== 'in_progress') {
      setChatMessages([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await loadChatMessages();
    };

    // Load immediately
    load();

    // Then poll every 8 seconds
    const interval = setInterval(load, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, selectedGameId, myGroup?.groupId, game?.status]);

  // Poll selected group chat every 8 seconds when viewing (admin)
  useEffect(() => {
    if (!token || !selectedGameId || !selectedGroupChatId || game?.status !== 'in_progress') {
      return;
    }

    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await loadChatMessages(selectedGroupChatId);
    };

    // Load immediately
    load();

    // Then poll every 8 seconds
    const interval = setInterval(load, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, selectedGameId, selectedGroupChatId, game?.status]);

  // Auto-scroll chat to top when new messages arrive (newest is at top)
  const chatTopRef = useRef<HTMLDivElement>(null);
  const selectedChatTopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatTopRef.current) {
      chatTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [chatMessages]);
  useEffect(() => {
    if (selectedChatTopRef.current) {
      selectedChatTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedGroupChatMessages]);

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
      {game && (
        <div style={{ width: '100%', maxHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', color: 'var(--text-2)', fontSize: '0.875rem' }}>
          BUDDY UP
        </div>
      )}
      <h1 style={{ marginBottom: '8px' }}>BUDDY UP</h1>
      <p style={{ color: 'var(--text-1)', marginBottom: '8px' }}>Sign up and vote your way to victory!</p>
      <button
        type="button"
        onClick={() => setShowRules((s) => !s)}
        style={{ background: 'none', border: 'none', color: 'var(--fire-1)', fontSize: '0.875rem', cursor: 'pointer', padding: 0, marginBottom: '16px', textDecoration: 'underline' }}
      >
        {showRules ? 'Hide' : 'How it works'}
      </button>
      {showRules && (
        <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)', color: 'var(--text-1)', fontSize: '0.875rem' }}>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>Sign up to join a game.</li>
            <li>When the game starts, you&apos;re put into a group.</li>
            <li>Vote for who stays. Everyone in the group must agree or the whole group is out.</li>
            <li>Advance to the next round. Last standing wins.</li>
            <li>Use group chat to coordinate with your group.</li>
          </ul>
        </div>
      )}

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
                style={{ padding: '8px', border: '1px solid var(--stroke)', borderRadius: '6px', width: '100%', maxWidth: '400px', color: 'var(--text-0)', background: 'var(--bg-1)' }}
              >
                {activeGames.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} - Prize: {g.prize_amount} BETR{g.status === 'in_progress' ? ' ● In progress' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {gameNotFound && (
            <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--ember-2)' }}>
              <p style={{ color: 'var(--text-0)', marginBottom: '8px' }}>This game doesn&apos;t exist or has ended.</p>
              <button type="button" onClick={handleViewOpenGames} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.875rem' }}>
                View open games
              </button>
            </div>
          )}

          {game && (
            <>
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)', borderLeft: game.status === 'in_progress' ? '4px solid var(--fire-1)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--text-0)' }}>Prize: {game.prize_amount} BETR</strong>
                  <span className="hl-badge" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                    {game.status === 'signup' ? 'Signups Open' : game.status === 'in_progress' ? 'Game In Progress' : game.status}
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '8px' }}>{formatStakingRequirement(game.staking_min_amount)}</p>
                {game.status === 'signup' && (game.start_condition || game.min_players_to_start || game.signup_closes_at) && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '4px' }}>
                    When the game starts: {game.start_condition === 'min_players'
                      ? `When ${game.min_players_to_start ?? 'N'} players sign up`
                      : game.start_condition === 'at_time' && game.signup_closes_at
                        ? `At ${new Date(game.signup_closes_at).toLocaleString()}`
                        : game.start_condition === 'whichever_first' && (game.min_players_to_start || game.signup_closes_at)
                          ? `When ${game.min_players_to_start ?? 'N'} players or at ${game.signup_closes_at ? new Date(game.signup_closes_at).toLocaleString() : 'time'}, whichever first`
                          : '—'}
                  </p>
                )}
                {game.status === 'signup' && (game.signup_count !== undefined || signupCount !== null) && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '4px' }}>
                    {(game.signup_count ?? signupCount ?? 0)} player{(game.signup_count ?? signupCount ?? 0) !== 1 ? 's' : ''} signed up
                  </p>
                )}
                {game.status === 'signup' && game.signup_closes_at && new Date(game.signup_closes_at).getTime() > Date.now() && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--fire-1)', marginBottom: '8px' }}>
                    Signups close in: {signupClosesCountdown || '…'}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, marginBottom: '8px', flexWrap: 'wrap' }}>
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
                  <button
                    type="button"
                    onClick={() => setRefreshTrigger((t) => t + 1)}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}
                    title="Refresh"
                  >
                    ↻ Refresh
                  </button>
                </div>
                {game.status === 'signup' && (
                  <>
                    {!game.hasSignedUp ? (
                      <button
                        onClick={handleSignup}
                        disabled={submitting || !token}
                        className="btn-primary"
                        style={{ width: '100%', marginTop: '8px' }}
                      >
                        {submitting ? 'Signing up…' : 'Sign Up'}
                      </button>
                    ) : (
                      <p style={{ color: 'var(--text-1)', marginTop: '8px' }}>✓ You&apos;ve signed up!</p>
                    )}
                    {/* Count and list of signups for all viewers (name + PFP clickable to Farcaster profile) */}
                    {(game.signup_count != null || signupCount != null || signupsList.length > 0) && (
                      <div style={{ marginTop: '12px' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '8px' }}>
                          {(game.signup_count ?? signupCount ?? signupsList.length ?? 0)} player{(game.signup_count ?? signupCount ?? signupsList.length ?? 0) !== 1 ? 's' : ''} signed up
                        </p>
                        {signupsList.length > 0 && (
                          <div style={{ marginBottom: '8px' }}>
                            <PlayerListInline players={signupsList} defaultPfp={DEFAULT_PFP} size="sm" />
                          </div>
                        )}
                      </div>
                    )}
                    {isAdmin && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                        {signupCount !== null && (
                          <button
                            onClick={handleViewSignups}
                            disabled={loadingSignups || !token}
                            className="btn-secondary"
                            style={{ width: '100%', fontSize: '0.875rem', padding: '6px 12px' }}
                          >
                            {loadingSignups ? 'Loading…' : `View all ${signupCount} player${signupCount !== 1 ? 's' : ''}`}
                          </button>
                        )}
                        <button
                          onClick={handleStartGame}
                          disabled={submitting || !token}
                          className="btn-primary"
                          style={{ width: '100%', background: 'var(--fire-1)' }}
                        >
                          {submitting ? 'Starting…' : 'Start Game'}
                        </button>
                        <button
                          onClick={handleCancelGame}
                          disabled={cancellingGame || !token}
                          className="btn-secondary"
                          style={{ width: '100%', background: 'var(--fire-2)', color: 'var(--text-0)' }}
                        >
                          {cancellingGame ? 'Cancelling…' : 'Cancel Game'}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {game.status === 'in_progress' && (
                  <>
                    <p style={{ color: 'var(--text-1)', marginTop: '8px' }}>
                      Round {game.current_round}
                      {eligiblePlayersCount !== null && totalSignups !== null && (
                        ` (${eligiblePlayersCount} of ${totalSignups} remaining)`
                      )}
                    </p>
                    {!roundId && game.advance_at && (() => {
                      const remain = Math.max(0, new Date(game.advance_at!).getTime() - Date.now());
                      if (remain <= 0) return null;
                      const m = Math.floor(remain / 60000);
                      const s = Math.floor((remain % 60000) / 1000);
                      return (
                        <p style={{ color: 'var(--fire-1)', marginTop: '8px', fontWeight: 600 }}>
                          Advancing in {m}:{String(s).padStart(2, '0')}
                        </p>
                      );
                    })()}
                    {isAdmin && (
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {!roundId && (
                          <button
                            onClick={handleOpenGroupSetup}
                            disabled={creatingRound || loadingEligiblePlayers || !token || !!(game.advance_at && new Date(game.advance_at).getTime() > Date.now())}
                            className="btn-primary"
                            title={game.advance_at && new Date(game.advance_at).getTime() > Date.now() ? 'Wait for countdown' : undefined}
                          >
                            {creatingRound || loadingEligiblePlayers ? 'Loading…' : `Start Round ${game.current_round}`}
                          </button>
                        )}
                        {roundId && allGroups.length > 0 && allGroups.some((g) => g.status === 'voting') && (
                          <button
                            onClick={handleCompleteRound}
                            disabled={completingRound || !token}
                            className="btn-primary"
                            style={{ background: 'var(--fire-1)' }}
                          >
                            {completingRound ? 'Completing…' : `Complete Round ${game.current_round}`}
                          </button>
                        )}
                        <button
                          onClick={handleEndGame}
                          disabled={endingGame || !token}
                          className="btn-secondary"
                        >
                          {endingGame ? 'Ending…' : 'End Game'}
                        </button>
                        <button
                          onClick={handleCancelGame}
                          disabled={cancellingGame || !token}
                          className="btn-secondary"
                          style={{ background: 'var(--fire-2)', color: 'var(--text-0)' }}
                        >
                          {cancellingGame ? 'Cancelling…' : 'Cancel Game'}
                        </button>
                        <button
                          onClick={handleViewProgress}
                          disabled={loadingProgress || !token}
                          className="btn-secondary"
                        >
                          {loadingProgress ? 'Loading…' : 'View Full Progress'}
                        </button>
                        {!showSettleForm && (
                          <button
                            onClick={async () => {
                              setShowSettleForm(true);
                              await loadSettlementSignups();
                            }}
                            className="btn-primary"
                            style={{ background: 'var(--fire-1)' }}
                          >
                            {game.status === 'in_progress' ? 'End & Settle Game' : 'Settle Game'}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {game.status === 'settled' && (game.settle_tx_hash || (game as any).settle_tx_url) && (
                  <p style={{ color: 'var(--text-1)', marginTop: '8px' }}>
                    Settlement: <a href={(game as any).settle_tx_url || getBaseScanTxUrl(game.settle_tx_hash!) || '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fire-1)' }}>View on Basescan</a>
                    {(game as any).payouts?.length > 0 && (
                      <> • Payouts: {(game as any).payouts.map((p: any, i: number) => (
                        <span key={i}>{i > 0 && ', '}FID {p.fid} {p.txUrl ? <a href={p.txUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fire-1)' }}>tx</a> : null}</span>
                      ))}</>
                    )}
                  </p>
                )}

                {((game.status === 'settled' || game.status === 'in_progress') && isAdmin && showSettleForm) && (
                  <>
                    <p style={{ color: 'var(--text-1)', marginTop: '8px' }}>
                      {game.status === 'in_progress' ? 'End game and settle winners:' : 'Game ended. Ready to settle.'}
                    </p>
                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-2)', borderRadius: '6px' }}>
                        <h4 style={{ marginBottom: '8px', color: 'var(--text-0)' }}>Settle Winners</h4>
                        {loadingSettlementSignups ? (
                          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-1)' }}>Loading eligible players...</div>
                        ) : settlementSignups.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-1)' }}>No signups found for this game</div>
                        ) : (
                          <>
                            {winners.map((winner, idx) => {
                              const selectedPlayer = settlementSignups.find((s) => String(s.fid) === winner.fid);
                              return (
                                <div key={idx} style={{ marginBottom: '12px', padding: '8px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--stroke)' }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.875rem', color: 'var(--text-1)', minWidth: '80px' }}>Winner {idx + 1}:</label>
                                    <select
                                      value={winner.fid}
                                      onChange={(e) => {
                                        const newWinners = [...winners];
                                        newWinners[idx].fid = e.target.value;
                                        setWinners(newWinners);
                                      }}
                                      style={{ 
                                        padding: '6px', 
                                        border: '1px solid var(--stroke)', 
                                        borderRadius: '6px', 
                                        flex: 1, 
                                        color: 'var(--text-0)',
                                        background: 'var(--bg-1)'
                                      }}
                                    >
                                      <option value="">Select player...</option>
                                      {settlementSignups.map((signup) => (
                                        <option key={signup.fid} value={String(signup.fid)}>
                                          {signup.display_name || signup.username || `FID ${signup.fid}`} (FID: {signup.fid})
                                        </option>
                                      ))}
                                    </select>
                                    {winners.length > 1 && (
                                      <button
                                        onClick={() => setWinners(winners.filter((_, i) => i !== idx))}
                                        className="btn-secondary"
                                        style={{ padding: '4px 8px' }}
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                  {selectedPlayer && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '4px', background: 'var(--bg-2)', borderRadius: '4px' }}>
                                      <img
                                        src={selectedPlayer.pfp_url || DEFAULT_PFP}
                                        alt={selectedPlayer.display_name || selectedPlayer.username || `FID ${selectedPlayer.fid}`}
                                        style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                                      />
                                      <span style={{ fontSize: '0.875rem', color: 'var(--text-0)' }}>
                                        {selectedPlayer.display_name || selectedPlayer.username || `FID ${selectedPlayer.fid}`}
                                      </span>
                                    </div>
                                  )}
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="Amount (BETR)"
                                    value={winner.amount}
                                    onChange={(e) => {
                                      const newWinners = [...winners];
                                      newWinners[idx].amount = e.target.value;
                                      setWinners(newWinners);
                                    }}
                                    style={{ padding: '6px', border: '1px solid var(--stroke)', borderRadius: '6px', width: '100%', color: 'var(--text-0)', background: 'var(--bg-1)' }}
                                  />
                                </div>
                              );
                            })}
                          </>
                        )}
                        {settlementSignups.length > 0 && (
                          <button
                            onClick={() => setWinners([...winners, { fid: '', amount: '' }])}
                            className="btn-secondary"
                            style={{ width: '100%', marginBottom: '8px' }}
                            disabled={loadingSettlementSignups}
                          >
                            Add Winner
                          </button>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setShowSettleForm(false);
                              setWinners([{ fid: '', amount: '' }]);
                            }}
                            className="btn-secondary"
                            disabled={settling}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSettle}
                            disabled={settling || !token}
                            className="btn-primary"
                            style={{ flex: 1 }}
                          >
                            {settling ? 'Settling…' : 'Confirm & Settle'}
                          </button>
                        </div>
                      </div>
                  </>
                )}
              </div>

              {/* My Group View */}
              {myGroup && game.status === 'in_progress' && (
                <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)' }}>
                  <h3 style={{ marginBottom: '12px', color: 'var(--text-0)' }}>Your Group (Group {myGroup.groupNumber})</h3>
                  <p style={{ color: 'var(--text-1)', marginBottom: '12px' }}>
                    {myGroup.voteCount}/{myGroup.totalMembers} voted
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    {myGroup.members.map((member) => {
                      const hasVoted = myGroup.votes?.some((v) => v.voterFid === member.fid) || false;
                      return (
                        <div
                          key={member.fid}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px',
                            background: hasVoted ? 'var(--bg-2)' : 'transparent',
                            borderRadius: '6px',
                            border: hasVoted ? '1px solid var(--stroke)' : 'none',
                          }}
                        >
                          <img
                            src={member.pfp_url || DEFAULT_PFP}
                            alt={member.display_name || member.username || `FID ${member.fid}`}
                            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                          />
                          <div style={{ flex: 1 }}>
                            <button
                              onClick={() => openFarcasterProfile(member.fid, member.username)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-0)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontWeight: 600,
                                padding: 0,
                              }}
                            >
                              {member.display_name || member.username || `FID ${member.fid}`}
                            </button>
                            {member.username && (
                              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-1)' }}>@{member.username}</p>
                            )}
                          </div>
                          {hasVoted && <span style={{ fontSize: '0.75rem', color: 'var(--fire-1)' }}>✓ Voted</span>}
                        </div>
                      );
                    })}
                  </div>

                  {!myGroup.hasVoted && myGroup.status === 'voting' && (
                    <div>
                      <p style={{ color: 'var(--text-1)', marginBottom: '8px' }}>Vote for who should advance:</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                        {myGroup.members
                          .filter((m) => m.fid !== (token ? Number(token.split('.')[0]) : null)) // Don't show self
                          .map((member) => (
                            <button
                              key={member.fid}
                              onClick={() => setSelectedVote(member.fid)}
                              disabled={submitting}
                              style={{
                                padding: '8px',
                                background: selectedVote === member.fid ? 'var(--fire-1)' : 'var(--bg-2)',
                                border: `1px solid ${selectedVote === member.fid ? 'var(--fire-1)' : 'var(--stroke)'}`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: 'var(--text-0)',
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                              }}
                            >
                              <img
                                src={member.pfp_url || DEFAULT_PFP}
                                alt={member.display_name || member.username || `FID ${member.fid}`}
                                style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                              {member.display_name || member.username || `FID ${member.fid}`}
                            </button>
                          ))}
                      </div>
                      <button
                        onClick={handleVote}
                        disabled={submitting || !selectedVote}
                        className="btn-primary"
                        style={{ width: '100%' }}
                      >
                        {submitting ? 'Submitting…' : 'Submit Vote'}
                      </button>
                    </div>
                  )}

                  {myGroup.hasVoted && (
                    <p style={{ color: 'var(--text-1)' }}>You voted for: {myGroup.members.find((m) => m.fid === myGroup.myVote)?.display_name || `FID ${myGroup.myVote}`}</p>
                  )}

                  {/* Group Chat (6.3: input above thread, scroll to bottom for latest) */}
                  {myGroup.status === 'voting' && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--stroke)' }}>
                      <h4 style={{ marginBottom: '8px', color: 'var(--fire-1)', fontSize: '0.875rem', fontWeight: 600 }}>Group Chat</h4>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !sendingMessage && chatInput.trim()) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          placeholder="Type a message..."
                          maxLength={1000}
                          disabled={sendingMessage}
                          style={{
                            flex: 1,
                            padding: '8px',
                            border: '1px solid var(--stroke)',
                            borderRadius: '6px',
                            background: 'var(--bg-2)',
                            color: 'var(--fire-1)',
                            fontSize: '0.875rem',
                          }}
                        />
                        <button
                          onClick={() => handleSendMessage()}
                          disabled={sendingMessage || !chatInput.trim()}
                          className="btn-primary"
                          style={{ padding: '8px 16px' }}
                        >
                          {sendingMessage ? 'Sending…' : 'Send'}
                        </button>
                      </div>
                      <div
                        style={{
                          maxHeight: '400px',
                          overflowY: 'auto',
                          padding: '8px',
                          background: 'var(--bg-2)',
                          borderRadius: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div ref={chatTopRef} />
                        {chatMessages.length === 0 ? (
                          <p style={{ color: 'var(--fire-2)', fontSize: '0.875rem', textAlign: 'center', padding: '16px' }}>
                            No messages yet. Start the conversation!
                          </p>
                        ) : (
                          chatMessages.map((msg) => (
                            <MessageWithReactions
                              key={msg.id}
                              message={msg}
                              onReactionClick={(messageId, reaction) =>
                                myGroup?.groupId ? handleReactionClick(myGroup.groupId, messageId, reaction) : Promise.resolve()
                              }
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* All Groups View */}
              {allGroups.length > 0 && game.status === 'in_progress' && (
                <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)' }}>
                  <h3 style={{ marginBottom: '12px', color: 'var(--text-0)' }}>All Groups</h3>
                  {allGroups.map((group) => (
                    <div key={group.id} style={{ marginBottom: '12px', padding: '8px', background: 'var(--bg-2)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ color: 'var(--text-0)' }}>Group {group.groupNumber}</strong>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span className="hl-badge" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                            {group.voteCount}/{group.totalMembers} voted
                          </span>
                          {isAdmin && group.status === 'voting' && (
                            <button
                              onClick={() => handleViewGroupChat(group.id)}
                              className="btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                            >
                              View Chat
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {group.members.map((member) => {
                          const hasVoted = group.votes?.some((v) => v.voterFid === member.fid) || false;
                          return (
                            <div
                              key={member.fid}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                background: hasVoted ? 'var(--fire-1)' : 'transparent',
                                borderRadius: '4px',
                              }}
                            >
                              <img
                                src={member.pfp_url || DEFAULT_PFP}
                                alt={member.display_name || member.username || `FID ${member.fid}`}
                                style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                              <button
                                onClick={() => openFarcasterProfile(member.fid, member.username)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--text-0)',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  padding: 0,
                                }}
                              >
                                {member.display_name || member.username || `FID ${member.fid}`}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Admin Signups Modal */}
              {showSignupsModal && isAdmin && (
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
                  onClick={handleCloseSignupsModal}
                >
                  <div
                    className="hl-card"
                    style={{
                      maxWidth: '90%',
                      width: '600px',
                      maxHeight: '90vh',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'auto',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h2 style={{ color: 'var(--text-0)' }}>Players Signed Up</h2>
                      <button
                        onClick={handleCloseSignupsModal}
                        style={{ background: 'none', border: 'none', color: 'var(--text-1)', fontSize: '24px', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                    {loadingSignups ? (
                      <p style={{ color: 'var(--text-1)', textAlign: 'center', padding: '16px' }}>Loading signups...</p>
                    ) : signupsList.length === 0 ? (
                      <p style={{ color: 'var(--text-1)', textAlign: 'center', padding: '16px' }}>No players have signed up yet.</p>
                    ) : (
                      <>
                        <p style={{ color: 'var(--text-1)', marginBottom: '12px', fontSize: '0.875rem' }}>
                          <strong>{signupsList.length}</strong> player{signupsList.length !== 1 ? 's' : ''} signed up
                        </p>
                        <div style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid var(--stroke)', borderRadius: '6px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--stroke)', background: 'var(--bg-2)' }}>
                                <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-0)' }}>#</th>
                                <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-0)' }}>Player</th>
                                <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-0)' }}>Signed Up</th>
                              </tr>
                            </thead>
                            <tbody>
                              {signupsList.map((signup, idx) => (
                                <tr
                                  key={signup.fid}
                                  style={{
                                    borderBottom: '1px solid var(--stroke)',
                                  }}
                                >
                                  <td style={{ padding: '8px', color: 'var(--text-1)' }}>{idx + 1}</td>
                                  <td style={{ padding: '8px', color: 'var(--text-0)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <img
                                        src={signup.pfp_url || DEFAULT_PFP}
                                        alt={signup.display_name || signup.username || `FID ${signup.fid}`}
                                        style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                                      />
                                      <button
                                        onClick={() => openFarcasterProfile(signup.fid, signup.username)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: 'var(--text-0)',
                                          cursor: 'pointer',
                                          fontSize: '0.875rem',
                                          padding: 0,
                                          textAlign: 'left',
                                        }}
                                      >
                                        {signup.display_name || signup.username || `FID ${signup.fid}`}
                                      </button>
                                    </div>
                                  </td>
                                  <td style={{ padding: '8px', color: 'var(--text-1)', fontSize: '0.75rem' }}>
                                    {formatRelativeTime(signup.signed_up_at)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Group Setup Modal */}
              {showGroupSetupModal && isAdmin && (
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
                    if (!loadingEligiblePlayers && !creatingRound) {
                      setShowGroupSetupModal(false);
                      setPreviewGroups([]);
                      setEligiblePlayers([]);
                    }
                  }}
                >
                  <div
                    className="hl-card"
                    style={{
                      maxWidth: '90%',
                      width: '800px',
                      maxHeight: '90vh',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'auto',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h2 style={{ color: 'var(--text-0)' }}>Set Up Groups for Round {game?.current_round || 1}</h2>
                      <button
                        onClick={() => {
                          if (!loadingEligiblePlayers && !creatingRound) {
                            setShowGroupSetupModal(false);
                            setPreviewGroups([]);
                            setEligiblePlayers([]);
                          }
                        }}
                        disabled={loadingEligiblePlayers || creatingRound}
                        style={{ background: 'none', border: 'none', color: 'var(--text-1)', fontSize: '24px', cursor: loadingEligiblePlayers || creatingRound ? 'not-allowed' : 'pointer' }}
                      >
                        ×
                      </button>
                    </div>

                    {loadingEligiblePlayers ? (
                      <p style={{ color: 'var(--text-1)', textAlign: 'center', padding: '16px' }}>Loading eligible players...</p>
                    ) : eligiblePlayers.length === 0 ? (
                      <p style={{ color: 'var(--text-1)', textAlign: 'center', padding: '16px' }}>No eligible players for this round.</p>
                    ) : (
                      <>
                        <p style={{ color: 'var(--text-1)', marginBottom: '12px' }}>
                          <strong>{eligiblePlayers.length}</strong> player{eligiblePlayers.length !== 1 ? 's' : ''} eligible for Round {game?.current_round || 1}
                        </p>

                        <div style={{ marginBottom: '16px' }}>
                          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
                            Group size (1-10):
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={previewGroupSize}
                            onChange={(e) => {
                              const newSize = e.target.value;
                              setPreviewGroupSize(newSize);
                              const sizeNum = parseInt(newSize, 10);
                              if (!isNaN(sizeNum) && sizeNum >= 1 && sizeNum <= 10) {
                                calculatePreviewGroups(sizeNum);
                              }
                            }}
                            style={{ padding: '8px', border: '1px solid var(--stroke)', borderRadius: '6px', width: '100px', color: 'var(--text-0)', background: 'var(--bg-1)' }}
                          />
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginTop: '4px' }}>
                            Will create {previewGroups.length} group{previewGroups.length !== 1 ? 's' : ''}
                          </p>
                        </div>

                        {previewGroups.length > 0 && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(previewGroups.length, 3)}, 1fr)`, gap: '12px', marginBottom: '16px', maxHeight: '50vh', overflowY: 'auto' }}>
                              {previewGroups.map((group) => (
                                <div
                                  key={group.groupNumber}
                                  style={{
                                    border: '1px solid var(--stroke)',
                                    borderRadius: '6px',
                                    padding: '12px',
                                    background: 'var(--bg-2)',
                                  }}
                                >
                                  <h3 style={{ color: 'var(--text-0)', marginBottom: '8px', fontSize: '0.875rem' }}>
                                    Group {group.groupNumber} ({group.fids.length} player{group.fids.length !== 1 ? 's' : ''})
                                  </h3>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {group.fids.map((fid) => {
                                      const player = eligiblePlayers.find((p) => p.fid === fid);
                                      return (
                                        <div
                                          key={fid}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '4px',
                                            background: 'var(--bg-1)',
                                            borderRadius: '4px',
                                          }}
                                        >
                                          <img
                                            src={player?.pfp_url || DEFAULT_PFP}
                                            alt={player?.display_name || player?.username || `FID ${fid}`}
                                            style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                                          />
                                          <button
                                            onClick={() => openFarcasterProfile(fid, player?.username || null)}
                                            style={{
                                              background: 'none',
                                              border: 'none',
                                              color: 'var(--text-0)',
                                              cursor: 'pointer',
                                              fontSize: '0.75rem',
                                              padding: 0,
                                              textAlign: 'left',
                                              flex: 1,
                                            }}
                                          >
                                            {player?.display_name || player?.username || `FID ${fid}`}
                                          </button>
                                          <select
                                            value=""
                                            onChange={(e) => {
                                              const targetGroup = parseInt(e.target.value, 10);
                                              if (!isNaN(targetGroup)) {
                                                movePlayerToGroup(fid, targetGroup);
                                              }
                                            }}
                                            style={{
                                              padding: '2px 4px',
                                              fontSize: '0.7rem',
                                              border: '1px solid var(--stroke)',
                                              borderRadius: '4px',
                                              background: 'var(--bg-1)',
                                              color: 'var(--text-0)',
                                            }}
                                          >
                                            <option value="">Move to...</option>
                                            {previewGroups.map((g) => (
                                              g.groupNumber !== group.groupNumber && (
                                                <option key={g.groupNumber} value={g.groupNumber}>
                                                  Group {g.groupNumber}
                                                </option>
                                              )
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => {
                                  setShowGroupSetupModal(false);
                                  setPreviewGroups([]);
                                  setEligiblePlayers([]);
                                }}
                                disabled={creatingRound}
                                className="btn-secondary"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleConfirmCreateRound}
                                disabled={creatingRound || previewGroups.length === 0}
                                className="btn-primary"
                              >
                                {creatingRound ? 'Creating…' : 'Confirm & Create Round'}
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Confirmation Modal */}
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
                    if (confirmConfig.onCancel) {
                      confirmConfig.onCancel();
                    }
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
                          if (confirmConfig.onCancel) {
                            confirmConfig.onCancel();
                          }
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

              {/* Complete Round Modal (Phase 4: advance now or set countdown) */}
              {showCompleteRoundModal && (
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
                  onClick={() => setShowCompleteRoundModal(false)}
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
                    <h3 style={{ color: 'var(--text-0)', marginBottom: '8px', fontSize: '1.125rem' }}>
                      Complete this round?
                    </h3>
                    <p style={{ color: 'var(--text-1)', marginBottom: '16px', lineHeight: '1.5' }}>
                      This will determine winners and eliminations. When should the next round start?
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <button onClick={() => runCompleteRound()} className="btn-primary" style={{ background: 'var(--fire-1)' }}>
                        Advance now
                      </button>
                      <button onClick={() => runCompleteRound(60)} className="btn-secondary">In 1 min</button>
                      <button onClick={() => runCompleteRound(120)} className="btn-secondary">In 2 min</button>
                      <button onClick={() => runCompleteRound(180)} className="btn-secondary">In 3 min</button>
                      <button onClick={() => runCompleteRound(300)} className="btn-secondary">In 5 min</button>
                      <button onClick={() => setShowCompleteRoundModal(false)} className="btn-secondary">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message Modal */}
              {showSuccessModal && (
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
                    setShowSuccessModal(false);
                    setSuccessMessage('');
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
                      Success
                    </h3>
                    <p style={{ color: 'var(--text-1)', marginBottom: '24px', lineHeight: '1.5' }}>
                      {successMessage}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          setShowSuccessModal(false);
                          setSuccessMessage('');
                        }}
                        className="btn-primary"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Group Chat Modal */}
              {selectedGroupChatId && isAdmin && (
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
                  onClick={handleCloseGroupChat}
                >
                  <div
                    className="hl-card"
                    style={{
                      maxWidth: '90%',
                      width: '500px',
                      maxHeight: '90vh',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h2 style={{ color: 'var(--fire-1)' }}>
                        Group {allGroups.find((g) => g.id === selectedGroupChatId)?.groupNumber || '?'} Chat
                      </h2>
                      <button
                        onClick={handleCloseGroupChat}
                        style={{ background: 'none', border: 'none', color: 'var(--fire-1)', fontSize: '24px', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                    {/* 6.3: input above thread */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        value={selectedGroupChatInput}
                        onChange={(e) => setSelectedGroupChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !sendingSelectedGroupMessage && selectedGroupChatInput.trim()) {
                            e.preventDefault();
                            handleSendMessage(selectedGroupChatId, selectedGroupChatInput);
                          }
                        }}
                        placeholder="Type a message..."
                        maxLength={1000}
                        disabled={sendingSelectedGroupMessage}
                        style={{
                          flex: 1,
                          padding: '8px',
                          border: '1px solid var(--stroke)',
                          borderRadius: '6px',
                          background: 'var(--bg-2)',
                          color: 'var(--fire-1)',
                          fontSize: '0.875rem',
                        }}
                      />
                      <button
                        onClick={() => handleSendMessage(selectedGroupChatId, selectedGroupChatInput)}
                        disabled={sendingSelectedGroupMessage || !selectedGroupChatInput.trim()}
                        className="btn-primary"
                        style={{ padding: '8px 16px' }}
                      >
                        {sendingSelectedGroupMessage ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        maxHeight: '50vh',
                        overflowY: 'auto',
                        padding: '8px',
                        background: 'var(--bg-2)',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div ref={selectedChatTopRef} />
                      {loadingSelectedGroupChat ? (
                        <p style={{ color: 'var(--fire-2)', fontSize: '0.875rem', textAlign: 'center', padding: '16px' }}>
                          Loading chat...
                        </p>
                      ) : selectedGroupChatMessages.length === 0 ? (
                        <p style={{ color: 'var(--fire-2)', fontSize: '0.875rem', textAlign: 'center', padding: '16px' }}>
                          No messages yet.
                        </p>
                      ) : (
                        selectedGroupChatMessages.map((msg) => (
                          <MessageWithReactions
                            key={msg.id}
                            message={msg}
                            onReactionClick={(messageId, reaction) =>
                              selectedGroupChatId ? handleReactionClick(selectedGroupChatId, messageId, reaction) : Promise.resolve()
                            }
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Progress Dashboard Modal */}
              {showProgress && progressData && isAdmin && (
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
                    overflow: 'auto',
                  }}
                  onClick={() => setShowProgress(false)}
                >
                  <div
                    className="hl-card"
                    style={{
                      maxWidth: '90%',
                      width: '800px',
                      maxHeight: '90vh',
                      padding: '24px',
                      overflow: 'auto',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h2 style={{ color: 'var(--text-0)' }}>Full Game Progress</h2>
                      <button
                        onClick={() => setShowProgress(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-1)', fontSize: '24px', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <h3 style={{ color: 'var(--text-0)', marginBottom: '8px' }}>Signups ({progressData.signups?.length || 0})</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {progressData.signups?.map((s: any) => (
                          <div key={s.fid} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <img src={s.pfp_url || DEFAULT_PFP} alt={s.display_name || s.username} style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-0)' }}>{s.display_name || s.username || `FID ${s.fid}`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {progressData.rounds?.map((round: any) => (
                      <div key={round.id} style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: '6px' }}>
                        <h3 style={{ color: 'var(--text-0)', marginBottom: '8px' }}>Round {round.round_number} (Group Size: {round.group_size}, Status: {round.status})</h3>
                        {round.groups?.map((group: any) => (
                          <div key={group.id} style={{ marginBottom: '8px', padding: '8px', background: 'var(--bg-1)', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <strong style={{ color: 'var(--text-0)' }}>Group {group.group_number}</strong>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>Status: {group.status}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginBottom: '4px' }}>
                              Members: {group.members?.map((m: any) => m.display_name || m.username || `FID ${m.fid}`).join(', ')}
                            </div>
                            {group.votes && group.votes.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>
                                Votes: {group.votes.map((v: any) => `FID ${v.voterFid} → FID ${v.votedForFid}`).join(', ')}
                              </div>
                            )}
                            {group.status === 'completed' && group.winner_fid && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--fire-1)', marginTop: '4px' }}>
                                Winner: FID {group.winner_fid}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
