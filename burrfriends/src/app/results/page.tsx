'use client';

/**
 * /results
 * Unified game results page with filters
 * 
 * Phase 21.3: Results Page
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { formatRelativeTime } from '~/lib/utils';
import { formatPrizeAmount } from '~/lib/format-prize';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';
import { WeekendGamePicksBlock } from '~/components/WeekendGamePicksBlock';

interface Winner {
  fid: number;
  amount: number;
  position: number | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  amount_display?: string | null;
}

interface ResultItem {
  id: string;
  gameType: 'poker' | 'betr_guesser' | 'buddy_up' | 'the_mole' | 'steal_no_steal' | 'jenga' | 'framedl_betr' | 'weekend_game' | 'superbowl_squares' | 'superbowl_props' | 'in_or_out' | 'take_from_the_pile' | 'bullied' | 'kill_or_keep' | 'art_contest' | 'nl_holdem' | 'ncaa_hoops';
  subType: string | null;
  title: string;
  prizeAmount: number;
  settledAt: string;
  txHash: string | null;
  winners: Winner[];
  participated: boolean;
  stayerFids?: number[];
  takeFromThePileEvents?: Array<{
    sequence: number;
    fid: number;
    event_type: string;
    amount_taken: number | null;
    username?: string | null;
    display_name?: string | null;
    pfp_url?: string | null;
  }>;
  takeFromThePileRemaining?: number;
  /** Phase 33: BULLIED — per-group outcome with hydrated profiles */
  bulliedGroups?: Array<{
    groupNumber: number;
    winnerFid: number | null;
    winnerUsername?: string | null;
    winnerDisplayName?: string | null;
    eliminatedProfiles?: Array<{ fid: number; username: string | null; display_name: string | null }>;
  }>;
  /** Phase 38: KILL OR KEEP — final 10 and eliminated */
  killOrKeepFinalFids?: number[];
  killOrKeepEliminatedFids?: number[];
  killOrKeepFinalProfiles?: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>;
  killOrKeepEliminatedProfiles?: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>;
  /** THE MOLE — Advanced / Eliminated (when set, Results shows these instead of only settlement winner) */
  theMoleAdvancedProfiles?: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>;
  theMoleEliminatedProfiles?: Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>;
  /** One-off: STEAL OR NO STEAL result where winner is Jacy — show this eliminated profile under the winner */
  oneOffEliminatedProfile?: { fid: number; username: string | null; display_name: string | null; pfp_url: string | null };
}

/** Phase 38: KILL OR KEEP — activity row (from GET games/[id] actionsWithProfiles) */
interface KillOrKeepActionRow {
  sequence: number;
  actor_fid: number;
  action: string;
  target_fid: number;
  actor_display_name: string;
  actor_pfp_url?: string;
  target_display_name: string;
  target_pfp_url?: string;
}

/** Weekend Game full leaderboard entry (scored or DNP) */
interface WeekendLeaderboardEntry {
  rank: number | null;
  fid: number;
  best_score: number | null;
  best_cast_url: string | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
}

const GAME_TYPE_LABELS: Record<string, string> = {
  poker: 'Poker',
  betr_guesser: 'BETR GUESSER',
  buddy_up: 'BUDDY UP',
  the_mole: 'THE MOLE',
  steal_no_steal: 'STEAL OR NO STEAL',
  jenga: 'JENGA',
  framedl_betr: 'FRAMEDL BETR',
  weekend_game: 'WEEKEND GAME',
  superbowl_squares: 'SUPERBOWL SQUARES',
  superbowl_props: 'SUPERBOWL PROPS',
  in_or_out: 'IN OR OUT',
  take_from_the_pile: 'TAKE FROM THE PILE',
  bullied: 'BULLIED',
  kill_or_keep: 'KILL OR KEEP',
  art_contest: 'TO SPINFINITY AND BEYOND ART CONTEST',
  nl_holdem: 'NL HOLDEM',
  ncaa_hoops: 'NCAA HOOPS',
};

const POKER_SUBTYPES: Record<string, string> = {
  sit_and_go: 'Sit & Go',
  tournament: 'Tournament',
};

const BETR_GAME_TYPES = [
  { value: 'betr_guesser', label: 'BETR GUESSER' },
  { value: 'buddy_up', label: 'BUDDY UP' },
  { value: 'the_mole', label: 'THE MOLE' },
  { value: 'steal_no_steal', label: 'STEAL OR NO STEAL' },
  { value: 'jenga', label: 'JENGA' },
  { value: 'framedl_betr', label: 'FRAMEDL BETR' },
  { value: 'weekend_game', label: 'WEEKEND GAME' },
  { value: 'superbowl_squares', label: 'SUPERBOWL SQUARES' },
  { value: 'superbowl_props', label: 'SUPERBOWL PROPS' },
  { value: 'in_or_out', label: 'IN OR OUT' },
  { value: 'take_from_the_pile', label: 'TAKE FROM THE PILE' },
  { value: 'bullied', label: 'BULLIED' },
  { value: 'kill_or_keep', label: 'KILL OR KEEP' },
  { value: 'art_contest', label: 'ART CONTEST' },
  { value: 'nl_holdem', label: 'NL HOLDEM' },
  { value: 'ncaa_hoops', label: 'NCAA HOOPS' },
];

export default function ResultsPage() {
  const { fid, status: authStatus, token } = useAuth();
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  
  // Filter state
  const [mainFilter, setMainFilter] = useState<'all' | 'poker' | 'betr'>('all');
  const [pokerSubfilter, setPokerSubfilter] = useState<string>('');
  const [betrSubfilter, setBetrSubfilter] = useState<string>('');
  // Phase 28.1: Available BETR game types (only types with results)
  const [availableBetrTypes, setAvailableBetrTypes] = useState<string[]>([]);
  // FRAMEDL: full scoreboard, show first 10 by default; "View entire board" to expand
  const [framedlLeaderboard, setFramedlLeaderboard] = useState<Array<{ rank: number | null; fid: number; best_score: number | null; best_cast_url: string | null; username: string | null; display_name: string | null; pfp_url: string | null }>>([]);
  const [framedlLeaderboardLoading, setFramedlLeaderboardLoading] = useState(false);
  const [framedlShowFullId, setFramedlShowFullId] = useState<string | null>(null);
  // Admin status (for Weekend Game picks block on Results)
  const [isAdmin, setIsAdmin] = useState(false);
  // Weekend Game: "View full results" expand and full leaderboard (scored + DNP)
  const [weekendGameLeaderboardExpandId, setWeekendGameLeaderboardExpandId] = useState<string | null>(null);
  const [weekendGameFullLeaderboard, setWeekendGameFullLeaderboard] = useState<{ entries: WeekendLeaderboardEntry[]; totalCount: number; bottomCount: number } | null>(null);
  const [weekendGameFullLeaderboardLoading, setWeekendGameFullLeaderboardLoading] = useState(false);
  const [weekendGameShowFullId, setWeekendGameShowFullId] = useState<string | null>(null);
  // BULLIED: "View details" expand per game
  const [expandedBulliedGames, setExpandedBulliedGames] = useState<Set<string>>(new Set());
  // KILL OR KEEP: "View full game activity" expand — cached activity per game id
  const [killOrKeepActivityExpandId, setKillOrKeepActivityExpandId] = useState<string | null>(null);
  const [killOrKeepActivityByGameId, setKillOrKeepActivityByGameId] = useState<Record<string, KillOrKeepActionRow[]>>({});
  const [killOrKeepActivityLoadingId, setKillOrKeepActivityLoadingId] = useState<string | null>(null);

  // Fetch leaderboard when results include any FRAMEDL card (so scoreboard can show first 10)
  useEffect(() => {
    const hasFramedl = results.some((r) => r.gameType === 'framedl_betr');
    if (!hasFramedl) {
      setFramedlLeaderboard([]);
      return;
    }
    setFramedlLeaderboardLoading(true);
    fetch('/api/remix-betr/leaderboard')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d?.data)) setFramedlLeaderboard(d.data);
      })
      .catch(() => setFramedlLeaderboard([]))
      .finally(() => setFramedlLeaderboardLoading(false));
  }, [results]);

  // Admin status for Weekend Game picks block
  useEffect(() => {
    if (!token) {
      setIsAdmin(false);
      return;
    }
    authedFetch('/api/admin/status', { method: 'GET' }, token)
      .then((r) => r.json())
      .then((d) => { if (d?.ok && d?.data?.isAdmin) setIsAdmin(true); else setIsAdmin(false); })
      .catch(() => setIsAdmin(false));
  }, [token]);

  // Weekend Game: fetch full leaderboard when "View full results" is expanded
  useEffect(() => {
    if (!weekendGameLeaderboardExpandId) {
      setWeekendGameFullLeaderboard(null);
      return;
    }
    setWeekendGameFullLeaderboardLoading(true);
    Promise.all([
      fetch('/api/weekend-game/leaderboard').then((r) => r.json()),
      token ? authedFetch('/api/betr-games/tournament/alive', { method: 'GET' }, token).then((r) => r.json()).catch(() => null) : Promise.resolve(null),
    ])
      .then(([lbRes, aliveRes]) => {
        const leaderboard: WeekendLeaderboardEntry[] = lbRes?.ok && Array.isArray(lbRes?.data) ? lbRes.data : [];
        const scoredFids = new Set(leaderboard.map((e: WeekendLeaderboardEntry) => e.fid));
        const alivePlayers: { fid: number; username?: string; display_name?: string; pfp_url?: string }[] =
          aliveRes?.ok && Array.isArray(aliveRes?.data?.players) ? aliveRes.data.players : [];
        const dnpEntries: WeekendLeaderboardEntry[] = alivePlayers
          .filter((p) => !scoredFids.has(p.fid))
          .map((p) => ({
            rank: null,
            fid: p.fid,
            best_score: null,
            best_cast_url: null,
            username: p.username ?? null,
            display_name: p.display_name ?? null,
            pfp_url: p.pfp_url ?? null,
          }));
        const entries = [...leaderboard, ...dnpEntries];
        const totalCount = entries.length;
        const bottomCount = Math.ceil(totalCount * 0.1);
        setWeekendGameFullLeaderboard({ entries, totalCount, bottomCount });
      })
      .catch(() => setWeekendGameFullLeaderboard(null))
      .finally(() => setWeekendGameFullLeaderboardLoading(false));
  }, [weekendGameLeaderboardExpandId, token]);

  // KILL OR KEEP: fetch game activity when "View full game activity" is expanded
  useEffect(() => {
    if (!killOrKeepActivityExpandId) return;
    if (killOrKeepActivityByGameId[killOrKeepActivityExpandId]) return;
    setKillOrKeepActivityLoadingId(killOrKeepActivityExpandId);
    fetch(`/api/kill-or-keep/games/${killOrKeepActivityExpandId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d?.data?.actionsWithProfiles)) {
          setKillOrKeepActivityByGameId((prev) => ({ ...prev, [killOrKeepActivityExpandId]: d.data.actionsWithProfiles }));
        }
      })
      .catch(() => {})
      .finally(() => setKillOrKeepActivityLoadingId(null));
  }, [killOrKeepActivityExpandId, killOrKeepActivityByGameId]);

  // Load results when filter changes
  useEffect(() => {
    loadResults(0);
  }, [mainFilter, pokerSubfilter, betrSubfilter, token]);

  const loadResults = async (newOffset: number) => {
    if (newOffset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('offset', String(newOffset));
      
      if (mainFilter !== 'all') {
        params.set('filter', mainFilter);
      }
      
      // Add subfilter based on main filter
      if (mainFilter === 'poker' && pokerSubfilter) {
        params.set('subfilter', pokerSubfilter);
      } else if (mainFilter === 'betr' && betrSubfilter) {
        params.set('subfilter', betrSubfilter);
      }

      // Use authedFetch if we have a token, else regular fetch
      let res;
      if (token) {
        res = await authedFetch(`/api/results?${params.toString()}`, {}, token);
      } else {
        res = await fetch(`/api/results?${params.toString()}`);
      }
      
      const data = await res.json();

      if (data.ok) {
        if (newOffset === 0) {
          setResults(data.data.results);
          // Phase 28.1: Store available BETR types
          if (data.data.availableBetrTypes) {
            setAvailableBetrTypes(data.data.availableBetrTypes);
          }
        } else {
          setResults(prev => [...prev, ...data.data.results]);
        }
        setHasMore(data.data.hasMore);
        setTotal(data.data.total || 0);
        setOffset(newOffset + 50);
      }
    } catch (e) {
      console.error('Failed to load results:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Handle main filter change
  const handleMainFilterChange = (filter: 'all' | 'poker' | 'betr') => {
    setMainFilter(filter);
    setPokerSubfilter('');
    setBetrSubfilter('');
    setOffset(0);
  };

  // Get display name for a winner
  const getWinnerDisplay = (winner: Winner) => {
    if (winner.display_name) return winner.display_name;
    if (winner.username) return `@${winner.username}`;
    return `FID ${winner.fid}`;
  };

  // Get game type display
  const getGameTypeDisplay = (result: ResultItem) => {
    if (result.gameType === 'poker' && result.subType) {
      return POKER_SUBTYPES[result.subType] || result.subType;
    }
    return GAME_TYPE_LABELS[result.gameType] || result.gameType;
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

  return (
    <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ color: 'var(--text-0)', margin: '0 0 8px 0', fontSize: '1.5rem' }}>
            GAME RESULTS
          </h1>
          <Link href="/clubs/burrfriends/games" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>
            ← Back to Games
          </Link>
        </div>

        {/* Filters */}
        <div className="hl-card" style={{ padding: '16px', marginBottom: '16px' }}>
          {/* Main Filter */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleMainFilterChange('all')}
              className={mainFilter === 'all' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px 16px', fontSize: '0.875rem' }}
            >
              All Games
            </button>
            <button
              onClick={() => handleMainFilterChange('poker')}
              className={mainFilter === 'poker' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px 16px', fontSize: '0.875rem' }}
            >
              Poker
            </button>
            <button
              onClick={() => handleMainFilterChange('betr')}
              className={mainFilter === 'betr' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px 16px', fontSize: '0.875rem' }}
            >
              BETR Games
            </button>
          </div>

          {/* Poker Subfilter */}
          {mainFilter === 'poker' && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setPokerSubfilter('')}
                className={!pokerSubfilter ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                All Poker
              </button>
              <button
                onClick={() => setPokerSubfilter('sit_and_go')}
                className={pokerSubfilter === 'sit_and_go' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                Sit & Go
              </button>
              <button
                onClick={() => setPokerSubfilter('tournament')}
                className={pokerSubfilter === 'tournament' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                Tournament
              </button>
            </div>
          )}

          {/* BETR Subfilter */}
          {mainFilter === 'betr' && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setBetrSubfilter('')}
                className={!betrSubfilter ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                All BETR
              </button>
              {/* Phase 28.1: Only show game types that have results */}
              {BETR_GAME_TYPES.filter(type => availableBetrTypes.includes(type.value)).map(type => (
                <button
                  key={type.value}
                  onClick={() => setBetrSubfilter(type.value)}
                  className={betrSubfilter === type.value ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  {type.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Total count */}
        {total > 0 && (
          <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '16px' }}>
            {total} game{total !== 1 ? 's' : ''} found
          </p>
        )}

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div className="hl-card" style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-1)' }}>Loading results...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="hl-card" style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-1)' }}>No results found</p>
            </div>
          ) : (
            <>
              {results.map((result, idx) => (
                <div
                  key={`${result.gameType}-${result.id}-${idx}`}
                  className="hl-card"
                  style={{ padding: '16px' }}
                >
                  {/* Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ 
                          color: 'var(--text-0)', 
                          fontWeight: 600, 
                          fontSize: '1rem' 
                        }}>
                          {result.title}
                        </span>
                        {result.participated && (
                          <span style={{
                            background: 'var(--fire-1)',
                            color: 'var(--bg-0)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}>
                            Participated
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ 
                          color: 'var(--fire-1)', 
                          fontSize: '0.75rem',
                          background: 'rgba(20, 184, 166, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          {getGameTypeDisplay(result)}
                        </span>
                        <span style={{ color: 'var(--text-2)', fontSize: '0.8rem' }}>
                          {formatRelativeTime(result.settledAt)}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--fire-1)', fontWeight: 600, fontSize: '1rem' }}>
                        {(result.gameType === 'framedl_betr' || result.gameType === 'weekend_game') ? 'Advantage only' : result.gameType === 'in_or_out' ? '$10M BETR (quit share)' : result.gameType === 'take_from_the_pile' ? `${formatPrizeAmount(result.prizeAmount)} BETR pile` : result.gameType === 'bullied' ? 'Elimination round' : result.gameType === 'kill_or_keep' ? 'Final 10' : result.gameType === 'art_contest' ? '$4000+ prize pool' : result.gameType === 'ncaa_hoops' ? 'Bracket contest' : `${formatPrizeAmount(result.prizeAmount)} BETR`}
                      </div>
                      {result.txHash && (
                        <a
                          href={`https://basescan.org/tx/${result.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--text-2)', fontSize: '0.75rem' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View tx →
                        </a>
                      )}
                    </div>
                  </div>

                  {/* FRAMEDL: full scoreboard, first 10 by default; dropdown to view entire board */}
                  {result.gameType === 'framedl_betr' && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginTop: '-4px', marginBottom: '8px' }}>
                        Score a 2 or less to receive an advantage on the next game
                      </p>
                      {framedlLeaderboardLoading ? (
                        <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>Loading scoreboard...</p>
                      ) : framedlLeaderboard.length === 0 ? (
                        <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No results yet.</p>
                      ) : (
                        <>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #333' }}>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>#</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Player</th>
                                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Attempts</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Proof</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(framedlShowFullId === result.id ? framedlLeaderboard : framedlLeaderboard.slice(0, 10)).map((e, i) => {
                                  const isDnp = e.best_score === null;
                                  const fullList = framedlLeaderboard;
                                  const idxInFull = fullList.indexOf(e);
                                  const nextEntry = fullList[idxInFull + 1];
                                  const showDivider = !isDnp && e.best_score != null && e.best_score <= 2 && nextEntry && (nextEntry.best_score === null || nextEntry.best_score >= 3);
                                  return (
                                    <React.Fragment key={e.fid}>
                                      <tr style={{ borderBottom: '1px solid #222', opacity: isDnp ? 0.5 : 1 }}>
                                        <td style={{ padding: '6px 8px' }}>{isDnp ? '\u2014' : e.rank}</td>
                                        <td style={{ padding: '6px 8px' }}>
                                          <span
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => openFarcasterProfile(e.fid, e.username)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openFarcasterProfile(e.fid, e.username); } }}
                                          >
                                            {e.pfp_url && <img src={e.pfp_url} alt="" style={{ width: 20, height: 20, borderRadius: 10, marginRight: 6, verticalAlign: 'middle' }} />}
                                            {e.display_name || e.username || `FID ${e.fid}`}
                                          </span>
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>{isDnp ? 'DNP' : (e.best_score === 7 ? 'X' : e.best_score)}</td>
                                        <td style={{ padding: '6px 8px' }}>
                                          {isDnp ? '\u2014' : (e.best_cast_url ? <a href={e.best_cast_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fire-1)' }}>Cast</a> : 'Screenshot')}
                                        </td>
                                      </tr>
                                      {showDivider && (
                                        <tr>
                                          <td colSpan={4} style={{ padding: 0 }}>
                                            <div className="neon-teal-divider" />
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {framedlLeaderboard.length > 10 && (
                            <div style={{ marginTop: '10px' }}>
                              <select
                                value={framedlShowFullId === result.id ? 'full' : 'first10'}
                                onChange={(ev) => setFramedlShowFullId(ev.target.value === 'full' ? result.id : null)}
                                style={{
                                  padding: '6px 10px',
                                  fontSize: '0.8rem',
                                  background: 'var(--bg-2)',
                                  color: 'var(--text-0)',
                                  border: '1px solid var(--stroke)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                <option value="first10">First 10</option>
                                <option value="full">View entire board</option>
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* IN OR OUT: Quit $X each, Stayed list */}
                  {result.gameType === 'in_or_out' && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      {result.winners.length > 0 && (
                        <p style={{ color: 'var(--text-0)', fontSize: '0.875rem', marginBottom: '6px' }}>
                          Quit: {formatPrizeAmount(result.winners[0]?.amount ?? 0)} BETR each ({result.winners.length} player{result.winners.length !== 1 ? 's' : ''})
                        </p>
                      )}
                      {result.stayerFids && result.stayerFids.length > 0 && (
                        <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', margin: 0 }}>
                          Stayed: {result.stayerFids.map((fid) => `FID ${fid}`).join(', ')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* BULLIED: X advanced · Y eliminated + View details per group */}
                  {result.gameType === 'bullied' && result.bulliedGroups && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      <p style={{ color: 'var(--text-0)', fontSize: '0.875rem', marginBottom: '8px' }}>
                        {result.bulliedGroups.filter(g => g.winnerFid != null).length} advanced &middot;{' '}
                        {result.bulliedGroups.reduce((sum, g) => sum + (g.eliminatedProfiles?.length ?? 0), 0)} eliminated
                      </p>
                      <button
                        onClick={() => setExpandedBulliedGames(prev => {
                          const next = new Set(prev);
                          next.has(result.id) ? next.delete(result.id) : next.add(result.id);
                          return next;
                        })}
                        style={{ color: 'var(--fire-1)', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {expandedBulliedGames.has(result.id) ? 'Hide details ▲' : 'View details ▼'}
                      </button>
                      {expandedBulliedGames.has(result.id) && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {result.bulliedGroups.map(group => (
                            <div key={group.groupNumber} style={{ fontSize: '0.8rem', color: 'var(--text-1)' }}>
                              <span style={{ color: 'var(--text-2)', marginRight: '6px' }}>Group {group.groupNumber}</span>
                              {group.winnerFid
                                ? <span style={{ color: 'var(--fire-1)' }}>{group.winnerDisplayName || (group.winnerUsername ? `@${group.winnerUsername}` : `FID ${group.winnerFid}`)} advanced</span>
                                : <span style={{ color: 'var(--text-2)' }}>All eliminated</span>}
                              {group.eliminatedProfiles && group.eliminatedProfiles.length > 0 && (
                                <span> &middot; eliminated: {group.eliminatedProfiles.map(ep => ep.display_name || (ep.username ? `@${ep.username}` : `FID ${ep.fid}`)).join(', ')}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAKE FROM THE PILE: events in order, remaining */}
                  {result.gameType === 'take_from_the_pile' && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      {result.takeFromThePileEvents && result.takeFromThePileEvents.length > 0 && (
                        <>
                        <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                          Order
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}>
                          {result.takeFromThePileEvents.map((ev) => {
                            const name = ev.display_name || ev.username || `FID ${ev.fid}`;
                            return (
                              <li
                                key={ev.sequence}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '4px 0',
                                  fontSize: '0.875rem',
                                  cursor: 'pointer',
                                }}
                                onClick={() => openFarcasterProfile(ev.fid, ev.username != null ? ev.username : null)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(ev.fid, ev.username != null ? ev.username : null); } }}
                              >
                                {ev.event_type === 'skip' ? (
                                  <span style={{ color: 'var(--text-1)' }}>{name} — Skipped</span>
                                ) : (
                                  <span style={{ color: 'var(--text-0)' }}>{name} — {formatPrizeAmount(ev.amount_taken ?? 0)} BETR</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        </>
                      )}
                      {typeof result.takeFromThePileRemaining === 'number' && (
                        <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', margin: 0 }}>
                          Remaining: {formatPrizeAmount(result.takeFromThePileRemaining)} BETR
                        </p>
                      )}
                      {result.winners.length > 0 && (
                        <>
                        <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginTop: '8px', textTransform: 'uppercase' }}>
                          Payouts (manual)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                          {result.winners.map((w) => (
                            <span
                              key={w.fid}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}
                              onClick={() => openFarcasterProfile(w.fid, w.username ?? null)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(w.fid, w.username ?? null); } }}
                            >
                              {getWinnerDisplay(w)} — {formatPrizeAmount(w.amount)} BETR
                            </span>
                          ))}
                        </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* THE MOLE: Advanced + Eliminated (when stored on game) */}
                  {result.gameType === 'the_mole' && (result.theMoleAdvancedProfiles?.length || result.theMoleEliminatedProfiles?.length) && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      {result.theMoleAdvancedProfiles && result.theMoleAdvancedProfiles.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>Advanced</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {result.theMoleAdvancedProfiles.map((p) => (
                              <span
                                key={p.fid}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}
                                onClick={() => openFarcasterProfile(p.fid, p.username ?? null)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openFarcasterProfile(p.fid, p.username ?? null); } }}
                              >
                                {p.pfp_url ? (
                                  <img src={p.pfp_url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-2)' }}>?</div>
                                )}
                                <span style={{ color: 'var(--text-0)' }}>{p.display_name || (p.username ? `@${p.username}` : `FID ${p.fid}`)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.theMoleEliminatedProfiles && result.theMoleEliminatedProfiles.length > 0 && (
                        <div>
                          <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>Eliminated</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {result.theMoleEliminatedProfiles.map((p) => (
                              <span
                                key={p.fid}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-1)' }}
                                onClick={() => openFarcasterProfile(p.fid, p.username ?? null)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openFarcasterProfile(p.fid, p.username ?? null); } }}
                              >
                                {p.pfp_url ? (
                                  <img src={p.pfp_url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-2)' }}>?</div>
                                )}
                                <span>{p.display_name || (p.username ? `@${p.username}` : `FID ${p.fid}`)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* KILL OR KEEP: Final 10 + eliminated */}
                  {result.gameType === 'kill_or_keep' && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      {(result.killOrKeepFinalProfiles && result.killOrKeepFinalProfiles.length > 0) && (
                        <>
                          <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                            Final 10
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                            {result.killOrKeepFinalProfiles.map((p) => (
                              <span
                                key={p.fid}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}
                                onClick={() => openFarcasterProfile(p.fid, p.username ?? null)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(p.fid, p.username ?? null); } }}
                              >
                                {p.display_name || (p.username ? `@${p.username}` : `FID ${p.fid}`)}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      {(result.killOrKeepEliminatedProfiles && result.killOrKeepEliminatedProfiles.length > 0) && (
                        <>
                          <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                            Eliminated
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {result.killOrKeepEliminatedProfiles.map((p) => (
                              <span
                                key={p.fid}
                                style={{ color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}
                                onClick={() => openFarcasterProfile(p.fid, p.username ?? null)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(p.fid, p.username ?? null); } }}
                              >
                                {p.display_name || (p.username ? `@${p.username}` : `FID ${p.fid}`)}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      <div style={{ marginTop: '12px' }}>
                        <button
                          type="button"
                          onClick={() => setKillOrKeepActivityExpandId((prev) => (prev === result.id ? null : result.id))}
                          style={{ fontSize: '0.875rem', color: 'var(--fire-1)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          {killOrKeepActivityExpandId === result.id ? 'Hide full game activity' : 'View full game activity'}
                        </button>
                        {killOrKeepActivityExpandId === result.id && (
                          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--stroke)' }}>
                            {killOrKeepActivityLoadingId === result.id ? (
                              <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>Loading activity...</p>
                            ) : (killOrKeepActivityByGameId[result.id]?.length ?? 0) > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {killOrKeepActivityByGameId[result.id].map((a) => (
                                  <div key={a.sequence} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '4px 0' }}>
                                    {a.action === 'roulette' ? (
                                      <>
                                        {a.target_pfp_url && <img src={a.target_pfp_url} alt="" width={20} height={20} style={{ borderRadius: '50%', flexShrink: 0 }} />}
                                        <span><strong>{a.target_display_name}</strong> <span style={{ color: 'var(--fire-1)' }}>eliminated by Russian Roulette</span></span>
                                      </>
                                    ) : a.action === 'skip' ? (
                                      <>
                                        {a.target_pfp_url && <img src={a.target_pfp_url} alt="" width={20} height={20} style={{ borderRadius: '50%', flexShrink: 0 }} />}
                                        <span style={{ color: 'var(--text-2)' }}><strong style={{ color: 'var(--text-1)' }}>{a.target_display_name}</strong> was skipped</span>
                                      </>
                                    ) : (
                                      <>
                                        {a.actor_pfp_url && <img src={a.actor_pfp_url} alt="" width={20} height={20} style={{ borderRadius: '50%', flexShrink: 0 }} />}
                                        <span>
                                          <strong>{a.actor_display_name}</strong>
                                          {a.action === 'kill'
                                            ? <span style={{ color: 'var(--fire-1)' }}> killed </span>
                                            : <span style={{ color: '#14B8A6' }}> kept </span>}
                                          {a.target_pfp_url && <img src={a.target_pfp_url} alt="" width={16} height={16} style={{ borderRadius: '50%', display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />}
                                          <strong>{a.target_display_name}</strong>
                                        </span>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>No activity recorded.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ART CONTEST: 14 winners + amount_display, View full gallery */}
                  {result.gameType === 'art_contest' && result.winners.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                        Top 14
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                        {result.winners.map((winner, widx) => (
                          <div key={`${winner.fid}-${widx}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, minWidth: '24px' }}>#{winner.position ?? widx + 1}</span>
                            <span
                              style={{ cursor: 'pointer', color: 'var(--fire-1)' }}
                              onClick={() => openFarcasterProfile(winner.fid, winner.username ?? null)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(winner.fid, winner.username ?? null); } }}
                            >
                              {winner.display_name || (winner.username ? `@${winner.username}` : `FID ${winner.fid}`)}
                            </span>
                            {winner.amount_display && <span style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>{winner.amount_display}</span>}
                          </div>
                        ))}
                      </div>
                      <Link href="/art-contest" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>View full gallery</Link>
                    </div>
                  )}

                  {/* NCAA HOOPS: leaderboard (position, name, total_score) */}
                  {result.gameType === 'ncaa_hoops' && result.winners.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                        Leaderboard
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                        {result.winners.slice(0, 10).map((winner, widx) => (
                          <div key={`${winner.fid}-${widx}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, minWidth: '24px' }}>#{winner.position ?? widx + 1}</span>
                            <span
                              style={{ cursor: 'pointer', color: 'var(--fire-1)' }}
                              onClick={() => openFarcasterProfile(winner.fid, winner.username ?? null)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(winner.fid, winner.username ?? null); } }}
                            >
                              {winner.display_name || (winner.username ? `@${winner.username}` : `FID ${winner.fid}`)}
                            </span>
                            <span style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>{winner.amount} pts</span>
                          </div>
                        ))}
                      </div>
                      <Link href="/ncaa-hoops" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>NCAA HOOPS</Link>
                    </div>
                  )}

                  {/* Winners — non-FRAMEDL, non–IN OR OUT, non–TAKE FROM THE PILE, non-BULLIED, non–KILL OR KEEP, non–ART CONTEST, non–NCAA HOOPS (Poker, BUDDY UP, WEEKEND GAME, etc.) */}
                  {result.winners.length > 0 && result.gameType !== 'framedl_betr' && result.gameType !== 'in_or_out' && result.gameType !== 'take_from_the_pile' && result.gameType !== 'bullied' && result.gameType !== 'kill_or_keep' && result.gameType !== 'art_contest' && result.gameType !== 'ncaa_hoops' && (result.gameType !== 'the_mole' || !(result.theMoleAdvancedProfiles?.length || result.theMoleEliminatedProfiles?.length)) && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                        Winner{result.winners.length > 1 ? 's' : ''}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        {result.winners.map((winner, widx) => (
                          <div key={`${winner.fid}-${widx}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                              onClick={() => openFarcasterProfile(winner.fid, winner.username ?? null)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openFarcasterProfile(winner.fid, winner.username ?? null); } }}
                            >
                            {winner.position && result.winners.length > 1 && (
                              result.gameType === 'superbowl_squares' ? (
                                <span style={{
                                  background: 'rgba(20, 184, 166, 0.15)',
                                  color: 'var(--fire-1)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}>
                                  {{ 1: 'Q1', 2: 'HT', 3: 'Q3', 4: 'Final' }[winner.position] || winner.position}
                                </span>
                              ) : (
                                <span style={{
                                  background: winner.position === 1 ? 'gold' : winner.position === 2 ? 'silver' : '#CD7F32',
                                  color: '#000',
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                }}>
                                  {winner.position}
                                </span>
                              )
                            )}
                            {winner.pfp_url ? (
                              <img
                                src={winner.pfp_url}
                                alt=""
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                }}
                              />
                            ) : (
                              <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: 'var(--bg-2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.7rem',
                                color: 'var(--text-2)',
                              }}>
                                ?
                              </div>
                            )}
                            <div>
                              <div style={{ color: 'var(--text-0)', fontSize: '0.875rem', fontWeight: 500 }}>
                                {getWinnerDisplay(winner)}
                              </div>
                              <div style={{ color: 'var(--fire-1)', fontSize: '0.75rem' }}>
                                {result.gameType === 'weekend_game' ? 'Advantage' : `${formatPrizeAmount(winner.amount)} BETR`}
                              </div>
                            </div>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* One-off: STEAL OR NO STEAL result where winner is Jacy — show Eliminated (FID 1477579) under winner */}
                  {result.oneOffEliminatedProfile && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }}>
                      <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px', textTransform: 'uppercase' }}>
                        Eliminated
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                          onClick={() => openFarcasterProfile(result.oneOffEliminatedProfile!.fid, result.oneOffEliminatedProfile!.username ?? null)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openFarcasterProfile(result.oneOffEliminatedProfile!.fid, result.oneOffEliminatedProfile!.username ?? null); } }}
                        >
                          {result.oneOffEliminatedProfile.pfp_url ? (
                            <img
                              src={result.oneOffEliminatedProfile.pfp_url}
                              alt=""
                              style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-2)' }}>?</div>
                          )}
                          <span style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>
                            {result.oneOffEliminatedProfile.display_name || (result.oneOffEliminatedProfile.username ? `@${result.oneOffEliminatedProfile.username}` : null) || `FID ${result.oneOffEliminatedProfile.fid}`}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Weekend Game: Top 5 winners picks block (admin or one of 5 winners) */}
                  {result.gameType === 'weekend_game' && token && (isAdmin || result.winners.some((w) => w.fid === fid)) && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                      <WeekendGamePicksBlock roundId={result.id} token={token} currentFid={fid ?? null} isAdmin={isAdmin} />
                    </div>
                  )}

                  {/* Weekend Game: View full results — full leaderboard (scored + DNP down to eliminated) */}
                  {result.gameType === 'weekend_game' && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setWeekendGameLeaderboardExpandId((id) => (id === result.id ? null : result.id))}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--fire-1)',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {weekendGameLeaderboardExpandId === result.id ? 'Hide full results' : 'View full results'}
                      </button>
                      {weekendGameLeaderboardExpandId === result.id && (
                        <div style={{ marginTop: '12px' }}>
                          {weekendGameFullLeaderboardLoading ? (
                            <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>Loading leaderboard…</p>
                          ) : weekendGameFullLeaderboard && weekendGameFullLeaderboard.entries.length > 0 ? (
                            <>
                              <div style={{ overflowX: 'auto' }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginBottom: '8px' }}>
                                  Higher score = better rank. Top 5 get an advantage.
                                </p>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #333' }}>
                                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>#</th>
                                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Player</th>
                                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Score</th>
                                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Proof</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(weekendGameShowFullId === result.id ? weekendGameFullLeaderboard.entries : weekendGameFullLeaderboard.entries.slice(0, 10)).map((e, idx) => {
                                      const isDnp = e.best_score === null;
                                      const isBottom10 = idx >= weekendGameFullLeaderboard.totalCount - weekendGameFullLeaderboard.bottomCount;
                                      const isFirstBottom10 = idx === weekendGameFullLeaderboard.totalCount - weekendGameFullLeaderboard.bottomCount && weekendGameFullLeaderboard.bottomCount > 0;
                                      return (
                                        <React.Fragment key={e.fid}>
                                          {idx === 5 && (
                                            <tr>
                                              <td colSpan={4} style={{ padding: 0, borderBottom: '3px solid #14B8A6' }} />
                                            </tr>
                                          )}
                                          <tr style={{
                                            borderBottom: '1px solid #222',
                                            background: 'transparent',
                                          }}>
                                            <td style={{ padding: '6px 8px' }}>{isDnp ? '—' : (e.rank ?? idx + 1)}</td>
                                            <td style={{ padding: '6px 8px' }}>
                                              <span
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => openFarcasterProfile(e.fid, e.username)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openFarcasterProfile(e.fid, e.username); } }}
                                              >
                                                {e.pfp_url && <img src={e.pfp_url} alt="" style={{ width: 20, height: 20, borderRadius: 10, marginRight: 6, verticalAlign: 'middle' }} />}
                                                {e.display_name || e.username || `FID ${e.fid}`}
                                              </span>
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '6px 8px', color: isDnp ? '#ef4444' : 'inherit' }}>
                                              {isDnp ? 'DNP' : (e.best_score ?? '—')}
                                            </td>
                                            <td style={{ padding: '6px 8px' }}>
                                              {isDnp ? '—' : (e.best_cast_url ? <a href={e.best_cast_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fire-1)' }}>Cast</a> : 'Screenshot')}
                                            </td>
                                          </tr>
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {weekendGameFullLeaderboard.entries.length > 10 && (
                                <div style={{ marginTop: '10px' }}>
                                  <select
                                    value={weekendGameShowFullId === result.id ? 'full' : 'first10'}
                                    onChange={(ev) => setWeekendGameShowFullId(ev.target.value === 'full' ? result.id : null)}
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: '0.8rem',
                                      background: 'var(--bg-2)',
                                      color: 'var(--text-0)',
                                      border: '1px solid var(--stroke)',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <option value="first10">First 10</option>
                                    <option value="full">View entire board</option>
                                  </select>
                                </div>
                              )}
                            </>
                          ) : (
                            <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No leaderboard data.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* See Full Results link for Super Bowl games */}
                  {(result.gameType === 'superbowl_props' || result.gameType === 'superbowl_squares') && (
                    <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: '12px', marginTop: '12px', textAlign: 'center' }}>
                      <Link
                        href={result.gameType === 'superbowl_props' ? `/superbowl-props?gameId=${result.id}` : `/superbowl-squares?gameId=${result.id}`}
                        style={{
                          color: 'var(--fire-1)',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          textDecoration: 'none',
                        }}
                      >
                        See Full Results →
                      </Link>
                    </div>
                  )}
                </div>
              ))}

              {/* Load More */}
              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <button
                    onClick={() => loadResults(offset)}
                    disabled={loadingMore}
                    className="btn-primary"
                    style={{ padding: '12px 32px' }}
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
