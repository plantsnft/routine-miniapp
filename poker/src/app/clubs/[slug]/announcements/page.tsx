'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import type { Club, ClubAnnouncement, Game } from '~/lib/types';
import { formatRelativeTime } from '~/lib/utils';

export default function ClubAnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { token, fid } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [announcements, setAnnouncements] = useState<ClubAnnouncement[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formGameId, setFormGameId] = useState('');

  useEffect(() => {
    if (token) {
      loadData();
    } else if (!token && fid === null) {
      setError('Please sign in');
      setLoading(false);
    }
  }, [slug, token, fid]);

  const loadData = async () => {
    if (!token) {
      setError('Please sign in');
      setLoading(false);
      return;
    }

    try {
      if (fid) {
        setCurrentUserFid(fid);
      }

      // Fetch club (requires auth)
      const clubsRes = await authedFetch('/api/clubs', { method: 'GET' }, token);
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      const foundClub = clubsData.data?.find((c: Club) => c.slug === slug);
      
      if (!foundClub) {
        setError('Club not found');
        return;
      }
      setClub(foundClub);

      // Fetch announcements
      const annRes = await fetch(`/api/clubs/${foundClub.id}/announcements`);
      if (!annRes.ok) throw new Error('Failed to fetch announcements');
      const annData = await annRes.json();
      setAnnouncements(annData.data || []);

      // Fetch games for dropdown
      const gamesRes = await fetch(`/api/games?club_id=${foundClub.id}`);
      if (gamesRes.ok) {
        const gamesData = await gamesRes.json();
        setGames(gamesData.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserFid || !club) return;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch(`/api/clubs/${club.id}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_fid: currentUserFid,
          title: formTitle,
          body: formBody,
          related_game_id: formGameId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create announcement');
      }

      setFormTitle('');
      setFormBody('');
      setFormGameId('');
      setShowCreateForm(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create announcement');
    } finally {
      setCreating(false);
    }
  };

  const isOwner = currentUserFid && club && isClubOwnerOrAdmin(currentUserFid, club);

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-black">Loading...</p>
        </div>
      </main>
    );
  }

  if (error && !club) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Error: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <Link href={`/clubs/${slug}`} className="text-primary hover:underline mb-4 inline-block">
          ← Back to Club
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-black">{club?.name} - Announcements</h1>
          {isOwner && !showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
            >
              + New Announcement
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {isOwner && showCreateForm && (
          <div className="mb-6 bg-white border border-gray-200 rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4 text-black">Create Announcement</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Body</label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  required
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Related Game (optional)</label>
                <select
                  value={formGameId}
                  onChange={(e) => setFormGameId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">None</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.title || 'Untitled Game'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormTitle('');
                    setFormBody('');
                    setFormGameId('');
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {announcements.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 text-center">
            <p className="text-black">No announcements yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement) => {
              const relatedGame = games.find(g => g.id === announcement.related_game_id);
              return (
                <div
                  key={announcement.id}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm p-6"
                >
                  <h3 className="text-xl font-semibold mb-2 text-black">{announcement.title}</h3>
                  <p className="text-black whitespace-pre-wrap mb-4">{announcement.body}</p>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{formatRelativeTime(announcement.inserted_at)}</span>
                    {relatedGame && (
                      <Link
                        href={`/games/${relatedGame.id}`}
                        className="text-primary hover:underline"
                      >
                        View Game →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
