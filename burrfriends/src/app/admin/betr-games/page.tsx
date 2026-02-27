'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isAdmin as checkIsAdmin } from '~/lib/admin';
import { formatRelativeTime } from '~/lib/utils';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';

interface Registration {
  fid: number;
  registered_at: string;
  source: string;
  approved_at: string | null;
  username: string;
  display_name: string;
  pfp_url: string;
}

interface TournamentPlayer {
  fid: number;
  status: string;
  eliminated_at: string | null;
  eliminated_reason: string | null;
  username: string;
  display_name: string;
  pfp_url: string;
}

interface Counts {
  total: number;
  alive: number;
  eliminated: number;
  quit: number;
}

export default function BetrGamesTournamentPage() {
  const { fid, token, status: authStatus } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Pending approvals
  const [pendingRegs, setPendingRegs] = useState<Registration[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  
  // Phase 22.3 + 25: Registration stats (added rejected)
  const [registrationStats, setRegistrationStats] = useState({ totalRegistered: 0, approved: 0, pending: 0, rejected: 0 });
  const [playerListPopup, setPlayerListPopup] = useState<{ category: string; players: { fid: number; display_name: string }[]; showRemove?: boolean } | null>(null);
  const [loadingPopup, setLoadingPopup] = useState(false);
  
  // Tournament players
  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [tournamentCounts, setTournamentCounts] = useState<Counts>({ total: 0, alive: 0, eliminated: 0, quit: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Search for elimination
  const [searchQuery, setSearchQuery] = useState('');
  const [eliminateReason, setEliminateReason] = useState('');
  
  // Action states
  const [approving, setApproving] = useState<number | null>(null);
  const [eliminating, setEliminating] = useState<number | null>(null);
  const [reinstating, setReinstating] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [startingTournament, setStartingTournament] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [tournamentCommunity, setTournamentCommunity] = useState<'betr' | 'minted_merch'>('betr'); // Phase 36
  const actionMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authStatus === 'authed' && fid) {
      setIsAdmin(checkIsAdmin(fid));
    }
  }, [authStatus, fid]);

  const loadData = async () => {
    if (!token || !isAdmin) return;
    setLoading(true);
    
    try {
      const [pendingRes, playersRes] = await Promise.all([
        authedFetch('/api/admin/betr-games/pending', {}, token),
        authedFetch(`/api/admin/betr-games/tournament-players${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`, {}, token),
      ]);
      
      const [pendingData, playersData] = await Promise.all([
        pendingRes.json(),
        playersRes.json(),
      ]);
      
      if (pendingData.ok) {
        setPendingRegs(pendingData.data.pending || []);
        setPendingCount(pendingData.data.count || 0);
        setRegistrationStats(pendingData.data.stats || { totalRegistered: 0, approved: 0, pending: 0, rejected: 0 });
      }
      
      if (playersData.ok) {
        setTournamentPlayers(playersData.data.players || []);
        setTournamentCounts(playersData.data.counts || { total: 0, alive: 0, eliminated: 0, quit: 0 });
      }
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, isAdmin, statusFilter]);

  const handleApprove = async (targetFid: number) => {
    if (!token) return;
    setApproving(targetFid);
    setActionMessage(null);
    
    try {
      const res = await authedFetch('/api/admin/betr-games/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: targetFid }),
      }, token);
      
      const data = await res.json();
      if (data.ok) {
        setActionMessage(`Approved FID ${targetFid}`);
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    } finally {
      setApproving(null);
    }
  };

  // Phase 25: Reject pending registration
  const handleReject = async (targetFid: number) => {
    if (!token) return;
    setRejecting(targetFid);
    setActionMessage(null);
    
    try {
      const res = await authedFetch('/api/admin/betr-games/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: targetFid }),
      }, token);
      
      const data = await res.json();
      if (data.ok) {
        setActionMessage(`Rejected FID ${targetFid}`);
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    } finally {
      setRejecting(null);
    }
  };

  // Phase 25: Remove approved registration
  const handleRemove = async (targetFid: number) => {
    if (!token) return;
    setRemoving(targetFid);
    setActionMessage(null);
    
    try {
      const res = await authedFetch('/api/admin/betr-games/remove-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: targetFid }),
      }, token);
      
      const data = await res.json();
      if (data.ok) {
        setActionMessage(`Removed FID ${targetFid}`);
        // Update popup if open
        if (playerListPopup) {
          setPlayerListPopup(prev => prev ? {
            ...prev,
            players: prev.players.filter(p => p.fid !== targetFid),
          } : null);
        }
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    } finally {
      setRemoving(null);
    }
  };

  const handleStartTournament = async () => {
    if (!token) return;
    
    setShowCloseConfirm(false);
    setStartingTournament(true);
    setActionMessage(null);
    
    try {
      const res = await authedFetch('/api/admin/betr-games/start-tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ community: tournamentCommunity }),
      }, token);
      
      const data = await res.json();
      if (data.ok) {
        setActionMessage(`Tournament started with ${data.data.playerCount} players!`);
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    } finally {
      setStartingTournament(false);
      // Scroll action message into view so feedback is always visible
      setTimeout(() => actionMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  };

  const handleEliminate = async (targetFid: number) => {
    if (!token) return;
    setEliminating(targetFid);
    setActionMessage(null);
    
    try {
      const res = await authedFetch('/api/admin/betr-games/eliminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: targetFid, reason: eliminateReason || undefined }),
      }, token);
      
      const data = await res.json();
      if (data.ok) {
        setActionMessage(`Eliminated FID ${targetFid}`);
        setEliminateReason('');
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    } finally {
      setEliminating(null);
    }
  };

  const handleReinstate = async (targetFid: number) => {
    if (!token) return;
    setReinstating(targetFid);
    setActionMessage(null);
    
    try {
      const res = await authedFetch('/api/admin/betr-games/reinstate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: targetFid }),
      }, token);
      
      const data = await res.json();
      if (data.ok) {
        setActionMessage(`Reinstated FID ${targetFid}`);
        loadData();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    } finally {
      setReinstating(null);
    }
  };

  // Phase 22.3 + 25: Handle clicking on registration stat to show player list
  const handleStatClick = async (category: 'all' | 'approved' | 'pending' | 'rejected') => {
    if (!token) return;
    setLoadingPopup(true);
    
    try {
      const res = await authedFetch(`/api/admin/betr-games/registrations-by-category?category=${category}`, {}, token);
      const data = await res.json();
      if (data.ok) {
        const categoryLabel = category === 'all' ? 'Total Registered' 
          : category === 'approved' ? 'Approved' 
          : category === 'rejected' ? 'Rejected'
          : 'Pending';
        setPlayerListPopup({
          category: categoryLabel,
          players: data.data.players || [],
          showRemove: category === 'approved', // Phase 25: Enable Remove buttons for approved
        });
      }
    } catch (e) {
      console.error('Failed to load player list', e);
    } finally {
      setLoadingPopup(false);
    }
  };

  // Filter tournament players by search query
  const filteredPlayers = tournamentPlayers.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.username.toLowerCase().includes(q) || 
           p.display_name.toLowerCase().includes(q) ||
           String(p.fid).includes(q);
  });

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
          <h1 style={{ color: 'var(--text-0)', marginBottom: '16px' }}>BETR GAMES Tournament</h1>
          <p style={{ color: 'var(--text-1)' }}>Admin access required</p>
          <Link href="/admin/dashboard" className="btn-primary" style={{ marginTop: '16px', display: 'inline-block' }}>
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '8px' }}>
          <h1 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.5rem' }}>BETR GAMES TOURNAMENT</h1>
          <Link href="/admin/dashboard" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>
            ← Back to Dashboard
          </Link>
        </div>

        {/* Action Message */}
        {actionMessage && (
          <div ref={actionMessageRef} style={{ 
            padding: '12px 16px', 
            marginBottom: '16px', 
            background: actionMessage.startsWith('Error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            border: `1px solid ${actionMessage.startsWith('Error') ? '#ef4444' : '#22c55e'}`,
            borderRadius: '8px',
            color: actionMessage.startsWith('Error') ? '#ef4444' : '#22c55e',
          }}>
            {actionMessage}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-1)' }}>Loading...</p>
        ) : (
          <>
            {/* Phase 22.3 + 25: Registration Stats (added Rejected) */}
            <div className="hl-card" style={{ padding: '16px', marginBottom: '16px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '1rem' }}>Registration Stats</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', textAlign: 'center' }}>
                <div 
                  onClick={() => handleStatClick('all')}
                  style={{ cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ color: 'var(--fire-1)', fontSize: '2rem', fontWeight: 700 }}>{registrationStats.totalRegistered}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Total</div>
                </div>
                <div 
                  onClick={() => handleStatClick('approved')}
                  style={{ cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ color: '#22c55e', fontSize: '2rem', fontWeight: 700 }}>{registrationStats.approved}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Approved</div>
                </div>
                <div 
                  onClick={() => handleStatClick('pending')}
                  style={{ cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ color: '#f59e0b', fontSize: '2rem', fontWeight: 700 }}>{registrationStats.pending}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Pending</div>
                </div>
                <div 
                  onClick={() => handleStatClick('rejected')}
                  style={{ cursor: 'pointer', padding: '8px', borderRadius: '8px', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ color: '#ef4444', fontSize: '2rem', fontWeight: 700 }}>{registrationStats.rejected}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Rejected</div>
                </div>
              </div>
              <p style={{ color: 'var(--text-2)', fontSize: '0.7rem', marginTop: '8px', textAlign: 'center' }}>
                Click a number to see player list
              </p>
            </div>

            {/* Tournament Stats */}
            <div className="hl-card" style={{ padding: '16px', marginBottom: '16px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '1rem' }}>Tournament Status</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', textAlign: 'center' }}>
                <div>
                  <div style={{ color: 'var(--text-0)', fontSize: '2rem', fontWeight: 700 }}>{tournamentCounts.total}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Total</div>
                </div>
                <div>
                  <div style={{ color: '#22c55e', fontSize: '2rem', fontWeight: 700 }}>{tournamentCounts.alive}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Alive</div>
                </div>
                <div>
                  <div style={{ color: '#ef4444', fontSize: '2rem', fontWeight: 700 }}>{tournamentCounts.eliminated}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Eliminated</div>
                </div>
                <div>
                  <div style={{ color: '#f59e0b', fontSize: '2rem', fontWeight: 700 }}>{tournamentCounts.quit}</div>
                  <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>Quit</div>
                </div>
              </div>
              
              {tournamentCounts.total === 0 && (
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <button 
                    onClick={() => setShowCloseConfirm(true)}
                    disabled={startingTournament || pendingCount > 0}
                    className="btn-primary"
                    style={{ padding: '12px 24px' }}
                  >
                    {startingTournament ? 'Closing...' : 'Close Registration for BETR GAMES'}
                  </button>
                  {pendingCount > 0 && (
                    <p style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: '8px' }}>
                      Approve {pendingCount} pending registration(s) first
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Pending Approvals - Phase 25: removed pfp, added Reject button */}
            <div className="hl-card" style={{ padding: '16px', marginBottom: '16px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: '0 0 12px 0', fontSize: '1rem' }}>
                Pending Approvals ({pendingCount})
              </h2>
              {pendingRegs.length === 0 ? (
                <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No pending approvals</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {pendingRegs.map((reg) => (
                    <div key={reg.fid} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px', 
                      padding: '10px', 
                      background: 'var(--bg-2)', 
                      borderRadius: '8px' 
                    }}>
                      <div
                        style={{ flex: 1, cursor: 'pointer' }}
                        onClick={() => openFarcasterProfile(reg.fid, reg.username)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(reg.fid, reg.username); } }}
                      >
                        <div style={{ color: 'var(--text-0)', fontWeight: 500 }}>{reg.display_name}</div>
                        <div style={{ color: 'var(--text-2)', fontSize: '0.75rem' }}>@{reg.username} · FID {reg.fid}</div>
                      </div>
                      <div style={{ color: 'var(--text-2)', fontSize: '0.75rem' }}>
                        {formatRelativeTime(reg.registered_at)}
                      </div>
                      <button
                        onClick={() => handleApprove(reg.fid)}
                        disabled={approving === reg.fid || rejecting === reg.fid}
                        className="btn-primary"
                        style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      >
                        {approving === reg.fid ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleReject(reg.fid)}
                        disabled={approving === reg.fid || rejecting === reg.fid}
                        style={{ 
                          padding: '6px 12px', 
                          fontSize: '0.75rem',
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid #ef4444',
                          borderRadius: '6px',
                          color: '#ef4444',
                          cursor: 'pointer',
                        }}
                      >
                        {rejecting === reg.fid ? '...' : 'Reject'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tournament Players */}
            <div className="hl-card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1rem' }}>
                  Tournament Players
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--stroke)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-0)',
                      fontSize: '0.75rem',
                    }}
                  >
                    <option value="all">All</option>
                    <option value="alive">Alive</option>
                    <option value="eliminated">Eliminated</option>
                    <option value="quit">Quit</option>
                  </select>
                </div>
              </div>
              
              {/* Search */}
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Search by username or FID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--stroke)',
                    background: 'var(--bg-2)',
                    color: 'var(--text-0)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {/* Elimination reason input */}
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Elimination reason (optional)"
                  value={eliminateReason}
                  onChange={(e) => setEliminateReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--stroke)',
                    background: 'var(--bg-2)',
                    color: 'var(--text-0)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {filteredPlayers.length === 0 ? (
                <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>
                  {tournamentCounts.total === 0 ? 'Tournament not started yet' : 'No players match search'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                  {filteredPlayers.map((player) => (
                    <div key={player.fid} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px', 
                      padding: '10px', 
                      background: 'var(--bg-2)', 
                      borderRadius: '8px',
                      borderLeft: `4px solid ${player.status === 'alive' ? '#22c55e' : player.status === 'eliminated' ? '#ef4444' : '#f59e0b'}`,
                    }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, cursor: 'pointer' }}
                        onClick={() => openFarcasterProfile(player.fid, player.username)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(player.fid, player.username); } }}
                      >
                        {player.pfp_url && (
                          <Image src={player.pfp_url} alt="" width={36} height={36} style={{ borderRadius: '50%' }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ color: 'var(--text-0)', fontWeight: 500 }}>{player.display_name}</div>
                          <div style={{ color: 'var(--text-2)', fontSize: '0.75rem' }}>@{player.username} · FID {player.fid}</div>
                          {player.eliminated_reason && (
                            <div style={{ color: '#ef4444', fontSize: '0.7rem', marginTop: '2px' }}>
                              {player.eliminated_reason}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background: player.status === 'alive' ? 'rgba(34, 197, 94, 0.2)' : player.status === 'eliminated' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: player.status === 'alive' ? '#22c55e' : player.status === 'eliminated' ? '#ef4444' : '#f59e0b',
                      }}>
                        {player.status}
                      </div>
                      {player.status === 'alive' ? (
                        <button
                          onClick={() => handleEliminate(player.fid)}
                          disabled={eliminating === player.fid}
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '0.75rem',
                            background: 'rgba(239, 68, 68, 0.2)',
                            border: '1px solid #ef4444',
                            borderRadius: '6px',
                            color: '#ef4444',
                            cursor: 'pointer',
                          }}
                        >
                          {eliminating === player.fid ? '...' : 'Eliminate'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReinstate(player.fid)}
                          disabled={reinstating === player.fid}
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '0.75rem',
                            background: 'rgba(34, 197, 94, 0.2)',
                            border: '1px solid #22c55e',
                            borderRadius: '6px',
                            color: '#22c55e',
                            cursor: 'pointer',
                          }}
                        >
                          {reinstating === player.fid ? '...' : 'Reinstate'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Phase 22.9: Close Registration Confirmation Modal (in-app, not window.confirm) */}
      {showCloseConfirm && (
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
          }}
          onClick={() => setShowCloseConfirm(false)}
        >
          <div
            className="hl-card"
            style={{
              maxWidth: '90%',
              width: '400px',
              padding: '24px',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: 'var(--text-0)', margin: '0 0 16px 0', fontSize: '1.25rem' }}>
              Are you sure?
            </h2>
            {/* Phase 36: Community selector for tournament */}
            <div style={{ marginBottom: '16px', textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
                Community
              </label>
              <select
                value={tournamentCommunity}
                onChange={(e) => setTournamentCommunity(e.target.value as 'betr' | 'minted_merch')}
                style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
              >
                <option value="betr">BETR (default)</option>
                <option value="minted_merch">Minted Merch</option>
              </select>
            </div>
            <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '24px' }}>
              This will close registration and lock the master list of players. New signups will be blocked and BETR GAMES can begin.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowCloseConfirm(false)}
                style={{
                  padding: '10px 20px',
                  fontSize: '0.875rem',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--stroke)',
                  borderRadius: '8px',
                  color: 'var(--text-1)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleStartTournament}
                className="btn-primary"
                style={{ padding: '10px 20px', fontSize: '0.875rem' }}
              >
                Yes, Close Registration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 22.3: Player List Popup */}
      {playerListPopup && (
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
          }}
          onClick={() => setPlayerListPopup(null)}
        >
          <div
            className="hl-card"
            style={{
              maxWidth: '90%',
              width: '400px',
              maxHeight: '80vh',
              padding: '24px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.25rem' }}>
                {playerListPopup.category} ({playerListPopup.players.length})
              </h2>
              <button
                onClick={() => setPlayerListPopup(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-1)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0 8px',
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {playerListPopup.players.length === 0 ? (
                <p style={{ color: 'var(--text-2)', textAlign: 'center' }}>No players</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {playerListPopup.players.map((p) => (
                    <div 
                      key={p.fid} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: 'var(--bg-2)',
                        borderRadius: '6px',
                      }}
                    >
                      <span
                        style={{ color: 'var(--text-0)', cursor: 'pointer' }}
                        onClick={() => openFarcasterProfile(p.fid, null)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(p.fid, null); } }}
                      >
                        {p.display_name} · FID {p.fid}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Phase 25: Show Remove button for approved registrations */}
                        {playerListPopup.showRemove && (
                          <button
                            onClick={() => handleRemove(p.fid)}
                            disabled={removing === p.fid}
                            style={{ 
                              padding: '4px 8px', 
                              fontSize: '0.7rem',
                              background: 'rgba(239, 68, 68, 0.2)',
                              border: '1px solid #ef4444',
                              borderRadius: '4px',
                              color: '#ef4444',
                              cursor: 'pointer',
                            }}
                          >
                            {removing === p.fid ? '...' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay for popup */}
      {loadingPopup && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
        >
          <p style={{ color: 'var(--text-0)' }}>Loading...</p>
        </div>
      )}
    </main>
  );
}
