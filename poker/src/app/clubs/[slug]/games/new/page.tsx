'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import type { Club, Game, GatingType } from '~/lib/types';

export default function NewGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const { slug: resolvedSlug } = use(params);
  const [slug] = useState<string>(resolvedSlug);
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clubggLink, setClubggLink] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [gatingType, setGatingType] = useState<GatingType>('open');
  const [entryFeeAmount, setEntryFeeAmount] = useState('');
  const [entryFeeCurrency, setEntryFeeCurrency] = useState('USD');
  const [stakingPoolId, setStakingPoolId] = useState('');
  const [stakingMinAmount, setStakingMinAmount] = useState('');
  const [gamePassword, setGamePassword] = useState('');
  const [passwordExpiresAt, setPasswordExpiresAt] = useState('');

  useEffect(() => {
    loadData();
  }, [slug]);

  const loadData = async () => {
    try {
      
      // Fetch clubs to find the one matching the slug
      const clubsRes = await fetch('/api/clubs');
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      const foundClub = clubsData.data?.find((c: Club) => c.slug === slug);
      
      if (!foundClub) {
        setError('Club not found');
        return;
      }

      setClub(foundClub);

      // Verify ownership
      const userFid = localStorage.getItem('userFid');
      if (!userFid || !isClubOwnerOrAdmin(parseInt(userFid, 10), foundClub)) {
        setError('Only club owners can create games');
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load club');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const userFid = localStorage.getItem('userFid');
      if (!userFid || !club) {
        throw new Error('Authentication required');
      }

      const gameData: any = {
        club_id: club.id,
        creator_fid: parseInt(userFid, 10),
        title: title || null,
        description: description || null,
        clubgg_link: clubggLink || null,
        scheduled_time: scheduledTime || null,
        gating_type: gatingType,
        game_password: gamePassword || null,
        password_expires_at: passwordExpiresAt || null,
      };

      // Add gating-specific fields
      if (gatingType === 'entry_fee') {
        gameData.entry_fee_amount = entryFeeAmount ? parseFloat(entryFeeAmount) : null;
        gameData.entry_fee_currency = entryFeeCurrency;
      } else if (gatingType === 'stake_threshold') {
        gameData.staking_pool_id = stakingPoolId || null;
        gameData.staking_min_amount = stakingMinAmount ? parseFloat(stakingMinAmount) : null;
      }

      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameData),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create game');
      }

      // Redirect to club games page
      router.push(`/clubs/${slug}/games`);
    } catch (err: any) {
      setError(err.message || 'Failed to create game');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    );
  }

  if (error && !club) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <p className="text-red-600">Error: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Create New Game - {club?.name}</h1>
        
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Weekly Tournament"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Game description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">ClubGG Link</label>
            <input
              type="url"
              value={clubggLink}
              onChange={(e) => setClubggLink(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="https://clubgg.com/..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Scheduled Time</label>
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Gating Type</label>
            <select
              value={gatingType}
              onChange={(e) => setGatingType(e.target.value as GatingType)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="open">Open / Free Game</option>
              <option value="entry_fee">Paid Entry (Hellfire)</option>
              <option value="stake_threshold">Staked in Betrmint Pool (Burrfriends)</option>
            </select>
          </div>

          {gatingType === 'entry_fee' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Entry Fee Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={entryFeeAmount}
                  onChange={(e) => setEntryFeeAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="10.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Currency</label>
                <select
                  value={entryFeeCurrency}
                  onChange={(e) => setEntryFeeCurrency(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="USD">USD</option>
                  <option value="ETH">ETH</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>
            </>
          )}

          {gatingType === 'stake_threshold' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Betrmint Pool ID</label>
                <input
                  type="text"
                  value={stakingPoolId}
                  onChange={(e) => setStakingPoolId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="pool-123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Minimum Stake Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={stakingMinAmount}
                  onChange={(e) => setStakingMinAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="100.00"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Game Password</label>
            <input
              type="text"
              value={gamePassword}
              onChange={(e) => setGamePassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Leave empty to set later"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password Expires At (optional)</label>
            <input
              type="datetime-local"
              value={passwordExpiresAt}
              onChange={(e) => setPasswordExpiresAt(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating...' : 'Create Game'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
