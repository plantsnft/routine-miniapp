'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getBaseScanTxUrl } from '~/lib/explorer';
import { formatStakingRequirement } from '~/lib/format-prize';
import { PlayerListInline } from '~/components/PlayerListInline';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';
import { formatRelativeTime } from '~/lib/utils';
import { CreateStealNoStealRoundModal } from '~/components/CreateStealNoStealRoundModal';
import { CreateStealNoStealHeadsUpYouWinModal } from '~/components/CreateStealNoStealHeadsUpYouWinModal';
import { StealNoStealMatchChatModal } from '~/components/StealNoStealMatchChatModal';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';
import Image from 'next/image';

type Game = {
  id: string;
  title: string;
  prize_amount: number;
  decision_time_seconds: number;
  staking_min_amount?: number | null;
  status: string;
  current_round: number;
  started_at?: string;
  hasSignedUp?: boolean;
  settle_tx_hash?: string | null;
  min_players_to_start?: number | null;
  signup_closes_at?: string | null;
  start_condition?: string | null;
  signup_count?: number;
  whitelist_fids?: number[] | null;
  signups?: Array<{ fid: number; signed_up_at: string; username: string | null; display_name: string | null; pfp_url: string | null }>;
};

type MyMatch = {
  matchId: string;
  matchNumber: number;
  roundId: string;
  roundNumber: number;
  role: 'holder' | 'decider';
  briefcaseAmount: number;
  briefcaseLabel?: string | null;
  outcomeRevealedAt?: string | null;
  negotiationEndsAt: string;
  negotiationTimeRemaining: number;
  decisionDeadline: string;
  decisionTimeRemaining: number;
  timeRemaining: number;
  status: string;
  decision: string | null;
  winnerFid: number | null;
  opponent: { fid: number; username: string | null; display_name: string | null; pfp_url: string | null };
  canDecide: boolean;
  chatEnabled: boolean;
};

type Match = {
  id: string;
  match_number: number;
  player_a_fid: number;
  player_b_fid: number;
  briefcase_amount: number;
  briefcase_label?: string | null;
  outcome_revealed_at?: string | null;
  negotiation_ends_at?: string;
  decision_deadline: string;
  status: string;
  decision: string | null;
  winner_fid: number | null;
  playerA: { fid: number; username?: string | null; display_name?: string | null; pfp_url?: string | null };
  playerB: { fid: number; username?: string | null; display_name?: string | null; pfp_url?: string | null };
};

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

function formatDuration(seconds: number): string {
  const secs = Math.max(0, Math.floor(seconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

const HEADS_UP_TITLE = 'HEADS UP Steal or No Steal';
const STANDARD_TITLE = 'STEAL OR NO STEAL';

interface StealNoStealContentProps {
  variant?: 'standard' | 'heads_up';
}

function StealNoStealContent({ variant = 'standard' }: StealNoStealContentProps) {
  const searchParams = useSearchParams();
  const isHeadsUp = variant === 'heads_up';
  const gameTitle = isHeadsUp ? HEADS_UP_TITLE : STANDARD_TITLE;
  const activeApi = isHeadsUp ? '/api/steal-no-steal/games/active-heads-up' : '/api/steal-no-steal/games/active';
  const basePath = isHeadsUp ? '/heads-up-steal-no-steal' : '/steal-no-steal';
  const urlGameId = searchParams.get('gameId')?.trim() || null;
  const { token, status: authStatus } = useAuth();
  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myMatch, setMyMatch] = useState<MyMatch | null>(null);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [chatMessages, setChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  // Phase 17.1: Separate timers for negotiation and decision
  const [negotiationCountdown, setNegotiationCountdown] = useState<number>(0);
  const [decisionCountdown, setDecisionCountdown] = useState<number>(0);
  // Phase 17.2: Countdown for signup phase
  const [signupClosesCountdown, setSignupClosesCountdown] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [showSettleForm, setShowSettleForm] = useState(false);
  const [completingRound, setCompletingRound] = useState(false);
  const [settling, setSettling] = useState(false);
  const [winners, setWinners] = useState<Array<{ fid: string; amount: string }>>([{ fid: '', amount: '' }]);
  const [noPayout, setNoPayout] = useState(false);
  const [signupsList, setSignupsList] = useState<Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>>([]);
  const [loadingSignups, setLoadingSignups] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const [viewProgress, setViewProgress] = useState(false);
  const [selectedMatchChat, setSelectedMatchChat] = useState<{ matchId: string; label: string } | null>(null);
  const [showSignupCountModal, setShowSignupCountModal] = useState(false);
  const [revealingMatchId, setRevealingMatchId] = useState<string | null>(null);
  const [showHeadsUpYouWinModal, setShowHeadsUpYouWinModal] = useState(false);
  const [progressData, setProgressData] = useState<{ game: Game; signups: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>; rounds: Array<{ id: string; round_number: number; status: string; matches: Match[] }>; settlements: Array<{ winner_fid: number; prize_amount: number; position: number | null }> } | null>(null);
  const [tick, setTick] = useState(0);

  // Tick every second when we have active matches (for countdown display)
  useEffect(() => {
    const hasActive = allMatches.some((m) => m.status === 'active');
    if (!hasActive) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [allMatches, tick]);

  // view=progress from URL
  useEffect(() => {
    setViewProgress(searchParams.get('view') === 'progress');
  }, [searchParams]);

  // Load progress data when viewProgress is true
  useEffect(() => {
    if (!viewProgress || !selectedGameId || !token) return;
    const load = () => {
      authedFetch(`/api/steal-no-steal/games/${selectedGameId}/progress`, { method: 'GET' }, token)
        .then((r) => r.json())
        .then((res) => {
          if (res?.ok && res?.data) setProgressData(res.data);
        })
        .catch(() => {});
    };
    load();
  }, [viewProgress, selectedGameId, token]);

  // Deep link
  useEffect(() => {
    if (urlGameId) setSelectedGameId(urlGameId);
  }, [urlGameId]);

  // Load active games
  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        const [gamesRes, adminRes] = await Promise.all([
          fetch(activeApi).then((r) => r.json()),
          authStatus === 'authed' && token
            ? authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json())
            : Promise.resolve({ ok: true, data: { isAdmin: false } }),
        ]);

        if (gamesRes?.ok && Array.isArray(gamesRes?.data)) {
          setActiveGames(gamesRes.data);
          if (urlGameId) {
            setSelectedGameId(urlGameId);
          } else if (gamesRes.data.length > 0 && !selectedGameId) {
            setSelectedGameId(gamesRes.data[0].id);
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
  }, [authStatus, token, selectedGameId, urlGameId, activeApi]);

  // Load selected game
  useEffect(() => {
    if (!selectedGameId) return;
    const loadGame = async () => {
      try {
        const res = token
          ? await authedFetch(`/api/steal-no-steal/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json())
          : await fetch(`/api/steal-no-steal/games/${selectedGameId}`).then((r) => r.json());
        if (res?.ok && res?.data) {
          setGame(res.data);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load game');
      }
    };
    loadGame();
    const interval = setInterval(loadGame, 10000);
    return () => clearInterval(interval);
  }, [selectedGameId, token]);

  // Load my match
  useEffect(() => {
    if (!selectedGameId || !token || game?.status !== 'in_progress') {
      setMyMatch(null);
      return;
    }
    const loadMyMatch = async () => {
      try {
        const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/my-match`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && res?.data) {
          setMyMatch(res.data);
          setRoundId(res.data.roundId);
        } else {
          setMyMatch(null);
        }
      } catch {
        setMyMatch(null);
      }
    };
    loadMyMatch();
    const interval = setInterval(loadMyMatch, 3000);
    return () => clearInterval(interval);
  }, [selectedGameId, token, game?.status]);

  // Admin: load roundId from progress when not in a match (so admin can see match list)
  useEffect(() => {
    if (!selectedGameId || !token || !game || game.status !== 'in_progress' || !isAdmin) return;
    if (roundId || myMatch) return; // already have roundId from my-match
    const loadProgress = async () => {
      try {
        const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/progress`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && res?.data?.rounds) {
          const activeRound = (res.data.rounds as Array<{ id: string; status: string }>).find((r) => r.status === 'active');
          if (activeRound) setRoundId(activeRound.id);
        }
      } catch {
        // ignore
      }
    };
    void loadProgress();
    const interval = setInterval(loadProgress, 5000);
    return () => clearInterval(interval);
  }, [selectedGameId, token, game?.status, isAdmin, roundId, myMatch]);

  // Load all matches for current round (when roundId from my-match or progress)
  useEffect(() => {
    if (!selectedGameId || !roundId || !token) return;
    const loadMatches = async () => {
      try {
        const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/rounds/${roundId}/matches`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && res?.data?.matches) {
          setAllMatches(res.data.matches);
        }
      } catch {
        // ignore
      }
    };
    loadMatches();
    const interval = setInterval(loadMatches, 5000);
    return () => clearInterval(interval);
  }, [selectedGameId, roundId, token]);

  // Load chat messages
  useEffect(() => {
    if (!selectedGameId || !myMatch?.matchId || !token || !myMatch.chatEnabled) {
      setChatMessages([]);
      return;
    }
    const loadChat = async () => {
      try {
        const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/matches/${myMatch.matchId}/chat`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && Array.isArray(res.data)) {
          setChatMessages(res.data);
        }
      } catch {
        // ignore
      }
    };
    loadChat();
    const interval = setInterval(loadChat, 8000);
    return () => clearInterval(interval);
  }, [selectedGameId, myMatch?.matchId, myMatch?.chatEnabled, token]);

  // Phase 17.1: Countdown timers for negotiation and decision phases
  useEffect(() => {
    // Initialize both countdowns from API response
    setNegotiationCountdown(myMatch?.negotiationTimeRemaining ?? 0);
    setDecisionCountdown(myMatch?.decisionTimeRemaining ?? 0);
    setCountdown(myMatch?.timeRemaining ?? 0); // backward compat

    if (!myMatch?.status || myMatch.status !== 'active') {
      return;
    }

    const interval = setInterval(() => {
      setNegotiationCountdown((c) => Math.max(0, c - 1));
      setDecisionCountdown((c) => Math.max(0, c - 1));
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [myMatch?.negotiationTimeRemaining, myMatch?.decisionTimeRemaining, myMatch?.timeRemaining, myMatch?.matchId, myMatch?.status]);

  // Phase 17.2: Countdown to signup_closes_at when in signup phase
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
      const diff = closesAt - now;
      setSignupClosesCountdown(formatDuration(Math.floor(diff / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [game?.status, game?.signup_closes_at]);

  const handleSignup = async () => {
    if (!token || !selectedGameId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch('/api/steal-no-steal/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: selectedGameId }),
      }, token).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || 'Failed to sign up');
      // Refresh game
      const gameRes = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
      if (gameRes?.ok) setGame(gameRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sign up');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (decision: 'steal' | 'no_steal') => {
    if (!token || !myMatch?.matchId) return;
    setConfirmConfig({
      message: 'Are you sure? This cannot be changed once submitted.',
      onConfirm: async () => {
        setShowConfirmModal(false);
        setSubmitting(true);
        setError(null);
        try {
          const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/decide`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId: myMatch.matchId, decision }),
          }, token).then((r) => r.json());
          if (!res.ok) throw new Error(res.error || 'Failed to submit decision');
          setSuccessMessage(res.message || 'Decision submitted!');
          setShowSuccessModal(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to submit decision');
        } finally {
          setSubmitting(false);
        }
      },
    });
    setShowConfirmModal(true);
  };

  const handleSendMessage = async () => {
    if (!token || !myMatch?.matchId || !chatInput.trim()) return;
    setSendingMessage(true);
    try {
      await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/matches/${myMatch.matchId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatInput.trim() }),
      }, token);
      setChatInput('');
      // Refresh chat
      const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/matches/${myMatch.matchId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok) setChatMessages(res.data);
    } catch {
      // ignore
    } finally {
      setSendingMessage(false);
    }
  };

  const handleReactionClick = async (messageId: string, reaction: 'thumbs_up' | 'x' | 'fire' | 'scream') => {
    if (!token || !selectedGameId || !myMatch?.matchId) return;
    try {
      const res = await authedFetch(
        `/api/steal-no-steal/games/${selectedGameId}/matches/${myMatch.matchId}/chat/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      const chatRes = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/matches/${myMatch.matchId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (chatRes?.ok) setChatMessages(chatRes.data);
    } catch (e) {
      console.error('Failed to set reaction:', e);
    }
  };

  const handleStartGame = async () => {
    if (!token || !selectedGameId) return;
    setSubmitting(true);
    try {
      const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/start`, { method: 'POST' }, token).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || 'Failed to start');
      const gameRes = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
      if (gameRes?.ok) setGame(gameRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelGame = async () => {
    if (!token || !selectedGameId) return;
    setConfirmConfig({
      message: 'Are you sure you want to cancel this game? This cannot be undone.',
      onConfirm: async () => {
        setShowConfirmModal(false);
        setSubmitting(true);
        try {
          const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/cancel`, { method: 'POST' }, token).then((r) => r.json());
          if (!res.ok) throw new Error(res.error || 'Failed to cancel');
          setSuccessMessage('Game cancelled');
          setShowSuccessModal(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to cancel');
        } finally {
          setSubmitting(false);
        }
      },
    });
    setShowConfirmModal(true);
  };

  const handleCompleteRound = async () => {
    if (!token || !selectedGameId || !roundId) return;
    setConfirmConfig({
      message: `Complete Round ${game?.current_round}? This will timeout any remaining matches and advance to the next round.`,
      onConfirm: async () => {
        setShowConfirmModal(false);
        setCompletingRound(true);
        try {
          const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/rounds/${roundId}/complete`, { method: 'POST' }, token).then((r) => r.json());
          if (!res.ok) throw new Error(res.error || 'Failed to complete round');
          setSuccessMessage(`Round ${game?.current_round} completed!`);
          setShowSuccessModal(true);
          setRoundId(null);
          // Reload game
          const gameRes = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
          if (gameRes?.ok && gameRes?.data) {
            setGame(gameRes.data);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to complete round');
        } finally {
          setCompletingRound(false);
        }
      },
    });
    setShowConfirmModal(true);
  };

  const loadSignupsForSettle = async () => {
    if (!token || !selectedGameId) return;
    setLoadingSignups(true);
    try {
      const res = await authedFetch(`/api/steal-no-steal/games/${selectedGameId}/signups`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && Array.isArray(res?.data)) {
        setSignupsList(res.data);
        // Pre-select first signup if available
        if (res.data.length > 0 && winners[0].fid === '') {
          setWinners([{ fid: String(res.data[0].fid), amount: '' }]);
        }
      }
    } catch (e) {
      console.error('Failed to load signups:', e);
    } finally {
      setLoadingSignups(false);
    }
  };

  const handleSettle = async () => {
    if (!token || !selectedGameId) return;
    const validWinners = noPayout
      ? winners.filter(w => w.fid && !Number.isNaN(Number(w.fid)))
      : winners.filter(w => w.fid && w.amount && !isNaN(parseFloat(w.amount)) && parseFloat(w.amount) > 0);
    if (validWinners.length === 0) {
      setError(noPayout ? 'Please add at least one winner (FID)' : 'Please add at least one winner with a valid amount');
      return;
    }
    setConfirmConfig({
      message: noPayout
        ? `Record ${validWinners.length} winner${validWinners.length !== 1 ? 's' : ''} only (no BETR transfer)?`
        : `Settle game with ${validWinners.length} winner${validWinners.length !== 1 ? 's' : ''}? This will transfer BETR tokens.`,
      onConfirm: async () => {
        setShowConfirmModal(false);
        setSettling(true);
        try {
          const res = await authedFetch(
            `/api/steal-no-steal/games/${selectedGameId}/settle`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                winners: validWinners.map(w => ({ fid: Number(w.fid), amount: noPayout ? 0 : parseFloat(w.amount) })),
                confirmWinners: true,
                ...(noPayout && { noPayout: true }),
              }),
            },
            token
          ).then((r) => r.json());
          if (!res.ok) throw new Error(res.error || 'Failed to settle');
          if (game) {
            setGame({ ...game, settle_tx_hash: res.data?.settleTxHash ?? null, status: 'settled' });
          }
          setShowSettleForm(false);
          setWinners([{ fid: '', amount: '' }]);
          setNoPayout(false);
          setSuccessMessage('Game settled successfully!');
          setShowSuccessModal(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to settle');
        } finally {
          setSettling(false);
        }
      },
    });
    setShowConfirmModal(true);
  };

  const handleRoundCreated = (newRoundId: string) => {
    setRoundId(newRoundId);
    // Reload matches
    if (selectedGameId && token) {
      authedFetch(`/api/steal-no-steal/games/${selectedGameId}/rounds/${newRoundId}/matches`, { method: 'GET' }, token)
        .then((r) => r.json())
        .then((res) => {
          if (res?.ok && res?.data?.matches) {
            setAllMatches(res.data.matches);
          }
        })
        .catch(() => {});
    }
  };

  const handleRevealMatch = async (matchId: string) => {
    if (!token || !selectedGameId || !roundId) return;
    setRevealingMatchId(matchId);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/steal-no-steal/games/${selectedGameId}/matches/${matchId}/reveal`,
        { method: 'POST' },
        token
      ).then((r) => r.json());
      if (!res.ok) throw new Error(res.error || 'Failed to reveal');
      const matchesRes = await authedFetch(
        `/api/steal-no-steal/games/${selectedGameId}/rounds/${roundId}/matches`,
        { method: 'GET' },
        token
      ).then((r) => r.json());
      if (matchesRes?.ok && matchesRes?.data?.matches) {
        setAllMatches(matchesRes.data.matches);
      }
      const myMatchRes = await authedFetch(
        `/api/steal-no-steal/games/${selectedGameId}/my-match`,
        { method: 'GET' },
        token
      ).then((r) => r.json());
      if (myMatchRes?.ok && myMatchRes?.data) {
        setMyMatch(myMatchRes.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reveal');
    } finally {
      setRevealingMatchId(null);
    }
  };

  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import('~/lib/constants');
        const { buildShareText } = await import('~/lib/og-helpers');
        const url = APP_URL + `${basePath}${selectedGameId ? `?gameId=${selectedGameId}` : ''}`;
        const text = buildShareText(
          gameTitle,
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
      const url = APP_URL + `/steal-no-steal${selectedGameId ? `?gameId=${selectedGameId}` : ''}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      const { APP_URL } = await import('~/lib/constants');
      alert('Copy failed. URL: ' + (APP_URL + `/steal-no-steal${selectedGameId ? `?gameId=${selectedGameId}` : ''}`));
    }
  };

  const getCountdownColor = () => {
    if (countdown < 30) return '#ef4444';
    if (countdown < 60) return '#f59e0b';
    return 'var(--fire-1)';
  };

  if (authStatus === 'loading' || loading) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--text-1)' }}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!game && activeGames.length === 0) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <Link href="/clubs/hellfire/games" style={{ color: 'var(--fire-1)', marginBottom: '16px', display: 'inline-block' }}>
            ← Back to Games
          </Link>
          <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-0)' }}>{gameTitle}</h1>
          <p style={{ color: 'var(--text-1)', marginBottom: '16px' }}>No active games. Check back later!</p>
          {isAdmin && token && isHeadsUp && (
            <>
              <button
                onClick={() => setShowHeadsUpYouWinModal(true)}
                className="btn-primary"
                style={{ padding: '10px 16px', fontSize: '0.875rem' }}
              >
                Create HEADS UP
              </button>
              <CreateStealNoStealHeadsUpYouWinModal
                isOpen={showHeadsUpYouWinModal}
                onClose={() => setShowHeadsUpYouWinModal(false)}
                onSuccess={(newGameId) => {
                  setShowHeadsUpYouWinModal(false);
                  setSelectedGameId(newGameId);
                  fetch(activeApi)
                    .then((r) => r.json())
                    .then((res) => {
                      if (res?.ok && Array.isArray(res?.data)) setActiveGames(res.data);
                    })
                    .catch(() => {});
                }}
              />
            </>
          )}
        </div>
      </main>
    );
  }

  // View Full Progress (admin full page)
  if (viewProgress && selectedGameId) {
    if (!progressData) {
      return (
        <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
          <div className="max-w-4xl mx-auto">
            <Link href={`${basePath}?gameId=${selectedGameId}`} style={{ color: 'var(--fire-1)', marginBottom: '16px', display: 'inline-block' }}>
              ← Back to Game
            </Link>
            <p style={{ color: 'var(--text-1)' }}>Loading progress...</p>
          </div>
        </main>
      );
    }
    const prog = progressData;
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <Link href={`${basePath}?gameId=${selectedGameId}`} style={{ color: 'var(--fire-1)', marginBottom: '16px', display: 'inline-block' }}>
            ← Back to Game
          </Link>
          <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-0)' }}>Full Progress — {gameTitle}</h1>
          <div className="hl-card mb-4" style={{ padding: '16px' }}>
            <h3 style={{ color: 'var(--text-0)', marginBottom: '12px' }}>Game</h3>
            <p style={{ color: 'var(--text-1)' }}>Status: {prog.game.status} · Round: {prog.game.current_round}</p>
            <p style={{ color: 'var(--fire-1)' }}>Prize: {prog.game.prize_amount?.toLocaleString()} BETR</p>
          </div>
          <div className="hl-card mb-4" style={{ padding: '16px' }}>
            <h3 style={{ color: 'var(--text-0)', marginBottom: '12px' }}>Signups ({prog.signups?.length ?? 0})</h3>
            {prog.signups && prog.signups.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {prog.signups.map((s) => (
                  <div key={s.fid} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--bg-1)', borderRadius: '6px' }}>
                    <img src={s.pfp_url || DEFAULT_PFP} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                    <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>{s.display_name || s.username || `FID ${s.fid}`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No signups</p>
            )}
          </div>
          {prog.rounds && prog.rounds.length > 0 && (
            <div className="hl-card mb-4" style={{ padding: '16px' }}>
              <h3 style={{ color: 'var(--text-0)', marginBottom: '12px' }}>Rounds & Matches</h3>
              {prog.rounds.map((r) => (
                <div key={r.id} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--stroke)' }}>
                  <p style={{ color: 'var(--fire-1)', fontWeight: 600, marginBottom: '8px' }}>Round {r.round_number} — {r.status}</p>
                  {(r.matches || []).map((m: Match) => (
                    <div key={m.id} style={{ padding: '8px', background: 'var(--bg-1)', borderRadius: '6px', marginBottom: '6px', fontSize: '0.875rem' }}>
                      {m.playerA?.display_name || m.playerA?.username || `FID ${m.player_a_fid}`} vs {m.playerB?.display_name || m.playerB?.username || `FID ${m.player_b_fid}`}
                      <span style={{ color: 'var(--text-1)', marginLeft: '8px' }}>— {m.status} {m.decision ? `(${m.decision})` : ''}</span>
                      {m.winner_fid && <span style={{ color: 'var(--fire-1)', marginLeft: '8px' }}>Winner: FID {m.winner_fid}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {prog.settlements && prog.settlements.length > 0 && (
            <div className="hl-card mb-4" style={{ padding: '16px' }}>
              <h3 style={{ color: 'var(--text-0)', marginBottom: '12px' }}>Settlements</h3>
              {prog.settlements.map((s, i) => (
                <p key={i} style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>
                  #{s.position ?? i + 1}: FID {s.winner_fid} — {s.prize_amount?.toLocaleString()} BETR
                </p>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        <Link href="/clubs/hellfire/games" style={{ color: 'var(--fire-1)', marginBottom: '16px', display: 'inline-block' }}>
          ← Back to Games
        </Link>

        {game && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <Image src="/stealornosteal.png" alt={gameTitle} width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px' }} />
          </div>
        )}
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-0)' }}>{gameTitle}</h1>
        <p className="mb-4" style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>
          Which briefcase will take you to the finals? Only 2 people know the real truth....
        </p>

        {error && (
          <div className="mb-4 p-3" style={{ background: 'var(--ember-1)', color: 'var(--ember-2)', borderRadius: 'var(--radius-md)' }}>
            {error}
          </div>
        )}

        {game && (
          <div className="hl-card mb-4" style={{ padding: '16px' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold" style={{ color: 'var(--text-0)' }}>{game.title}</span>
              <span style={{ color: game.status === 'in_progress' ? 'var(--fire-1)' : 'var(--text-1)', fontSize: '0.875rem' }}>
                {game.status === 'signup' ? 'Signups Open' : game.status === 'in_progress' ? 'In Progress' : game.status}
              </span>
            </div>
            <p style={{ color: 'var(--fire-1)', fontSize: '1.25rem', fontWeight: 600 }}>
              Prize Pool: {game.prize_amount.toLocaleString()} BETR
            </p>
            {game.staking_min_amount && (
              <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>{formatStakingRequirement(game.staking_min_amount)}</p>
            )}
            {game.whitelist_fids != null && game.whitelist_fids.length > 0 && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '4px' }}>Invite-only · {game.whitelist_fids.length} players</p>
            )}
            <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>
              Decision Time: {Math.floor(game.decision_time_seconds / 60)} minutes
            </p>
            {game.signup_count !== undefined && (
              <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>{game.signup_count} players signed up</p>
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
                onClick={handleCopyGameUrl}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}
              >
                {linkCopied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>
        )}

        {/* Signup Phase */}
        {game?.status === 'signup' && (
          <div className="hl-card mb-4" style={{ padding: '16px' }}>
            {game.hasSignedUp ? (
              <p style={{ color: 'var(--fire-1)', fontWeight: 600 }}>✓ You&apos;ve signed up!</p>
            ) : (
              <button onClick={handleSignup} disabled={submitting} className="btn-primary">
                {submitting ? 'Signing up...' : 'Sign Up'}
              </button>
            )}
            {game.signups && game.signups.length > 0 && (
              <div className="mt-4">
                <PlayerListInline players={game.signups.map((s) => ({ fid: s.fid, username: s.username, display_name: s.display_name, pfp_url: s.pfp_url }))} />
              </div>
            )}
            {/* Phase 17.2: Start condition info */}
            {(game.start_condition || game.min_players_to_start || game.signup_closes_at) && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginTop: '12px' }}>
                Game starts: {game.start_condition === 'players'
                  ? `When ${game.min_players_to_start ?? 'N'} players sign up`
                  : game.start_condition === 'time' && game.signup_closes_at
                    ? `At ${new Date(game.signup_closes_at).toLocaleString()}`
                    : game.start_condition === 'either'
                      ? `When ${game.min_players_to_start ?? 'N'} players OR timer ends`
                      : '—'}
              </p>
            )}
            {/* Phase 17.2: Player progress if min_players set */}
            {game.min_players_to_start && (
              <p style={{ fontSize: '1.25rem', color: 'var(--fire-1)', fontWeight: 600, marginTop: '8px' }}>
                {game.signup_count ?? 0}/{game.min_players_to_start} players
              </p>
            )}
            {/* Phase 17.2: Countdown timer if signup_closes_at set */}
            {game.signup_closes_at && new Date(game.signup_closes_at).getTime() > Date.now() && (
              <p style={{ fontSize: '1.25rem', color: 'var(--fire-1)', fontWeight: 600, marginTop: '8px' }}>
                Signups close in: {signupClosesCountdown || '…'}
              </p>
            )}
            {isAdmin && (
              <div className="mt-4 flex gap-2 flex-wrap">
                {isHeadsUp && (
                  <button onClick={() => setShowHeadsUpYouWinModal(true)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.875rem', borderColor: 'var(--fire-1)', color: 'var(--fire-1)' }}>
                    Create HEADS UP
                  </button>
                )}
                <button onClick={() => setShowSignupCountModal(true)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.875rem' }}>
                  Signup count ({game.signup_count ?? game.signups?.length ?? 0})
                </button>
                <button onClick={handleStartGame} disabled={submitting || (game.signup_count || 0) < 2} className="btn-primary">
                  Start Game
                </button>
                <button onClick={handleCancelGame} disabled={submitting} className="btn-secondary" style={{ color: '#ef4444' }}>
                  Cancel Game
                </button>
              </div>
            )}
          </div>
        )}

        {/* In Progress - My Match */}
        {game?.status === 'in_progress' && myMatch && (
          <div className="hl-card mb-4" style={{ padding: '16px' }}>
            {/* Role indicator */}
            <div
              style={{
                background: myMatch.role === 'holder' ? 'var(--fire-1)' : '#f59e0b',
                color: '#000',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                marginBottom: '16px',
              }}
            >
              <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {myMatch.role === 'holder' ? '💼 YOU ARE THE HOLDER' : '🎯 YOU ARE THE DECIDER'}
              </p>
              <p style={{ fontSize: '0.875rem' }}>
                {myMatch.role === 'holder'
                  ? (myMatch.briefcaseLabel === 'YOU WIN'
                      ? 'Convince the other person NOT to steal. If you keep the case you will WIN.'
                      : 'Convince the other person to take the case. If you keep the case you will LOSE. Get the other person to take your case.')
                  : 'Will you STEAL or leave it?'}
              </p>
            </div>

            {/* Briefcase: holder sees image + hint; decider sees nothing (YOU WIN) or amount (YOU LOSE) */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              {myMatch.role === 'holder' ? (
                myMatch.briefcaseLabel === 'YOU WIN' ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/youwin.png" alt="" style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-md)' }} />
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--fire-1)', marginTop: '8px' }}>
                      {myMatch.briefcaseAmount.toLocaleString()} BETR
                    </p>
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--fire-1)', marginTop: '4px' }}>
                      If they do not steal you will win.
                    </p>
                  </>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/youlose.png" alt="" style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--radius-md)' }} />
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--fire-1)', marginTop: '8px' }}>
                      If they do not steal you will lose.
                    </p>
                  </>
                )
              ) : (
                myMatch.briefcaseLabel === 'YOU WIN' ? (
                  <p style={{ fontSize: '1rem', color: 'var(--text-1)' }}>Will you STEAL or leave it?</p>
                ) : (
                  <>
                    <div style={{ fontSize: '4rem' }}>💼</div>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--fire-1)' }}>
                      {myMatch.briefcaseAmount.toLocaleString()} BETR
                    </p>
                  </>
                )
              )}
            </div>

            {/* Phase 17.1: Two-phase timer */}
            {myMatch.status === 'active' && (
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                {negotiationCountdown > 0 ? (
                  <>
                    <p style={{ fontSize: '0.875rem', color: 'var(--fire-1)' }}>🗣️ Negotiation Time</p>
                    <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--fire-1)' }}>
                      {formatDuration(negotiationCountdown)}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '4px' }}>
                      {myMatch.role === 'decider'
                        ? 'Decision available when timer ends'
                        : (myMatch.briefcaseLabel === 'YOU WIN'
                            ? 'Convince the other person NOT to steal in order to win.'
                            : 'Convince the other person to take the case. If you keep the case you will LOSE.')}
                    </p>
                  </>
                ) : decisionCountdown > 0 ? (
                  <>
                    <p style={{ fontSize: '0.875rem', color: '#ef4444' }}>⚡ DECISION TIME</p>
                    <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#ef4444' }}>
                      {formatDuration(decisionCountdown)}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '4px' }}>
                      {myMatch.role === 'decider' ? 'Make your decision now!' : 'Waiting for decision...'}
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: '1rem', color: '#ef4444', fontWeight: 600 }}>⏰ Time expired</p>
                )}
              </div>
            )}

            {/* Opponent */}
            <div className="flex items-center gap-3 mb-4" style={{ padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)' }}>
              <img
                src={myMatch.opponent.pfp_url || DEFAULT_PFP}
                alt=""
                style={{ width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}
                onClick={() => openFarcasterProfile(myMatch.opponent.fid, myMatch.opponent.username)}
              />
              <div>
                <p style={{ color: 'var(--text-0)', fontWeight: 600, cursor: 'pointer' }} onClick={() => openFarcasterProfile(myMatch.opponent.fid, myMatch.opponent.username)}>
                  {myMatch.opponent.display_name || myMatch.opponent.username || `FID: ${myMatch.opponent.fid}`}
                </p>
                <p style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>
                  {myMatch.role === 'holder' ? 'The Decider' : 'The Holder'}
                </p>
              </div>
            </div>

            {/* Decision outcome: YOU LOSE always shown; YOU WIN only when outcomeRevealedAt set */}
            {myMatch.status !== 'active' && (
              <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                {(myMatch.briefcaseLabel !== 'YOU WIN' || myMatch.outcomeRevealedAt) ? (
                  <>
                    {myMatch.status === 'decided' && (
                      <>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: myMatch.decision === 'steal' ? '#ef4444' : 'var(--fire-1)' }}>
                          {myMatch.decision === 'steal' ? '🔥 STOLEN!' : '🤝 NO STEAL'}
                        </p>
                        <p style={{ color: 'var(--text-1)' }}>
                          {myMatch.briefcaseLabel === 'YOU WIN'
                            ? (myMatch.decision === 'steal'
                                ? (myMatch.role === 'holder' ? 'You lose!' : 'You win!')
                                : (myMatch.role === 'holder' ? 'You win!' : 'You lose!'))
                            : (myMatch.decision === 'steal'
                                ? (myMatch.role === 'holder' ? 'You win!' : 'You lose!')
                                : (myMatch.role === 'holder' ? 'You lose!' : 'You win!'))}
                        </p>
                      </>
                    )}
                    {myMatch.status === 'timeout' && (
                      <>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--fire-1)' }}>⏰ TIME&apos;S UP!</p>
                        <p style={{ color: 'var(--text-1)' }}>
                          {myMatch.briefcaseLabel === 'YOU WIN'
                            ? (myMatch.role === 'holder' ? 'You win! (You kept the case)' : 'You lose! (Holder kept the case)')
                            : (myMatch.role === 'holder' ? 'You lose! (You kept the case)' : 'You win! (Holder kept the case)')}
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <p style={{ color: 'var(--text-1)' }}>Waiting for admin to reveal outcome.</p>
                )}
              </div>
            )}

            {/* Decision buttons (Player B only) */}
            {myMatch.canDecide && (
              <div className="flex gap-4 justify-center mb-4">
                <button
                  onClick={() => handleDecision('steal')}
                  disabled={submitting}
                  style={{
                    padding: '16px 32px',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  🔥 STEAL
                </button>
                <button
                  onClick={() => handleDecision('no_steal')}
                  disabled={submitting}
                  style={{
                    padding: '16px 32px',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    background: 'var(--fire-1)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  🤝 NO STEAL
                </button>
              </div>
            )}

            {/* Chat */}
            {myMatch.chatEnabled && (
              <div style={{ border: '1px solid var(--stroke)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg-1)', borderBottom: '1px solid var(--stroke)' }}>
                  <p style={{ color: 'var(--fire-1)', fontWeight: 600, fontSize: '0.875rem' }}>💬 Chat</p>
                </div>
                <div ref={chatRef} style={{ height: '200px', overflowY: 'auto', padding: '8px', background: 'var(--bg-2)' }}>
                  {chatMessages.length === 0 ? (
                    <p style={{ color: 'var(--fire-2)', fontSize: '0.875rem', textAlign: 'center', paddingTop: '20px' }}>
                      No messages yet. Start the conversation!
                    </p>
                  ) : (
                    chatMessages.map((msg) => (
                      <MessageWithReactions
                        key={msg.id}
                        message={msg}
                        onReactionClick={(messageId, reaction) => handleReactionClick(messageId, reaction)}
                      />
                    ))
                  )}
                </div>
                <div style={{ padding: '8px', background: 'var(--bg-1)', display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--stroke)', background: 'var(--bg-2)', color: 'var(--fire-1)' }}
                  />
                  <button onClick={handleSendMessage} disabled={sendingMessage || !chatInput.trim()} className="btn-primary" style={{ padding: '8px 16px' }}>
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* All Matches */}
        {game?.status === 'in_progress' && allMatches.length > 0 && (
          <div className="hl-card" style={{ padding: '16px' }}>
            <h3 style={{ color: 'var(--text-0)', fontWeight: 600, marginBottom: '12px' }}>
              Round {game.current_round} Matches
              {allMatches.length > 0 && (
                <span style={{ color: 'var(--text-1)', fontSize: '0.875rem', fontWeight: 400, marginLeft: '8px' }}>
                  ({allMatches.filter((a) => a.winner_fid).length} of {allMatches.length} decided)
                </span>
              )}
            </h3>
            {allMatches.map((m) => {
              const now = Date.now(); // Re-computed on each tick for active matches
              const negEnd = m.negotiation_ends_at ? new Date(m.negotiation_ends_at).getTime() : 0;
              const decEnd = new Date(m.decision_deadline).getTime();
              let countdownStr = '';
              if (m.status === 'active' && negEnd) {
                if (now < negEnd) {
                  const s = Math.max(0, Math.floor((negEnd - now) / 1000));
                  countdownStr = `Negotiation: ${formatDuration(s)}`;
                } else if (now < decEnd) {
                  const s = Math.max(0, Math.floor((decEnd - now) / 1000));
                  countdownStr = `Decision: ${formatDuration(s)}`;
                } else {
                  countdownStr = 'Expired';
                }
              }
              const winnerFid = m.winner_fid ? Number(m.winner_fid) : null;
              return (
                <div
                  key={m.id}
                  style={{
                    padding: '12px',
                    background: 'var(--bg-1)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '8px',
                    border: winnerFid ? '2px solid var(--fire-1)' : undefined,
                    boxShadow: winnerFid ? '0 0 10px rgba(0, 255, 200, 0.3)' : undefined,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={m.playerA?.pfp_url || DEFAULT_PFP} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                      <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>
                        {m.playerA?.display_name || m.playerA?.username || `FID: ${m.player_a_fid}`}
                      </span>
                      <span style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>vs</span>
                      <img src={m.playerB?.pfp_url || DEFAULT_PFP} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                      <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>
                        {m.playerB?.display_name || m.playerB?.username || `FID: ${m.player_b_fid}`}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: m.status === 'active' ? 'var(--fire-1)' : m.decision === 'steal' ? '#ef4444' : 'var(--fire-2)',
                          color: m.status === 'active' ? '#000' : '#fff',
                        }}
                      >
                        {m.status === 'active' ? 'In Progress' : m.status === 'timeout' ? 'Timeout' : m.decision === 'steal' ? 'STEAL' : 'NO STEAL'}
                      </span>
                      {countdownStr && (
                        <p style={{ color: 'var(--fire-1)', fontSize: '0.75rem', marginTop: '4px', fontWeight: 600 }}>
                          {countdownStr}
                        </p>
                      )}
                      <p style={{ color: 'var(--fire-1)', fontSize: '0.75rem', marginTop: '4px' }}>
                        {m.briefcase_amount.toLocaleString()} BETR
                      </p>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedMatchChat({ matchId: m.id, label: `Match ${m.match_number}: ${m.playerA?.display_name || m.playerA?.username || `FID ${m.player_a_fid}`} vs ${m.playerB?.display_name || m.playerB?.username || `FID ${m.player_b_fid}`}` })}
                            style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '4px', color: 'var(--fire-1)', cursor: 'pointer' }}
                          >
                            View Chat
                          </button>
                          {m.briefcase_label === 'YOU WIN' && m.status !== 'active' && m.status !== 'pending' && !m.outcome_revealed_at && (
                            <button
                              type="button"
                              onClick={() => handleRevealMatch(m.id)}
                              disabled={revealingMatchId === m.id}
                              style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'var(--fire-1)', border: '1px solid var(--fire-1)', borderRadius: '4px', color: '#000', cursor: revealingMatchId === m.id ? 'not-allowed' : 'pointer', opacity: revealingMatchId === m.id ? 0.7 : 1 }}
                            >
                              {revealingMatchId === m.id ? 'Revealing...' : 'Reveal'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Admin Controls (in_progress) */}
        {game?.status === 'in_progress' && isAdmin && (
          <div className="hl-card mt-4" style={{ padding: '16px' }}>
            <h3 style={{ color: 'var(--text-0)', fontWeight: 600, marginBottom: '12px' }}>Admin Controls</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isHeadsUp && (
                <button
                  onClick={() => setShowHeadsUpYouWinModal(true)}
                  className="btn-secondary"
                  style={{ borderColor: 'var(--fire-1)', color: 'var(--fire-1)' }}
                >
                  Create HEADS UP
                </button>
              )}
              {/* Start Round button - only when no active round */}
              {!roundId && (
                <button
                  onClick={() => setShowRoundModal(true)}
                  className="btn-primary"
                  style={{ width: '100%' }}
                >
                  Start Round {game.current_round}
                </button>
              )}

              {/* Complete Round button - when round exists */}
              {roundId && allMatches.length > 0 && (
                <button
                  onClick={handleCompleteRound}
                  disabled={completingRound}
                  className="btn-primary"
                  style={{ width: '100%', background: 'var(--fire-1)' }}
                >
                  {completingRound ? 'Completing...' : `Complete Round ${game.current_round}`}
                </button>
              )}

              {/* End & Settle button */}
              {!showSettleForm && (
                <button
                  onClick={() => {
                    setShowSettleForm(true);
                    loadSignupsForSettle();
                  }}
                  className="btn-primary"
                  style={{ width: '100%', background: 'var(--fire-1)' }}
                >
                  End &amp; Settle Game
                </button>
              )}

              {/* Cancel Game button */}
              <button
                onClick={handleCancelGame}
                disabled={submitting}
                className="btn-secondary"
                style={{ width: '100%', color: '#ef4444' }}
              >
                Cancel Game
              </button>

              {/* View Full Progress button */}
              <button
                onClick={() => {
                  setViewProgress(true);
                  if (selectedGameId && token) {
                    authedFetch(`/api/steal-no-steal/games/${selectedGameId}/progress`, { method: 'GET' }, token)
                      .then((r) => r.json())
                      .then((res) => {
                        if (res?.ok && res?.data) setProgressData(res.data);
                      })
                      .catch(() => {});
                  }
                }}
                className="btn-secondary"
                style={{ width: '100%' }}
              >
                View Full Progress
              </button>
            </div>

            {/* Settle Form */}
            {showSettleForm && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ color: 'var(--text-0)', marginBottom: '12px' }}>Settle Winners</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={noPayout}
                    onChange={(e) => setNoPayout(e.target.checked)}
                  />
                  <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>No payout (winners/eliminated only)</span>
                </label>
                {loadingSignups ? (
                  <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>Loading players...</p>
                ) : (
                  <>
                    {winners.map((w, idx) => {
                      const selectedPlayer = signupsList.find(s => String(s.fid) === w.fid);
                      return (
                        <div key={idx} style={{ marginBottom: '12px', padding: '8px', background: 'var(--bg-2)', borderRadius: '6px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <select
                              value={w.fid}
                              onChange={(e) => {
                                const newWinners = [...winners];
                                newWinners[idx].fid = e.target.value;
                                setWinners(newWinners);
                              }}
                              style={{
                                flex: 1,
                                padding: '8px',
                                borderRadius: '6px',
                                border: '1px solid var(--stroke)',
                                background: 'var(--bg-1)',
                                color: 'var(--text-0)',
                              }}
                            >
                              <option value="">Select winner...</option>
                              {signupsList.map(s => (
                                <option key={s.fid} value={String(s.fid)}>
                                  {s.display_name || s.username || `FID ${s.fid}`}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <img
                                src={selectedPlayer.pfp_url || DEFAULT_PFP}
                                alt=""
                                style={{ width: 24, height: 24, borderRadius: '50%' }}
                              />
                              <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>
                                {selectedPlayer.display_name || selectedPlayer.username || `FID ${selectedPlayer.fid}`}
                              </span>
                            </div>
                          )}
                          {!noPayout && (
                            <input
                              type="number"
                              placeholder="Amount (BETR)"
                              value={w.amount}
                              onChange={(e) => {
                                const newWinners = [...winners];
                                newWinners[idx].amount = e.target.value;
                                setWinners(newWinners);
                              }}
                              style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '6px',
                                border: '1px solid var(--stroke)',
                                background: 'var(--bg-1)',
                                color: 'var(--text-0)',
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => setWinners([...winners, { fid: '', amount: '' }])}
                      className="btn-secondary"
                      style={{ width: '100%', marginBottom: '12px' }}
                    >
                      Add Winner
                    </button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          setShowSettleForm(false);
                          setWinners([{ fid: '', amount: '' }]);
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSettle}
                        disabled={settling}
                        className="btn-primary"
                        style={{ flex: 1 }}
                      >
                        {settling ? 'Settling...' : 'Confirm & Settle'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settled Phase */}
        {game?.status === 'settled' && (
          <div className="hl-card mb-4" style={{ padding: '16px' }}>
            <h3 style={{ color: 'var(--text-0)', fontWeight: 600, marginBottom: '12px' }}>Game Settled</h3>
            
            <div style={{ padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
              <p style={{ color: 'var(--fire-1)', fontSize: '1.25rem', fontWeight: 600 }}>
                Prize Pool: {game.prize_amount.toLocaleString()} BETR
              </p>
            </div>

            {game.settle_tx_hash && getBaseScanTxUrl(game.settle_tx_hash) && (
              <div style={{ padding: '12px', background: 'var(--bg-1)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '8px' }}>Settlement Transaction</p>
                <a
                  href={getBaseScanTxUrl(game.settle_tx_hash) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--fire-1)',
                    textDecoration: 'underline',
                    fontSize: '0.875rem',
                    wordBreak: 'break-all',
                  }}
                >
                  View on BaseScan →
                </a>
              </div>
            )}
            {game.status === 'settled' && !game.settle_tx_hash && (
              <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginTop: '8px' }}>No payout – winners/eliminated only.</p>
            )}
          </div>
        )}

        {/* Round Setup Modal */}
        {game && token && (
          <CreateStealNoStealRoundModal
            isOpen={showRoundModal}
            onClose={() => setShowRoundModal(false)}
            onSuccess={handleRoundCreated}
            gameId={game.id}
            currentRound={game.current_round}
            prizeAmount={game.prize_amount}
            token={token}
          />
        )}

        {/* Phase 17.7: Create HEADS UP Modal (heads_up variant only) */}
        {token && isHeadsUp && (
          <CreateStealNoStealHeadsUpYouWinModal
            isOpen={showHeadsUpYouWinModal}
            onClose={() => setShowHeadsUpYouWinModal(false)}
            onSuccess={(newGameId) => {
              setShowHeadsUpYouWinModal(false);
              setSelectedGameId(newGameId);
              fetch(activeApi)
                .then((r) => r.json())
                .then((res) => {
                  if (res?.ok && Array.isArray(res?.data)) setActiveGames(res.data);
                })
                .catch(() => {});
            }}
          />
        )}

        {/* Confirm Modal */}
        {showConfirmModal && confirmConfig && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <div className="hl-card" style={{ padding: '24px', maxWidth: '90%', width: '400px' }}>
              <p style={{ color: 'var(--text-0)', marginBottom: '16px' }}>{confirmConfig.message}</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowConfirmModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={confirmConfig.onConfirm} className="btn-primary">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccessModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <div className="hl-card" style={{ padding: '24px', maxWidth: '90%', width: '400px', textAlign: 'center' }}>
              <p style={{ color: 'var(--fire-1)', fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>✓ {successMessage}</p>
              <button onClick={() => setShowSuccessModal(false)} className="btn-primary">OK</button>
            </div>
          </div>
        )}

        {/* Phase 17.6: Admin View Chat per match */}
        {selectedMatchChat && (game?.id ?? selectedGameId) && token && (
          <StealNoStealMatchChatModal
            gameId={game?.id ?? selectedGameId ?? ''}
            matchId={selectedMatchChat.matchId}
            matchLabel={selectedMatchChat.label}
            isOpen={!!selectedMatchChat}
            onClose={() => setSelectedMatchChat(null)}
          />
        )}

        {/* Phase 17.6: Signup count modal (admin only, signup phase) */}
        {showSignupCountModal && game?.status === 'signup' && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowSignupCountModal(false)}
            role="presentation"
          >
            <div
              className="hl-card"
              style={{ padding: '24px', maxWidth: '90%', width: '400px', maxHeight: '80vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Signup count"
            >
              <h3 style={{ color: 'var(--fire-1)', margin: '0 0 16px', fontSize: '1.125rem' }}>Signups ({game.signups?.length ?? game.signup_count ?? 0})</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(game.signups ?? []).map((s) => (
                  <li key={s.fid} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={s.pfp_url || DEFAULT_PFP} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                    <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>
                      {s.display_name || s.username || `FID ${s.fid}`}
                    </span>
                    <span style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>FID {s.fid}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => setShowSignupCountModal(false)} className="btn-primary" style={{ marginTop: '16px', width: '100%' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

interface StealNoStealClientProps {
  variant?: 'standard' | 'heads_up';
}

export default function StealNoStealClient({ variant = 'standard' }: StealNoStealClientProps) {
  return (
    <Suspense fallback={<div className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}><p style={{ color: 'var(--text-1)' }}>Loading...</p></div>}>
      <StealNoStealContent variant={variant} />
    </Suspense>
  );
}
