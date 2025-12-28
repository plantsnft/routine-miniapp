'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isClubOwnerOrAdmin, isGlobalAdmin } from '~/lib/permissions';
import { isPaidGame } from '~/lib/games';
import type { Game, GameParticipant, Club, PaymentStatus, User, Payout, PayoutStatus } from '~/lib/types';
import { formatDate } from '~/lib/utils';

export default function ManageGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, fid } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [newFid, setNewFid] = useState('');
  const [addingFid, setAddingFid] = useState(false);
  const [users, setUsers] = useState<Record<number, User>>({});
  const [updatingPaymentStatus, setUpdatingPaymentStatus] = useState<number | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [editingPayout, setEditingPayout] = useState<string | null>(null);
  const [payoutTxHash, setPayoutTxHash] = useState<Record<string, string>>({});
  const [payoutStatus, setPayoutStatus] = useState<Record<string, PayoutStatus>>({});
  const [payoutNotes, setPayoutNotes] = useState<Record<string, string>>({});
  const [showRemixPayload, setShowRemixPayload] = useState(false);
  const [remixPayload, setRemixPayload] = useState<any>(null);
  const [showMarkActiveModal, setShowMarkActiveModal] = useState(false);
  const [markActiveTxHash, setMarkActiveTxHash] = useState('');
  const [markingActive, setMarkingActive] = useState(false);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (fid) {
      setCurrentUserFid(fid);
      loadData();
    }
  }, [id, fid, token]);

  useEffect(() => {
    // Load payouts when game is completed
    if (game && game.status === 'completed' && currentUserFid) {
      loadPayouts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, currentUserFid]);

  const loadData = async () => {
    if (!token || !fid) {
      setError('Please sign in');
      setLoading(false);
      return;
    }

    try {
      // Fetch game
      const gameRes = await authedFetch(`/api/games/${id}`, { method: 'GET' }, token);
      if (!gameRes.ok) throw new Error('Failed to fetch game');
      const gameData = await gameRes.json();
      setGame(gameData.data);

      // Fetch club (requires auth)
      const clubsRes = await authedFetch('/api/clubs', { method: 'GET' }, token);
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      const foundClub = clubsData.data?.find((c: Club) => c.id === gameData.data.club_id);
      setClub(foundClub);

      // Verify ownership
      if (foundClub && !isClubOwnerOrAdmin(fid, foundClub)) {
        setError('Only club owners can manage games');
        return;
      }

      // Fetch participants (will trigger user load after)
      await loadParticipants();
      
      // Fetch payouts if game is completed
      if (gameData.data.status === 'completed') {
        await loadPayouts();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadParticipants = async () => {
    if (!token || !fid) return;
    try {
      const res = await authedFetch(`/api/games/${id}/participants`, { method: 'GET' }, token);
      if (!res.ok) throw new Error('Failed to fetch participants');
      const data = await res.json();
      setParticipants(data.data || []);
      // Load users after participants are loaded
      await loadUsers(data.data || []);
    } catch (err: any) {
      console.error('Failed to load participants:', err);
    }
  };

  const loadUsers = async (participantsList?: GameParticipant[]) => {
    const list = participantsList || participants;
    try {
      const uniqueFids = Array.from(new Set(list.map(p => p.player_fid)));
      const userPromises = uniqueFids.map(fid =>
        fetch(`/api/users?fid=${fid}`).then(r => r.json()).then(data => ({ fid, user: data.data }))
      );
      const userResults = await Promise.all(userPromises);
      const usersMap: Record<number, User> = {};
      userResults.forEach(({ fid, user }) => {
        if (user) usersMap[fid] = user;
      });
      setUsers(prev => ({ ...prev, ...usersMap }));
    } catch (err: any) {
      console.error('Failed to load users:', err);
    }
  };

  const loadPayouts = async () => {
    if (!token || !fid) return;
    try {
      const res = await authedFetch(`/api/games/${id}/payouts`, { method: 'GET' }, token);
      if (!res.ok) throw new Error('Failed to fetch payouts');
      const data = await res.json();
      const payoutList = data.data || [];
      setPayouts(payoutList);
      
      // Initialize form state
      const txHashMap: Record<string, string> = {};
      const statusMap: Record<string, PayoutStatus> = {};
      const notesMap: Record<string, string> = {};
      payoutList.forEach((p: Payout) => {
        txHashMap[p.id] = p.tx_hash || '';
        statusMap[p.id] = p.status;
        notesMap[p.id] = p.notes || '';
      });
      setPayoutTxHash(txHashMap);
      setPayoutStatus(statusMap);
      setPayoutNotes(notesMap);
    } catch (err: any) {
      console.error('Failed to load payouts:', err);
    }
  };

  const handleUpdatePayout = async (payoutId: string) => {
    if (!currentUserFid) return;

    setEditingPayout(payoutId);
    setError(null);

    try {
      const res = await fetch(`/api/games/${id}/payouts/${payoutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: currentUserFid,
          tx_hash: payoutTxHash[payoutId] || null,
          status: payoutStatus[payoutId],
          notes: payoutNotes[payoutId] || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update payout');
      }

      await loadPayouts();
      setEditingPayout(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update payout');
    } finally {
      setEditingPayout(null);
    }
  };

  const handleAddFid = async () => {
    if (!newFid || !token || !fid) return;

    setAddingFid(true);
    setError(null);

    try {
      const fidNum = parseInt(newFid, 10);
      if (isNaN(fidNum)) {
        throw new Error('Invalid FID');
      }

      const res = await authedFetch(`/api/games/${id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: fidNum,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to add participant');
      }

      setNewFid('');
      await loadParticipants();
    } catch (err: any) {
      setError(err.message || 'Failed to add participant');
    } finally {
      setAddingFid(false);
    }
  };

  const handleToggleEligibility = async (participant: GameParticipant) => {
    if (!currentUserFid) return;

    try {
      const res = await fetch(`/api/games/${id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: currentUserFid,
          player_fid: participant.player_fid,
          is_eligible: !participant.is_eligible,
          join_reason: participant.join_reason || 'manual_override',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update participant');
      }

      await loadParticipants();
    } catch (err: any) {
      setError(err.message || 'Failed to update participant');
    }
  };

  const handleShowRemixPayload = async () => {
    if (!token) return;
    try {
      const res = await authedFetch(`/api/admin/games/${id}/onchain-payload`, { method: 'GET' }, token);
      if (!res.ok) throw new Error('Failed to fetch Remix payload');
      const data = await res.json();
      setRemixPayload(data.data);
      setShowRemixPayload(true);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Remix payload');
    }
  };

  const handleMarkActive = async () => {
    if (!token || !markActiveTxHash.trim()) return;
    setMarkingActive(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/games/${id}/mark-onchain-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_hash: markActiveTxHash.trim() }),
      }, token);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to mark game as active');
      }
      setShowMarkActiveModal(false);
      setMarkActiveTxHash('');
      await loadData(); // Reload game data
    } catch (err: any) {
      setError(err.message || 'Failed to mark game as active');
    } finally {
      setMarkingActive(false);
    }
  };

  const handleUpdatePaymentStatus = async (participant: GameParticipant, newStatus: PaymentStatus) => {
    if (!token || !fid) return;

    setUpdatingPaymentStatus(participant.player_fid || (participant as any).fid);
    setError(null);

    try {
      const participantFid = participant.player_fid || (participant as any).fid;
      const res = await authedFetch(`/api/games/${id}/participants/${participantFid}/payment-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: newStatus,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update payment status');
      }

      await loadParticipants();
    } catch (err: any) {
      setError(err.message || 'Failed to update payment status');
    } finally {
      setUpdatingPaymentStatus(null);
    }
  };

  const [settling, setSettling] = useState(false);
  const handleSettleGame = async () => {
    if (!token || !fid || !game) return;

    setSettling(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/games/${id}/settle-contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to settle game');
      }

      setSuccessMessage('Game settled successfully!');
      await loadData(); // Reload game data
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to settle game');
    } finally {
      setSettling(false);
    }
  };

  const [editing, setEditing] = useState(true); // Default to editing mode
  const [editForm, setEditForm] = useState({
    name: '',
    entry_fee_amount: '',
    entry_fee_currency: 'USDC',
    scheduled_time: '',
    clubgg_link: '',
  });

  // Prefill form when game loads
  useEffect(() => {
    if (game) {
      setEditForm({
        name: game.title || (game as any).name || '',
        entry_fee_amount: game.entry_fee_amount ? String(game.entry_fee_amount) : '',
        entry_fee_currency: game.entry_fee_currency || 'USDC',
        scheduled_time: game.scheduled_time ? new Date(game.scheduled_time).toISOString().slice(0, 16) : '',
        clubgg_link: game.clubgg_link || '',
      });
    }
  }, [game]);
  
  // Function to handle edit button click - prefill form before showing
  const handleEditButtonClick = () => {
    if (game) {
      setEditForm({
        name: game.title || (game as any).name || '',
        entry_fee_amount: game.entry_fee_amount ? String(game.entry_fee_amount) : '',
        entry_fee_currency: game.entry_fee_currency || 'USDC',
        scheduled_time: game.scheduled_time ? new Date(game.scheduled_time).toISOString().slice(0, 16) : '',
        clubgg_link: game.clubgg_link || '',
      });
    }
    setEditing(!editing);
  };

  const handleEditGame = async () => {
    if (!token || !fid || !game) return;

    setEditing(true);
    setError(null);
    setRedeploying(false);

    try {
      const updateData: any = {};
      if (editForm.name) updateData.name = editForm.name;
      if (editForm.entry_fee_amount) updateData.buy_in_amount = parseFloat(editForm.entry_fee_amount);
      if (editForm.entry_fee_currency) updateData.buy_in_currency = editForm.entry_fee_currency;
      if (editForm.scheduled_time) updateData.game_date = editForm.scheduled_time;
      if (editForm.clubgg_link !== undefined) updateData.clubgg_link = editForm.clubgg_link;

      // For paid games, trigger automatic contract redeployment
      if (isPaidGame(game)) {
        updateData.trigger_contract_redeploy = true;
        setRedeploying(true);
      }

      const res = await authedFetch(`/api/games/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update game');
      }

      setSuccessMessage('Game updated successfully!' + (isPaidGame(game) ? ' Contract redeployment initiated.' : ''));
      setEditing(false);
      setRedeploying(false);
      await loadData(); // Reload game data to show new onchain status
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update game');
      setRedeploying(false);
    } finally {
      setEditing(false);
    }
  };

  const [redeploying, setRedeploying] = useState(false);

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-black">Loading...</p>
        </div>
      </main>
    );
  }

  if (error && !game) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Error: {error}</p>
        </div>
      </main>
    );
  }

  if (!game || !club) {
    return null;
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <Link href={`/games/${id}`} className="text-primary hover:underline mb-4 inline-block">
          ← Back to Game
        </Link>

        <h1 className="text-3xl font-bold mb-6 text-black">Manage Game: {game.title || 'Untitled'}</h1>

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {/* Edit Game Form - Shown by default */}
        {editing && (
          <div className="mb-6 p-6 bg-white border-2 border-blue-300 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-black">Edit Game Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">Game Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black !text-black"
                  placeholder="Game name"
                  style={{ color: '#000000' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Entry Fee Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.entry_fee_amount}
                  onChange={(e) => setEditForm({ ...editForm, entry_fee_amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black !text-black"
                  placeholder="0.00"
                  style={{ color: '#000000' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Entry Fee Currency</label>
                <select
                  value={editForm.entry_fee_currency}
                  onChange={(e) => setEditForm({ ...editForm, entry_fee_currency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black !text-black"
                  style={{ color: '#000000' }}
                >
                  <option value="USDC" style={{ color: '#000000' }}>USDC</option>
                  <option value="ETH" style={{ color: '#000000' }}>ETH</option>
                  <option value="USD" style={{ color: '#000000' }}>USD</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Scheduled Time</label>
                <input
                  type="datetime-local"
                  value={editForm.scheduled_time}
                  onChange={(e) => setEditForm({ ...editForm, scheduled_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black !text-black"
                  style={{ color: '#000000' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">ClubGG Link</label>
                <input
                  type="url"
                  value={editForm.clubgg_link}
                  onChange={(e) => setEditForm({ ...editForm, clubgg_link: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black !text-black"
                  style={{ color: '#000000' }}
                  placeholder="https://clubgg.app.link/..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleEditGame}
                  disabled={redeploying}
                  className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {redeploying ? 'Saving & Redeploying Contract...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    loadData(); // Reload to see updated game
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300"
                >
                  View Manage Options
                </button>
              </div>
              {redeploying && isPaidGame(game) && (
                <p className="text-sm text-black mt-2">
                  Redeploying contract with updated entry fee...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Management Options - Only shown when not editing */}
        {!editing && (
          <>
            {/* Action Buttons */}
            <div className="mb-6 flex flex-wrap gap-4">
              {game.status !== 'completed' && game.status !== 'settled' && isPaidGame(game) && (
                <button
                  onClick={() => setShowSettleConfirm(true)}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                >
                  Settle Game
                </button>
              )}
              {/* Settle Confirmation Modal */}
              {showSettleConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                    <h3 className="text-xl font-semibold mb-4 text-black">Settle Game</h3>
                    <p className="text-black mb-6">
                      Are you sure you want to settle this game? This will distribute payouts to all paid participants.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          setShowSettleConfirm(false);
                          await handleSettleGame();
                        }}
                        disabled={settling}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {settling ? 'Settling...' : 'Yes, Settle Game'}
                      </button>
                      <button
                        onClick={() => setShowSettleConfirm(false)}
                        disabled={settling}
                        className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={() => setEditing(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Edit Game
              </button>
            </div>

        {/* Remix Payload Modal - Available always */}
        {showRemixPayload && remixPayload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-black">Remix Payload</h3>
                <button
                  onClick={() => setShowRemixPayload(false)}
                  className="text-black hover:text-black"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-black mb-1">Contract Address</p>
                  <p className="font-mono text-sm bg-gray-100 p-2 rounded">{remixPayload.contractAddress}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-black mb-1">Function Name</p>
                  <p className="font-mono text-sm bg-gray-100 p-2 rounded">{remixPayload.functionName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-black mb-1">Parameters</p>
                  <pre className="font-mono text-xs bg-gray-100 p-3 rounded overflow-x-auto">
                    {JSON.stringify(remixPayload.payload, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-sm font-medium text-black mb-1">Instructions</p>
                  <p className="text-sm text-black bg-blue-50 p-3 rounded">{remixPayload.instructions}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(remixPayload.instructions);
                    setSuccessMessage('Copied to clipboard!');
                    setTimeout(() => setSuccessMessage(null), 2000);
                  }}
                  className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
                >
                  Copy Instructions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mark Active Modal */}
        {showMarkActiveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-black">Mark Game Active</h3>
                <button
                  onClick={() => {
                    setShowMarkActiveModal(false);
                    setMarkActiveTxHash('');
                  }}
                  className="text-black hover:text-black"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">
                    Transaction Hash
                  </label>
                  <input
                    type="text"
                    value={markActiveTxHash}
                    onChange={(e) => setMarkActiveTxHash(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  />
                  <p className="text-xs text-black mt-1">
                    Paste the transaction hash from your Remix createGame() call
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleMarkActive}
                    disabled={!markActiveTxHash.trim() || markingActive}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {markingActive ? 'Marking...' : 'Mark Active'}
                  </button>
                  <button
                    onClick={() => {
                      setShowMarkActiveModal(false);
                      setMarkActiveTxHash('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

            {/* Payment Summary for Paid Games */}
            {isPaidGame(game) && game.entry_fee_amount && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-black">Payment Summary</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-black mb-1">Total Expected Buy-ins</p>
                    <p className="text-2xl font-bold">
                      {participants.length * game.entry_fee_amount} {game.entry_fee_currency || 'USD'}
                    </p>
                    <p className="text-xs text-black mt-1">
                      {participants.length} participants × {game.entry_fee_amount} {game.entry_fee_currency || 'USD'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-black mb-1">Total Paid</p>
                    <p className="text-2xl font-bold text-green-600">
                      {participants.filter(p => p.payment_status === 'paid').length * game.entry_fee_amount} {game.entry_fee_currency || 'USD'}
                    </p>
                    <p className="text-xs text-black mt-1">
                      {participants.filter(p => p.payment_status === 'paid').length} with status: paid
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-black">Add Participant by FID</h2>
          <div className="flex gap-4">
            <input
              type="number"
              value={newFid}
              onChange={(e) => setNewFid(e.target.value)}
              placeholder="Enter FID"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              onClick={handleAddFid}
              disabled={addingFid || !newFid}
              className="px-6 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingFid ? 'Adding...' : 'Add'}
            </button>
            </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4 text-black">Participants ({participants.length})</h2>
          
          {participants.length === 0 ? (
            <p className="text-black">No participants yet.</p>
          ) : (
            <div className="space-y-4">
              {participants.map((participant) => {
                const user = users[participant.player_fid];
                return (
                  <div
                    key={participant.id}
                    className="p-4 border border-gray-200 rounded-lg space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-lg text-black">
                          {user?.display_name || user?.username || `FID: ${participant.player_fid}`}
                        </p>
                        <p className="text-sm text-black">FID: {participant.player_fid}</p>
                        {user?.wallet_address && (
                          <p className="text-xs text-black font-mono mt-1">
                            {user.wallet_address.slice(0, 10)}...{user.wallet_address.slice(-8)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleEligibility(participant)}
                          className={`px-3 py-1 rounded text-sm font-medium ${
                            participant.is_eligible
                              ? 'bg-red-100 text-red-800 hover:bg-red-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                          }`}
                        >
                          {participant.is_eligible ? 'Mark Ineligible' : 'Mark Eligible'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className={`px-2 py-1 rounded text-sm ${
                        participant.is_eligible
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {participant.is_eligible ? 'Eligible' : 'Not Eligible'}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 text-black rounded text-sm">
                        {participant.join_reason || 'unknown'}
                      </span>
                      {participant.has_seen_password && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                          Viewed Credentials
                        </span>
                      )}
                      {isPaidGame(game) && participant.buy_in_amount && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm">
                          Buy-in: {participant.buy_in_amount} {game.entry_fee_currency || 'USD'}
                        </span>
                      )}
                    </div>

                    {/* Payment Status for Paid Games */}
                    {isPaidGame(game) && (
                      <div className="border-t border-gray-200 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Payment Status:</span>
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            participant.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                            participant.payment_status === 'refunded' ? 'bg-yellow-100 text-yellow-800' :
                            participant.payment_status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {participant.payment_status || 'pending'}
                          </span>
                        </div>
                        {participant.join_tx_hash && (
                          <p className="text-xs text-black font-mono mb-2">
                            TX: {participant.join_tx_hash.slice(0, 20)}...
                          </p>
                        )}
                        <div className="flex gap-2">
                          {participant.payment_status !== 'paid' && (
                            <button
                              onClick={() => handleUpdatePaymentStatus(participant, 'paid')}
                              disabled={updatingPaymentStatus === participant.player_fid}
                              className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm hover:bg-green-200 disabled:opacity-50"
                            >
                              {updatingPaymentStatus === participant.player_fid ? 'Updating...' : 'Mark Paid'}
                            </button>
                          )}
                          {participant.payment_status !== 'refunded' && participant.payment_status === 'paid' && (
                            <button
                              onClick={() => handleUpdatePaymentStatus(participant, 'refunded')}
                              disabled={updatingPaymentStatus === participant.player_fid}
                              className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm hover:bg-yellow-200 disabled:opacity-50"
                            >
                              {updatingPaymentStatus === participant.player_fid ? 'Updating...' : 'Mark Refunded'}
                            </button>
                          )}
                          {participant.payment_status === 'pending' && (
                            <button
                              onClick={() => handleUpdatePaymentStatus(participant, 'failed')}
                              disabled={updatingPaymentStatus === participant.player_fid}
                              className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200 disabled:opacity-50"
                            >
                              {updatingPaymentStatus === participant.player_fid ? 'Updating...' : 'Mark Failed'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {participant.password_viewed_at && (
                      <p className="text-xs text-black">
                        Credentials viewed: {formatDate(participant.password_viewed_at)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
            </div>

            {/* Payout Management Section (for completed games) */}
            {game.status === 'completed' && payouts.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mt-6">
                <h2 className="text-xl font-semibold mb-4 text-black">Payout Management</h2>
            <div className="space-y-4">
              {payouts.map((payout) => {
                const user = users[payout.recipient_fid];
                const isEditing = editingPayout === payout.id;
                return (
                  <div
                    key={payout.id}
                    className="p-4 border border-gray-200 rounded-lg space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-black">
                          {user?.display_name || user?.username || `FID: ${payout.recipient_fid}`}
                        </p>
                        <p className="text-sm text-black">FID: {payout.recipient_fid}</p>
                        {payout.recipient_wallet_address && (
                          <p className="text-xs text-black font-mono mt-1">
                            Wallet: {payout.recipient_wallet_address.slice(0, 10)}...{payout.recipient_wallet_address.slice(-8)}
                          </p>
                        )}
                        <p className="text-lg font-bold mt-2 text-black">
                          {payout.amount} {payout.currency}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        payout.status === 'completed' ? 'bg-green-100 text-green-800' :
                        payout.status === 'failed' ? 'bg-red-100 text-red-800' :
                        payout.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {payout.status}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-black">Transaction Hash</label>
                        <input
                          type="text"
                          value={payoutTxHash[payout.id] || ''}
                          onChange={(e) => setPayoutTxHash(prev => ({ ...prev, [payout.id]: e.target.value }))}
                          placeholder="0x... or payment reference"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
                          disabled={isEditing}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1 text-black">Status</label>
                        <select
                          value={payoutStatus[payout.id] || payout.status}
                          onChange={(e) => setPayoutStatus(prev => ({ ...prev, [payout.id]: e.target.value as PayoutStatus }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          disabled={isEditing}
                        >
                          <option value="pending">Pending</option>
                          <option value="completed">Completed</option>
                          <option value="failed">Failed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1 text-black">Notes</label>
                        <textarea
                          value={payoutNotes[payout.id] || ''}
                          onChange={(e) => setPayoutNotes(prev => ({ ...prev, [payout.id]: e.target.value }))}
                          placeholder="Optional notes..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                          disabled={isEditing}
                        />
                      </div>

                      {payout.tx_hash && !isEditing && (
                        <p className="text-xs text-black font-mono">
                          Current TX: {payout.tx_hash.slice(0, 20)}...
                        </p>
                      )}

                      <button
                        onClick={() => handleUpdatePayout(payout.id)}
                        disabled={isEditing}
                        className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isEditing ? 'Updating...' : 'Update Payout'}
                      </button>
                    </div>
                  </div>
                );
              })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
