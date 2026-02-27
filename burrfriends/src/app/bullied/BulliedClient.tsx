'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';

type Game = {
  id: string;
  title: string;
  status: string;
  is_preview?: boolean;
  created_by_fid?: number;
  created_at?: string;
  room_timer_ends_at?: string | null;
  roulette_wheel_deployed_at?: string | null;
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
  myReason?: string | null;
  voteCount: number;
  totalMembers: number;
  votes?: Array<{ voterFid: number; votedForFid: number }>;
  rouletteWheelDeployed?: boolean;
  rouletteOptedFids?: number[];
  rouletteLockedAt?: string | null;
  unreadChatCount?: number;
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
  votes: Array<{ voterFid: number; votedForFid: number | null; reasonText?: string | null; updatedAt?: string }>;
  voteCount: number;
  totalMembers: number;
  messageCount?: number;
  activeCount?: number;
  unreadChatCount?: number;
  rouletteOptedFids?: number[];
  rouletteLockedAt?: string | null;
};

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function BulliedClient() {
  const { token, status: authStatus, fid: currentFid } = useAuth();
  const searchParams = useSearchParams();
  const urlGameId = searchParams.get('gameId')?.trim() || null;

  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myGroup, setMyGroup] = useState<MyGroup | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);

  const [voting, setVoting] = useState(false);
  const [votedForFid, setVotedForFid] = useState<number | null>(null);
  const [changingVote, setChangingVote] = useState(false);

  const [chatMessages, setChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  const [selectedGroupChatId, setSelectedGroupChatId] = useState<string | null>(null);
  const [selectedGroupChatMessages, setSelectedGroupChatMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [selectedGroupChatInput, setSelectedGroupChatInput] = useState('');
  const [sendingSelectedGroupMessage, setSendingSelectedGroupMessage] = useState(false);
  const [loadingSelectedGroupChat, setLoadingSelectedGroupChat] = useState(false);

  const groupChatSectionRef = useRef<HTMLDivElement>(null);
  const openChatScrolledRef = useRef(false);
  const groupChatScrollContainerRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<MessageWithReactionsPayload[]>([]);
  const selectedGroupChatMessagesRef = useRef<MessageWithReactionsPayload[]>([]);

  const [showAdminConfessionsModal, setShowAdminConfessionsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);
  // Phase 33.11: neon countdown (admin-adjustable)
  const [roomTimerRemainingMs, setRoomTimerRemainingMs] = useState<number | null>(null);
  const [showRoomTimerModal, setShowRoomTimerModal] = useState(false);
  const [roomTimerMinutesInput, setRoomTimerMinutesInput] = useState('');
  const [roomTimerSubmitting, setRoomTimerSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showConfessionalsModal, setShowConfessionalsModal] = useState(false);
  const [confessionalsRoundId, setConfessionalsRoundId] = useState<string | null>(null);
  const [confessionalsGroupId, setConfessionalsGroupId] = useState<string | null>(null);
  const [confessionalsReason, setConfessionalsReason] = useState('');
  const [confessionalsSubmitting, setConfessionalsSubmitting] = useState(false);
  const [confessionalsJustCleared, setConfessionalsJustCleared] = useState(false);
  const [clearingVote, setClearingVote] = useState(false);

  const [showGroupSetupModal, setShowGroupSetupModal] = useState(false);
  const [eligiblePlayers, setEligiblePlayers] = useState<
    Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>
  >([]);
  const [loadingEligiblePlayers, setLoadingEligiblePlayers] = useState(false);
  const [previewGroups, setPreviewGroups] = useState<Array<{ groupNumber: number; fids: number[] }>>([]);

  const [completingRound, setCompletingRound] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [cancellingGame, setCancellingGame] = useState(false);
  const [startingGame, setStartingGame] = useState(false);

  // Roulette Wheel state (Phase 33.9)
  const [deployingRoulette, setDeployingRoulette] = useState(false);
  const [rouletteOpting, setRouletteOpting] = useState(false);
  const [rouletteRevealing, setRouletteRevealing] = useState(false);

  const confessionalsCount = allGroups.reduce(
    (n, g) => n + (g.votes?.filter((v) => v.reasonText != null && String(v.reasonText).trim() !== '')?.length ?? 0),
    0
  );

  // Deep link: open specific game when URL has ?gameId=...
  useEffect(() => {
    if (urlGameId) setSelectedGameId(urlGameId);
  }, [urlGameId]);

  // ?openChat=1: scroll to Group Chat once when myGroup is loaded
  useEffect(() => {
    const openChat = searchParams.get('openChat');
    if (openChat !== '1' || !myGroup || openChatScrolledRef.current) return;
    openChatScrolledRef.current = true;
    const t = setTimeout(() => {
      groupChatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(t);
  }, [searchParams, myGroup]);

  // Keep chat message refs in sync for merge-by-id in loadChatMessages
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
    selectedGroupChatMessagesRef.current = selectedGroupChatMessages;
  }, [chatMessages, selectedGroupChatMessages]);

  // Load active games + admin check on mount
  useEffect(() => {
    if (authStatus === 'loading') return;
    (async () => {
      try {
        const [gamesRes, adminRes] = await Promise.all([
          fetch('/api/bullied/games/active').then((r) => r.json()),
          authStatus === 'authed' && token
            ? authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json())
            : Promise.resolve({ isAdmin: false }),
        ]);

        if (gamesRes?.ok && Array.isArray(gamesRes?.data)) {
          const sorted = [...gamesRes.data].sort((a: Game, b: Game) => {
            const rank = (s: string) => (s === 'in_progress' ? 0 : s === 'open' ? 1 : 2);
            return rank(a.status) - rank(b.status);
          });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, token, urlGameId]);

  // Load selected game details
  useEffect(() => {
    if (!selectedGameId) return;
    setGame((prev) => (prev?.id === selectedGameId ? prev : null));
    (async () => {
      try {
        const res = token
          ? await authedFetch(`/api/bullied/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json())
          : await fetch(`/api/bullied/games/${selectedGameId}`).then((r) => r.json());
        if (res?.ok && res?.data) {
          setGame(res.data);

          if (res.data.status === 'in_progress' && token) {
            const myGroupRes = await authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
            if (myGroupRes?.ok && myGroupRes?.data) {
              setMyGroup(myGroupRes.data);
              setRoundId(myGroupRes.data.roundId);
            } else if (myGroupRes?.ok && myGroupRes?.roundId) {
              setMyGroup(null);
              setRoundId(myGroupRes.roundId);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load game:', e);
      }
    })();
  }, [selectedGameId, token]);

  // Load all groups when roundId is known
  useEffect(() => {
    if (!roundId || !token || !selectedGameId) return;
    (async () => {
      try {
        const res = await authedFetch(`/api/bullied/games/${selectedGameId}/rounds/${roundId}/groups`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && Array.isArray(res?.data)) {
          setAllGroups(res.data);
        }
      } catch (e) {
        console.error('Failed to load groups:', e);
      }
    })();
  }, [roundId, selectedGameId, token]);

  // Poll my-group every 5s when in_progress
  useEffect(() => {
    if (!selectedGameId || !token || game?.status !== 'in_progress') return;
    const interval = setInterval(async () => {
      try {
        const res = await authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && res?.data) {
          setMyGroup(res.data);
          setRoundId(res.data.roundId);
        } else if (res?.ok && res?.roundId) {
          setMyGroup(null);
          setRoundId(res.roundId);
        }
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedGameId, token, game?.status]);

  // Poll all groups every 10s when in_progress and roundId known
  useEffect(() => {
    if (!selectedGameId || !token || game?.status !== 'in_progress' || !roundId) return;
    const interval = setInterval(async () => {
      try {
        const res = await authedFetch(`/api/bullied/games/${selectedGameId}/rounds/${roundId}/groups`, { method: 'GET' }, token).then((r) => r.json());
        if (res?.ok && Array.isArray(res?.data)) {
          setAllGroups(res.data);
        }
      } catch {
        // ignore
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedGameId, token, game?.status, roundId]);

  // Phase 33.11: Room countdown tick (in_progress only)
  useEffect(() => {
    if (game?.status !== 'in_progress') {
      setRoomTimerRemainingMs(null);
      return;
    }
    const endsAt = game?.room_timer_ends_at;
    if (!endsAt) {
      setRoomTimerRemainingMs(0);
      return;
    }
    const update = () => {
      const remaining = new Date(endsAt).getTime() - Date.now();
      setRoomTimerRemainingMs(remaining <= 0 ? 0 : remaining);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [game?.status, game?.room_timer_ends_at]);

  // Load chat messages (for user's own group or selected group when admin)
  const loadChatMessages = async (groupId?: string) => {
    const targetGroupId = groupId || myGroup?.groupId;
    if (!token || !selectedGameId || !targetGroupId) return;
    try {
      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/groups/${targetGroupId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && Array.isArray(res?.data)) {
        const sorted = res.data.slice().sort(
          (a: MessageWithReactionsPayload, b: MessageWithReactionsPayload) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        if (groupId) {
          const prev = selectedGroupChatMessagesRef.current;
          const prevById = new Map(prev.map((m) => [m.id, m]));
          const merged = sorted.map((msg: MessageWithReactionsPayload) => prevById.get(msg.id) ?? msg);
          if (merged.length === prev.length && merged.every((m: MessageWithReactionsPayload, i: number) => prev[i] && m.id === prev[i].id && m === prev[i])) return;
          setSelectedGroupChatMessages(merged);
        } else {
          const prev = chatMessagesRef.current;
          const prevById = new Map(prev.map((m) => [m.id, m]));
          const merged = sorted.map((msg: MessageWithReactionsPayload) => prevById.get(msg.id) ?? msg);
          if (merged.length === prev.length && merged.every((m: MessageWithReactionsPayload, i: number) => prev[i] && m.id === prev[i].id && m === prev[i])) return;
          setChatMessages(merged);
        }
      }
    } catch (e) {
      console.error('Failed to load chat:', e);
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

  // Handle viewing a group's chat (admin)
  const handleViewGroupChat = async (groupId: string) => {
    setSelectedGroupChatId(groupId);
    setSelectedGroupChatMessages([]);
    setSelectedGroupChatInput('');
    await loadSelectedGroupChat(groupId);
  };

  // Close selected group chat modal
  const handleCloseGroupChat = () => {
    setSelectedGroupChatId(null);
    setSelectedGroupChatMessages([]);
    setSelectedGroupChatInput('');
  };

  const handleReactionClick = async (groupId: string, messageId: string, reaction: 'thumbs_up' | 'x' | 'fire' | 'scream') => {
    if (!token || !selectedGameId) return;
    try {
      const res = await authedFetch(
        `/api/bullied/games/${selectedGameId}/groups/${groupId}/chat/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      await loadChatMessages(groupId);
    } catch (e) {
      console.error('Failed to set reaction:', e);
    }
  };

  // Poll chat every 8s when group is voting
  useEffect(() => {
    if (!token || !selectedGameId || !myGroup?.groupId || myGroup.status !== 'voting' || game?.status !== 'in_progress') {
      setChatMessages([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await loadChatMessages();
    };
    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedGameId, myGroup?.groupId, myGroup?.status, game?.status]);

  // Poll selected group chat every 8s when admin has modal open
  useEffect(() => {
    if (!token || !selectedGameId || !selectedGroupChatId || game?.status !== 'in_progress') return;
    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await loadSelectedGroupChat(selectedGroupChatId);
    };
    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedGameId, selectedGroupChatId, game?.status]);

  // Heartbeat for chat presence (own group or admin viewing a group chat); active = last 60s
  const currentChatGroupId = selectedGroupChatId ?? (myGroup?.status === 'voting' ? myGroup?.groupId : null);
  useEffect(() => {
    if (!token || !selectedGameId || !currentChatGroupId || game?.status !== 'in_progress') return;
    const sendHeartbeat = () => {
      authedFetch(
        `/api/bullied/games/${selectedGameId}/groups/${currentChatGroupId}/chat/heartbeat`,
        { method: 'POST' },
        token
      ).then((r) => r.json()).catch(() => {});
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [token, selectedGameId, currentChatGroupId, game?.status]);

  const handleSendMessage = async (targetGroupId?: string, messageText?: string) => {
    const groupId = targetGroupId ?? myGroup?.groupId;
    const text = targetGroupId != null ? (messageText ?? '').trim() : chatInput.trim();
    if (!token || !selectedGameId || !groupId || !text) return;
    const isSelectedGroup = !!targetGroupId;
    if (isSelectedGroup) {
      setSendingSelectedGroupMessage(true);
    } else {
      setChatSending(true);
    }
    try {
      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/groups/${groupId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to send message');
      }
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
        setChatSending(false);
      }
    }
  };

  const handleVote = async (fid: number) => {
    if (!token || !selectedGameId || !myGroup) return;
    setVoting(true);
    setVotedForFid(fid);
    try {
      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: myGroup.roundId,
          groupId: myGroup.groupId,
          votedForFid: fid,
        }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit vote');
      }
      setChangingVote(false);
      setShowConfessionalsModal(true);
      setConfessionalsRoundId(myGroup.roundId);
      setConfessionalsGroupId(myGroup.groupId);
      setConfessionalsReason('');
      const myGroupRes = await authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
      if (myGroupRes?.ok && myGroupRes?.data) {
        setMyGroup(myGroupRes.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit vote');
    } finally {
      setVoting(false);
      setVotedForFid(null);
    }
  };

  const handleClearVote = async () => {
    if (!token || !selectedGameId || !myGroup) return;
    setClearingVote(true);
    try {
      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: myGroup.roundId,
          groupId: myGroup.groupId,
          votedForFid: null,
        }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to clear vote');
      }
      setConfessionalsJustCleared(true);
      setShowConfessionalsModal(true);
      setConfessionalsRoundId(myGroup.roundId);
      setConfessionalsGroupId(myGroup.groupId);
      setConfessionalsReason('');
      const myGroupRes = await authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
      if (myGroupRes?.ok && myGroupRes?.data) {
        setMyGroup(myGroupRes.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear vote');
    } finally {
      setClearingVote(false);
    }
  };

  // Helpers for modals
  const showConfirm = (
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText = 'Confirm',
    cancelText = 'Cancel'
  ) => {
    setConfirmConfig({ message, onConfirm, onCancel, confirmText, cancelText });
    setShowConfirmModal(true);
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
  };

  const closeConfessionalsModal = () => {
    setShowConfessionalsModal(false);
    setConfessionalsRoundId(null);
    setConfessionalsGroupId(null);
    setConfessionalsReason('');
    setConfessionalsJustCleared(false);
  };

  // Escape key closes confessionals modal
  useEffect(() => {
    if (!showConfessionalsModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfessionalsModal();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showConfessionalsModal]);

  const handleSubmitConfessionalsReason = async () => {
    if (!token || !selectedGameId || confessionalsSubmitting) return;
    if (confessionalsJustCleared) {
      closeConfessionalsModal();
      const myGroupRes = await authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
      if (myGroupRes?.ok && myGroupRes?.data) {
        setMyGroup(myGroupRes.data);
      }
      return;
    }
    if (!confessionalsRoundId || !confessionalsGroupId) return;
    setConfessionalsSubmitting(true);
    try {
      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/vote/reason`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: confessionalsRoundId,
          groupId: confessionalsGroupId,
          reason: confessionalsReason,
        }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to save reason');
      }
      closeConfessionalsModal();
      const myGroupRes = await authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
      if (myGroupRes?.ok && myGroupRes?.data) {
        setMyGroup(myGroupRes.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save reason');
    } finally {
      setConfessionalsSubmitting(false);
    }
  };

  // Fisher-Yates shuffle
  const shuffle = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const calculatePreviewGroups = (players: Array<{ fid: number }>) => {
    const shuffled = shuffle(players.map((p) => p.fid));
    const groups: Array<{ groupNumber: number; fids: number[] }> = [];
    let groupNumber = 1;
    for (let i = 0; i < shuffled.length; i += 3) {
      groups.push({ groupNumber, fids: shuffled.slice(i, i + 3) });
      groupNumber++;
    }
    setPreviewGroups(groups);
  };

  const movePlayerToGroup = (playerFid: number, targetGroupNumber: number) => {
    const newGroups = [...previewGroups];
    for (const group of newGroups) {
      const index = group.fids.indexOf(playerFid);
      if (index !== -1) {
        group.fids.splice(index, 1);
        break;
      }
    }
    const targetGroup = newGroups.find((g) => g.groupNumber === targetGroupNumber);
    if (targetGroup) {
      targetGroup.fids.push(playerFid);
    } else {
      newGroups.push({ groupNumber: targetGroupNumber, fids: [playerFid] });
    }
    setPreviewGroups(newGroups);
  };

  // Admin: Start Game flow
  const handleOpenGroupSetup = async () => {
    if (!token || !selectedGameId) return;
    setLoadingEligiblePlayers(true);
    setShowGroupSetupModal(true);
    try {
      const res = await authedFetch('/api/betr-games/tournament/alive', { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && res?.data?.players && Array.isArray(res.data.players)) {
        const players = res.data.players.map((p: any) => ({
          fid: Number(p.fid),
          username: p.username ?? null,
          display_name: p.display_name ?? null,
          pfp_url: p.pfp_url ?? null,
        }));
        if (players.length === 0) {
          setError('No alive tournament players found');
          setShowGroupSetupModal(false);
          return;
        }
        setEligiblePlayers(players);
        calculatePreviewGroups(players);
      } else {
        setError('Failed to load alive players');
        setShowGroupSetupModal(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load eligible players');
      setShowGroupSetupModal(false);
    } finally {
      setLoadingEligiblePlayers(false);
    }
  };

  const handleConfirmStartGame = async () => {
    if (!token || !selectedGameId) return;
    setStartingGame(true);
    try {
      const nonEmptyGroups = previewGroups.filter((g) => g.fids.length > 0);
      if (nonEmptyGroups.length === 0) {
        throw new Error('At least one group must have players');
      }
      const renumberedGroups = nonEmptyGroups.map((g, index) => ({
        groupNumber: index + 1,
        fids: g.fids,
      }));

      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customGroups: renumberedGroups }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to start game');
      }

      setShowGroupSetupModal(false);
      setPreviewGroups([]);
      setEligiblePlayers([]);

      const gameRes = await authedFetch(`/api/bullied/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
      if (gameRes?.ok && gameRes?.data) {
        setGame(gameRes.data);
      }
      const myGroupRes = await authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json());
      if (myGroupRes?.ok && myGroupRes?.data) {
        setMyGroup(myGroupRes.data);
        setRoundId(myGroupRes.data.roundId);
      }
      if (data.data?.roundId) {
        setRoundId(data.data.roundId);
        const groupsRes = await authedFetch(`/api/bullied/games/${selectedGameId}/rounds/${data.data.roundId}/groups`, { method: 'GET' }, token).then((r) => r.json());
        if (groupsRes?.ok && Array.isArray(groupsRes?.data)) {
          setAllGroups(groupsRes.data);
        }
      }
      showSuccess('Game started!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start game');
    } finally {
      setStartingGame(false);
    }
  };

  // Roulette Wheel handlers (Phase 33.9)
  const handleDeployRoulette = async () => {
    if (!token || !selectedGameId) return;
    setDeployingRoulette(true);
    try {
      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/deploy-roulette-wheel`, {
        method: 'POST',
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to deploy roulette wheel');
      // Refetch game to pick up roulette_wheel_deployed_at
      const gameRes = await authedFetch(`/api/bullied/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
      if (gameRes?.ok && gameRes?.data) setGame(gameRes.data);
      showSuccess('Roulette Wheel deployed! All groups now see the option.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deploy roulette wheel');
    } finally {
      setDeployingRoulette(false);
    }
  };

  const handleRouletteOpt = async (groupId: string, groupRoundId: string, optIn: boolean) => {
    if (!token || !selectedGameId || !groupRoundId) return;
    setRouletteOpting(true);
    try {
      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/roulette-opt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: groupRoundId, groupId, optIn }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to update roulette opt');
      // Refetch my-group and all groups to get updated roulette state
      if (selectedGameId && token) {
        const [myGroupRes, groupsRes] = await Promise.all([
          authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json()),
          roundId ? authedFetch(`/api/bullied/games/${selectedGameId}/rounds/${roundId}/groups`, { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve(null),
        ]);
        if (myGroupRes?.ok && myGroupRes?.data) setMyGroup(myGroupRes.data);
        if (groupsRes?.ok && Array.isArray(groupsRes?.data)) setAllGroups(groupsRes.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update roulette choice');
    } finally {
      setRouletteOpting(false);
    }
  };

  const handleRouletteReveal = async (groupId: string, groupRoundId: string) => {
    if (!token || !selectedGameId || !groupRoundId) return;
    setRouletteRevealing(true);
    try {
      const res = await authedFetch(`/api/bullied/games/${selectedGameId}/roulette-reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: groupRoundId, groupId }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to reveal roulette winner');
      // Refetch my-group and all groups
      if (selectedGameId && token) {
        const [myGroupRes, groupsRes] = await Promise.all([
          authedFetch(`/api/bullied/games/${selectedGameId}/my-group`, { method: 'GET' }, token).then((r) => r.json()),
          roundId ? authedFetch(`/api/bullied/games/${selectedGameId}/rounds/${roundId}/groups`, { method: 'GET' }, token).then((r) => r.json()) : Promise.resolve(null),
        ]);
        if (myGroupRes?.ok && myGroupRes?.data) setMyGroup(myGroupRes.data);
        if (groupsRes?.ok && Array.isArray(groupsRes?.data)) setAllGroups(groupsRes.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reveal roulette winner');
    } finally {
      setRouletteRevealing(false);
    }
  };

  const handleCompleteRound = () => {
    if (!token || !selectedGameId || !roundId) return;
    showConfirm(
      'Complete this round? This will determine winners and eliminations.',
      async () => {
        setCompletingRound(true);
        try {
          const res = await authedFetch(`/api/bullied/games/${selectedGameId}/rounds/${roundId}/complete`, {
            method: 'POST',
          }, token);
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Failed to complete round');
          }
          const gameRes = await authedFetch(`/api/bullied/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
          if (gameRes?.ok && gameRes?.data) {
            setGame(gameRes.data);
          }
          setRoundId(null);
          setAllGroups([]);
          setMyGroup(null);
          showSuccess(`Round completed! ${data.data?.winners?.length ?? 0} player(s) advanced.`);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to complete round');
        } finally {
          setCompletingRound(false);
        }
      },
      undefined,
      'Complete Round',
      'Cancel'
    );
  };

  const handleEndGame = () => {
    if (!token || !selectedGameId) return;
    showConfirm(
      'End this game?',
      async () => {
        setEndingGame(true);
        try {
          const res = await authedFetch(`/api/bullied/games/${selectedGameId}/end`, {
            method: 'POST',
          }, token);
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Failed to end game');
          }
          const gameRes = await authedFetch(`/api/bullied/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
          if (gameRes?.ok && gameRes?.data) {
            setGame(gameRes.data);
          }
          showSuccess('Game ended.');
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

  const handleCancelGame = () => {
    if (!token || !selectedGameId) return;
    showConfirm(
      'Cancel this game? This cannot be undone.',
      async () => {
        setCancellingGame(true);
        try {
          const res = await authedFetch(`/api/bullied/games/${selectedGameId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cancel: true }),
          }, token);
          const data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Failed to cancel game');
          }
          const gameRes = await authedFetch(`/api/bullied/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json());
          if (gameRes?.ok && gameRes?.data) {
            setGame(gameRes.data);
          }
          showSuccess('Game cancelled.');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to cancel game');
        } finally {
          setCancellingGame(false);
        }
      },
      undefined,
      'Cancel Game',
      'Keep Game'
    );
  };

  // Reload game data helper
  const reloadGame = async () => {
    if (!selectedGameId) return;
    try {
      const res = token
        ? await authedFetch(`/api/bullied/games/${selectedGameId}`, { method: 'GET' }, token).then((r) => r.json())
        : await fetch(`/api/bullied/games/${selectedGameId}`).then((r) => r.json());
      if (res?.ok && res?.data) {
        setGame(res.data);
      }
    } catch {
      // ignore
    }
  };

  if (authStatus === 'loading' || loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-1)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '720px', margin: '0 auto' }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <Image src="/bullied.png" alt="BULLIED" width={400} height={400} style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px' }} priority />
      </div>
      {/* Header */}
      <h1 style={{ marginBottom: '8px', color: 'var(--text-0)' }}>BULLIED</h1>
      <p style={{ color: 'var(--text-1)', marginBottom: '16px', fontSize: '0.875rem', lineHeight: '1.5' }}>
        3 go in, 1 or none advance. All 3 must agree on who advances. If they don&apos;t agree, everyone is eliminated.
      </p>

      {error && (
        <p style={{ color: 'var(--ember-2)', marginBottom: '12px' }}>{error}</p>
      )}

      {/* No active games */}
      {activeGames.length === 0 && !loading && (
        <p style={{ color: 'var(--text-1)' }}>No active BULLIED games</p>
      )}

      {/* Game selector (multiple active games) */}
      {activeGames.length > 1 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-1)' }}>Select game:</label>
          <select
            value={selectedGameId || ''}
            onChange={(e) => {
              setSelectedGameId(e.target.value);
              setMyGroup(null);
              setAllGroups([]);
              setRoundId(null);
            }}
            style={{
              padding: '8px',
              border: '1px solid var(--stroke)',
              borderRadius: '6px',
              width: '100%',
              maxWidth: '400px',
              color: 'var(--text-0)',
              background: 'var(--bg-1)',
            }}
          >
            {activeGames.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}{g.status === 'in_progress' ? ' - In Progress' : g.status === 'open' ? ' - Open' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ===== GAME STATUS: open ===== */}
      {game && game.status === 'open' && (
        <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.125rem' }}>{game.title}</h2>
            <span style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--bg-2)', borderRadius: '4px', color: 'var(--fire-1)' }}>
              Open
            </span>
          </div>
          <p style={{ color: 'var(--text-1)', marginBottom: '16px' }}>
            Game Open &mdash; Waiting for admin to start
          </p>

          {isAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={handleOpenGroupSetup}
                disabled={loadingEligiblePlayers}
                style={{
                  padding: '10px 16px',
                  background: 'var(--fire-1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loadingEligiblePlayers ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {loadingEligiblePlayers ? 'Loading...' : 'Start Game'}
              </button>
              <button
                onClick={handleCancelGame}
                disabled={cancellingGame}
                style={{
                  padding: '10px 16px',
                  background: 'var(--bg-2)',
                  color: 'var(--text-0)',
                  border: '1px solid var(--stroke)',
                  borderRadius: '6px',
                  cursor: cancellingGame ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                {cancellingGame ? 'Cancelling...' : 'Cancel Game'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== GAME STATUS: in_progress ===== */}
      {game && game.status === 'in_progress' && (
        <>
          {/* Phase 33.11: Neon countdown or Results in Process */}
          <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            {(() => {
              const displayMs = roomTimerRemainingMs !== null
                ? roomTimerRemainingMs
                : (game.room_timer_ends_at ? Math.max(0, new Date(game.room_timer_ends_at).getTime() - Date.now()) : 0);
              const showResultsInProcess = !game.room_timer_ends_at || displayMs <= 0;
              return showResultsInProcess ? (
              <div
                className="neon-results-in-process"
                style={{
                  fontSize: 'clamp(1.25rem, 4vw, 2rem)',
                  fontWeight: 700,
                  color: 'var(--fire-1)',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}
                onClick={isAdmin ? () => setShowRoomTimerModal(true) : undefined}
                role={isAdmin ? 'button' : undefined}
              >
                Results in Process
              </div>
            ) : (
              <div
                style={{
                  fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                  fontWeight: 700,
                  color: 'var(--fire-1)',
                  textShadow: '0 0 8px var(--fire-1), 0 0 16px var(--fire-1)',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}
                onClick={isAdmin ? () => setShowRoomTimerModal(true) : undefined}
                role={isAdmin ? 'button' : undefined}
              >
                {displayMs >= 60 * 60 * 1000
                  ? `${Math.floor(displayMs / (60 * 60 * 1000))}h ${Math.floor((displayMs % (60 * 60 * 1000)) / (60 * 1000))}m`
                  : `${Math.floor(displayMs / (60 * 1000))}m ${Math.floor((displayMs % (60 * 1000)) / 1000)}s`}
              </div>
            );
            })()}
          </div>

          <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--stroke)', borderLeft: '4px solid var(--fire-1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.125rem' }}>{game.title}</h2>
              <span style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--fire-1)', borderRadius: '4px', color: '#fff' }}>
                In Progress
              </span>
            </div>
          </div>

          {/* My Group Section */}
          {myGroup && (
            <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
              <h3 style={{ marginBottom: '12px', color: 'var(--text-0)' }}>Your Group (Group {myGroup.groupNumber})</h3>
              <p style={{ color: 'var(--text-1)', marginBottom: '12px', fontSize: '0.875rem' }}>
                {myGroup.voteCount}/{myGroup.totalMembers} voted
              </p>

              {/* Member list */}
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
                            color: 'var(--fire-1)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            padding: 0,
                            textAlign: 'left',
                            fontSize: '0.875rem',
                          }}
                        >
                          {member.display_name || member.username || `FID ${member.fid}`}
                        </button>
                        {member.username && (
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-1)' }}>@{member.username}</p>
                        )}
                      </div>
                      {hasVoted && <span style={{ fontSize: '0.75rem', color: 'var(--fire-1)' }}>Voted</span>}
                    </div>
                  );
                })}
              </div>

              {/* Voting UI — show when haven't voted OR when changing vote */}
              {(!myGroup.hasVoted || changingVote) && myGroup.status === 'voting' && (
                <div>
                  <p style={{ color: 'var(--text-1)', marginBottom: '8px', fontSize: '0.875rem' }}>
                    {myGroup.hasVoted ? 'Change your vote:' : 'Vote for who should advance:'}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                    {myGroup.members.map((member) => (
                      <button
                        key={member.fid}
                        onClick={() => handleVote(member.fid)}
                        disabled={voting}
                        style={{
                          padding: '10px',
                          background: votedForFid === member.fid ? 'var(--fire-1)' : 'var(--bg-2)',
                          border: `1px solid ${votedForFid === member.fid ? 'var(--fire-1)' : 'var(--stroke)'}`,
                          borderRadius: '6px',
                          cursor: voting ? 'not-allowed' : 'pointer',
                          color: votedForFid === member.fid ? '#fff' : 'var(--text-0)',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.875rem',
                        }}
                      >
                        <img
                          src={member.pfp_url || DEFAULT_PFP}
                          alt={member.display_name || member.username || `FID ${member.fid}`}
                          style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        {member.display_name || member.username || `FID ${member.fid}`}
                        {voting && votedForFid === member.fid && ' (submitting...)'}
                      </button>
                    ))}
                  </div>
                  {changingVote && (
                    <button
                      type="button"
                      onClick={() => setChangingVote(false)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        background: 'transparent',
                        color: 'var(--text-1)',
                        border: '1px solid var(--stroke)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}

              {/* Already voted — show when voted AND not currently changing */}
              {myGroup.hasVoted && !changingVote && (
                <>
                  <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>
                    You voted for: <strong style={{ color: 'var(--fire-1)' }}>
                      {myGroup.members.find((m) => m.fid === myGroup.myVote)?.display_name || `FID ${myGroup.myVote}`}
                    </strong>
                  </p>
                  {myGroup.status === 'voting' && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setChangingVote(true)}
                        disabled={clearingVote}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          background: 'transparent',
                          color: 'var(--fire-1)',
                          border: '1px solid var(--fire-1)',
                          borderRadius: '4px',
                          cursor: clearingVote ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Change vote
                      </button>
                      <button
                        type="button"
                        onClick={handleClearVote}
                        disabled={clearingVote}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          background: 'transparent',
                          color: 'var(--fire-1)',
                          border: '1px solid var(--fire-1)',
                          borderRadius: '4px',
                          cursor: clearingVote ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {clearingVote ? 'Clearing…' : 'Clear my vote'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowConfessionalsModal(true);
                          setConfessionalsRoundId(myGroup.roundId);
                          setConfessionalsGroupId(myGroup.groupId);
                          setConfessionalsReason(myGroup.myReason ?? '');
                        }}
                        disabled={clearingVote}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          background: 'transparent',
                          color: 'var(--fire-1)',
                          border: '1px solid var(--fire-1)',
                          borderRadius: '4px',
                          cursor: clearingVote ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {myGroup.myReason ? 'Edit reason' : 'Add reason'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Roulette Wheel UI (Phase 33.9) */}
              {myGroup.status === 'voting' && (game?.roulette_wheel_deployed_at || myGroup.rouletteWheelDeployed) && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #14B8A6' }}>
                  {myGroup.rouletteLockedAt ? (
                    /* Locked — all 3 chose the wheel */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: '#14B8A6', fontWeight: 700, textAlign: 'center' }}>
                        🔒 Roulette locked — all 3 chose the wheel
                      </p>
                      <button
                        onClick={() => handleRouletteReveal(myGroup.groupId, myGroup.roundId)}
                        disabled={rouletteRevealing}
                        style={{
                          padding: '12px 24px',
                          background: rouletteRevealing ? 'var(--bg-2)' : '#14B8A6',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '10px',
                          cursor: rouletteRevealing ? 'not-allowed' : 'pointer',
                          fontWeight: 700,
                          fontSize: '1rem',
                          boxShadow: rouletteRevealing ? 'none' : '0 0 16px rgba(20,184,166,0.7)',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {rouletteRevealing ? 'Revealing...' : '🎡 Reveal who will advance'}
                      </button>
                    </div>
                  ) : (
                    /* Not locked yet — show opt-in toggle */
                    (() => {
                      const myFidOptedIn = currentFid != null && (myGroup.rouletteOptedFids || []).includes(currentFid);
                      const optedCount = (myGroup.rouletteOptedFids || []).length;
                      const totalInGroup = myGroup.totalMembers;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                          <button
                            onClick={() => handleRouletteOpt(myGroup.groupId, myGroup.roundId, !myFidOptedIn)}
                            disabled={rouletteOpting}
                            style={{
                              padding: '12px 24px',
                              background: myFidOptedIn ? '#0d9488' : '#14B8A6',
                              color: '#fff',
                              border: myFidOptedIn ? '2px solid #5eead4' : '2px solid transparent',
                              borderRadius: '10px',
                              cursor: rouletteOpting ? 'not-allowed' : 'pointer',
                              fontWeight: 700,
                              fontSize: '1rem',
                              boxShadow: '0 0 16px rgba(20,184,166,0.6)',
                              letterSpacing: '0.02em',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {rouletteOpting ? '...' : myFidOptedIn ? '🎡 Roulette chosen ✓' : '🎡 Use Roulette Wheel'}
                          </button>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-1)', textAlign: 'center', maxWidth: '280px' }}>
                            If all {totalInGroup} of you choose the wheel, one person will be picked at random to advance. You can unchoose until all {totalInGroup} have said yes — then it locks.
                          </p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#14B8A6', fontWeight: 600 }}>
                            {optedCount}/{totalInGroup} chosen
                          </p>
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {/* Group Chat */}
              {myGroup.status === 'voting' && (
                <div ref={groupChatSectionRef} style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--stroke)' }}>
                  {(myGroup.unreadChatCount ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => groupChatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--fire-1)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        marginBottom: '8px',
                        padding: 0,
                        textAlign: 'left',
                        textDecoration: 'underline',
                      }}
                    >
                      You have (<span style={{ color: '#ef4444' }}>{myGroup.unreadChatCount}</span>) new messages
                    </button>
                  )}
                  <h4 style={{ marginBottom: '8px', color: 'var(--fire-1)', fontSize: '0.875rem', fontWeight: 600 }}>Group Chat</h4>
                  <div
                    ref={groupChatScrollContainerRef}
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      padding: '8px',
                      background: 'var(--bg-2)',
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      marginBottom: '8px',
                    }}
                  >
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !chatSending && chatInput.trim()) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type a message..."
                      maxLength={1000}
                      disabled={chatSending}
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
                      disabled={chatSending || !chatInput.trim()}
                      style={{
                        padding: '8px 16px',
                        background: 'var(--fire-1)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: chatSending || !chatInput.trim() ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                      }}
                    >
                      {chatSending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* All Groups Section */}
          {allGroups.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
              <h3 style={{ marginBottom: '12px', color: 'var(--text-0)' }}>All Groups</h3>
              {allGroups.map((group) => {
                const isCompleted = group.status === 'completed';
                const isEliminated = group.status === 'eliminated';
                const winnerMember = isCompleted && group.winnerFid
                  ? group.members.find((m) => m.fid === group.winnerFid)
                  : null;
                return (
                  <div
                    key={group.id}
                    style={{
                      marginBottom: '12px',
                      padding: '10px',
                      background: 'var(--bg-2)',
                      borderRadius: '6px',
                      border: isCompleted
                        ? '1px solid #22c55e'
                        : isEliminated
                          ? '1px solid #ef4444'
                          : '1px solid var(--stroke)',
                      opacity: isEliminated ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ color: 'var(--text-0)' }}>Group {group.groupNumber}</strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'var(--bg-1)', borderRadius: '4px', color: 'var(--text-1)' }}>
                          {group.voteCount}/{group.totalMembers} voted
                        </span>
                        {isAdmin && group.status === 'voting' && (
                          <>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>
                              {group.totalMembers} member{group.totalMembers !== 1 ? 's' : ''}
                              {typeof group.messageCount === 'number' && ` · ${group.messageCount} msg${group.messageCount !== 1 ? 's' : ''}`}
                              {typeof group.activeCount === 'number' && ` · ${group.activeCount} in chat`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleViewGroupChat(group.id)}
                              style={{
                                fontSize: '0.75rem',
                                padding: '4px 8px',
                                background: 'var(--bg-2)',
                                border: '1px solid var(--stroke)',
                                borderRadius: '6px',
                                color: 'var(--fire-1)',
                                cursor: 'pointer',
                                fontWeight: 500,
                              }}
                            >
                              View Chat{(group.unreadChatCount ?? 0) > 0 ? (
                                <> (<span style={{ color: '#ef4444' }}>{group.unreadChatCount}</span> new)</>
                              ) : null}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: isCompleted && winnerMember ? '8px' : '0' }}>
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
                              background: hasVoted ? 'var(--bg-1)' : 'transparent',
                              borderRadius: '4px',
                            }}
                          >
                            <img
                              src={member.pfp_url || DEFAULT_PFP}
                              alt={member.display_name || member.username || `FID ${member.fid}`}
                              style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <button
                              onClick={() => openFarcasterProfile(member.fid, member.username)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--fire-1)',
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
                    {isCompleted && winnerMember && (
                      <>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>
                          Winner: {winnerMember.display_name || winnerMember.username || `FID ${winnerMember.fid}`}
                        </p>
                        {group.rouletteLockedAt && (
                          <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: '#14B8A6', fontWeight: 600 }}>
                            🎡 Advanced via Roulette Wheel decision
                          </p>
                        )}
                      </>
                    )}
                    {/* Admin roulette state */}
                    {isAdmin && game?.roulette_wheel_deployed_at && !isCompleted && !isEliminated && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#14B8A6' }}>
                        🎡 Roulette: {(group.rouletteOptedFids || []).length}/{group.totalMembers} opted in
                        {group.rouletteLockedAt ? ' — locked' : ''}
                      </p>
                    )}
                    {isEliminated && (
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#ef4444' }}>Eliminated</p>
                    )}
                    {/* Admin: show individual votes */}
                    {isAdmin && group.votes && group.votes.length > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--text-1)' }}>
                        Votes: {group.votes.map((v) => {
                          const voter = group.members.find((m) => m.fid === v.voterFid);
                          const target = v.votedForFid ? group.members.find((m) => m.fid === v.votedForFid) : null;
                          return `${voter?.display_name || voter?.username || `FID ${v.voterFid}`} → ${target ? (target.display_name || target.username || `FID ${v.votedForFid}`) : 'none'}`;
                        }).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
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
              role="presentation"
            >
              <div
                style={{
                  maxWidth: '90%',
                  width: '500px',
                  maxHeight: '90vh',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--bg-1)',
                  borderRadius: '8px',
                  border: '1px solid var(--stroke)',
                }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={`Group ${allGroups.find((g) => g.id === selectedGroupChatId)?.groupNumber ?? '?'} Chat`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ color: 'var(--fire-1)', margin: 0, fontSize: '1rem' }}>
                    Group {allGroups.find((g) => g.id === selectedGroupChatId)?.groupNumber ?? '?'} Chat
                  </h2>
                  <button
                    type="button"
                    onClick={handleCloseGroupChat}
                    style={{ background: 'none', border: 'none', color: 'var(--fire-1)', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
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
                    type="button"
                    onClick={() => handleSendMessage(selectedGroupChatId, selectedGroupChatInput)}
                    disabled={sendingSelectedGroupMessage || !selectedGroupChatInput.trim()}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--fire-1)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: sendingSelectedGroupMessage || !selectedGroupChatInput.trim() ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
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
                  {loadingSelectedGroupChat ? (
                    <p style={{ color: 'var(--fire-2)', fontSize: '0.875rem', textAlign: 'center', padding: '16px', margin: 0 }}>
                      Loading chat...
                    </p>
                  ) : selectedGroupChatMessages.length === 0 ? (
                    <p style={{ color: 'var(--fire-2)', fontSize: '0.875rem', textAlign: 'center', padding: '16px', margin: 0 }}>
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

          {/* Admin controls (in_progress) */}
          {isAdmin && (
            <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
              <h3 style={{ marginBottom: '12px', color: 'var(--text-0)', fontSize: '0.875rem' }}>Admin Controls</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAdminConfessionsModal(true)}
                  style={{
                    padding: '10px 16px',
                    background: 'var(--bg-2)',
                    color: 'var(--text-0)',
                    border: '1px solid var(--stroke)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  View confessions ({confessionalsCount})
                </button>
                {/* Roulette Wheel deploy */}
                {!game?.roulette_wheel_deployed_at ? (
                  <button
                    onClick={handleDeployRoulette}
                    disabled={deployingRoulette}
                    style={{
                      padding: '10px 16px',
                      background: deployingRoulette ? 'var(--bg-2)' : '#14B8A6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: deployingRoulette ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      boxShadow: deployingRoulette ? 'none' : '0 0 10px rgba(20,184,166,0.5)',
                    }}
                  >
                    {deployingRoulette ? 'Deploying...' : '🎡 Deploy Roulette Wheel'}
                  </button>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#14B8A6', fontWeight: 600 }}>
                    🎡 Roulette Wheel deployed ✓
                  </div>
                )}
                {roundId && allGroups.length > 0 && (
                  <button
                    onClick={handleCompleteRound}
                    disabled={completingRound}
                    style={{
                      padding: '10px 16px',
                      background: 'var(--fire-1)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: completingRound ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                  >
                    {completingRound ? 'Completing...' : 'Complete Round'}
                  </button>
                )}
                <button
                  onClick={handleEndGame}
                  disabled={endingGame}
                  style={{
                    padding: '10px 16px',
                    background: 'var(--bg-2)',
                    color: 'var(--text-0)',
                    border: '1px solid var(--stroke)',
                    borderRadius: '6px',
                    cursor: endingGame ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  {endingGame ? 'Ending...' : 'End Game'}
                </button>
                <button
                  onClick={handleCancelGame}
                  disabled={cancellingGame}
                  style={{
                    padding: '10px 16px',
                    background: 'var(--bg-2)',
                    color: 'var(--text-0)',
                    border: '1px solid var(--stroke)',
                    borderRadius: '6px',
                    cursor: cancellingGame ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  {cancellingGame ? 'Cancelling...' : 'Cancel Game'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== GAME STATUS: settled ===== */}
      {game && game.status === 'settled' && (
        <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.125rem' }}>Game Complete</h2>
            <span style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#22c55e', borderRadius: '4px', color: '#fff' }}>
              Settled
            </span>
          </div>

          {allGroups.length > 0 ? (
            <>
              {allGroups.map((group) => {
                const isCompleted = group.status === 'completed';
                const isEliminated = group.status === 'eliminated';
                const winnerMember = isCompleted && group.winnerFid
                  ? group.members.find((m) => m.fid === group.winnerFid)
                  : null;
                return (
                  <div
                    key={group.id}
                    style={{
                      marginBottom: '8px',
                      padding: '10px',
                      background: 'var(--bg-2)',
                      borderRadius: '6px',
                      border: isCompleted
                        ? '1px solid #22c55e'
                        : isEliminated
                          ? '1px solid #ef4444'
                          : '1px solid var(--stroke)',
                      opacity: isEliminated ? 0.6 : 1,
                    }}
                  >
                    {isCompleted && winnerMember ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img
                          src={winnerMember.pfp_url || DEFAULT_PFP}
                          alt={winnerMember.display_name || winnerMember.username || `FID ${winnerMember.fid}`}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <div>
                          <strong style={{ color: '#22c55e' }}>
                            Group {group.groupNumber} &mdash; {winnerMember.display_name || winnerMember.username || `FID ${winnerMember.fid}`} advances
                          </strong>
                          {group.rouletteLockedAt && (
                            <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: '#14B8A6', fontWeight: 600 }}>
                              🎡 Advanced via Roulette Wheel decision
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <strong style={{ color: isEliminated ? '#ef4444' : 'var(--text-1)' }}>
                        Group {group.groupNumber} &mdash; Eliminated
                      </strong>
                    )}
                  </div>
                );
              })}
              <p style={{ color: 'var(--text-1)', marginTop: '12px', fontSize: '0.875rem' }}>
                {allGroups.filter((g) => g.status === 'completed' && g.winnerFid).length} player{allGroups.filter((g) => g.status === 'completed' && g.winnerFid).length !== 1 ? 's' : ''} advanced out of {allGroups.reduce((sum, g) => sum + g.fids.length, 0)} total
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--text-1)' }}>Game has been settled.</p>
          )}
        </div>
      )}

      {/* ===== GAME STATUS: cancelled ===== */}
      {game && game.status === 'cancelled' && (
        <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid #ef4444' }}>
          <h2 style={{ color: '#ef4444', margin: 0, fontSize: '1.125rem' }}>Game Cancelled</h2>
        </div>
      )}

      {/* ===== GROUP SETUP MODAL (Admin Start Game) ===== */}
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
            if (!loadingEligiblePlayers && !startingGame) {
              setShowGroupSetupModal(false);
              setPreviewGroups([]);
              setEligiblePlayers([]);
            }
          }}
        >
          <div
            style={{
              maxWidth: '90%',
              width: '800px',
              maxHeight: '90vh',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
              background: 'var(--bg-1)',
              borderRadius: '8px',
              border: '1px solid var(--stroke)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: 0 }}>Set Up Groups</h2>
              <button
                onClick={() => {
                  if (!loadingEligiblePlayers && !startingGame) {
                    setShowGroupSetupModal(false);
                    setPreviewGroups([]);
                    setEligiblePlayers([]);
                  }
                }}
                disabled={loadingEligiblePlayers || startingGame}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-1)',
                  fontSize: '24px',
                  cursor: loadingEligiblePlayers || startingGame ? 'not-allowed' : 'pointer',
                }}
              >
                &times;
              </button>
            </div>

            {loadingEligiblePlayers ? (
              <p style={{ color: 'var(--text-1)', textAlign: 'center', padding: '16px' }}>Loading eligible players...</p>
            ) : eligiblePlayers.length === 0 ? (
              <p style={{ color: 'var(--text-1)', textAlign: 'center', padding: '16px' }}>No eligible players found.</p>
            ) : (
              <>
                <p style={{ color: 'var(--text-1)', marginBottom: '12px' }}>
                  <strong>{eligiblePlayers.length}</strong> alive tournament player{eligiblePlayers.length !== 1 ? 's' : ''}
                </p>

                <div style={{ marginBottom: '12px' }}>
                  <button
                    onClick={() => calculatePreviewGroups(eligiblePlayers)}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--bg-2)',
                      color: 'var(--text-0)',
                      border: '1px solid var(--stroke)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Re-shuffle
                  </button>
                  <span style={{ marginLeft: '12px', fontSize: '0.75rem', color: 'var(--text-1)' }}>
                    {previewGroups.length} group{previewGroups.length !== 1 ? 's' : ''} of 3
                  </span>
                </div>

                {previewGroups.length > 0 && (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${Math.min(previewGroups.length, 3)}, 1fr)`,
                        gap: '12px',
                        marginBottom: '16px',
                        maxHeight: '50vh',
                        overflowY: 'auto',
                      }}
                    >
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
                            Group {group.groupNumber} ({group.fids.length})
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
                                      color: 'var(--fire-1)',
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
                                    {previewGroups.map((g) =>
                                      g.groupNumber !== group.groupNumber ? (
                                        <option key={g.groupNumber} value={g.groupNumber}>
                                          Group {g.groupNumber}
                                        </option>
                                      ) : null
                                    )}
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
                        disabled={startingGame}
                        style={{
                          padding: '10px 16px',
                          background: 'var(--bg-2)',
                          color: 'var(--text-0)',
                          border: '1px solid var(--stroke)',
                          borderRadius: '6px',
                          cursor: startingGame ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmStartGame}
                        disabled={startingGame || previewGroups.length === 0}
                        style={{
                          padding: '10px 16px',
                          background: 'var(--fire-1)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: startingGame || previewGroups.length === 0 ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                        }}
                      >
                        {startingGame ? 'Starting...' : 'Confirm & Start Game'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== CONFIRMATION MODAL ===== */}
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
            if (confirmConfig.onCancel) confirmConfig.onCancel();
            setShowConfirmModal(false);
            setConfirmConfig(null);
          }}
        >
          <div
            style={{
              maxWidth: '90%',
              width: '400px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-1)',
              borderRadius: '8px',
              border: '1px solid var(--stroke)',
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
                  if (confirmConfig.onCancel) confirmConfig.onCancel();
                  setShowConfirmModal(false);
                  setConfirmConfig(null);
                }}
                style={{
                  padding: '10px 16px',
                  background: 'var(--bg-2)',
                  color: 'var(--text-0)',
                  border: '1px solid var(--stroke)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                {confirmConfig.cancelText || 'Cancel'}
              </button>
              <button
                onClick={() => {
                  confirmConfig.onConfirm();
                  setShowConfirmModal(false);
                  setConfirmConfig(null);
                }}
                style={{
                  padding: '10px 16px',
                  background: 'var(--fire-1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {confirmConfig.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ROOM TIMER MODAL (Phase 33.11, admin only) ===== */}
      {showRoomTimerModal && token && selectedGameId && (
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
            if (!roomTimerSubmitting) {
              setShowRoomTimerModal(false);
              setRoomTimerMinutesInput('');
            }
          }}
        >
          <div
            style={{
              maxWidth: '90%',
              width: '400px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-1)',
              borderRadius: '8px',
              border: '1px solid var(--stroke)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: 'var(--text-0)', marginBottom: '16px', fontSize: '1.125rem' }}>Set timer</h3>
            <p style={{ color: 'var(--text-1)', marginBottom: '12px', fontSize: '0.875rem' }}>
              Minutes from now (1–10080):
            </p>
            <input
              type="number"
              min={1}
              max={10080}
              value={roomTimerMinutesInput}
              onChange={(e) => setRoomTimerMinutesInput(e.target.value)}
              disabled={roomTimerSubmitting}
              style={{
                padding: '10px 12px',
                marginBottom: '16px',
                background: 'var(--bg-2)',
                border: '1px solid var(--stroke)',
                borderRadius: '6px',
                color: 'var(--text-0)',
                fontSize: '1rem',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  if (!roomTimerSubmitting) {
                    setShowRoomTimerModal(false);
                    setRoomTimerMinutesInput('');
                  }
                }}
                disabled={roomTimerSubmitting}
                style={{
                  padding: '10px 16px',
                  background: 'var(--bg-2)',
                  color: 'var(--text-0)',
                  border: '1px solid var(--stroke)',
                  borderRadius: '6px',
                  cursor: roomTimerSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const parsed = parseInt(roomTimerMinutesInput, 10);
                  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10080) {
                    return;
                  }
                  setRoomTimerSubmitting(true);
                  try {
                    const res = await authedFetch(
                      `/api/bullied/games/${selectedGameId}/room-timer`,
                      { method: 'PATCH', body: JSON.stringify({ minutes: parsed }) },
                      token!
                    ).then((r) => r.json());
                    if (res?.ok) {
                      setShowRoomTimerModal(false);
                      setRoomTimerMinutesInput('');
                      const gameRes = await authedFetch(`/api/bullied/games/${selectedGameId}`, { method: 'GET' }, token!).then((r) => r.json());
                      if (gameRes?.ok && gameRes?.data) {
                        setGame(gameRes.data);
                      }
                    } else {
                      setError(res?.error || 'Failed to set timer');
                    }
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to set timer');
                  } finally {
                    setRoomTimerSubmitting(false);
                  }
                }}
                disabled={roomTimerSubmitting || !roomTimerMinutesInput.trim()}
                style={{
                  padding: '10px 16px',
                  background: 'var(--fire-1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: roomTimerSubmitting || !roomTimerMinutesInput.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {roomTimerSubmitting ? 'Setting...' : 'Set timer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADMIN CONFESSIONALS MODAL ===== */}
      {showAdminConfessionsModal && (() => {
        const items: Array<{ groupNumber: number; voterName: string; reasonText: string; updatedAt: string }> = [];
        for (const group of allGroups) {
          for (const v of group.votes ?? []) {
            if (v.reasonText == null || String(v.reasonText).trim() === '') continue;
            const member = group.members.find((m) => m.fid === v.voterFid);
            const voterName = member ? member.display_name || member.username || `FID ${v.voterFid}` : `FID ${v.voterFid}`;
            items.push({
              groupNumber: group.groupNumber,
              voterName,
              reasonText: String(v.reasonText).trim(),
              updatedAt: v.updatedAt ?? '',
            });
          }
        }
        items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
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
            onClick={() => setShowAdminConfessionsModal(false)}
          >
            <div
              style={{
                maxWidth: '90%',
                width: '480px',
                maxHeight: '80vh',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-1)',
                borderRadius: '8px',
                border: '1px solid var(--stroke)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.125rem' }}>Confessionals</h3>
                <button
                  type="button"
                  onClick={() => setShowAdminConfessionsModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-1)',
                    cursor: 'pointer',
                    fontSize: '1.25rem',
                    padding: '0 4px',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {items.length === 0 ? (
                  <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', margin: 0 }}>No confessionals yet.</p>
                ) : (
                  items.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        marginBottom: '16px',
                        padding: '12px',
                        background: 'var(--bg-2)',
                        borderRadius: '6px',
                        border: '1px solid var(--stroke)',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginBottom: '6px' }}>
                        Group {item.groupNumber} · {item.voterName}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-0)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {item.reasonText}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== SUCCESS MODAL ===== */}
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
            style={{
              maxWidth: '90%',
              width: '400px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-1)',
              borderRadius: '8px',
              border: '1px solid var(--stroke)',
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
                style={{
                  padding: '10px 16px',
                  background: 'var(--fire-1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== THE BETR CONFESSIONALS MODAL ===== */}
      {showConfessionalsModal && (
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
          onClick={closeConfessionalsModal}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90%',
              width: '420px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-1)',
              borderRadius: '8px',
              border: '1px solid var(--stroke)',
              boxShadow: '0 0 15px #14B8A6, 0 0 30px rgba(20, 184, 166, 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeConfessionalsModal}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-2)',
                border: '1px solid var(--stroke)',
                borderRadius: '6px',
                color: 'var(--text-0)',
                fontSize: '18px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
              aria-label="Close"
            >
              &times;
            </button>
            <h3
              style={{
                color: '#14B8A6',
                marginBottom: '16px',
                fontSize: '1.125rem',
                fontWeight: 700,
                textShadow: '0 0 8px #14B8A6, 0 0 20px rgba(20, 184, 166, 0.5)',
              }}
            >
              THE BETR CONFESSIONALS
            </h3>
            <textarea
              placeholder="Click here to explain your pick and decision"
              value={confessionalsReason}
              onChange={(e) => setConfessionalsReason(e.target.value)}
              maxLength={10000}
              rows={5}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '0.875rem',
                background: 'var(--bg-2)',
                border: '1px solid var(--stroke)',
                borderRadius: '6px',
                color: 'var(--text-0)',
                resize: 'vertical',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleSubmitConfessionalsReason}
                disabled={confessionalsSubmitting}
                style={{
                  padding: '10px 16px',
                  background: 'var(--fire-1)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: confessionalsSubmitting ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {confessionalsSubmitting ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
