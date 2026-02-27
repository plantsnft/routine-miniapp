'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isAdmin as checkIsAdmin } from '~/lib/admin';
import { CreateGameHubModal } from '~/components/CreateGameHubModal';
import { formatRelativeTime } from '~/lib/utils';
// Phase 18.5: Import create modals for BETR games
import { CreateBetrGuesserGameModal } from '~/components/CreateBetrGuesserGameModal';
import { CreateBuddyUpGameModal } from '~/components/CreateBuddyUpGameModal';
import { CreateTheMoleGameModal } from '~/components/CreateTheMoleGameModal';
import { CreateStealNoStealGameModal } from '~/components/CreateStealNoStealGameModal';
import { CreateStealNoStealHeadsUpYouWinModal } from '~/components/CreateStealNoStealHeadsUpYouWinModal';
import { CreateRemixBetrRoundModal } from '~/components/CreateRemixBetrRoundModal';
import CreateJengaGameModal from '~/components/CreateJengaGameModal';
import { CreateSuperbowlSquaresGameModal } from '~/components/CreateSuperbowlSquaresGameModal';
import { CreateSuperbowlPropsGameModal } from '~/components/CreateSuperbowlPropsGameModal';
import { CreateWeekendGameRoundModal } from '~/components/CreateWeekendGameRoundModal';
import { CreateBulliedGameModal } from '~/components/CreateBulliedGameModal';
import { CreateInOrOutGameModal } from '~/components/CreateInOrOutGameModal';
import { CreateTakeFromThePileGameModal } from '~/components/CreateTakeFromThePileGameModal';
import { CreateKillOrKeepGameModal } from '~/components/CreateKillOrKeepGameModal';
import { CreateArtContestModal } from '~/components/CreateArtContestModal';
import { CreateSundayHighStakesModal } from '~/components/CreateSundayHighStakesModal';
import { CreateNlHoldemGameModal } from '~/components/CreateNlHoldemGameModal';
import { CreateNcaaHoopsContestModal } from '~/components/CreateNcaaHoopsContestModal';

interface WalletStatus {
  address: string;
  balance: string;
  warningLevel: 'ok' | 'warning' | 'critical';
  mintedMerchBalance?: string; // Phase 36: Minted Merch token balance
  baseScanUrl: string;
}

interface GameSummary {
  signupsOpen: number;   // Phase 18.2: Granular status
  inProgress: number;
  needsAction: number;
  scheduled: number;
}

interface BetrUsage {
  thisMonth: string;
  allTime: string;
}

interface NotificationPrefs {
  notifyReadyToSettle: boolean;
}

interface ReadyGame {
  type: string;
  id: string;
  title: string;
  prize_pool: number;
  created_at: string;
  link: string;
  is_preview?: boolean;
}

interface ScheduledGame {
  type: string;
  id: string;
  title: string;
  scheduled_time: string;
  status: string;
  link: string;
}

interface ActivityEvent {
  type: 'game_created' | 'signup' | 'settlement';
  game_type: string;
  game_id: string;
  fid?: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  prize_amount?: number;
  admin_fid?: number;  // Phase 18.2: Creator FID for game_created
  timestamp: string;
}

interface Broadcast {
  id: string;
  admin_fid: number;
  title: string;
  body: string;
  recipients_count: number;
  sent_at: string;
}

interface Settlement {
  game_type: string;
  game_id: string;
  prize_amount: number;
  tx_hash: string | null;
  settled_at: string;
}

const GAME_TYPE_LABELS: Record<string, string> = {
  betr_guesser: 'BETR GUESSER',
  buddy_up: 'BUDDY UP',
  the_mole: 'THE MOLE',
  steal_no_steal: 'STEAL OR NO STEAL',
  jenga: 'JENGA',
  remix_betr: 'REMIX BETR',
  weekend_game: 'WEEKEND GAME',
  poker: 'POKER',
  superbowl_squares: 'SUPERBOWL SQUARES',
  superbowl_props: 'SUPERBOWL PROPS',
  bullied: 'BULLIED',
  in_or_out: 'IN OR OUT',
  take_from_the_pile: 'TAKE FROM THE PILE',
  kill_or_keep: 'KILL OR KEEP',
  nl_holdem: 'NL HOLDEM',
  art_contest: 'TO SPINFINITY AND BEYOND ART CONTEST',
  sunday_high_stakes: 'SUNDAY HIGH STAKES ARE BETR',
  ncaa_hoops: 'NCAA HOOPS',
};

export default function AdminDashboardPage() {
  const { fid, status: authStatus, token } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core dashboard state
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [games, setGames] = useState<GameSummary | null>(null);
  const [betrUsage, setBetrUsage] = useState<BetrUsage | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // v2 dashboard state
  const [readyGames, setReadyGames] = useState<ReadyGame[]>([]);
  const [scheduledGames, setScheduledGames] = useState<ScheduledGame[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const [showCreateGameModal, setShowCreateGameModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Phase 18.5: State for BETR game create modals
  const [createBetrGuesserOpen, setCreateBetrGuesserOpen] = useState(false);
  const [createBuddyUpOpen, setCreateBuddyUpOpen] = useState(false);
  const [createMoleOpen, setCreateMoleOpen] = useState(false);
  const [createStealNoStealOpen, setCreateStealNoStealOpen] = useState(false);
  const [createYouWinHeadsUpOpen, setCreateYouWinHeadsUpOpen] = useState(false);
  const [createRemixBetrOpen, setCreateRemixBetrOpen] = useState(false);
  const [createJengaOpen, setCreateJengaOpen] = useState(false);
  const [createSuperbowlSquaresOpen, setCreateSuperbowlSquaresOpen] = useState(false);
  const [createSuperbowlPropsOpen, setCreateSuperbowlPropsOpen] = useState(false);
  const [createWeekendGameOpen, setCreateWeekendGameOpen] = useState(false);
  const [createBulliedOpen, setCreateBulliedOpen] = useState(false);
  const [createInOrOutOpen, setCreateInOrOutOpen] = useState(false);
  const [createTakeFromThePileOpen, setCreateTakeFromThePileOpen] = useState(false);
  const [createKillOrKeepOpen, setCreateKillOrKeepOpen] = useState(false);
  const [createNlHoldemOpen, setCreateNlHoldemOpen] = useState(false);
  const [createNcaaHoopsOpen, setCreateNcaaHoopsOpen] = useState(false);
  const [createArtContestOpen, setCreateArtContestOpen] = useState(false);
  const [createSundayHighStakesOpen, setCreateSundayHighStakesOpen] = useState(false);

  // Phase 18.3: Clickable stats modal
  const [statusModalOpen, setStatusModalOpen] = useState<string | null>(null);
  const [statusModalGames, setStatusModalGames] = useState<{ type: string; id: string; title: string; link: string; is_preview?: boolean }[]>([]);
  const [statusModalLoading, setStatusModalLoading] = useState(false);

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastTargetUrl, setBroadcastTargetUrl] = useState('');
  const [broadcastStakingMin, setBroadcastStakingMin] = useState<number | null>(null);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === 'authed' && fid) {
      setIsAdmin(checkIsAdmin(fid));
    }
  }, [authStatus, fid]);

  useEffect(() => {
    if (!token || !isAdmin) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load all data in parallel (Phase 29.2: preview games moved to Feedback → Beta Testing)
        const [walletRes, gamesRes, betrRes, prefsRes, readyRes, scheduledRes, activityRes, broadcastRes, settlementRes] = await Promise.all([
          authedFetch('/api/admin/wallet-status', {}, token),
          authedFetch('/api/admin/game-summary', {}, token),
          authedFetch('/api/admin/betr-usage', {}, token),
          authedFetch('/api/admin/notification-prefs', {}, token),
          authedFetch('/api/admin/ready-to-settle', {}, token),
          authedFetch('/api/admin/scheduled-games', {}, token),
          authedFetch('/api/admin/activity-feed?limit=30', {}, token),
          authedFetch('/api/admin/broadcast-history', {}, token),
          authedFetch('/api/admin/settlement-history', {}, token),
        ]);

        const [walletData, gamesData, betrData, prefsData, readyData, scheduledData, activityData, broadcastData, settlementData] = await Promise.all([
          walletRes.json(),
          gamesRes.json(),
          betrRes.json(),
          prefsRes.json(),
          readyRes.json(),
          scheduledRes.json(),
          activityRes.json(),
          broadcastRes.json(),
          settlementRes.json(),
        ]);

        if (walletData.ok) setWallet(walletData.data);
        if (gamesData.ok) setGames(gamesData.data);
        if (betrData.ok) setBetrUsage(betrData.data);
        if (prefsData.ok) setNotifPrefs(prefsData.data);
        if (readyData.ok) setReadyGames(readyData.data.games || []);
        if (scheduledData.ok) setScheduledGames(scheduledData.data.games || []);
        if (activityData.ok) setActivityEvents(activityData.data.events || []);
        if (broadcastData.ok) setBroadcasts(broadcastData.data.broadcasts || []);
        if (settlementData.ok) setSettlements(settlementData.data.settlements || []);
      } catch (e: any) {
        setError(e.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, isAdmin]);

  const handleCopyAddress = async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleNotify = async () => {
    if (!token || !notifPrefs) return;
    setSavingPrefs(true);

    try {
      const res = await authedFetch('/api/admin/notification-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyReadyToSettle: !notifPrefs.notifyReadyToSettle }),
      }, token);

      const data = await res.json();
      if (data.ok) {
        setNotifPrefs(data.data);
      }
    } catch (e) {
      console.error('Failed to update prefs:', e);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!token) return;
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      setBroadcastError('Title and body are required');
      return;
    }

    setBroadcastSending(true);
    setBroadcastError(null);
    setBroadcastSuccess(null);

    try {
      const res = await authedFetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: broadcastTitle.trim(),
          body: broadcastBody.trim(),
          targetUrl: broadcastTargetUrl.trim() || undefined,
          stakingMinAmount: broadcastStakingMin || undefined,
        }),
      }, token);

      const data = await res.json();
      if (data.ok) {
        setBroadcastSuccess(`Sent to ${data.data?.successCount || 0} users`);
        setBroadcastTitle('');
        setBroadcastBody('');
        setBroadcastTargetUrl('');
        setBroadcastStakingMin(null);
        // Refresh broadcast history
        const histRes = await authedFetch('/api/admin/broadcast-history', {}, token);
        const histData = await histRes.json();
        if (histData.ok) setBroadcasts(histData.data.broadcasts || []);
      } else {
        setBroadcastError(data.error || 'Failed to send');
      }
    } catch (e: any) {
      setBroadcastError(e.message || 'Failed to send');
    } finally {
      setBroadcastSending(false);
    }
  };

  // Phase 18.3: Handle clicking on a status to show games.
  // Needs Action: use readyGames (same as "Games Ready to Settle") so modal and count stay in sync.
  const handleStatusClick = async (status: string, count: number) => {
    if (count === 0) return; // Nothing to show

    setStatusModalOpen(status);
    if (status === 'needsAction') {
      setStatusModalGames(readyGames.map((g) => ({ type: g.type, id: g.id, title: g.title, link: g.link, is_preview: g.is_preview })));
      setStatusModalLoading(false);
      return;
    }

    setStatusModalLoading(true);
    setStatusModalGames([]);
    try {
      const res = await authedFetch(`/api/admin/games-by-status?status=${status}`, {}, token);
      const data = await res.json();
      if (data.ok) {
        setStatusModalGames(data.data.games || []);
      }
    } catch (e) {
      console.error('Failed to fetch games by status:', e);
    } finally {
      setStatusModalLoading(false);
    }
  };

  // Phase 18.5: Handle game selection from CreateGameHubModal
  const handleCreateGameSelect = (gameId: string) => {
    switch (gameId) {
      case 'betr-guesser':
        setCreateBetrGuesserOpen(true);
        break;
      case 'buddy-up':
        setCreateBuddyUpOpen(true);
        break;
      case 'the-mole':
        setCreateMoleOpen(true);
        break;
      case 'steal-no-steal':
        setCreateStealNoStealOpen(true);
        break;
      case 'heads-up-steal-no-steal':
        setCreateYouWinHeadsUpOpen(true);
        break;
      case 'remix-betr':
        setCreateRemixBetrOpen(true);
        break;
      case 'jenga':
        setCreateJengaOpen(true);
        break;
      case 'superbowl-squares':
        setCreateSuperbowlSquaresOpen(true);
        break;
      case 'superbowl-props':
        setCreateSuperbowlPropsOpen(true);
        break;
      case 'weekend-game':
        setCreateWeekendGameOpen(true);
        break;
      case 'bullied':
        setCreateBulliedOpen(true);
        break;
      case 'in-or-out':
        setCreateInOrOutOpen(true);
        break;
      case 'take-from-the-pile':
        setCreateTakeFromThePileOpen(true);
        break;
      case 'kill-or-keep':
        setCreateKillOrKeepOpen(true);
        break;
      case 'art-contest':
        setCreateArtContestOpen(true);
        break;
      case 'sunday-high-stakes':
        setCreateSundayHighStakesOpen(true);
        break;
      case 'nl-holdem':
        setCreateNlHoldemOpen(true);
        break;
      case 'ncaa-hoops':
        setCreateNcaaHoopsOpen(true);
        break;
      // poker uses Link navigation (handled in CreateGameHubModal)
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'game_created': return '🎮';
      case 'signup': return '👤';
      case 'settlement': return '💰';
      default: return '📋';
    }
  };

  const getActivityLabel = (event: ActivityEvent) => {
    const gameLabel = GAME_TYPE_LABELS[event.game_type] || event.game_type;
    switch (event.type) {
      case 'game_created':
        // Phase 18.4: Removed admin display
        return `${gameLabel} created`;
      case 'signup':
        // Phase 18.3: Show "Unknown" instead of FID
        const name = event.display_name || event.username || 'Unknown';
        return `${name} → ${gameLabel}`;
      case 'settlement': return `${gameLabel} settled`;
      default: return 'Event';
    }
  };

  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto text-center">
          <p style={{ color: 'var(--text-1)' }}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!fid || !isAdmin) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto text-center">
          <h1 style={{ color: 'var(--text-0)', marginBottom: '16px' }}>Admin Dashboard</h1>
          <p style={{ color: 'var(--text-1)' }}>Admin access required</p>
          <Link href="/clubs/burrfriends/games" className="btn-primary" style={{ marginTop: '16px', display: 'inline-block' }}>
            ← Back to Games
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header - Phase 18.2: Wallet warning moved inline */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '8px' }}>
          <h1 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.5rem' }}>ADMIN DASHBOARD</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            {games && games.needsAction > 0 && (
              <div style={{
                background: '#ef4444',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}>
                {games.needsAction} Needs Action
              </div>
            )}
          </div>
        </div>

        {/* Phase 20 Bugfix: Added User Blocklist link */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          <Link href="/clubs/burrfriends/games" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>
            ← Back to Games
          </Link>
          <Link href="/admin/users" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>
            User Blocklist
          </Link>
          <Link href="/admin/feedback" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>
            Feedback
          </Link>
        </div>

        {loading && <p style={{ color: 'var(--text-1)', textAlign: 'center' }}>Loading dashboard...</p>}
        {error && <p style={{ color: '#ef4444', textAlign: 'center' }}>{error}</p>}

        {!loading && !error && (
          <>
            {/* Top Row: Wallet + Game Stats + BETR Payouts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
              {/* Wallet Status Card - Phase 18.2: Inline warning + text labels */}
              <div className="hl-card" style={{ padding: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Wallet Status
                </h3>
                {wallet ? (
                  <>
                    {/* Phase 18.3: Refill inline on same row as balance */}
                    <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ 
                        color: wallet.warningLevel === 'critical' ? '#ef4444' : wallet.warningLevel === 'warning' ? '#f59e0b' : 'var(--fire-1)', 
                        fontSize: '1.25rem', 
                        fontWeight: 700 
                      }}>
                        {Number(wallet.balance).toLocaleString()} BETR
                      </div>
                      {wallet.warningLevel !== 'ok' && (
                        <div style={{
                          background: '#ef4444',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                        }}>
                          {wallet.warningLevel === 'critical' ? '⚠️ LOW BETR' : '⚠️ REFILL SOON'}
                        </div>
                      )}
                    </div>
                    {/* Phase 36: Minted Merch balance */}
                    {wallet.mintedMerchBalance !== undefined && (
                      <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ color: '#3eb489', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.01em' }}>
                          {Number(wallet.mintedMerchBalance).toLocaleString()} MINTED MERCH
                        </div>
                      </div>
                    )}
                    {/* Phase 18.3: "View Wallet on BaseScan" */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button onClick={handleCopyAddress} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>
                        {copied ? '✓ Copied' : 'Copy Address'}
                      </button>
                      <a href={wallet.baseScanUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', textDecoration: 'none' }}>
                        View Wallet on BaseScan
                      </a>
                    </div>
                  </>
                ) : <p style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Unable to load</p>}
              </div>

              {/* Game Stats Card - Phase 18.3: Clickable stats */}
              <div className="hl-card" style={{ padding: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Game Status
                </h3>
                {games ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.875rem' }}>
                    <button
                      onClick={() => handleStatusClick('signupsOpen', games.signupsOpen)}
                      style={{ display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', padding: '4px 0', cursor: games.signupsOpen > 0 ? 'pointer' : 'default', opacity: games.signupsOpen > 0 ? 1 : 0.6 }}
                    >
                      <span style={{ color: 'var(--text-1)' }}>Signups Open</span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{games.signupsOpen}</span>
                    </button>
                    <button
                      onClick={() => handleStatusClick('inProgress', games.inProgress)}
                      style={{ display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', padding: '4px 0', cursor: games.inProgress > 0 ? 'pointer' : 'default', opacity: games.inProgress > 0 ? 1 : 0.6 }}
                    >
                      <span style={{ color: 'var(--text-1)' }}>In Progress</span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{games.inProgress}</span>
                    </button>
                    <button
                      onClick={() => handleStatusClick('needsAction', games.needsAction)}
                      style={{ display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', padding: '4px 0', cursor: games.needsAction > 0 ? 'pointer' : 'default', opacity: games.needsAction > 0 ? 1 : 0.6 }}
                    >
                      <span style={{ color: games.needsAction > 0 ? '#ef4444' : 'var(--text-1)' }}>Needs Action</span>
                      <span style={{ color: games.needsAction > 0 ? '#ef4444' : 'var(--text-0)', fontWeight: 600 }}>{games.needsAction}</span>
                    </button>
                    <button
                      onClick={() => handleStatusClick('scheduled', games.scheduled)}
                      style={{ display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', padding: '4px 0', cursor: games.scheduled > 0 ? 'pointer' : 'default', opacity: games.scheduled > 0 ? 1 : 0.6 }}
                    >
                      <span style={{ color: 'var(--text-1)' }}>Scheduled</span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{games.scheduled}</span>
                    </button>
                  </div>
                ) : <p style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Unable to load</p>}
              </div>

              {/* BETR Payouts Card */}
              <div className="hl-card" style={{ padding: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  BETR Payouts
                </h3>
                {betrUsage ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-1)' }}>This Month</span>
                      <span style={{ color: 'var(--fire-1)', fontWeight: 600 }}>{Number(betrUsage.thisMonth).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-1)' }}>All Time</span>
                      <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{Number(betrUsage.allTime).toLocaleString()}</span>
                    </div>
                  </div>
                ) : <p style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Unable to load</p>}
              </div>

              {/* Quick Actions Card */}
              <div className="hl-card" style={{ padding: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Quick Actions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button onClick={() => setShowCreateGameModal(true)} className="btn-primary" style={{ width: '100%', padding: '8px', fontSize: '0.75rem' }}>
                    + Create Game
                  </button>
                  <button onClick={() => setShowBroadcastModal(true)} className="btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '0.75rem' }}>
                    📢 Broadcast
                  </button>
                  <Link href="/admin/betr-games" className="btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '0.75rem', display: 'block', textAlign: 'center' }}>
                    🏆 Tournament
                  </Link>
                </div>
              </div>
            </div>

            {/* Games Ready to Settle */}
            {readyGames.length > 0 && (
              <div className="hl-card" style={{ padding: '16px', marginTop: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🔴 Games Ready to Settle ({readyGames.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {readyGames.slice(0, 5).map((game) => (
                    <Link
                      key={`${game.type}-${game.id}`}
                      href={game.link}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: 'var(--bg-2)',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      <div>
                        <div style={{ color: 'var(--text-0)', fontSize: '0.875rem', fontWeight: 500 }}>{game.title}</div>
                        <div style={{ color: 'var(--text-2)', fontSize: '0.7rem' }}>{GAME_TYPE_LABELS[game.type] || game.type}</div>
                      </div>
                      <div style={{ color: 'var(--fire-1)', fontSize: '0.875rem', fontWeight: 600 }}>
                        {game.prize_pool > 0 ? `${game.prize_pool.toLocaleString()} BETR` : 'Settle →'}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Scheduled Games */}
            {scheduledGames.length > 0 && (
              <div className="hl-card" style={{ padding: '16px', marginTop: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📅 Scheduled Games ({scheduledGames.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {scheduledGames.slice(0, 5).map((game) => (
                    <Link
                      key={`${game.type}-${game.id}`}
                      href={game.link}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: 'var(--bg-2)',
                        borderRadius: '8px',
                        textDecoration: 'none',
                      }}
                    >
                      <div>
                        <div style={{ color: 'var(--text-0)', fontSize: '0.875rem', fontWeight: 500 }}>{game.title}</div>
                        <div style={{ color: 'var(--text-2)', fontSize: '0.7rem' }}>{GAME_TYPE_LABELS[game.type] || game.type}</div>
                      </div>
                      <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>
                        {formatRelativeTime(game.scheduled_time)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity + Settlement History Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginTop: '16px' }}>
              {/* Recent Activity */}
              <div className="hl-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ color: 'var(--text-0)', margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Recent Activity
                  </h3>
                  <Link href="/admin/activity" style={{ color: 'var(--fire-1)', fontSize: '0.7rem' }}>View All →</Link>
                </div>
                {activityEvents.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {activityEvents.slice(0, 8).map((event, idx) => (
                      <div key={`${event.type}-${event.game_id}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                        <span>{getActivityIcon(event.type)}</span>
                        {event.pfp_url && (
                          <Image src={event.pfp_url} alt="" width={20} height={20} style={{ borderRadius: '50%' }} />
                        )}
                        <span style={{ color: 'var(--text-0)', flex: 1 }}>{getActivityLabel(event)}</span>
                        <span style={{ color: 'var(--text-2)' }}>{formatRelativeTime(event.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>No recent activity</p>}
              </div>

              {/* Settlement History - Phase 18.4: Simplified, no winner */}
              <div className="hl-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ color: 'var(--text-0)', margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Recent Settlements
                  </h3>
                  <Link href="/admin/settlements" style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                    View All →
                  </Link>
                </div>
                {settlements.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {settlements.slice(0, 8).map((s, idx) => (
                      <div key={`${s.game_type}-${s.game_id}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-0)', minWidth: '100px' }}>{GAME_TYPE_LABELS[s.game_type] || s.game_type}</span>
                        <span style={{ color: 'var(--fire-1)', fontWeight: 600, flex: 1 }}>{s.prize_amount.toLocaleString()}</span>
                        <span style={{ color: 'var(--text-2)' }}>{formatRelativeTime(s.settled_at)}</span>
                        {s.tx_hash && (
                          <a
                            href={`https://basescan.org/tx/${s.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--fire-1)' }}
                          >
                            🔗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>No settlements yet</p>}
              </div>
            </div>

            {/* Broadcast History */}
            {broadcasts.length > 0 && (
              <div className="hl-card" style={{ padding: '16px', marginTop: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Broadcast History
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {broadcasts.slice(0, 5).map((b) => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: 'var(--bg-2)', borderRadius: '6px', fontSize: '0.75rem' }}>
                      <div>
                        <div style={{ color: 'var(--text-0)', fontWeight: 500 }}>{b.title}</div>
                        <div style={{ color: 'var(--text-2)', fontSize: '0.65rem' }}>{b.body.substring(0, 50)}{b.body.length > 50 ? '...' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--fire-1)' }}>{b.recipients_count} sent</div>
                        <div style={{ color: 'var(--text-2)', fontSize: '0.65rem' }}>{formatRelativeTime(b.sent_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin Notifications Section */}
            {notifPrefs && (
              <div className="hl-card" style={{ padding: '16px', marginTop: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Admin Notifications
                </h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={notifPrefs.notifyReadyToSettle}
                    onChange={handleToggleNotify}
                    disabled={savingPrefs}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>
                    Notify me when games are ready to settle
                  </span>
                  {savingPrefs && <span style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Saving...</span>}
                </label>
              </div>
            )}
          </>
        )}

        {/* Create Game Modal */}
        <CreateGameHubModal
          isOpen={showCreateGameModal}
          onClose={() => setShowCreateGameModal(false)}
          onSelectGame={handleCreateGameSelect}
        />

        {/* Phase 18.5: BETR Game Create Modals */}
        <CreateBetrGuesserGameModal
          isOpen={createBetrGuesserOpen}
          onClose={() => setCreateBetrGuesserOpen(false)}
          onSuccess={() => setCreateBetrGuesserOpen(false)}
        />
        <CreateBuddyUpGameModal
          isOpen={createBuddyUpOpen}
          onClose={() => setCreateBuddyUpOpen(false)}
          onSuccess={() => setCreateBuddyUpOpen(false)}
        />
        <CreateTheMoleGameModal
          isOpen={createMoleOpen}
          onClose={() => setCreateMoleOpen(false)}
          onSuccess={() => setCreateMoleOpen(false)}
        />
        <CreateStealNoStealGameModal
          isOpen={createStealNoStealOpen}
          onClose={() => setCreateStealNoStealOpen(false)}
          onSuccess={() => setCreateStealNoStealOpen(false)}
        />
        <CreateStealNoStealHeadsUpYouWinModal
          isOpen={createYouWinHeadsUpOpen}
          onClose={() => setCreateYouWinHeadsUpOpen(false)}
          onSuccess={(gameId) => {
            setCreateYouWinHeadsUpOpen(false);
            window.location.href = `/heads-up-steal-no-steal?gameId=${gameId}`;
          }}
        />
        <CreateRemixBetrRoundModal
          isOpen={createRemixBetrOpen}
          onClose={() => setCreateRemixBetrOpen(false)}
          onSuccess={() => setCreateRemixBetrOpen(false)}
        />
        <CreateJengaGameModal
          isOpen={createJengaOpen}
          onClose={() => setCreateJengaOpen(false)}
          onGameCreated={() => setCreateJengaOpen(false)}
          token={token || ''}
        />
        <CreateSuperbowlSquaresGameModal
          isOpen={createSuperbowlSquaresOpen}
          onClose={() => setCreateSuperbowlSquaresOpen(false)}
          onSuccess={() => setCreateSuperbowlSquaresOpen(false)}
        />
        <CreateSuperbowlPropsGameModal
          isOpen={createSuperbowlPropsOpen}
          onClose={() => setCreateSuperbowlPropsOpen(false)}
          onCreated={() => setCreateSuperbowlPropsOpen(false)}
        />
        <CreateWeekendGameRoundModal
          isOpen={createWeekendGameOpen}
          onClose={() => setCreateWeekendGameOpen(false)}
          onSuccess={() => setCreateWeekendGameOpen(false)}
        />
        <CreateBulliedGameModal
          isOpen={createBulliedOpen}
          onClose={() => setCreateBulliedOpen(false)}
          onSuccess={() => setCreateBulliedOpen(false)}
        />
        <CreateInOrOutGameModal
          isOpen={createInOrOutOpen}
          onClose={() => setCreateInOrOutOpen(false)}
          onSuccess={() => setCreateInOrOutOpen(false)}
        />
        <CreateTakeFromThePileGameModal
          isOpen={createTakeFromThePileOpen}
          onClose={() => setCreateTakeFromThePileOpen(false)}
          onSuccess={() => setCreateTakeFromThePileOpen(false)}
        />
        <CreateKillOrKeepGameModal
          isOpen={createKillOrKeepOpen}
          onClose={() => setCreateKillOrKeepOpen(false)}
          onSuccess={() => setCreateKillOrKeepOpen(false)}
        />
        <CreateArtContestModal
          isOpen={createArtContestOpen}
          onClose={() => setCreateArtContestOpen(false)}
          onSuccess={() => { setCreateArtContestOpen(false); }}
        />
        <CreateSundayHighStakesModal
          isOpen={createSundayHighStakesOpen}
          onClose={() => setCreateSundayHighStakesOpen(false)}
          onSuccess={() => { setCreateSundayHighStakesOpen(false); }}
        />
        <CreateNlHoldemGameModal
          isOpen={createNlHoldemOpen}
          onClose={() => setCreateNlHoldemOpen(false)}
          onSuccess={() => setCreateNlHoldemOpen(false)}
        />
        <CreateNcaaHoopsContestModal
          isOpen={createNcaaHoopsOpen}
          onClose={() => setCreateNcaaHoopsOpen(false)}
          onSuccess={() => setCreateNcaaHoopsOpen(false)}
        />

        {/* Broadcast Modal */}
        {showBroadcastModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
            onClick={() => setShowBroadcastModal(false)}
          >
            <div
              style={{
                background: 'var(--bg-1)',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '500px',
                width: '100%',
                maxHeight: '80vh',
                overflow: 'auto',
                border: '1px solid var(--stroke)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ color: 'var(--text-0)', margin: 0 }}>Send Broadcast</h2>
                <button
                  onClick={() => setShowBroadcastModal(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '1.5rem', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>
                    Title (max 32 chars)
                  </label>
                  <input
                    type="text"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    maxLength={32}
                    placeholder="Notification title"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid var(--stroke)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-0)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>
                    Body (max 128 chars)
                  </label>
                  <textarea
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    maxLength={128}
                    placeholder="Notification body"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid var(--stroke)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-0)',
                      resize: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>
                    Target URL (optional)
                  </label>
                  <input
                    type="text"
                    value={broadcastTargetUrl}
                    onChange={(e) => setBroadcastTargetUrl(e.target.value)}
                    placeholder="/clubs/burrfriends/games"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid var(--stroke)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-0)',
                    }}
                  />
                </div>

                {/* Phase 18.2: Staking filter dropdown */}
                <div>
                  <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>
                    Staking Requirement
                  </label>
                  <select
                    value={broadcastStakingMin || ''}
                    onChange={(e) => setBroadcastStakingMin(e.target.value ? Number(e.target.value) : null)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid var(--stroke)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-0)',
                    }}
                  >
                    <option value="">All Subscribers</option>
                    <option value="1000000">1M+ BETR Staked</option>
                    <option value="5000000">5M+ BETR Staked</option>
                    <option value="25000000">25M+ BETR Staked</option>
                    <option value="50000000">50M+ BETR Staked</option>
                    <option value="200000000">200M+ BETR Staked</option>
                  </select>
                </div>

                {broadcastError && <p style={{ color: '#ef4444', margin: 0 }}>{broadcastError}</p>}
                {broadcastSuccess && <p style={{ color: '#10b981', margin: 0 }}>{broadcastSuccess}</p>}

                <button
                  onClick={handleSendBroadcast}
                  disabled={broadcastSending}
                  className="btn-primary"
                  style={{ width: '100%', padding: '12px' }}
                >
                  {broadcastSending ? 'Sending...' : 'Send Broadcast'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 18.3: Status Games Modal */}
        {statusModalOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}>
            <div className="hl-card" style={{ padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ color: 'var(--text-0)', margin: 0 }}>
                  {statusModalOpen === 'signupsOpen' && 'Signups Open'}
                  {statusModalOpen === 'inProgress' && 'In Progress'}
                  {statusModalOpen === 'needsAction' && 'Needs Action'}
                  {statusModalOpen === 'scheduled' && 'Scheduled'}
                </h3>
                <button
                  onClick={() => setStatusModalOpen(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-1)', fontSize: '1.5rem', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
              
              {statusModalLoading ? (
                <p style={{ color: 'var(--text-1)', textAlign: 'center' }}>Loading...</p>
              ) : statusModalGames.length === 0 ? (
                <p style={{ color: 'var(--text-1)', textAlign: 'center' }}>No games found</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {statusModalGames.map((game) => (
                    <Link
                      key={`${game.type}-${game.id}`}
                      href={game.link}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        background: 'var(--bg-2)',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                      onClick={() => setStatusModalOpen(null)}
                    >
                      <div>
                        <div style={{ color: 'var(--text-0)', fontWeight: 500 }}>{game.title}{game.is_preview && <span style={{ color: 'var(--text-2)', fontWeight: 400, fontSize: '0.65rem', marginLeft: '6px' }}>(in preview)</span>}</div>
                        <div style={{ color: 'var(--text-2)', fontSize: '0.75rem' }}>{GAME_TYPE_LABELS[game.type] || game.type}</div>
                      </div>
                      <span style={{ color: 'var(--fire-1)' }}>→</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
