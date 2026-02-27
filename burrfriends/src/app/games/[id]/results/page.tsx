'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { isPaidGame } from '~/lib/games';
import type { Game, GameParticipant } from '~/lib/types';

interface ResultRow {
  player_fid: number;
  position: number | '';
  payout_amount: number | '';
  payout_currency: string;
  net_profit: number | '';
  buy_in_amount?: number;
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
          setResults(eligibleParts.map((p: GameParticipant) => {
            const buyInAmount = isPaidGame(gameData.data) && p.buy_in_amount ? p.buy_in_amount : 0;
            return {
              player_fid: p.player_fid,
              position: '',
              payout_amount: '',
              payout_currency: gameData.data.entry_fee_currency || 'USD',
              net_profit: '',
              buy_in_amount: buyInAmount, // Store for display
            };
          }));
        }
      }

      // Fetch existing results
      const resultsRes = await fetch(`/api/games/${id}/results`);
      if (resultsRes.ok) {
        const resultsData = await resultsRes.json();
        if (resultsData.data && resultsData.data.length > 0) {
          // Get buy-in amounts from participants
          const partRes = await fetch(`/api/games/${id}/participants?fid=${fid}`);
          const partsData = partRes.ok ? await partRes.json() : { data: [] };
          const partsMap = new Map<number, GameParticipant>((partsData.data || []).map((p: GameParticipant) => [p.player_fid, p]));
          
          setResults(resultsData.data.map((r: any) => {
            const participant = partsMap.get(r.player_fid);
            const buyInAmount = participant?.buy_in_amount ?? 0;
            return {
              player_fid: r.player_fid,
              position: r.position || '',
              payout_amount: r.payout_amount || '',
              payout_currency: r.payout_currency || 'USD',
              net_profit: r.net_profit !== null && r.net_profit !== undefined ? r.net_profit : '',
              buy_in_amount: buyInAmount,
            };
          }));
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
      // Success message will be shown via UI state
      // Results saved successfully - form will reflect changes
    } catch (err: any) {
      setError(err.message || 'Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  const updateResult = (index: number, field: keyof ResultRow, value: any) => {
    const newResults = [...results];
    const updated = { ...newResults[index], [field]: value };
    
    // Auto-calculate net_profit for paid games when payout_amount changes
    if (field === 'payout_amount' && game && isPaidGame(game)) {
      const payoutAmount = value === '' ? 0 : Number(value);
      const buyInAmount = updated.buy_in_amount || 0;
      updated.net_profit = payoutAmount - buyInAmount;
    }
    
    newResults[index] = updated;
    setResults(newResults);
  };

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-black">Loading...</p>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-black">Game not found</p>
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

        <h1 className="text-3xl font-bold mb-6 text-black">Results: {game.title || 'Untitled'}</h1>

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
                  {isPaidGame(game) && <th className="text-left p-2">Buy-in</th>}
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
                    {isPaidGame(game) && (
                      <td className="p-2 text-sm text-black">
                        {result.buy_in_amount ? `${result.buy_in_amount} ${game.entry_fee_currency || 'USD'}` : '-'}
                      </td>
                    )}
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
                        placeholder={isPaidGame(game) ? "Auto-calculated" : "0.00"}
                        readOnly={isPaidGame(game)}
                      />
                      {isPaidGame(game) && (
                        <p className="text-xs text-black mt-1">
                          {result.payout_amount && result.buy_in_amount
                            ? `(${result.payout_amount} - ${result.buy_in_amount})`
                            : ''}
                        </p>
                      )}
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
