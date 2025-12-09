'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import type { Game, GameParticipant, EligibilityResult } from '~/lib/types';
import { formatDate } from '~/lib/utils';

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [participant, setParticipant] = useState<GameParticipant | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (currentUserFid && game) {
      fetch('/api/clubs')
        .then(r => r.json())
        .then(data => {
          const club = data.data?.find((c: any) => c.id === game.club_id);
          setIsOwner(club && isClubOwnerOrAdmin(currentUserFid, club));
        });
    }
  }, [currentUserFid, game]);

  const loadData = async () => {
    try {
      // Get current user FID
      const fid = localStorage.getItem('userFid');
      if (fid) {
        setCurrentUserFid(parseInt(fid, 10));
      }

      // Fetch game
      const gameRes = await fetch(`/api/games/${id}`);
      if (!gameRes.ok) throw new Error('Failed to fetch game');
      const gameData = await gameRes.json();
      setGame(gameData.data);

      // Fetch participant status if user is logged in
      if (fid) {
        const participantRes = await fetch(`/api/games/${id}/participants?fid=${fid}`);
        if (participantRes.ok) {
          const participantData = await participantRes.json();
          const participants = participantData.data || [];
          const userParticipant = participants.find((p: GameParticipant) => p.player_fid === parseInt(fid, 10));
          if (userParticipant) {
            setParticipant(userParticipant);
            setEligibility({
              eligible: userParticipant.is_eligible,
              reason: (userParticipant.join_reason as any) || 'not_eligible',
            });
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load game');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!currentUserFid) {
      setError('Please sign in to join games');
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: currentUserFid }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to join game');
      }

      setParticipant(data.data.participant);
      setEligibility(data.data.eligibility);
    } catch (err: any) {
      setError(err.message || 'Failed to join game');
    } finally {
      setJoining(false);
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

  if (!game) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Game not found</p>
        </div>
      </main>
    );
  }

  const isEligible = eligibility?.eligible || false;
  const canJoin = currentUserFid && (!participant || !isEligible);

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <Link href="/clubs" className="text-primary hover:underline mb-4 inline-block">
          ← Back to Clubs
        </Link>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h1 className="text-3xl font-bold mb-4">{game.title || 'Untitled Game'}</h1>
          
          {game.description && (
            <p className="text-gray-600 mb-6">{game.description}</p>
          )}

          <div className="flex flex-wrap gap-2 mb-6">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              game.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
              game.status === 'active' ? 'bg-green-100 text-green-800' :
              game.status === 'completed' ? 'bg-gray-100 text-gray-600' :
              'bg-red-100 text-red-800'
            }`}>
              {game.status}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              game.gating_type === 'open' ? 'bg-green-100 text-green-800' :
              game.gating_type === 'entry_fee' ? 'bg-purple-100 text-purple-800' :
              'bg-orange-100 text-orange-800'
            }`}>
              {game.gating_type === 'open' ? 'Open Game' :
               game.gating_type === 'entry_fee' ? 'Paid Entry' :
               'Stake Gated'}
            </span>
          </div>

          {game.scheduled_time && (
            <div className="mb-6">
              <p className="text-sm text-gray-500 mb-1">Scheduled Time</p>
              <p className="text-lg">{formatDate(game.scheduled_time)}</p>
            </div>
          )}

          {game.clubgg_link && (
            <div className="mb-6">
              <a
                href={game.clubgg_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Open ClubGG Game →
              </a>
            </div>
          )}

          {game.gating_type === 'entry_fee' && game.entry_fee_amount && (
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-purple-800 font-medium mb-1">Entry Fee</p>
              <p className="text-lg text-purple-900">
                {game.entry_fee_amount} {game.entry_fee_currency || 'USD'}
              </p>
            </div>
          )}

          {game.gating_type === 'stake_threshold' && game.staking_min_amount && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-800 font-medium mb-1">Stake Requirement</p>
              <p className="text-lg text-orange-900">
                Minimum {game.staking_min_amount} staked in pool {game.staking_pool_id}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          {eligibility && (
            <div className={`mb-6 p-4 rounded-lg border ${
              isEligible 
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-yellow-50 border-yellow-200 text-yellow-800'
            }`}>
              <p className="font-medium mb-1">
                {isEligible ? '✓ You are eligible' : '⚠ Eligibility Check'}
              </p>
              <p className="text-sm">{eligibility.message || eligibility.reason}</p>
            </div>
          )}

          {currentUserFid ? (
            <div className="flex gap-4">
              {canJoin && (
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {joining ? 'Joining...' : 'Join Game'}
                </button>
              )}
              {isEligible && participant && (
                <Link
                  href={`/games/${id}/password`}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                >
                  View Password
                </Link>
              )}
              {isOwner && (
                <>
                  <Link
                    href={`/games/${id}/manage`}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700"
                  >
                    Manage (Owner)
                  </Link>
                  <Link
                    href={`/games/${id}/results`}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                  >
                    Results (Owner)
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="p-4 bg-gray-100 border border-gray-200 rounded-lg">
              <p className="text-gray-600 mb-2">Please sign in to join this game</p>
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
