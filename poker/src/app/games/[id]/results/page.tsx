'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import type { Game, GameParticipant } from '~/lib/types';

interface ResultRow {
  player_fid: number;
  position: number | '';
  payout_amount: number | '';
  payout_currency: string;
  net_profit: number | '';
}

export default function GameResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const fid = localStorage.getItem('userFid');
      if (fid) {
        setCurrentUserFid(parseInt(fid, 10));
      }

      // Fetch game
      const gameRes = await fetch(`/api/games/${id}`);
      if (!gameRes.ok) throw new Error('Failed to fetch game');
      const gameData = await gameRes.json();
      setGame(gameData.data);

      // Fetch participants (for owner)
      if (fid) {
        const partRes = await fetch(`/api/games/${id}/participants?fid=${fid}`);
        if (partRes.ok) {
          const partData = await partRes.json();
          const parts = partData.data || [];
          setParticipants(parts);

          // Initialize results with eligible participants
          const eligibleParts = parts.filter((p: GameParticipant) => p.is_eligible);
          setResults(eligibleParts.map((p: GameParticipant) => ({
            player_fid: p.player_fid,
            position: '',
            payout_amount: '',
            payout_currency: 'USD',
            net_profit: '',
          })));
        }
      }

      // Fetch existing results
      const resultsRes = await fetch(`/api/games/${id}/results`);
      if (resultsRes.ok) {
        const resultsData = await resultsRes.json();
        if (resultsData.data && resultsData.data.length > 0) {
          setResults(resultsData.data.map((r: any) => ({
            player_fid: r.player_fid,
            position: r.position || '',
            payout_amount: r.payout_amount || '',
            payout_currency: r.payout_currency || 'USD',
            net_profit: r.net_profit || '',
          })));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUserFid) {
      setError('Please sign in');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const resultsData = results.map(r => ({
        player_fid: r.player_fid,
        position: r.position === '' ? null : Number(r.position),
        payout_amount: r.payout_amount === '' ? null : Number(r.payout_amount),
        payout_currency: r.payout_currency || 'USD',
        net_profit: r.net_profit === '' ? null : Number(r.net_profit),
      }));

      const res = await fetch(`/api/games/${id}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: currentUserFid,
          results: resultsData,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to save results');
      }

      setError(null);
      alert('Results saved successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  const updateResult = (index: number, field: keyof ResultRow, value: any) => {
    const newResults = [...results];
    newResults[index] = { ...newResults[index], [field]: value };
    setResults(newResults);
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

  if (!game) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Game not found</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <Link href={`/games/${id}`} className="text-primary hover:underline mb-4 inline-block">
          ← Back to Game
        </Link>

        <h1 className="text-3xl font-bold mb-6">Results: {game.title || 'Untitled'}</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">FID</th>
                  <th className="text-left p-2">Position</th>
                  <th className="text-left p-2">Payout Amount</th>
                  <th className="text-left p-2">Currency</th>
                  <th className="text-left p-2">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr key={result.player_fid} className="border-b">
                    <td className="p-2">{result.player_fid}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={result.position}
                        onChange={(e) => updateResult(index, 'position', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                        className="w-20 px-2 py-1 border rounded"
                        placeholder="1"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        value={result.payout_amount}
                        onChange={(e) => updateResult(index, 'payout_amount', e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="w-32 px-2 py-1 border rounded"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={result.payout_currency}
                        onChange={(e) => updateResult(index, 'payout_currency', e.target.value)}
                        className="px-2 py-1 border rounded"
                      >
                        <option value="USD">USD</option>
                        <option value="ETH">ETH</option>
                        <option value="USDC">USDC</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        value={result.net_profit}
                        onChange={(e) => updateResult(index, 'net_profit', e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="w-32 px-2 py-1 border rounded"
                        placeholder="0.00"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Results'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
