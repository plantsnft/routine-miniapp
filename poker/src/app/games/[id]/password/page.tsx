'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import type { Game } from '~/lib/types';

export default function GamePasswordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      // Get current user FID
      const fid = localStorage.getItem('userFid');
      if (!fid) {
        setError('Please sign in to view password');
        return;
      }
      setCurrentUserFid(parseInt(fid, 10));

      // Fetch game
      const gameRes = await fetch(`/api/games/${id}`);
      if (!gameRes.ok) throw new Error('Failed to fetch game');
      const gameData = await gameRes.json();
      setGame(gameData.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load game');
    } finally {
      setLoading(false);
    }
  };

  const handleReveal = async () => {
    if (!currentUserFid) {
      setError('Please sign in');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${id}/password?fid=${currentUserFid}`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to fetch password');
      }

      setPassword(data.data.password);
      setRevealed(true);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch password');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !revealed) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    );
  }

  if (error && !game) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <p className="text-red-600">Error: {error}</p>
          <Link href={`/games/${id}`} className="mt-4 inline-block text-primary hover:underline">
            ← Back to Game
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <Link href={`/games/${id}`} className="text-primary hover:underline mb-4 inline-block">
          ← Back to Game
        </Link>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h1 className="text-2xl font-bold mb-4">Game Password</h1>
          <p className="text-gray-600 mb-6">
            {game?.title || 'Untitled Game'}
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          {!revealed ? (
            <div>
              <p className="text-gray-600 mb-4">
                Click the button below to reveal the password. This action will be recorded.
              </p>
              <button
                onClick={handleReveal}
                disabled={loading}
                className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Reveal Password'}
              </button>
            </div>
          ) : (
            <div className="p-6 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-sm text-green-800 font-medium mb-2">ClubGG Password:</p>
              <p className="text-2xl font-mono font-bold text-green-900 mb-4">{password}</p>
              <p className="text-sm text-green-700">
                ✓ Password viewed at {new Date().toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
