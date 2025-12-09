'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import type { Club, Game } from '~/lib/types';
import { formatDate } from '~/lib/utils';

export default function ClubGamesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [club, setClub] = useState<Club | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, [slug]);

  const loadData = async () => {
    try {
      // Fetch club
      const clubsRes = await fetch('/api/clubs');
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      const foundClub = clubsData.data?.find((c: Club) => c.slug === slug);
      
      if (!foundClub) {
        setError('Club not found');
        return;
      }
      setClub(foundClub);

      // Fetch games
      const gamesRes = await fetch(`/api/games?club_id=${foundClub.id}`);
      if (!gamesRes.ok) throw new Error('Failed to fetch games');
      const gamesData = await gamesRes.json();
      setGames(gamesData.data || []);

      // Get current user FID
      const fid = localStorage.getItem('userFid');
      if (fid) {
        setCurrentUserFid(parseInt(fid, 10));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const isOwner = currentUserFid && club && isClubOwnerOrAdmin(currentUserFid, club);

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    );
  }

  if (error || !club) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Error: {error || 'Club not found'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">{club.name} - Games</h1>
            <Link href="/clubs" className="text-primary hover:underline mt-2 inline-block">
              ← Back to Clubs
            </Link>
          </div>
          {isOwner && (
            <Link
              href={`/clubs/${slug}/games/new`}
              className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
            >
              + New Game
            </Link>
          )}
        </div>

        {games.length === 0 ? (
          <div className="p-8 bg-white border border-gray-200 rounded-lg text-center">
            <p className="text-gray-600 mb-4">No games yet.</p>
            {isOwner && (
              <Link
                href={`/clubs/${slug}/games/new`}
                className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
              >
                Create First Game
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => (
              <div
                key={game.id}
                className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold mb-2">{game.title || 'Untitled Game'}</h2>
                    {game.description && (
                      <p className="text-gray-600 mb-3">{game.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mb-3">
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
                        {game.gating_type === 'open' ? 'Open' :
                         game.gating_type === 'entry_fee' ? 'Paid Entry' :
                         'Stake Gated'}
                      </span>
                    </div>
                    {game.scheduled_time && (
                      <p className="text-sm text-gray-500">
                        Scheduled: {formatDate(game.scheduled_time)}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/games/${game.id}`}
                    className="ml-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
