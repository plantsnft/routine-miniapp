'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import type { Game, GameParticipant, Club } from '~/lib/types';
import { formatDate } from '~/lib/utils';

export default function ManageGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [newFid, setNewFid] = useState('');
  const [addingFid, setAddingFid] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const fid = localStorage.getItem('userFid');
      if (!fid) {
        setError('Please sign in');
        return;
      }
      setCurrentUserFid(parseInt(fid, 10));

      // Fetch game
      const gameRes = await fetch(`/api/games/${id}`);
      if (!gameRes.ok) throw new Error('Failed to fetch game');
      const gameData = await gameRes.json();
      setGame(gameData.data);

      // Fetch club
      const clubsRes = await fetch('/api/clubs');
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      const foundClub = clubsData.data?.find((c: Club) => c.id === gameData.data.club_id);
      setClub(foundClub);

      // Verify ownership
      if (foundClub && !isClubOwnerOrAdmin(parseInt(fid, 10), foundClub)) {
        setError('Only club owners can manage games');
        return;
      }

      // Fetch participants
      await loadParticipants();
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadParticipants = async () => {
    if (!currentUserFid) return;
    try {
      const res = await fetch(`/api/games/${id}/participants?fid=${currentUserFid}`);
      if (!res.ok) throw new Error('Failed to fetch participants');
      const data = await res.json();
      setParticipants(data.data || []);
    } catch (err: any) {
      console.error('Failed to load participants:', err);
    }
  };

  const handleAddFid = async () => {
    if (!newFid || !currentUserFid) return;

    setAddingFid(true);
    setError(null);

    try {
      const fidNum = parseInt(newFid, 10);
      if (isNaN(fidNum)) {
        throw new Error('Invalid FID');
      }

      const res = await fetch(`/api/games/${id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: currentUserFid,
          player_fid: fidNum,
          is_eligible: true,
          join_reason: 'manual_override',
        }),
      });

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

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading...</p>
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

        <h1 className="text-3xl font-bold mb-6">Manage Game: {game.title || 'Untitled'}</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Add Participant by FID</h2>
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
          <h2 className="text-xl font-semibold mb-4">Participants ({participants.length})</h2>
          
          {participants.length === 0 ? (
            <p className="text-gray-600">No participants yet.</p>
          ) : (
            <div className="space-y-4">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">FID: {participant.player_fid}</p>
                    <div className="flex gap-2 mt-2">
                      <span className={`px-2 py-1 rounded text-sm ${
                        participant.is_eligible
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {participant.is_eligible ? 'Eligible' : 'Not Eligible'}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                        {participant.join_reason || 'unknown'}
                      </span>
                      {participant.has_seen_password && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                          Viewed Password
                        </span>
                      )}
                    </div>
                    {participant.password_viewed_at && (
                      <p className="text-xs text-gray-500 mt-1">
                        Password viewed: {formatDate(participant.password_viewed_at)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleEligibility(participant)}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      participant.is_eligible
                        ? 'bg-red-100 text-red-800 hover:bg-red-200'
                        : 'bg-green-100 text-green-800 hover:bg-green-200'
                    }`}
                  >
                    {participant.is_eligible ? 'Mark Ineligible' : 'Mark Eligible'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
