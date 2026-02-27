'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import type { Club, Game } from '~/lib/types';
import { getEffectiveMaxParticipants, getGameBadges } from '~/lib/game-registration';
import { RegistrationInfoBadge } from '~/components/RegistrationInfoBadge';
import { JoinHellfireBanner } from '~/components/JoinHellfireBanner';
import { AdminRequests } from '~/components/AdminRequests';
import { HELLFIRE_CLUB_SLUG, CLUBGG_LINK, SUPERBOWL_WEEKEND_MODE } from '~/lib/constants';
import { PaymentButton } from '~/components/PaymentButton';
import { ParticipantListModal } from '~/components/ParticipantListModal';
import { GameCountdownTimer } from '~/components/GameCountdownTimer';
import { isPaidGame } from '~/lib/games';
import { FloatingEggEmojis } from '~/components/FloatingEggEmojis';
import { formatPrizeWithCurrency, formatStakingRequirement } from '~/lib/format-prize';
import { getIsAdminCached } from '~/lib/adminStatusCache';
import { RegisterForBetrGamesModal } from '~/components/RegisterForBetrGamesModal';
import { OptOutConfirmationModal } from '~/components/OptOutConfirmationModal';
import { CreateBetrGuesserGameModal } from '~/components/CreateBetrGuesserGameModal';
import { CreateBuddyUpGameModal } from '~/components/CreateBuddyUpGameModal';
import { CreateTheMoleGameModal } from '~/components/CreateTheMoleGameModal';
import { CreateStealNoStealGameModal } from '~/components/CreateStealNoStealGameModal';
import { CreateSuperbowlSquaresGameModal } from '~/components/CreateSuperbowlSquaresGameModal';
import { CreateSuperbowlPropsGameModal } from '~/components/CreateSuperbowlPropsGameModal';
import { LobbyChatModal } from '~/components/LobbyChatModal';
import { FeedbackPopupModal } from '~/components/FeedbackPopupModal';
import { SundayHighStakesSubmitPopup } from '~/components/SundayHighStakesSubmitPopup';
import { Pin } from 'lucide-react';

const BULLIED_BY_BETR_GAME_ID = 'a47b5a0e-c614-47c3-b267-64c932838f05';

// Wrapper component to auto-trigger payment when game is set
function PaymentButtonWrapper({ 
  game, 
  playerFid, 
  onSuccess, 
  onError,
  buttonRef 
}: { 
  game: Game; 
  playerFid: number; 
  onSuccess: (txHash: string, password: string | null) => void;
  onError: (error: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  useEffect(() => {
    // Auto-trigger payment when component mounts (after a small delay to ensure button is rendered)
    const timer = setTimeout(() => {
      if (buttonRef.current) {
        buttonRef.current.click();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [buttonRef]);

  return (
    <div style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
      <PaymentButton
        game={game}
        playerFid={playerFid}
        onSuccess={onSuccess}
        onError={onError}
        buttonRef={buttonRef}
      />
    </div>
  );
}

export default function ClubGamesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { token, fid, status: authStatus, retry } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [participantCountsByGame, setParticipantCountsByGame] = useState<Record<string, number>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [showAdminRequests, setShowAdminRequests] = useState(false);
  const [selectedGameForParticipants, setSelectedGameForParticipants] = useState<Game | null>(null);
  const [gameForPayment, setGameForPayment] = useState<Game | null>(null);
  const paymentButtonRef = useRef<HTMLButtonElement>(null);
  const betrGamesRef = useRef<HTMLDivElement>(null);
  const betrPokerRef = useRef<HTMLDivElement>(null);

  // BETR GAMES registration gate (homepage BETR GAMES section)
  const [betrGamesRegistered, setBetrGamesRegistered] = useState<boolean | null>(null);
  const [betrGamesRegistering, setBetrGamesRegistering] = useState(false);
  const [betrGamesModalOpen, setBetrGamesModalOpen] = useState(false);
  const [betrGamesModalError, setBetrGamesModalError] = useState(false);
  const [betrGamesModalAlreadyRegistered, setBetrGamesModalAlreadyRegistered] = useState(false);
  const [betrGamesModalErrorReason, setBetrGamesModalErrorReason] = useState<'generic' | 'insufficient_stake' | 'registration_closed' | undefined>(undefined);
  const [betrGamesModalStakedAmount, setBetrGamesModalStakedAmount] = useState<string | undefined>(undefined);
  const [betrGamesApproved, setBetrGamesApproved] = useState(false);
  // Phase 25: Rejected state from status API — must branch status card so rejected users see rejection message, not "Awaiting approval"
  const [betrGamesRejected, setBetrGamesRejected] = useState(false);
  // Phase 25: Bump to refetch status after opt-out when canReregister is false (rejected user)
  const [betrGamesStatusKey, setBetrGamesStatusKey] = useState(0);
  // Phase 25: Opt-out modal state
  const [optOutModalOpen, setOptOutModalOpen] = useState(false);
  const [optingOut, setOptingOut] = useState(false);
  // Phase 22.9: Registration closed state (from status API — tournament started)
  const [registrationClosed, setRegistrationClosed] = useState(false);
  // Phase 22.10: Tournament status and alive count (when registration closed)
  const [tournamentStatus, setTournamentStatus] = useState<'alive' | 'eliminated' | 'quit' | null>(null);
  const [aliveCount, setAliveCount] = useState(0);
  const [aliveModalOpen, setAliveModalOpen] = useState(false);
  const [alivePlayers, setAlivePlayers] = useState<{ fid: number; username: string; display_name: string; pfp_url: string }[]>([]);
  const [alivePlayersLoading, setAlivePlayersLoading] = useState(false);
  const [profileOverlayUrl, setProfileOverlayUrl] = useState<string | null>(null);
  // Phase 22: Mini app prompt popup
  const [showMiniAppPrompt, setShowMiniAppPrompt] = useState(false);
  const [hasMiniAppAdded, setHasMiniAppAdded] = useState<boolean | null>(null);
  const [remixHistory, setRemixHistory] = useState<{ round_label: string | null; chosen_at: string; winners: { fid: number; amount: number; position: number; username?: string; display_name?: string }[] }[]>([]);
  const [remixHistoryLoading, setRemixHistoryLoading] = useState(false);
  const [betrGuesserGames, setBetrGuesserGames] = useState<any[]>([]);
  const [betrGuesserHistory, setBetrGuesserHistory] = useState<any[]>([]);
  const [createBetrGuesserModalOpen, setCreateBetrGuesserModalOpen] = useState(false);
  const [betrGuesserCountdown, setBetrGuesserCountdown] = useState<string>('');
  const [buddyUpGames, setBuddyUpGames] = useState<any[]>([]);
  const [buddyUpHistory, setBuddyUpHistory] = useState<any[]>([]);
  const [createBuddyUpModalOpen, setCreateBuddyUpModalOpen] = useState(false);
  const [moleGames, setMoleGames] = useState<any[]>([]);
  const [moleHistory, setMoleHistory] = useState<any[]>([]);
  const [createMoleModalOpen, setCreateMoleModalOpen] = useState(false);
  const [stealNoStealGames, setStealNoStealGames] = useState<any[]>([]);
  const [headsUpGames, setHeadsUpGames] = useState<any[]>([]);
  const [stealNoStealHistory, setStealNoStealHistory] = useState<any[]>([]);
  const [createStealNoStealModalOpen, setCreateStealNoStealModalOpen] = useState(false);
  const [remixBetrRounds, setRemixBetrRounds] = useState<any[]>([]);
  const [remixBetrCountdown, setRemixBetrCountdown] = useState<string>('');
  const [weekendGameRounds, setWeekendGameRounds] = useState<any[]>([]);
  const [bulliedGames, setBulliedGames] = useState<any[]>([]);
  const [bulliedStatusActiveGames, setBulliedStatusActiveGames] = useState<{ gameId: string; unreadChatCount?: number }[]>([]);
  const [bulliedHistory, setBulliedHistory] = useState<any[]>([]);
  const [inOrOutGames, setInOrOutGames] = useState<any[]>([]);
  const [takeFromThePileGames, setTakeFromThePileGames] = useState<any[]>([]);
  const [killOrKeepGames, setKillOrKeepGames] = useState<any[]>([]);
  const [nlHoldemGames, setNlHoldemGames] = useState<any[]>([]);
  // Super Bowl Squares
  const [superbowlSquaresGames, setSuperbowlSquaresGames] = useState<any[]>([]);
  const [superbowlSquaresHistory, setSuperbowlSquaresHistory] = useState<any[]>([]);
  const [createSuperbowlSquaresModalOpen, setCreateSuperbowlSquaresModalOpen] = useState(false);
  // Phase 26: Super Bowl Props
  const [superbowlPropsGame, setSuperbowlPropsGame] = useState<any>(null);
  const [createSuperbowlPropsModalOpen, setCreateSuperbowlPropsModalOpen] = useState(false);
  // Phase 39: Art Contest
  const [artContestActive, setArtContestActive] = useState<{ id: string; title?: string; status: string } | null>(null);
  // Phase 42: SUNDAY HIGH STAKES ARE BETR
  const [sundayHighStakesActive, setSundayHighStakesActive] = useState<{ id: string; title?: string; status: string; starts_at?: string | null } | null>(null);
  const [showShsSubmitPopup, setShowShsSubmitPopup] = useState(false);
  // Phase 41: NCAA HOOPS
  const [ncaaHoopsActive, setNcaaHoopsActive] = useState<{ id: string; title?: string; status: string } | null>(null);
  // Phase 18.2: Removed showInactiveBetrGames - admin uses dashboard instead
  const [showRegistrationOverlay, setShowRegistrationOverlay] = useState(true);
  // Phase 19: Lobby Chat
  const [hasLobbyChatAccess, setHasLobbyChatAccess] = useState(false);
  const [lobbyInChatCount, setLobbyInChatCount] = useState<number | null>(null);
  const [lobbyUnreadCount, setLobbyUnreadCount] = useState<number | null>(null);
  const [showLobbyChatModal, setShowLobbyChatModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [signInOverlayDismissed, setSignInOverlayDismissed] = useState(false);

  useEffect(() => {
    if (authStatus === 'loading') {
      // Still loading - wait
      setLoading(true);
      setError(null);
      return;
    }

    if (authStatus === 'authed' && token) {
      loadData();
    } else if (authStatus === 'error') {
      // Auth failed - show retry option
      setError(null); // Clear any previous errors
      setLoading(false);
    }
  }, [slug, authStatus, token, fid]);

  useEffect(() => {
    if (showHistory) {
      setRemixHistoryLoading(true);
      Promise.all([
        fetch('/api/remix-betr/history').then((r) => r.json()),
        fetch('/api/betr-guesser/history').then((r) => r.json()),
        fetch('/api/buddy-up/history').then((r) => r.json()),
        fetch('/api/the-mole/history').then((r) => r.json()),
        fetch('/api/steal-no-steal/history').then((r) => r.json()),
        fetch('/api/bullied/history').then((r) => r.json()),
      ])
        .then(([remix, guesser, buddyUp, mole, stealNoSteal, bullied]) => {
          if (remix?.ok && Array.isArray(remix?.data)) setRemixHistory(remix.data);
          if (guesser?.ok && Array.isArray(guesser?.data)) setBetrGuesserHistory(guesser.data);
          if (buddyUp?.ok && Array.isArray(buddyUp?.data)) setBuddyUpHistory(buddyUp.data);
          if (stealNoSteal?.ok && Array.isArray(stealNoSteal?.data)) setStealNoStealHistory(stealNoSteal.data);
          if (mole?.ok && Array.isArray(mole?.data)) setMoleHistory(mole.data);
          if (bullied?.ok && Array.isArray(bullied?.data)) setBulliedHistory(bullied.data);
        })
        .catch(() => {})
        .finally(() => setRemixHistoryLoading(false));
    } else {
      setRemixHistory([]);
      setBetrGuesserHistory([]);
      setBuddyUpHistory([]);
      setMoleHistory([]);
      setBulliedHistory([]);
    }
  }, [showHistory]);

  // Load active BETR GUESSER games
  useEffect(() => {
    const loadGames = () => {
      fetch('/api/betr-guesser/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setBetrGuesserGames(d.data); })
        .catch(() => {});
    };
    loadGames();
    // Refresh every 10 seconds to update countdown
    const interval = setInterval(loadGames, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load active BUDDY UP games
  useEffect(() => {
    const load = () => {
      fetch('/api/buddy-up/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setBuddyUpGames(d.data); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load active BULLIED games
  useEffect(() => {
    const load = () => {
      fetch('/api/bullied/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setBulliedGames(d.data); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  // BULLIED unread chat count: fetch status when authenticated and has active BULLIED games
  useEffect(() => {
    if (!token || bulliedGames.length === 0) {
      setBulliedStatusActiveGames([]);
      return;
    }
    const load = () => {
      authedFetch('/api/bullied/status', { method: 'GET' }, token)
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data?.activeGames)) setBulliedStatusActiveGames(d.data.activeGames); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [token, bulliedGames]);

  // Load active IN OR OUT games
  useEffect(() => {
    const load = () => {
      fetch('/api/in-or-out/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setInOrOutGames(d.data); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load active TAKE FROM THE PILE games
  useEffect(() => {
    const load = () => {
      fetch('/api/take-from-the-pile/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setTakeFromThePileGames(d.data); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load active KILL OR KEEP games
  useEffect(() => {
    const load = () => {
      fetch('/api/kill-or-keep/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setKillOrKeepGames(d.data); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load active NL HOLDEM games (authed when token so we get unreadChatCount per game)
  useEffect(() => {
    const load = () => {
      const fetcher = token
        ? authedFetch('/api/nl-holdem/games/active', { method: 'GET' }, token).then((r) => r.json())
        : fetch('/api/nl-holdem/games/active').then((r) => r.json());
      fetcher
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setNlHoldemGames(d.data); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [token]);

  // Load active THE MOLE games
  useEffect(() => {
    const loadGames = () => {
      fetch('/api/the-mole/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setMoleGames(d.data); })
        .catch(() => {});
    };
    loadGames();
    const interval = setInterval(loadGames, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load active STEAL OR NO STEAL games
  useEffect(() => {
    const loadGames = () => {
      fetch('/api/steal-no-steal/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setStealNoStealGames(d.data); })
        .catch(() => {});
    };
    loadGames();
    const interval = setInterval(loadGames, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load active HEADS UP Steal or No Steal games (Phase 17.7)
  useEffect(() => {
    const loadGames = () => {
      fetch('/api/steal-no-steal/games/active-heads-up')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setHeadsUpGames(d.data); })
        .catch(() => {});
    };
    loadGames();
    const interval = setInterval(loadGames, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load active SUPERBOWL SQUARES games
  useEffect(() => {
    const loadGames = () => {
      fetch('/api/superbowl-squares/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setSuperbowlSquaresGames(d.data); })
        .catch(() => {});
    };
    loadGames();
    const interval = setInterval(loadGames, 30000); // Less frequent polling
    return () => clearInterval(interval);
  }, []);

  // Phase 26: Load active SUPERBOWL PROPS game
  useEffect(() => {
    const loadGame = () => {
      fetch('/api/superbowl-props/games/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && d?.data?.game) setSuperbowlPropsGame(d.data.game); })
        .catch(() => {});
    };
    loadGame();
    const interval = setInterval(loadGame, 30000);
    return () => clearInterval(interval);
  }, []);

  // Phase 39: Load active ART CONTEST
  useEffect(() => {
    const load = () => {
      fetch('/api/art-contest/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && d?.data) setArtContestActive(d.data); else setArtContestActive(null); })
        .catch(() => setArtContestActive(null));
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  // Phase 42: Load active SUNDAY HIGH STAKES ARE BETR
  useEffect(() => {
    const load = () => {
      fetch('/api/sunday-high-stakes/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && d?.data) setSundayHighStakesActive(d.data); else setSundayHighStakesActive(null); })
        .catch(() => setSundayHighStakesActive(null));
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  // Phase 41: Load active NCAA HOOPS contest
  useEffect(() => {
    const load = () => {
      fetch('/api/ncaa-hoops/contests/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && d?.data) setNcaaHoopsActive(d.data); else setNcaaHoopsActive(null); })
        .catch(() => setNcaaHoopsActive(null));
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  // Load active REMIX BETR rounds and WEEKEND GAME rounds
  useEffect(() => {
    const loadRounds = () => {
      fetch('/api/remix-betr/rounds/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setRemixBetrRounds(d.data); })
        .catch(() => {});
      fetch('/api/weekend-game/rounds/active')
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d?.data)) setWeekendGameRounds(d.data); })
        .catch(() => {});
    };
    loadRounds();
    const interval = setInterval(loadRounds, 10000);
    return () => clearInterval(interval);
  }, []);

  // Phase 19: Check lobby chat access (1M BETR staked) and set in-chat count
  useEffect(() => {
    if (authStatus !== 'authed' || !token) {
      setHasLobbyChatAccess(false);
      setLobbyInChatCount(null);
      return;
    }
    // Check if user has 1M+ staked by calling lobby/active (returns 403 if not)
    authedFetch('/api/lobby/active', { method: 'GET' }, token)
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setHasLobbyChatAccess(true);
          setLobbyInChatCount(data?.data?.inChatCount ?? 0);
          setLobbyUnreadCount(data?.data?.unreadChatCount ?? 0);
        } else {
          setHasLobbyChatAccess(false);
          setLobbyInChatCount(null);
          setLobbyUnreadCount(null);
        }
      })
      .catch(() => {
        setHasLobbyChatAccess(false);
        setLobbyInChatCount(null);
        setLobbyUnreadCount(null);
      });
  }, [authStatus, token]);

  // Phase 19: Poll lobby active count when user has access (so "Chat (N)" stays current)
  useEffect(() => {
    if (!hasLobbyChatAccess || !token) return;
    const fetchCount = () => {
      authedFetch('/api/lobby/active', { method: 'GET' }, token)
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok) {
            setLobbyInChatCount(data?.data?.inChatCount ?? 0);
            setLobbyUnreadCount(data?.data?.unreadChatCount ?? 0);
          }
        })
        .catch(() => {});
    };
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, [hasLobbyChatAccess, token]);

  // Phase 22: Check mini app status and show popup after 10 seconds if not added
  useEffect(() => {
    if (authStatus !== 'authed' || !token) {
      return;
    }
    
    // Check if already dismissed this session
    if (typeof window !== 'undefined' && sessionStorage.getItem('miniAppPromptDismissed') === 'true') {
      return;
    }
    
    // Check mini app status
    authedFetch('/api/notifications/status', { method: 'GET' }, token)
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && data?.data) {
          setHasMiniAppAdded(data.data.hasMiniAppAdded === true);
        }
      })
      .catch(() => {});
  }, [authStatus, token]);

  // Phase 22: Show popup 10 seconds after page load if mini app not added
  useEffect(() => {
    if (hasMiniAppAdded === false) {
      const timer = setTimeout(() => {
        // Double-check session storage in case user dismissed on another component
        if (typeof window !== 'undefined' && sessionStorage.getItem('miniAppPromptDismissed') !== 'true') {
          setShowMiniAppPrompt(true);
        }
      }, 10000); // 10 seconds
      return () => clearTimeout(timer);
    }
  }, [hasMiniAppAdded]);
  
  const dismissMiniAppPrompt = () => {
    setShowMiniAppPrompt(false);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('miniAppPromptDismissed', 'true');
    }
  };

  // Phase 22.1: Handle mini app add via native Farcaster SDK
  const handleAddMiniApp = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      const actions = sdk?.actions as any;
      if (actions?.addMiniApp) {
        await actions.addMiniApp();
      }
    } catch (err) {
      console.error('[MiniAppPrompt] Error:', err);
    }
    dismissMiniAppPrompt();
  };

  // Phase 22.9: registrationClosed is set from status API in the useEffect below

  // Update countdown timer for BETR GUESSER card. Use only open games (guesses_close_at > now) for countdown; if all closed, show "Guesses closed".
  useEffect(() => {
    if (betrGuesserGames.length === 0) {
      setBetrGuesserCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const openOnly = betrGuesserGames.filter((g) => new Date(g.guesses_close_at).getTime() > now);
      if (openOnly.length === 0) {
        setBetrGuesserCountdown('Guesses closed');
        return;
      }

      const soonest = [...openOnly].sort(
        (a, b) => new Date(a.guesses_close_at).getTime() - new Date(b.guesses_close_at).getTime()
      )[0];
      if (!soonest) {
        setBetrGuesserCountdown('');
        return;
      }

      const closeTime = new Date(soonest.guesses_close_at).getTime();
      const diff = closeTime - now;

      if (diff <= 0) {
        setBetrGuesserCountdown('Guesses closed');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setBetrGuesserCountdown(`Guesses close in: ${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setBetrGuesserCountdown(`Guesses close in: ${minutes}m ${seconds}s`);
      } else {
        setBetrGuesserCountdown(`Guesses close in: ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [betrGuesserGames]);

  // Update countdown timer for REMIX BETR card
  useEffect(() => {
    if (remixBetrRounds.length === 0) {
      setRemixBetrCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const openOnly = remixBetrRounds.filter((r) => r.status === 'open' && new Date(r.submissions_close_at).getTime() > now);
      if (openOnly.length === 0) {
        // Check if there are any closed rounds
        const closedRounds = remixBetrRounds.filter((r) => r.status === 'closed');
        if (closedRounds.length > 0) {
          setRemixBetrCountdown('Submissions closed');
        } else {
          setRemixBetrCountdown('');
        }
        return;
      }

      const soonest = [...openOnly].sort(
        (a, b) => new Date(a.submissions_close_at).getTime() - new Date(b.submissions_close_at).getTime()
      )[0];
      if (!soonest) {
        setRemixBetrCountdown('');
        return;
      }

      const closeTime = new Date(soonest.submissions_close_at).getTime();
      const diff = closeTime - now;

      if (diff <= 0) {
        setRemixBetrCountdown('Submissions closed');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setRemixBetrCountdown(`Closes in: ${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setRemixBetrCountdown(`Closes in: ${minutes}m ${seconds}s`);
      } else {
        setRemixBetrCountdown(`Closes in: ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [remixBetrRounds]);

  // BETR WITH BURR homepage sections are only shown for the burrfriends/hellfire club
  const isHellfireClub = slug === HELLFIRE_CLUB_SLUG || club?.slug === HELLFIRE_CLUB_SLUG;

  // Fetch BETR GAMES registration status for BETR WITH BURR (used for BETR GAMES overlay gate)
  useEffect(() => {
    if (!isHellfireClub || authStatus !== 'authed' || !token) {
      setBetrGamesRegistered(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/betr-games/register/status', { method: 'GET' }, token);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.ok) {
          setBetrGamesRegistered(data?.data?.registered === true);
          setBetrGamesApproved(data?.data?.approved === true);
          setBetrGamesRejected(data?.data?.rejected === true);
          setRegistrationClosed(data?.data?.registrationClosed === true);
          setTournamentStatus(data?.data?.tournamentStatus ?? null);
          setAliveCount(typeof data?.data?.aliveCount === 'number' ? data.data.aliveCount : 0);
        } else {
          setBetrGamesRegistered(false);
          setBetrGamesRejected(false);
          setTournamentStatus(null);
          setAliveCount(0);
        }
      } catch {
        if (!cancelled) {
          setBetrGamesRegistered(false);
          setBetrGamesRejected(false);
          setTournamentStatus(null);
          setAliveCount(0);
        }
      }
    })();
    return () => { void (cancelled = true); };
  }, [isHellfireClub, authStatus, token, betrGamesStatusKey]);

  const scrollTo = (which: 'betrGames' | 'betrPoker') => {
    const el = which === 'betrGames' ? betrGamesRef.current : betrPokerRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Phase 22.10: Open alive players modal and fetch list
  const handleOpenAliveModal = async () => {
    if (!token || alivePlayersLoading) return;
    setAliveModalOpen(true);
    setAlivePlayersLoading(true);
    setAlivePlayers([]);
    try {
      const res = await authedFetch('/api/betr-games/tournament/alive', { method: 'GET' }, token);
      const data = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data?.data?.players)) setAlivePlayers(data.data.players);
    } catch {
      setAlivePlayers([]);
    } finally {
      setAlivePlayersLoading(false);
    }
  };

  const handleBetrGamesRegister = async () => {
    if (!token || authStatus !== 'authed' || betrGamesRegistering) return;
    setBetrGamesRegistering(true);
    setBetrGamesModalError(false);
    setBetrGamesModalAlreadyRegistered(false);
    setBetrGamesModalErrorReason(undefined);
    setBetrGamesModalStakedAmount(undefined);
    try {
      const res = await authedFetch('/api/betr-games/register', { method: 'POST' }, token);
      const data = await res.json().catch(() => null);
      // Phase 22.9: Handle registration_closed
      if (res.status === 403 && data?.data?.reason === 'registration_closed') {
        setBetrGamesModalError(false);
        setBetrGamesModalErrorReason('registration_closed');
        setBetrGamesModalOpen(true);
        setRegistrationClosed(true);
        return;
      }
      if (res.status === 403 && data?.data?.reason === 'insufficient_stake') {
        setBetrGamesModalError(false);
        setBetrGamesModalErrorReason('insufficient_stake');
        setBetrGamesModalStakedAmount(typeof data?.data?.stakedAmount === 'string' ? data.data.stakedAmount : undefined);
        setBetrGamesModalOpen(true);
        return;
      }
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'Failed to register');
      setBetrGamesRegistered(true);
      setBetrGamesModalError(false);
      setBetrGamesModalErrorReason(undefined);
      setBetrGamesModalStakedAmount(undefined);
      setBetrGamesModalAlreadyRegistered(Boolean(data?.data?.alreadyRegistered));
      setBetrGamesApproved(Boolean(data?.data?.approved));
      setBetrGamesRejected(false);
      setBetrGamesModalOpen(true);
    } catch {
      setBetrGamesModalError(true);
      setBetrGamesModalErrorReason(undefined);
      setBetrGamesModalStakedAmount(undefined);
      setBetrGamesModalOpen(true);
    } finally {
      setBetrGamesRegistering(false);
    }
  };

  // Phase 25: Handle opt-out from BETR GAMES
  const handleOptOut = async () => {
    if (!token || authStatus !== 'authed' || optingOut) return;
    setOptingOut(true);
    try {
      const res = await authedFetch('/api/betr-games/opt-out', { method: 'POST' }, token);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'Failed to opt out');
      // Phase 25: If canReregister is false (e.g. rejected user), refetch status so card shows rejected state
      if (data?.data?.canReregister === false) {
        setBetrGamesStatusKey(k => k + 1);
      } else {
        setBetrGamesRegistered(false);
        setBetrGamesApproved(false);
        setBetrGamesRejected(false);
      }
      setOptOutModalOpen(false);
    } catch (e) {
      console.error('[handleOptOut] Error:', e);
      // Still close modal on error - user can try again
      setOptOutModalOpen(false);
    } finally {
      setOptingOut(false);
    }
  };

  const loadData = async () => {
    if (!token || authStatus !== 'authed') {
      // Don't set error here - let the useEffect handle state
      setLoading(false);
      return;
    }

    try {
      // Fetch club (requires auth) - API handles fallback to old slug
      const clubsRes = await authedFetch('/api/clubs', { method: 'GET' }, token);
      
      if (!clubsRes.ok) {
        const errorText = await clubsRes.clone().text();
        throw new Error(`Failed to fetch clubs: ${clubsRes.status} ${errorText.substring(0, 100)}`);
      }
      const clubsData = await clubsRes.json();
      
      // API handles fallback, so just take the first club returned
      // The API will return either the new slug or old slug club
      const foundClub = clubsData.data?.[0];
      
      if (!foundClub) {
        setError('Club not found');
        return;
      }
      
      // Accept either slug during migration period
      const { HELLFIRE_CLUB_SLUG } = await import('~/lib/constants');
      const validSlugs = [HELLFIRE_CLUB_SLUG, 'hellfire'];
      if (!validSlugs.includes(foundClub.slug)) {
        setError('Club not found');
        return;
      }
      
      setClub(foundClub);

      // Fetch games (requires auth) - force fresh data, no cache
      const gamesRes = await authedFetch(`/api/games?club_id=${foundClub.id}`, { 
        method: 'GET',
        cache: 'no-store',
      }, token);
      if (!gamesRes.ok) throw new Error('Failed to fetch games');
      const gamesData = await gamesRes.json();
      const gamesList = gamesData.data || [];
      setGames(gamesList);

      // Get current user FID from auth context
      if (fid) {
        setCurrentUserFid(fid);
        
        // Use participant_count and viewer_has_joined from games API response (no N+1 queries)
        // These fields are correctly keyed by gameId from the server
        const countsMap: Record<string, number> = {};
        
        for (const game of gamesList) {
          // Use participant_count from API (already filtered to status='joined')
          countsMap[game.id] = game.participant_count ?? 0;
        }
        
        setParticipantCountsByGame(countsMap);
        
        // Check admin status and load pending requests count
        try {
          const admin = await getIsAdminCached(token);
          setIsAdmin(admin);
              
              // If admin, load pending requests count
          if (admin) {
                const requestsRes = await authedFetch('/api/game-requests?status=pending', { method: 'GET' }, token);
                if (requestsRes.ok) {
                  const requestsData = await requestsRes.json();
                  if (requestsData.ok && requestsData.data) {
                    setPendingRequestsCount(requestsData.data.length || 0);
              }
            }
          }
        } catch (err) {
          // Silently fail - admin check is optional
          console.error('Failed to check admin status:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const isOwner = currentUserFid && club && isClubOwnerOrAdmin(currentUserFid, club);

  // Show loading state while auth is loading or data is loading
  if (authStatus === 'loading' || (loading && !club && !error)) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--text-1)' }}>{authStatus === 'loading' ? 'Signing in...' : 'Loading...'}</p>
        </div>
      </main>
    );
  }

  // Show error state with retry if auth failed
  if (authStatus === 'error') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="mb-4" style={{ color: 'var(--ember-2)' }}>Authentication failed. Please try again.</p>
          <button
            onClick={retry}
            className="btn-primary"
          >
            Retry sign-in
          </button>
          <Link href="/" className="mt-4 ml-4 inline-block text-ember hover:underline transition-colors" style={{ color: 'var(--ember-1)' }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  // Show error if club not found or other error
  if (error || !club) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--ember-2)' }}>Error: {error || 'Club not found'}</p>
          <Link href="/" className="mt-4 inline-block text-ember hover:underline transition-colors" style={{ color: 'var(--ember-1)' }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  // BETR WITH BURR Club GG URL
  // This is the source of truth for the BETR WITH BURR club deep link
  // Uses CLUBGG_LINK constant from constants.ts
  const clubHref = CLUBGG_LINK;

  // Banner items for rotating carousel (only used for BETR WITH BURR club)
  const bannerItems = isHellfireClub ? [
    {
      title: 'View BETR WITH BURR on Club GG',
      href: clubHref,
    },
  ] : [];

  return (
    <main className="min-h-screen px-4 pt-2 pb-8" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Neon Sign Header for BETR WITH BURR - positioned directly under ticker */}
        {isHellfireClub ? (
          <div
            style={{
              background: '#0a0a0a',
              backgroundImage: 'linear-gradient(135deg, #0a0a0a 0%, #111111 100%)',
              padding: '32px 24px',
              marginBottom: '20px',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 0 30px rgba(20, 184, 166, 0.2), 0 0 60px rgba(255, 16, 240, 0.1), 0 4px 12px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
            }}
          >
            {/* Logo + Title Row - always one line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'nowrap' }}>
              <Image
                src="/icon.png"
                alt="BETR WITH BURR"
                width={56}
                height={56}
                style={{ borderRadius: 'var(--radius-md)' }}
                priority
              />
              <h1
                className="neon-sign-text"
                style={{
                  fontSize: 'clamp(1.8rem, 6vw, 3rem)',
                  fontFamily: 'Georgia, "Times New Roman", Times, serif',
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  margin: 0,
                  lineHeight: '1.2',
                  whiteSpace: 'nowrap',
                }}
              >
                BETR WITH BURR
              </h1>
              {/* Invisible spacer to balance logo width for centered title */}
              <div style={{ width: 56, height: 56, visibility: 'hidden' }} aria-hidden="true" />
            </div>

            {/* Navigation buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {/* Hide section scroll buttons in Super Bowl Weekend Mode (no sections to scroll to) */}
              {!SUPERBOWL_WEEKEND_MODE && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollTo('betrGames')}
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      minHeight: 'auto',
                      background: 'rgba(255, 255, 255, 0.15)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: '#FFFFFF',
                      backdropFilter: 'blur(4px)',
                      transition: 'all 0.2s ease-out',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    BETR Games
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTo('betrPoker')}
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      minHeight: 'auto',
                      background: 'rgba(255, 255, 255, 0.15)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: '#FFFFFF',
                      backdropFilter: 'blur(4px)',
                      transition: 'all 0.2s ease-out',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    Poker
                  </button>
                </>
              )}
              <Link
                href="/about"
                className="btn-secondary"
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  display: 'inline-block',
                  minHeight: 'auto',
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#FFFFFF',
                  backdropFilter: 'blur(4px)',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease-out',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
              >
                About
              </Link>
              {isAdmin && (
                <Link
                  href="/admin/dashboard"
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    display: 'inline-block',
                    minHeight: 'auto',
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#FFFFFF',
                    backdropFilter: 'blur(4px)',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease-out',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.35)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                  }}
                >
                  Admin
                </Link>
              )}
              {/* Phase 21: Results button (all authenticated users) */}
              {authStatus === 'authed' && (
                <Link
                  href="/results"
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    minHeight: 'auto',
                    background: 'rgba(45, 212, 191, 0.2)',
                    border: '1px solid rgba(45, 212, 191, 0.5)',
                    color: '#FFFFFF',
                    backdropFilter: 'blur(4px)',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease-out',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(45, 212, 191, 0.35)';
                    e.currentTarget.style.borderColor = 'rgba(45, 212, 191, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(45, 212, 191, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(45, 212, 191, 0.5)';
                  }}
                >
                  Results
                </Link>
              )}
              {/* Phase 43: Feedback button (all authenticated users) */}
              {authStatus === 'authed' && (
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(true)}
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    minHeight: 'auto',
                    background: 'rgba(45, 212, 191, 0.2)',
                    border: '1px solid rgba(45, 212, 191, 0.5)',
                    color: '#FFFFFF',
                    backdropFilter: 'blur(4px)',
                    transition: 'all 0.2s ease-out',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(45, 212, 191, 0.35)';
                    e.currentTarget.style.borderColor = 'rgba(45, 212, 191, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(45, 212, 191, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(45, 212, 191, 0.5)';
                  }}
                >
                  Feedback
                </button>
              )}
              {/* Phase 19: Lobby Chat button (1M+ BETR stakers only); label shows in-chat count */}
              {hasLobbyChatAccess && (
                <button
                  type="button"
                  onClick={() => setShowLobbyChatModal(true)}
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    minHeight: 'auto',
                    background: 'rgba(45, 212, 191, 0.2)',
                    border: '1px solid rgba(45, 212, 191, 0.5)',
                    color: '#FFFFFF',
                    backdropFilter: 'blur(4px)',
                    transition: 'all 0.2s ease-out',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(45, 212, 191, 0.35)';
                    e.currentTarget.style.borderColor = 'rgba(45, 212, 191, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(45, 212, 191, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(45, 212, 191, 0.5)';
                  }}
                >
                  {lobbyUnreadCount != null && lobbyUnreadCount > 0 ? (
                    <>Chat (<span style={{ color: '#ef4444' }}>{lobbyUnreadCount}</span>)</>
                  ) : (
                    lobbyInChatCount !== null ? `Chat (${lobbyInChatCount})` : 'Chat'
                  )}
                </button>
              )}
            </div>
            </div>
          ) : (
          /* Legacy header for other clubs */
          <>
            <div className="text-center mb-2" style={{ minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-0)' }}>
              {club.name}
            </h1>
            </div>
          {slug !== HELLFIRE_CLUB_SLUG && (
            <Link href="/clubs" className="text-ember hover:underline mt-2 inline-block transition-colors" style={{ color: 'var(--ember-1)' }}>
              ← Back to Clubs
            </Link>
          )}
          </>
        )}

        {/* Legacy navigation for non-BETR WITH BURR clubs */}
        {!isHellfireClub && (
          /* Legacy header and buttons row for other clubs */
          <div className="text-center mb-6" style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'nowrap' }}>
          {isAdmin ? (
            <>
                    <Link
                      href={`/clubs/${slug}/games/new`}
                      className="btn-primary"
                  style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
                    >
                      Create New Game
                    </Link>
              {pendingRequestsCount > 0 && (
                <button
                  onClick={() => setShowAdminRequests(true)}
                  className="btn-primary relative"
                  style={{ 
                      padding: '4px 8px',
                      fontSize: '8px',
                    minHeight: 'auto',
                    background: 'linear-gradient(135deg, var(--ember-0) 0%, var(--ember-1) 100%)'
                  }}
                >
                  Requests ({pendingRequestsCount})
                </button>
              )}
            </>
          ) : (
            <button
              onClick={async () => {
                try {
                  const { sdk } = await import('@farcaster/miniapp-sdk');
                  if (sdk?.actions?.composeCast) {
                    const miniAppUrl = typeof window !== 'undefined' 
                      ? window.location.origin + `/clubs/${HELLFIRE_CLUB_SLUG}/games`
                      : `https://poker-swart.vercel.app/clubs/${HELLFIRE_CLUB_SLUG}/games`;
                    await sdk.actions.composeCast({
                      text: 'i would like to play poker who is with me?',
                      embeds: [miniAppUrl],
                    });
                  } else {
                    alert('This feature requires Warpcast. Please open this mini app in Warpcast to share.');
                  }
                } catch (error) {
                  console.error('Failed to open cast composer:', error);
                  alert('Failed to open cast composer. Please try again.');
                }
              }}
              className="btn-primary"
                style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
            >
              Request a Game
            </button>
          )}
          
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '8px', minHeight: 'auto' }}
          >
            {showHistory ? '← Back to Active Games' : 'Previous Games'}
          </button>
          
          {isHellfireClub && (
            <Link
              href={clubHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
                style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
            >
              Club GG
            </Link>
          )}

            <Link
              href="/burrfriends"
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
            >
              BETR WITH BURR
            </Link>

            <Link
              href="/about"
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
            >
              About
            </Link>
        </div>
        )}


        {/* Admin Requests Modal (admin only) */}
        <AdminRequests
          isOpen={showAdminRequests}
          onClose={() => {
            setShowAdminRequests(false);
            // Reload pending count
            if (token && isAdmin) {
              authedFetch('/api/game-requests?status=pending', { method: 'GET' }, token)
                .then(r => r.json())
                .then(data => {
                  if (data.ok && data.data) {
                    setPendingRequestsCount(data.data.length || 0);
                  }
                })
                .catch(() => {});
            }
          }}
        />

        {(() => {
          // Filter games based on history view
          const activeGames = games.filter((g: Game) => 
            g.status !== 'cancelled' && g.status !== 'settled' && g.status !== 'completed'
          );
          const historyGames = games.filter((g: Game) => 
            g.status === 'cancelled' || g.status === 'settled' || g.status === 'completed'
          );
          const displayGames = showHistory ? historyGames : activeGames;

          if (isHellfireClub) {
            // SUPER BOWL WEEKEND MODE - show only Super Bowl games
            if (SUPERBOWL_WEEKEND_MODE) {
              return (
                <div style={{ marginBottom: '18px' }}>
                  {/* SUPERBOWL SQUARES card */}
                  {superbowlSquaresGames.length > 0 && (
                    <Link href="/superbowl-squares" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                      <div
                        className={`hl-card ${superbowlSquaresGames.length > 0 ? 'hl-card--active' : ''}`}
                        style={{ 
                          transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
                          border: '1px solid rgba(0, 255, 200, 0.3)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 className="text-lg font-semibold text-primary" style={{ color: '#00ffc8', fontWeight: 600, margin: 0 }}>BETR SUPERBOWL SQUARES</h3>
                            {superbowlSquaresGames.length > 0 && (
                              <span style={{ color: '#00ffc8', fontSize: '0.75rem' }}>
                                {superbowlSquaresGames[0].status === 'setup' ? 'Coming Soon' :
                                 superbowlSquaresGames[0].status === 'claiming' ? 'Claiming Open' :
                                 superbowlSquaresGames[0].status === 'locked' ? 'Grid Locked' : 'Active'}
                              </span>
                            )}
                          </div>
                          <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: 'rgba(0, 255, 200, 0.2)', color: '#00ffc8' }}>SUPERBOWL SQUARES</span>
                          <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>10x10 grid. Claim squares based on your staking tier. Win when scores match!</p>
                        </div>
                      </div>
                    </Link>
                  )}

                  {/* Phase 26: SUPERBOWL PROPS card */}
                  {/* Empty state: when no Super Bowl games, show message instead of black area */}
                  {superbowlSquaresGames.length === 0 && !superbowlPropsGame && (
                    <div
                      className="hl-card"
                      style={{
                        padding: '24px',
                        textAlign: 'center',
                        border: '1px solid var(--stroke)',
                        background: 'var(--bg-2)',
                      }}
                    >
                      <p style={{ color: 'var(--text-1)', margin: 0, fontSize: '0.95rem' }}>
                        No active Super Bowl games at the moment. Check back soon for more BETR events.
                      </p>
                    </div>
                  )}

                  {superbowlPropsGame && (
                    <Link href="/superbowl-props" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                      <div
                        className="hl-card hl-card--active"
                        style={{ 
                          transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
                          border: '1px solid rgba(234, 179, 8, 0.3)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 className="text-lg font-semibold text-primary" style={{ color: '#eab308', fontWeight: 600, margin: 0 }}>BETR SUPERBOWL: PROPS</h3>
                            <span style={{ color: '#eab308', fontSize: '0.75rem' }}>
                              {superbowlPropsGame.status === 'open' ? 'OPEN' : superbowlPropsGame.status === 'settled' ? 'SETTLED' : 'CLOSED'}
                            </span>
                          </div>
                          <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: 'rgba(234, 179, 8, 0.2)', color: '#eab308' }}>25 PROPS</span>
                          <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: '4px 0 0 0', fontSize: '0.85rem' }}>Payout: 20M + 20M potentially</p>
                          <p className="text-sm text-secondary" style={{ color: 'var(--text-1)', margin: '2px 0 0 0', fontSize: '0.8rem' }}>Must be staking 1M $BETR to play</p>
                          <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: '1.5' }}>
                            <div>Most correct answers — 10M</div>
                            <div>2nd — 5M</div>
                            <div>3rd — 4.2M</div>
                            <div>Least correct — 4.2M</div>
                            <div style={{ color: '#D946EF', fontWeight: 600, marginTop: '4px' }}>Betr believer bonus: add 5M $BETR to any prize if you stake 50M</div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
              );
            }

            // Overlay gate: only show for authed users who are confirmed not registered (wait for API)
            const showGate = authStatus === 'authed' && betrGamesRegistered === false;
            // Sign-in message: show for non-authed users
            const showSignInMessage = authStatus !== 'authed';
            return (
              <>
                {/* BETR GAMES (non-poker) */}
                <section ref={betrGamesRef} style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fire-1)' }}>
                      BETR GAMES
                    </h2>
                  </div>

                  {/* Phase 22.10: X players remaining — under heading, neon teal glow, clickable when registration closed */}
                  {registrationClosed && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={handleOpenAliveModal}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenAliveModal(); } }}
                      style={{
                        textAlign: 'center',
                        marginBottom: '12px',
                        cursor: 'pointer',
                        color: '#14B8A6',
                        fontWeight: 700,
                        fontSize: '1.25rem',
                        textShadow: '0 0 8px #14B8A6, 0 0 20px #14B8A6, 0 0 32px rgba(20, 184, 166, 0.5)',
                      }}
                    >
                      {aliveCount} players remaining
                    </div>
                  )}

                  {/* Phase 24 + 25: Tournament registration status - prominent display for registered users. Rejected branch first (plan 10.3.1, 24.2). */}
                  {betrGamesRegistered === true && (
                    <div style={{
                      background: 'rgba(20, 184, 166, 0.08)',
                      border: '1px solid rgba(20, 184, 166, 0.3)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      marginBottom: '16px',
                    }}>
                      {betrGamesRejected ? (
                        /* Phase 25: Rejected — show rejection message only; do NOT show "✓ You are registered" or "Awaiting approval" */
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '4px' }}>
                            <div style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: '1rem', textAlign: 'center' }}>
                              You were not approved for BETR GAMES. We hope you can join for any future games!
                            </div>
                            <button
                              onClick={() => setOptOutModalOpen(true)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                background: 'transparent',
                                border: '1px solid var(--text-2)',
                                borderRadius: '4px',
                                color: 'var(--text-2)',
                                cursor: 'pointer',
                              }}
                            >
                              Opt Out
                            </button>
                          </div>
                        </>
                      ) : !registrationClosed ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '4px' }}>
                            <div style={{ color: 'var(--fire-1)', fontWeight: 600, fontSize: '1rem' }}>
                              ✓ You are registered
                            </div>
                            {/* Phase 25: Opt Out button */}
                            <button
                              onClick={() => setOptOutModalOpen(true)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                background: 'transparent',
                                border: '1px solid var(--text-2)',
                                borderRadius: '4px',
                                color: 'var(--text-2)',
                                cursor: 'pointer',
                              }}
                            >
                              Opt Out
                            </button>
                          </div>
                          {betrGamesApproved ? (
                            <div style={{ color: 'var(--text-1)', fontSize: '0.875rem', textAlign: 'center' }}>
                              Registration open
                            </div>
                          ) : (
                            <div style={{ color: '#f59e0b', fontSize: '0.875rem', textAlign: 'center' }}>
                              Awaiting approval
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '4px' }}>
                            <div style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: '1rem' }}>
                              Registration closed
                            </div>
                            {/* Phase 25: Opt Out button (also shown after deadline) */}
                            <button
                              onClick={() => setOptOutModalOpen(true)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                background: 'transparent',
                                border: '1px solid var(--text-2)',
                                borderRadius: '4px',
                                color: 'var(--text-2)',
                                cursor: 'pointer',
                              }}
                            >
                              Opt Out
                            </button>
                          </div>
                          <div style={{ color: 'var(--fire-1)', fontSize: '0.875rem', textAlign: 'center' }}>
                            Games in progress
                          </div>
                          {/* Phase 22.10: Active or (eliminated) — quit treated as eliminated */}
                          <div style={{ fontSize: '0.875rem', textAlign: 'center', marginTop: '4px', fontWeight: 600 }}>
                            {tournamentStatus === 'alive' ? (
                              <span style={{ color: '#22c55e' }}>Active</span>
                            ) : (tournamentStatus === 'eliminated' || tournamentStatus === 'quit') ? (
                              <span style={{ color: 'var(--text-2)' }}>(eliminated)</span>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        filter: showGate ? 'blur(9px)' : 'none',
                        opacity: showGate ? 0.55 : 1,
                        pointerEvents: showGate ? 'none' : 'auto',
                        transition: 'filter 200ms ease-out, opacity 200ms ease-out',
                      }}
                    >
                      {weekendGameRounds.length > 0 && (
                        <Link href="/weekend-game" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                          <div
                            className={`hl-card ${weekendGameRounds.length > 0 ? 'hl-card--active' : ''}`}
                            style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <Image src="/remix.png" alt="REMIX 3D Tunnel Racer" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                            </div>
                            <div className="flex-1" style={{ textAlign: 'center' }}>
                              <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'center', alignItems: 'center' }}>
                                <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>WEEKEND GAME</h3>
                              </div>
                              <span className="hl-badge hl-badge--fire" style={{ display: 'inline-block', marginBottom: '8px' }}>REMIX 3D TUNNEL RACER</span>
                              <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Play 3D Tunnel Racer on Remix, submit your score here.</p>
                            </div>
                          </div>
                        </Link>
                      )}

                      {remixBetrRounds.length > 0 && weekendGameRounds.length === 0 && (
                        <Link href="/remix-betr" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                          <div
                            className={`hl-card ${remixBetrRounds.length > 0 ? 'hl-card--active' : ''}`}
                            style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <Image src="/FRAMEDL.png" alt="FRAMEDL" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                            </div>
                            <div className="flex-1" style={{ textAlign: 'center' }}>
                              <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'center', alignItems: 'center' }}>
                                <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>FRAMEDL BETR</h3>
                                {remixBetrCountdown && (
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>{remixBetrCountdown}</span>
                                )}
                              </div>
                              <span className="hl-badge hl-badge--fire" style={{ display: 'inline-block', marginBottom: '8px' }}>FRAMEDL BETR</span>
                              <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Play FRAMEDL, submit your result here.</p>
                            </div>
                          </div>
                        </Link>
                      )}

                      {betrGuesserGames.length > 0 && (
                        <Link href="/betr-guesser" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                          <div
                            className={`hl-card ${betrGuesserGames.length > 0 ? 'hl-card--active' : ''}`}
                            style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <Image src="/guesser.png" alt="BETR GUESSER" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>BETR GUESSER</h3>
                                {betrGuesserCountdown && (
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>{betrGuesserCountdown}</span>
                                )}
                              </div>
                              <span className="hl-badge hl-badge--fire" style={{ display: 'inline-block', marginBottom: '8px' }}>BETR GUESSER</span>
                              <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Guess a number 1-100. Highest unique guess wins!</p>
                            </div>
                          </div>
                        </Link>
                      )}

                      {buddyUpGames.length > 0 && (
                        <div className="mb-4">
                          <Link href="/buddy-up" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className={`hl-card ${buddyUpGames.length > 0 ? 'hl-card--active' : ''}`}
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>BUDDY UP</h3>
                                  {buddyUpGames.length > 0 && (
                                    <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                      {buddyUpGames[0].status === 'signup' ? 'Signups Open' : 'Game In Progress'}
                                    </span>
                                  )}
                                </div>
                                <span className="hl-badge hl-badge--fire" style={{ display: 'inline-block', marginBottom: '8px' }}>BUDDY UP</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Sign up and vote your way to victory!</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                      )}

                      {bulliedGames.length > 0 && (() => {
                        const bulliedDisplayGame = bulliedGames.find((g) => g.status === 'in_progress') ?? bulliedGames[0];
                        const bulliedUnread = token ? (bulliedStatusActiveGames.find((ag) => ag.gameId === bulliedDisplayGame?.id)?.unreadChatCount ?? 0) : 0;
                        return (
                        <div className="mb-4">
                          <Link href={bulliedGames.length === 1 ? `/bullied?gameId=${bulliedDisplayGame?.id}&openChat=1` : '/bullied'} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className="hl-card hl-card--active"
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Image src="/bullied.png" alt="BULLIED" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>BULLIED</h3>
                                  <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>
                                    {bulliedDisplayGame?.status === 'open' ? 'Game Open' : 'Game In Progress'}
                                  </span>
                                </div>
                                {bulliedUnread > 0 && (
                                  <p className="text-sm mt-1 mb-1" style={{ color: 'var(--text-0)', margin: 0 }}>
                                    You have (<span style={{ color: '#ef4444' }}>{bulliedUnread}</span>) new messages
                                  </p>
                                )}
                                <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: '#dc2626', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>BULLIED</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>3 go in, 1 or none advance</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                        );
                      })()}

                      {inOrOutGames.length > 0 && (
                        <div className="mb-4">
                          <Link href={inOrOutGames.length === 1 ? `/in-or-out?gameId=${inOrOutGames[0].id}` : '/in-or-out'} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className="hl-card hl-card--active"
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Image src="/inorout.png" alt="IN OR OUT" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                              </div>
                              <div className="flex-1" style={{ textAlign: 'center' }}>
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'center', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>IN OR OUT</h3>
                                  <span style={{ color: '#f97316', fontSize: '0.75rem' }}>
                                    {inOrOutGames[0].status === 'open' ? 'Game Open' : 'Game In Progress'}
                                  </span>
                                </div>
                                <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: '#f97316', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>IN OR OUT</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Quit for $10M share or Stay</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                      )}

                      {takeFromThePileGames.length > 0 && (
                        <div className="mb-4">
                          <Link href={takeFromThePileGames.length === 1 ? `/take-from-the-pile?gameId=${takeFromThePileGames[0].id}` : '/take-from-the-pile'} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className="hl-card hl-card--active"
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Image src="/takefrompile.png" alt="TAKE FROM THE PILE" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>TAKE FROM THE PILE</h3>
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                    {takeFromThePileGames[0].status === 'open' ? 'Game Open' : 'Game In Progress'}
                                  </span>
                                </div>
                                <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: 'var(--fire-1)', color: 'var(--bg-0)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>TAKE FROM THE PILE</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Take from the pile. Your turn, your amount.</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                      )}

                      {killOrKeepGames.length > 0 && (
                        <div className="mb-4">
                          <Link href={killOrKeepGames.length === 1 ? `/kill-or-keep?gameId=${killOrKeepGames[0].id}` : '/kill-or-keep'} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className="hl-card hl-card--active"
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Image src="/keeporkill.png" alt="KILL OR KEEP" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>KILL OR KEEP</h3>
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                    {killOrKeepGames[0].status === 'open' ? 'Game Open' : 'Game In Progress'}
                                  </span>
                                </div>
                                <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: 'var(--fire-1)', color: 'var(--bg-0)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>KILL OR KEEP</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Keep or kill one per turn. Final 10 survive.</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                      )}

                      {nlHoldemGames.length > 0 && (
                        <div className="mb-4">
                          <Link href={nlHoldemGames.length === 1 ? `/nl-holdem?gameId=${nlHoldemGames[0].id}` : '/nl-holdem'} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className="hl-card hl-card--active"
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '120px', background: 'var(--bg-2)', borderRadius: '12px', marginBottom: '8px' }}>
                                <span style={{ color: 'var(--text-0)', fontSize: '1.25rem', fontWeight: 600 }}>♠️ NL HOLDEM ♥️</span>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>
                                    NL HOLDEM
                                    {(nlHoldemGames as { unreadChatCount?: number }[]).reduce((s, g) => s + (g.unreadChatCount ?? 0), 0) > 0 && (
                                      <span style={{ color: '#ef4444', marginLeft: '6px' }}>
                                        ({(nlHoldemGames as { unreadChatCount?: number }[]).reduce((s, g) => s + (g.unreadChatCount ?? 0), 0)})
                                      </span>
                                    )}
                                  </h3>
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                    {nlHoldemGames[0].status === 'open' ? 'Game Open' : 'Game In Progress'}
                                  </span>
                                </div>
                                <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: '#0ea5e9', color: 'var(--bg-0)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>NL HOLDEM</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>In-app No-Limit Hold&apos;em Sit & Go. Sign up and play.</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                      )}

                      {artContestActive && (
                        <div className="mb-4">
                          <Link href="/art-contest" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className="hl-card hl-card--active"
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Image src="/artcontest.png" alt="TO SPINFINITY AND BEYOND ART CONTEST" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>TO SPINFINITY AND BEYOND ART CONTEST</h3>
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                    {artContestActive.status === 'open' ? 'Open' : artContestActive.status === 'closed' ? 'Closed' : 'Settled'}
                                  </span>
                                </div>
                                <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: 'var(--fire-1)', color: 'var(--bg-0)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>ART CONTEST</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Submit your art. Top 14 win. $4000+ prize pool.</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                      )}

                      {sundayHighStakesActive && (
                        <div className="mb-4">
                          <Link href="/sunday-high-stakes" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className="hl-card hl-card--active"
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <Image src="/sundayhighstakes.png" alt="SUNDAY HIGH STAKES ARE BETR" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>SUNDAY HIGH STAKES ARE BETR</h3>
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                    {sundayHighStakesActive.status === 'open' ? 'Open' : 'Closed'}
                                  </span>
                                </div>
                                <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: 'var(--fire-1)', color: 'var(--bg-0)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>SUNDAY HIGH STAKES</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Submit your cast. Get the password and play on Club GG.</p>
                                {sundayHighStakesActive.status === 'open' && (() => {
                                  const startsAt = sundayHighStakesActive.starts_at;
                                  if (!startsAt) {
                                    return (
                                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,23,68,0.3)', textAlign: 'center' }}>
                                        <span className="neon-open-now">OPEN NOW</span>
                                        <button
                                          type="button"
                                          className="btn-secondary"
                                          style={{ display: 'block', margin: '8px auto 0', fontSize: '0.8rem' }}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setShowShsSubmitPopup(true);
                                          }}
                                        >
                                          Submit URL
                                        </button>
                                      </div>
                                    );
                                  }
                                  const start = new Date(startsAt).getTime();
                                  const end = start + 30 * 60 * 1000;
                                  const now = Date.now();
                                  if (now < start) {
                                    const d = Math.max(0, start - now);
                                    const m = Math.floor(d / 60000);
                                    const s = Math.floor((d % 60000) / 1000);
                                    return (
                                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,23,68,0.3)', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-1)' }}>
                                        Starts in {m}:{s.toString().padStart(2, '0')}
                                      </div>
                                    );
                                  }
                                  if (now > end) {
                                    return (
                                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,23,68,0.3)', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-1)' }}>
                                        Game in progress — no more signups
                                      </div>
                                    );
                                  }
                                  return (
                                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,23,68,0.3)', textAlign: 'center' }}>
                                      <span className="neon-open-now">OPEN NOW</span>
                                      <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ display: 'block', margin: '8px auto 0', fontSize: '0.8rem' }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setShowShsSubmitPopup(true);
                                        }}
                                      >
                                        Submit URL
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </Link>
                        </div>
                      )}

                      {ncaaHoopsActive && (
                        <div className="mb-4">
                          <Link href={`/ncaa-hoops?contestId=${ncaaHoopsActive.id}`} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div
                              className="hl-card hl-card--active"
                              style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '268px', background: 'var(--bg-2)', borderRadius: '12px', marginBottom: '8px' }}>
                                <span style={{ color: 'var(--text-1)', fontSize: '1.25rem' }}>🏀 NCAA HOOPS</span>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                  <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>NCAA HOOPS</h3>
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                    {ncaaHoopsActive.status === 'open' ? 'Open' : ncaaHoopsActive.status === 'picks_closed' ? 'Picks closed' : ncaaHoopsActive.status === 'in_progress' ? 'In progress' : ncaaHoopsActive.status === 'settled' ? 'Settled' : ncaaHoopsActive.status}
                                  </span>
                                </div>
                                <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: '#0d9488', color: 'var(--bg-0)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>NCAA HOOPS</span>
                                <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>March Madness bracket. Pick winners. 1–2–4–8–16–32–64 pts.</p>
                              </div>
                            </div>
                          </Link>
                        </div>
                      )}

                      {moleGames.length > 0 && (
                        <Link href="/the-mole" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                          <div
                            className={`hl-card ${moleGames.length > 0 ? 'hl-card--active' : ''}`}
                            style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <Image src="/themole.png" alt="THE MOLE" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>THE MOLE</h3>
                                {moleGames.length > 0 && (
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                    {moleGames[0].status === 'signup' ? 'Signups Open' : moleGames[0].status === 'in_progress' ? 'Game In Progress' : moleGames[0].status === 'mole_won' ? 'Mole Won — Settle' : ''}
                                  </span>
                                )}
                              </div>
                              <span className="hl-badge hl-badge--fire" style={{ display: 'inline-block', marginBottom: '8px' }}>THE MOLE</span>
                              <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Find the mole. All must agree and be right to advance!</p>
                            </div>
                          </div>
                        </Link>
                      )}

                      {/* STEAL OR NO STEAL card */}
                      {stealNoStealGames.length > 0 && (
                        <Link href={stealNoStealGames.length === 1 ? `/steal-no-steal?gameId=${stealNoStealGames[0].id}` : '/steal-no-steal'} className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                          <div
                            className={`hl-card ${stealNoStealGames.length > 0 ? 'hl-card--active' : ''}`}
                            style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <Image src="/stealornosteal.png" alt="STEAL OR NO STEAL" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>STEAL OR NO STEAL</h3>
                                {stealNoStealGames.length > 0 && (
                                  <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                    {stealNoStealGames[0].status === 'signup' ? 'Signups Open' : 'Game In Progress'}
                                  </span>
                                )}
                              </div>
                              <span className="hl-badge hl-badge--fire" style={{ display: 'inline-block', marginBottom: '8px' }}>STEAL OR NO STEAL</span>
                              <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Which briefcase will take you to the finals? Only 2 people know the real truth....</p>
                            </div>
                          </div>
                        </Link>
                      )}

                      {/* HEADS UP Steal or No Steal card (Phase 17.7) */}
                      {headsUpGames.length > 0 && (
                        <Link href={headsUpGames.length === 1 ? `/heads-up-steal-no-steal?gameId=${headsUpGames[0].id}` : '/heads-up-steal-no-steal'} className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                          <div
                            className="hl-card hl-card--active"
                            style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <Image src="/stealornosteal.png" alt="HEADS UP Steal or No Steal" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="text-lg font-semibold text-primary" style={{ color: 'var(--fire-1)', fontWeight: 600, margin: 0 }}>HEADS UP Steal or No Steal</h3>
                                <span style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                  {headsUpGames[0].status === 'signup' ? 'Signups Open' : 'Game In Progress'}
                                </span>
                              </div>
                              <span className="hl-badge hl-badge--fire" style={{ display: 'inline-block', marginBottom: '8px' }}>HEADS UP</span>
                              <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>Pick the right case and you will WIN BETR GAMES!</p>
                            </div>
                          </div>
                        </Link>
                      )}

                      {/* SUPERBOWL SQUARES card */}
                      {superbowlSquaresGames.length > 0 && (
                        <Link href="/superbowl-squares" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                          <div
                            className={`hl-card ${superbowlSquaresGames.length > 0 ? 'hl-card--active' : ''}`}
                            style={{ 
                              transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
                              border: '1px solid rgba(0, 255, 200, 0.3)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="text-lg font-semibold text-primary" style={{ color: '#00ffc8', fontWeight: 600, margin: 0 }}>BETR SUPERBOWL SQUARES</h3>
                                {superbowlSquaresGames.length > 0 && (
                                  <span style={{ color: '#00ffc8', fontSize: '0.75rem' }}>
                                    {superbowlSquaresGames[0].status === 'setup' ? 'Coming Soon' :
                                     superbowlSquaresGames[0].status === 'claiming' ? 'Claiming Open' :
                                     superbowlSquaresGames[0].status === 'locked' ? 'Grid Locked' : 'Active'}
                                  </span>
                                )}
                              </div>
                              <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: 'rgba(0, 255, 200, 0.2)', color: '#00ffc8' }}>SUPERBOWL SQUARES</span>
                              <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: 0 }}>10x10 grid. Claim squares based on your staking tier. Win when scores match!</p>
                            </div>
                          </div>
                        </Link>
                      )}

                      {/* Phase 26: SUPERBOWL PROPS card */}
                      {superbowlPropsGame && (
                        <Link href="/superbowl-props" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                          <div
                            className="hl-card hl-card--active"
                            style={{ 
                              transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
                              border: '1px solid rgba(234, 179, 8, 0.3)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="text-lg font-semibold text-primary" style={{ color: '#eab308', fontWeight: 600, margin: 0 }}>BETR SUPERBOWL: PROPS</h3>
                                <span style={{ color: '#eab308', fontSize: '0.75rem' }}>
                                  {superbowlPropsGame.status === 'open' ? 'OPEN' : superbowlPropsGame.status === 'settled' ? 'SETTLED' : 'CLOSED'}
                                </span>
                              </div>
                              <span className="hl-badge" style={{ display: 'inline-block', marginBottom: '8px', background: 'rgba(234, 179, 8, 0.2)', color: '#eab308' }}>25 PROPS</span>
                              <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)', margin: '4px 0 0 0', fontSize: '0.85rem' }}>Payout: 20M + 20M potentially</p>
                              <p className="text-sm text-secondary" style={{ color: 'var(--text-1)', margin: '2px 0 0 0', fontSize: '0.8rem' }}>Must be staking 1M $BETR to play</p>
                              <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: '1.5' }}>
                                <div>Most correct answers — 10M</div>
                                <div>2nd — 5M</div>
                                <div>3rd — 4.2M</div>
                                <div>Least correct — 4.2M</div>
                                <div style={{ color: '#D946EF', fontWeight: 600, marginTop: '4px' }}>Betr believer bonus: add 5M $BETR to any prize if you stake 50M</div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      )}

                      {/* betrgameswinner image: 350×350, teal glow, click → /results (plan 10.3.3) */}
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', marginBottom: '8px' }}>
                        <Link href="/results" className="block">
                          <span
                            className="inline-block rounded-lg"
                            style={{
                              boxShadow: '0 0 10px #14B8A6, 0 0 20px #14B8A6',
                              padding: '4px',
                            }}
                          >
                            <Image
                              src="/betrgameswinner.png"
                              alt="BETR Games Winners - View Results"
                              width={350}
                              height={350}
                              className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                            />
                          </span>
                        </Link>
                      </div>

                    </div>

                    {/* Phase 22.1: Registration overlay - compact version with image + button + countdown */}
                    {showGate && showRegistrationOverlay && (
                      <div
                        role="presentation"
                        onClick={() => setShowRegistrationOverlay(false)}
                        style={{
                          position: 'fixed',
                          inset: 0,
                          zIndex: 1000,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0, 0, 0, 0.7)',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          role="dialog"
                          aria-label="BETR GAMES registration"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: '#000',
                            borderRadius: 'var(--radius-card)',
                            border: '1px solid rgba(20, 184, 166, 0.5)',
                            boxShadow: '0 0 22px rgba(20, 184, 166, 0.45), 0 0 55px rgba(20, 184, 166, 0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '24px',
                            textAlign: 'center',
                            cursor: 'default',
                            position: 'relative',
                            maxWidth: '90vw',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setShowRegistrationOverlay(false)}
                            aria-label="Close"
                            style={{
                              position: 'absolute',
                              top: '10px',
                              right: '10px',
                              width: '28px',
                              height: '28px',
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text-2)',
                              fontSize: '1.25rem',
                              lineHeight: 1,
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                          <Image src="/betrgames.png" alt="BETR GAMES" width={260} height={180} style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain', marginBottom: '16px' }} />
                          {!registrationClosed ? (
                            <>
                              <button
                                type="button"
                                onClick={handleBetrGamesRegister}
                                className="btn-primary"
                                disabled={betrGamesRegistering || betrGamesRegistered === null}
                                style={{ 
                                  padding: '12px 24px', 
                                  fontSize: '1rem', 
                                  minHeight: '44px', 
                                  marginBottom: '12px',
                                  boxShadow: '0 0 20px rgba(239, 68, 68, 0.4), 0 0 40px rgba(239, 68, 68, 0.2)',
                                  animation: 'pulseGlowRed 2s ease-in-out infinite',
                                }}
                              >
                                {betrGamesRegistered === null ? 'Checking…' : (betrGamesRegistering ? 'Registering…' : 'Register')}
                              </button>
                              <div
                                style={{
                                  fontSize: '0.875rem',
                                  fontWeight: 600,
                                  color: 'var(--fire-1)',
                                  textShadow: '0 0 8px rgba(20, 184, 166, 0.8)',
                                }}
                              >
                                Registration open
                              </div>
                            </>
                          ) : (
                            <div
                              style={{
                                fontSize: '1.125rem',
                                fontWeight: 700,
                                color: '#ef4444',
                              }}
                            >
                              Registration Closed
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sign-in overlay: fixed viewport-centered ~60% panel; dismissible via X or click-outside (10.3.3) */}
                    {showSignInMessage && !signInOverlayDismissed && (
                      <div
                        role="presentation"
                        onClick={() => setSignInOverlayDismissed(true)}
                        style={{
                          position: 'fixed',
                          inset: 0,
                          zIndex: 1000,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0, 0, 0, 0.5)',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          role="dialog"
                          aria-label="Sign in to access BETR GAMES"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '60vw',
                            height: '60vh',
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            background: '#000',
                            borderRadius: 'var(--radius-card)',
                            border: '1px solid rgba(20, 184, 166, 0.5)',
                            boxShadow: '0 0 22px rgba(20, 184, 166, 0.45), 0 0 55px rgba(20, 184, 166, 0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '18px',
                            textAlign: 'center',
                            cursor: 'default',
                            overflow: 'auto',
                            position: 'relative',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSignInOverlayDismissed(true)}
                            aria-label="Close"
                            style={{
                              position: 'absolute',
                              top: '10px',
                              right: '10px',
                              width: '28px',
                              height: '28px',
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text-2)',
                              fontSize: '1.25rem',
                              lineHeight: 1,
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                          <div style={{ fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--fire-1)', marginBottom: '8px' }}>
                            Sign in to access BETR GAMES
                          </div>
                          <p style={{ color: 'var(--text-1)', marginBottom: '14px' }}>
                            Sign in with Farcaster to access BETR GAMES content. Poker games are always visible below.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Loud neon teal divider */}
                <div className="neon-divider neon-divider--animated" style={{ margin: '22px 0' }} />

                {/* BETR POKER (existing behavior, new placement) */}
                <section ref={betrPokerRef} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fire-1)' }}>
                      BETR POKER
                    </h2>
                  </div>

                  {/* Poker controls row (moved under BETR POKER). About stays top-level. */}
                  <div className="text-center mb-6" style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                    {isAdmin ? (
                      <>
                  <Link
                    href={`/clubs/${slug}/games/new`}
                    className="btn-primary"
                          style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
                  >
                          Create New Game
                  </Link>
                        {pendingRequestsCount > 0 && (
                          <button
                            onClick={() => setShowAdminRequests(true)}
                            className="btn-primary relative"
                            style={{ padding: '4px 8px', fontSize: '8px', minHeight: 'auto', background: 'linear-gradient(135deg, var(--ember-0) 0%, var(--ember-1) 100%)' }}
                          >
                            Requests ({pendingRequestsCount})
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={async () => {
                          try {
                            const { sdk } = await import('@farcaster/miniapp-sdk');
                            if (sdk?.actions?.composeCast) {
                              const miniAppUrl = typeof window !== 'undefined'
                                ? window.location.origin + `/clubs/${HELLFIRE_CLUB_SLUG}/games`
                                : `https://poker-swart.vercel.app/clubs/${HELLFIRE_CLUB_SLUG}/games`;
                              await sdk.actions.composeCast({
                                text: 'i would like to play poker who is with me?',
                                embeds: [miniAppUrl],
                              });
                            } else {
                              alert('This feature requires Warpcast. Please open this mini app in Warpcast to share.');
                            }
                          } catch (error) {
                            console.error('Failed to open cast composer:', error);
                            alert('Failed to open cast composer. Please try again.');
                          }
                        }}
                        className="btn-primary"
                        style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
                      >
                        Request a Game
                      </button>
                    )}

                    <Link
                      href={clubHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary"
                      style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
                    >
                      Club GG
                    </Link>

                    <Link
                      href="/burrfriends"
                      className="btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '8px', display: 'inline-block', minHeight: 'auto' }}
                    >
                      BETR WITH BURR
                    </Link>
                  </div>

                  {displayGames.length === 0 ? (
                    <div className="hl-card text-center">
                      <p className="text-primary mb-4" style={{ color: 'var(--text-1)' }}>
                        {showHistory ? 'No game history yet.' : 'No games yet.'}
                      </p>
                      {isOwner && !showHistory && (
                        <Link href={`/clubs/${slug}/games/new`} className="btn-primary">
                          Create First Game
                        </Link>
                      )}
                    </div>
                  ) : (
            <div className="space-y-4">
              {displayGames.map((game) => {
                const participantCount = game.participant_count ?? participantCountsByGame[game.id] ?? 0;
                const badges = getGameBadges(game, participantCount);
                // Pulsing glow is based on registration being open, not "In progress" status
                const registrationOpen = (game as any).registrationOpen !== false; // Default to true if not set
                const isActive = registrationOpen && badges.primaryLabel !== 'Settled' && badges.primaryLabel !== 'Cancelled' && badges.primaryLabel !== 'Closed';
                const isInactive = badges.primaryLabel && (badges.primaryLabel === 'Settled' || badges.primaryLabel === 'Cancelled' || badges.primaryLabel === 'Closed');
                // Check if user has joined - if so, use green glow instead of red
                const hasJoined = game.viewer_has_joined === true;
                
                return (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="block"
                style={{ textDecoration: 'none', cursor: 'pointer' }}
              >
                <div
                  className={`hl-card ${hasJoined && isActive ? 'hl-card--joined' : isActive ? 'hl-card--active' : isInactive ? 'hl-card--inactive' : ''}`}
                  style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div className="flex-1">
                    {game.id === 'a47b5a0e-c614-47c3-b267-64c932838f05' && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                        <Image src="/bullied.png" alt="BULLIED" width={89} height={89} style={{ borderRadius: '12px', objectFit: 'contain' }} />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>{game.title || 'Untitled Game'}</h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <GameCountdownTimer game={game} />
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!token) return;
                              try {
                                const res = await authedFetch(
                                  `/api/games/${game.id}`,
                                  { method: 'PATCH', body: JSON.stringify({ is_pinned: !(game.is_pinned ?? false) }) },
                                  token
                                );
                                if (res.ok) loadData();
                              } catch {
                                // non-blocking
                              }
                            }}
                            title={game.is_pinned ? 'Unpin game' : 'Pin game to top'}
                            style={{
                              padding: '4px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: game.is_pinned ? 'var(--fire-1)' : 'var(--text-1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            aria-label={game.is_pinned ? 'Unpin game' : 'Pin game to top'}
                          >
                            <Pin size={16} style={{ opacity: game.is_pinned ? 1 : 0.6 }} />
                          </button>
                        )}
                      </div>
                    </div>
                    {game.description && (
                      <p className="text-sm text-secondary mb-2" style={{ color: 'var(--text-1)' }}>{game.description}</p>
                    )}
                    <div className="flex items-center gap-2 mb-2" style={{ flexWrap: 'nowrap' }}>
                      {(() => {
                        // BULLIED BY BETR: when registration closed, show "Click here for password" (joined) or "You are not eligible..." (not joined)
                        if (game.id === BULLIED_BY_BETR_GAME_ID && badges.primaryLabel === 'Registration closed') {
                          if (game.viewer_has_joined) {
                            return (
                              <Link
                                href={`/games/${game.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hl-badge hl-badge--fire"
                                style={{ cursor: 'pointer', textDecoration: 'none' }}
                              >
                                Click here for password
                              </Link>
                            );
                          }
                          return (
                            <span className="hl-badge hl-badge--muted">
                              You are not eligible to play in this game.
                            </span>
                          );
                        }
                        // All other games: show "You are registered" for this game when joined, else primaryLabel
                        const isBulliedByBetrJoined = game.id === BULLIED_BY_BETR_GAME_ID && game.viewer_has_joined === true;
                        const displayLabel = isBulliedByBetrJoined ? 'You are registered' : badges.primaryLabel;
                        return displayLabel ? (
                        <span className={`hl-badge ${
                          displayLabel === 'Open' ? '' :
                          displayLabel === 'Registration open' ? 'hl-badge--fire' :
                          displayLabel === 'In progress' ? 'hl-badge--fire' :
                          displayLabel === 'You are registered' ? 'hl-badge--fire' :
                          displayLabel === 'Registration closed' ? 'hl-badge--muted' :
                          displayLabel === 'Settled' ? 'hl-badge--muted' :
                          displayLabel === 'Cancelled' ? 'hl-badge--muted' :
                          displayLabel === 'Closed' ? 'hl-badge--muted' :
                          ''
                        }`}>
                          {displayLabel}
                        </span>
                        ) : null;
                      })()}
                      {(badges.primaryLabel === 'Registration open' || badges.primaryLabel === 'Open') && (
                        <RegistrationInfoBadge game={game} participantCount={participantCount} />
                      )}
                      {currentUserFid && isPaidGame(game) && game.entry_fee_amount && !game.viewer_has_joined ? (
                        <span 
                          className={`hl-badge ${game.gating_type === 'open' ? '' : 'hl-badge--fire'}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const registrationOpen = (game as any).registrationOpen !== false;
                            if (registrationOpen) {
                              setGameForPayment(game);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
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
                      ) : (
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
                      )}
                    </div>
                    {/* Participant count and spots open - clickable to show participants */}
                    <div 
                      className="text-xs text-tertiary mb-2 flex items-center gap-2 flex-wrap" 
                      style={{ 
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedGameForParticipants(game);
                      }}
                    >
                      <span>
                        {(() => {
                          const participantCount = game.participant_count ?? participantCountsByGame[game.id] ?? 0;
                          // Use effectiveMaxParticipants from API (enriched by enrichGameWithRegistrationStatus), 
                          // fallback to helper function if missing (shouldn't happen in normal flow)
                          const effectiveMax = game.effectiveMaxParticipants ?? getEffectiveMaxParticipants({
                            game_type: game.game_type,
                            max_participants: game.max_participants,
                          });
                          // Use spotsOpen from API, fallback to calculated value
                          const spots = game.spotsOpen ?? (effectiveMax !== null && effectiveMax !== undefined ? Math.max(effectiveMax - participantCount, 0) : null);
                          
                          if (effectiveMax !== null && effectiveMax !== undefined) {
                            return (
                              <>
                                {participantCount}/{effectiveMax} joined • {spots} spots open • {formatStakingRequirement(game.staking_min_amount)}
                              </>
                            );
                          } else {
                            // Only show "Unlimited" for truly unlimited games (legacy edge case, not large_event)
                            return (
                              <>
                                <span>Unlimited spots</span> • {formatStakingRequirement(game.staking_min_amount)}
                              </>
                            );
                          }
                        })()}
                      </span>
                      {/* Already Joined Badge - inline with participant count, green style */}
                      {currentUserFid && (() => {
                        // Use viewer_has_joined from API response (correctly keyed by gameId)
                        const hasJoined = game.viewer_has_joined === true;
                        // Only show badge if viewer has joined THIS specific game
                        return hasJoined ? (
                          <span 
                            className="hl-badge hl-badge--green" 
                            style={{ cursor: 'default' }} 
                            onClick={(e) => e.stopPropagation()}
                          >
                            ✓ You&apos;ve joined
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {/* Floating egg emojis for EGGS games */}
                  {(() => {
                    const currency = game.entry_fee_currency || (game as any).buy_in_currency || 'USDC';
                    if (currency === 'EGGS') {
                      return <FloatingEggEmojis gameId={game.id} />;
                    }
                    return null;
                  })()}
                </div>
              </Link>
              );
              })}
                    </div>
                  )}

                  {showHistory && (
                    <div className="hl-card mt-4" style={{ padding: '16px' }}>
                      <h3 style={{ marginBottom: '8px' }}>FRAMEDL BETR – Past rounds</h3>
                      {remixHistoryLoading ? (
                        <p style={{ color: 'var(--text-1)' }}>Loading…</p>
                      ) : remixHistory.length === 0 ? (
                        <p style={{ color: 'var(--text-1)' }}>No rounds yet.</p>
                      ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {remixHistory.map((r, i) => (
                            <li key={i} style={{ marginBottom: '8px', fontSize: '0.875rem' }}>
                              <strong>{r.round_label || 'Round'}</strong> · {new Date(r.chosen_at).toLocaleDateString()}
                              <ul style={{ marginTop: '4px', paddingLeft: '16px' }}>
                                {[...r.winners].sort((a, b) => a.position - b.position).map((w) => (
                                  <li key={w.fid}>#{w.position} {w.display_name || w.username || `FID ${w.fid}`} — {w.amount} BETR</li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {showHistory && (
                    <>
                      <div className="hl-card mt-4" style={{ padding: '16px' }}>
                        <h3 style={{ marginBottom: '8px' }}>BETR GUESSER – Past games</h3>
                        {remixHistoryLoading ? (
                          <p style={{ color: 'var(--text-1)' }}>Loading…</p>
                        ) : betrGuesserHistory.length === 0 ? (
                          <p style={{ color: 'var(--text-1)' }}>No games yet.</p>
                        ) : (
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {betrGuesserHistory.map((g, i) => (
                              <li key={i} style={{ marginBottom: '8px', fontSize: '0.875rem' }}>
                                <strong>Winner:</strong> {g.winner?.display_name || g.winner?.username || `FID ${g.winnerFid}`} guessed {g.winnerGuess} · {g.prizeAmount} BETR · {new Date(g.settledAt).toLocaleDateString()}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="hl-card mt-4" style={{ padding: '16px' }}>
                        <h3 style={{ marginBottom: '8px' }}>BUDDY UP – Past games</h3>
                        {buddyUpHistory.length === 0 && <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No past games</p>}
                        {buddyUpHistory.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {buddyUpHistory.slice(0, 5).map((h: any) => (
                              <div key={h.gameId} style={{ padding: '8px', border: '1px solid var(--stroke)', borderRadius: '6px', background: 'var(--bg-2)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {h.winner?.pfp_url && (
                                    <img src={h.winner.pfp_url} alt={h.winner.display_name || h.winner.username || `FID ${h.winnerFid}`} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                                  )}
                                  <div style={{ flex: 1, fontSize: '0.875rem' }}>
                                    <div style={{ color: 'var(--text-0)' }}>
                                      Winner: <strong>{h.winner?.display_name || h.winner?.username || `FID ${h.winnerFid}`}</strong>
                                    </div>
                                    <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>
                                      Prize: {h.prizeAmount} BETR • {new Date(h.settledAt).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="hl-card mt-4" style={{ padding: '16px' }}>
                        <h3 style={{ marginBottom: '8px' }}>BULLIED – Past games</h3>
                        {bulliedHistory.length === 0 && <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No past games</p>}
                        {bulliedHistory.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {bulliedHistory.slice(0, 5).map((h: any) => (
                              <div key={h.id} style={{ padding: '8px', border: '1px solid var(--stroke)', borderRadius: '6px', background: 'var(--bg-2)' }}>
                                <div style={{ fontSize: '0.875rem' }}>
                                  <div style={{ color: 'var(--text-0)', marginBottom: '4px' }}>
                                    <strong>{h.title || 'BULLIED'}</strong>
                                  </div>
                                  {h.winners && h.winners.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {h.winners.map((w: any) => (
                                        <div key={w.fid} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          {w.pfp_url && (
                                            <img src={w.pfp_url} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />
                                          )}
                                          <span style={{ color: 'var(--fire-1)' }}>
                                            {w.display_name || w.username || `FID ${w.fid}`}
                                          </span>
                                          <span style={{ color: 'var(--text-2)', fontSize: '0.7rem' }}>advanced</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ color: 'var(--text-2)' }}>No winners</div>
                                  )}
                                  <div style={{ color: 'var(--text-2)', fontSize: '0.7rem', marginTop: '4px' }}>
                                    {h.settled_at ? new Date(h.settled_at).toLocaleDateString() : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="hl-card mt-4" style={{ padding: '16px' }}>
                        <h3 style={{ marginBottom: '8px' }}>THE MOLE – Past games</h3>
                        {moleHistory.length === 0 && <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No past games</p>}
                        {moleHistory.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {moleHistory.slice(0, 5).map((h: any) => {
                              const w = h.winners?.[0];
                              return (
                                <div key={h.id} style={{ padding: '8px', border: '1px solid var(--stroke)', borderRadius: '6px', background: 'var(--bg-2)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {w?.pfp_url && (
                                      <img src={w.pfp_url} alt={w.display_name || w.username || `FID ${w.fid}`} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                                    )}
                                    <div style={{ flex: 1, fontSize: '0.875rem' }}>
                                      <div style={{ color: 'var(--text-0)' }}>
                                        Winner: <strong>{w?.display_name || w?.username || `FID ${w?.fid}`}</strong>
                                        {h.mole_winner_fid ? ' (Mole)' : ''}
                                      </div>
                                      <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>
                                        Prize: {h.prize_amount} BETR • {new Date(h.settled_at).toLocaleDateString()}
                                      </div>
                                    </div>
                                  </div>
            </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="hl-card mt-4" style={{ padding: '16px' }}>
                        <h3 style={{ marginBottom: '8px' }}>STEAL OR NO STEAL – Past games</h3>
                        {stealNoStealHistory.length === 0 && <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No past games</p>}
                        {stealNoStealHistory.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {stealNoStealHistory.slice(0, 5).map((h: any) => {
                              const w = h.winners?.[0];
                              return (
                                <div key={h.id} style={{ padding: '8px', border: '1px solid var(--stroke)', borderRadius: '6px', background: 'var(--bg-2)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {w?.pfp_url && (
                                      <img src={w.pfp_url} alt={w.display_name || w.username || `FID ${w.fid}`} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                                    )}
                                    <div style={{ flex: 1, fontSize: '0.875rem' }}>
                                      <div style={{ color: 'var(--text-0)' }}>
                                        Winner: <strong>{w?.display_name || w?.username || `FID ${w?.fid}`}</strong>
                                      </div>
                                      <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>
                                        Prize: {h.prize_amount} BETR • {new Date(h.settled_at).toLocaleDateString()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </>
                  )}
                </section>
              </>
            );
          }

          // Non-BETR WITH BURR clubs: preserve existing layout
          return (
            <>
              {!showHistory && (
                <Link href="/remix-betr" className="block mb-4" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                  <div
                    className="hl-card hl-card--active"
                    style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <Image src="/FRAMEDL.png" alt="FRAMEDL" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />
                    </div>
                    <div className="flex-1" style={{ textAlign: 'center' }}>
                      <h2 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>FRAMEDL BETR</h2>
                      <span className="hl-badge hl-badge--fire" style={{ display: 'inline-block', marginTop: '4px' }}>FRAMEDL BETR</span>
                      <p className="text-sm text-secondary mt-2" style={{ color: 'var(--text-1)' }}>Play FRAMEDL, submit your result here.</p>
                    </div>
                  </div>
                </Link>
              )}

              {displayGames.length === 0 ? (
                <div className="hl-card text-center">
                  <p className="text-primary mb-4" style={{ color: 'var(--text-1)' }}>
                    {showHistory ? 'No game history yet.' : 'No games yet.'}
                  </p>
                  {isOwner && !showHistory && (
                    <Link href={`/clubs/${slug}/games/new`} className="btn-primary">
                      Create First Game
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {displayGames.map((game) => {
                    const participantCount = game.participant_count ?? participantCountsByGame[game.id] ?? 0;
                    const badges = getGameBadges(game, participantCount);
                    const registrationOpen = (game as any).registrationOpen !== false;
                    const isActive = registrationOpen && badges.primaryLabel !== 'Settled' && badges.primaryLabel !== 'Cancelled' && badges.primaryLabel !== 'Closed';
                    const isInactive = badges.primaryLabel && (badges.primaryLabel === 'Settled' || badges.primaryLabel === 'Cancelled' || badges.primaryLabel === 'Closed');
                    const hasJoined = game.viewer_has_joined === true;

                    return (
                      <Link
                        key={game.id}
                        href={`/games/${game.id}`}
                        className="block"
                        style={{ textDecoration: 'none', cursor: 'pointer' }}
                      >
                        <div
                          className={`hl-card ${hasJoined && isActive ? 'hl-card--joined' : isActive ? 'hl-card--active' : isInactive ? 'hl-card--inactive' : ''}`}
                          style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                              <h2 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>{game.title || 'Untitled Game'}</h2>
                              <GameCountdownTimer game={game} />
                            </div>
                            {game.description && (
                              <p className="text-sm text-secondary mb-2" style={{ color: 'var(--text-1)' }}>{game.description}</p>
                            )}
                            {/* (rest of card is unchanged below) */}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {showHistory && (
                <div className="hl-card mt-4" style={{ padding: '16px' }}>
                  <h3 style={{ marginBottom: '8px' }}>FRAMEDL BETR – Past rounds</h3>
                  {remixHistoryLoading ? (
                    <p style={{ color: 'var(--text-1)' }}>Loading…</p>
                  ) : remixHistory.length === 0 ? (
                    <p style={{ color: 'var(--text-1)' }}>No rounds yet.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {remixHistory.map((r, i) => (
                        <li key={i} style={{ marginBottom: '8px', fontSize: '0.875rem' }}>
                          <strong>{r.round_label || 'Round'}</strong> · {new Date(r.chosen_at).toLocaleDateString()}
                          <ul style={{ marginTop: '4px', paddingLeft: '16px' }}>
                            {[...r.winners].sort((a, b) => a.position - b.position).map((w) => (
                              <li key={w.fid}>#{w.position} {w.display_name || w.username || `FID ${w.fid}`} — {w.amount} BETR</li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {/* BETR GAMES modals (homepage section) */}
        <CreateBetrGuesserGameModal
          isOpen={createBetrGuesserModalOpen}
          onClose={() => setCreateBetrGuesserModalOpen(false)}
          onSuccess={() => {
            // Reload active games
            fetch('/api/betr-guesser/games/active')
              .then((r) => r.json())
              .then((d) => { if (d?.ok && Array.isArray(d?.data)) setBetrGuesserGames(d.data); })
              .catch(() => {});
          }}
        />
        <CreateBuddyUpGameModal
          isOpen={createBuddyUpModalOpen}
          onClose={() => setCreateBuddyUpModalOpen(false)}
          onSuccess={() => {
            fetch('/api/buddy-up/games/active')
              .then((r) => r.json())
              .then((d) => { if (d?.ok && Array.isArray(d?.data)) setBuddyUpGames(d.data); })
              .catch(() => {});
          }}
        />
        <CreateTheMoleGameModal
          isOpen={createMoleModalOpen}
          onClose={() => setCreateMoleModalOpen(false)}
          onSuccess={() => {
            fetch('/api/the-mole/games/active')
              .then((r) => r.json())
              .then((d) => { if (d?.ok && Array.isArray(d?.data)) setMoleGames(d.data); })
              .catch(() => {});
          }}
        />
        <CreateStealNoStealGameModal
          isOpen={createStealNoStealModalOpen}
          onClose={() => setCreateStealNoStealModalOpen(false)}
          onSuccess={() => {
            fetch('/api/steal-no-steal/games/active')
              .then((r) => r.json())
              .then((d) => { if (d?.ok && Array.isArray(d?.data)) setStealNoStealGames(d.data); })
              .catch(() => {});
          }}
        />
        <CreateSuperbowlSquaresGameModal
          isOpen={createSuperbowlSquaresModalOpen}
          onClose={() => setCreateSuperbowlSquaresModalOpen(false)}
          onSuccess={() => {
            fetch('/api/superbowl-squares/games/active')
              .then((r) => r.json())
              .then((d) => { if (d?.ok && Array.isArray(d?.data)) setSuperbowlSquaresGames(d.data); })
              .catch(() => {});
          }}
        />
        <CreateSuperbowlPropsGameModal
          isOpen={createSuperbowlPropsModalOpen}
          onClose={() => setCreateSuperbowlPropsModalOpen(false)}
          onCreated={() => {
            fetch('/api/superbowl-props/games/active')
              .then((r) => r.json())
              .then((d) => { if (d?.ok && d?.data?.game) setSuperbowlPropsGame(d.data.game); })
              .catch(() => {});
          }}
        />
        <RegisterForBetrGamesModal
          isOpen={betrGamesModalOpen}
          onClose={() => setBetrGamesModalOpen(false)}
          alreadyRegistered={betrGamesModalAlreadyRegistered}
          approved={betrGamesApproved}
          error={betrGamesModalError}
          errorReason={betrGamesModalErrorReason}
          stakedAmount={betrGamesModalStakedAmount}
        />

        {/* Phase 25: Opt-Out Confirmation Modal */}
        <OptOutConfirmationModal
          isOpen={optOutModalOpen}
          onClose={() => setOptOutModalOpen(false)}
          onConfirm={handleOptOut}
          isLoading={optingOut}
        />

        {/* Phase 22.10: Alive players modal — list name, PFP, FID; row click opens profile overlay */}
        {aliveModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1002,
            }}
            onClick={() => setAliveModalOpen(false)}
          >
            <div
              style={{
                background: '#1a1a1a',
                borderRadius: '12px',
                padding: '20px',
                maxWidth: '90vw',
                width: '400px',
                maxHeight: '80vh',
                overflow: 'auto',
                border: '1px solid rgba(20, 184, 166, 0.6)',
                boxShadow: '0 0 15px #14B8A6, 0 0 30px rgba(20, 184, 166, 0.4)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-1)', fontSize: '1.1rem' }}>Players remaining</h3>
                <button type="button" onClick={() => setAliveModalOpen(false)} className="btn-secondary" style={{ minWidth: '60px' }}>Close</button>
              </div>
              {alivePlayersLoading ? (
                <p style={{ color: 'var(--text-2)', margin: 0 }}>Loading…</p>
              ) : alivePlayers.length === 0 ? (
                <p style={{ color: 'var(--text-2)', margin: 0 }}>No players to show.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {alivePlayers.map((p) => {
                    const profileUrl = p.username && !p.username.startsWith('fid:') ? `https://warpcast.com/${p.username}` : `https://warpcast.com/~/profile/${p.fid}`;
                    return (
                      <li
                        key={p.fid}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setProfileOverlayUrl(profileUrl); setAliveModalOpen(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setProfileOverlayUrl(profileUrl); setAliveModalOpen(false); } }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 0',
                          borderBottom: '1px solid var(--stroke)',
                          cursor: 'pointer',
                          color: 'var(--text-1)',
                        }}
                      >
                        {p.pfp_url ? <img src={p.pfp_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} /> : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-2)' }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{p.display_name || p.username || `FID ${p.fid}`}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>FID {p.fid}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Phase 22.10: Profile overlay — iframe (same pattern as Practice 12.18) */}
        {profileOverlayUrl && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1003,
            }}
            onClick={() => setProfileOverlayUrl(null)}
          >
            <div
              style={{
                background: '#1a1a1a',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid rgba(20, 184, 166, 0.6)',
                boxShadow: '0 0 15px #14B8A6, 0 0 30px rgba(20, 184, 166, 0.4)',
                width: 'min(90vw, 720px)',
                height: 'min(85vh, 560px)',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-1)' }}>Profile</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => { window.open(profileOverlayUrl, '_blank', 'noopener,noreferrer'); }}
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '4px 8px', minHeight: 'auto' }}
                  >
                    Open in new window
                  </button>
                  <button type="button" onClick={() => setProfileOverlayUrl(null)} className="btn-secondary" style={{ minWidth: '60px' }}>Close</button>
                </div>
              </div>
              <iframe
                src={profileOverlayUrl}
                title="Profile"
                style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', borderRadius: '8px' }}
              />
            </div>
          </div>
        )}

        {/* Phase 19: Lobby Chat Modal */}
        <LobbyChatModal
          isOpen={showLobbyChatModal}
          onClose={() => setShowLobbyChatModal(false)}
        />
        <FeedbackPopupModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
        />

        {/* Phase 42: SUNDAY HIGH STAKES Submit URL popup */}
        <SundayHighStakesSubmitPopup
          isOpen={showShsSubmitPopup}
          onClose={() => setShowShsSubmitPopup(false)}
          contestTitle={sundayHighStakesActive?.title}
        />

        {/* Phase 22.1: Mini App Prompt Popup - clickable to trigger native add flow */}
        {showMiniAppPrompt && (
          <div
            onClick={handleAddMiniApp}
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              background: 'rgba(0, 0, 0, 0.95)',
              border: '1px solid var(--fire-1)',
              borderRadius: '12px',
              padding: '16px 20px',
              boxShadow: '0 0 30px rgba(45, 212, 191, 0.4), 0 0 60px rgba(45, 212, 191, 0.2)',
              zIndex: 1001,
              maxWidth: '300px',
              animation: 'fadeIn 0.3s ease-out',
              cursor: 'pointer',
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); dismissMiniAppPrompt(); }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '10px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-1)',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '0',
                lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
            <p
              style={{
                color: 'var(--fire-1)',
                textShadow: '0 0 10px rgba(45, 212, 191, 0.8), 0 0 20px rgba(45, 212, 191, 0.5)',
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 600,
                margin: 0,
                paddingRight: '16px',
              }}
            >
              Add the mini app for notifications!
            </p>
            <p
              style={{
                color: 'var(--text-2)',
                fontSize: '11px',
                marginTop: '8px',
                marginBottom: 0,
              }}
            >
              Tap to add →
            </p>
          </div>
        )}

        {/* Join BETR WITH BURR Banner - moved below games (only for BETR WITH BURR club) */}
        {isHellfireClub && bannerItems.length > 0 && (
          <div className="mb-4">
            <JoinHellfireBanner items={bannerItems} />
          </div>
        )}

        {/* Participant List Modal */}
        {selectedGameForParticipants && (
          <ParticipantListModal
            isOpen={!!selectedGameForParticipants}
            onClose={() => setSelectedGameForParticipants(null)}
            gameId={selectedGameForParticipants.id}
            gameTitle={selectedGameForParticipants.title || undefined}
          />
        )}

        {/* Hidden PaymentButton - triggered when entry fee badge is clicked */}
        {gameForPayment && currentUserFid && (
          <PaymentButtonWrapper
            game={gameForPayment}
            playerFid={currentUserFid}
            onSuccess={() => {
              setGameForPayment(null);
              loadData();
            }}
            onError={(error) => {
              const errorMessage = error + '\n\nPlease retry the payment. Sometimes the mini app fails but you have NOT been charged.';
              alert(errorMessage);
              console.error('Payment error:', error);
              setGameForPayment(null);
            }}
            buttonRef={paymentButtonRef}
          />
        )}

      </div>
    </main>
  );
}
