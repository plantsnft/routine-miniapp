'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { formatDate } from '~/lib/utils';
import { getPasteText } from '~/lib/pasteSupport';
import type { Club } from '~/lib/types';

interface RequestGameModalProps {
  club: Club;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RequestGameModal({ club, isOpen, onClose, onSuccess }: RequestGameModalProps) {
  const { token, fid } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Prefund state
  const [prefundTxHash, setPrefundTxHash] = useState('');
  const [isPrefunded, setIsPrefunded] = useState(false);
  
  // Form state (mirrors create game form)
  const [clubggLink, setClubggLink] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [startNow, setStartNow] = useState(false);
  const [entryFeeAmount, setEntryFeeAmount] = useState('');
  const [numPlayers, setNumPlayers] = useState('');
  const [totalRewardAmount, setTotalRewardAmount] = useState('');
  const [gameCurrency, setGameCurrency] = useState('USDC');
  const [customTokenAddress, setCustomTokenAddress] = useState('');
  const [showCustomTokenInput, setShowCustomTokenInput] = useState(false);
  const [editingRewardAmount, setEditingRewardAmount] = useState(false);
  const [numPayoutSpots, setNumPayoutSpots] = useState('');
  const [payoutPercentages, setPayoutPercentages] = useState<Record<number, string>>({});
  const [winnerTakeAll, setWinnerTakeAll] = useState(false);
  const [gamePassword, setGamePassword] = useState('');

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Reset all state when modal closes
      setPrefundTxHash('');
      setIsPrefunded(false);
      setError(null);
      setSubmitting(false);
      setClubggLink('');
      setScheduledTime('');
      setStartNow(false);
      setEntryFeeAmount('');
      setNumPlayers('');
      setTotalRewardAmount('');
      setGameCurrency('USDC');
      setCustomTokenAddress('');
      setShowCustomTokenInput(false);
      setEditingRewardAmount(false);
      setNumPayoutSpots('');
      setPayoutPercentages({});
      setWinnerTakeAll(false);
      setGamePassword('');
    }
  }, [isOpen]);

  // Auto-calculate total reward amount
  useEffect(() => {
    if (entryFeeAmount && numPlayers && !editingRewardAmount) {
      const calculated = parseFloat(entryFeeAmount) * parseFloat(numPlayers);
      if (!isNaN(calculated)) {
        setTotalRewardAmount(calculated.toFixed(2));
      }
    }
  }, [entryFeeAmount, numPlayers, editingRewardAmount]);

  // Handle winner take all checkbox
  useEffect(() => {
    if (winnerTakeAll) {
      setNumPayoutSpots('1');
      setPayoutPercentages({ 1: '100' });
    }
  }, [winnerTakeAll]);

  // Generate payout percentage inputs when number of spots changes
  useEffect(() => {
    if (numPayoutSpots && !winnerTakeAll) {
      const spots = parseInt(numPayoutSpots, 10);
      if (!isNaN(spots) && spots > 0) {
        setPayoutPercentages(prev => {
          const newPercentages: Record<number, string> = {};
          for (let i = 1; i <= spots; i++) {
            newPercentages[i] = prev[i] || '';
          }
          return newPercentages;
        });
      }
    }
  }, [numPayoutSpots, winnerTakeAll]);

  // Validate prefund tx hash format (strict: 0x + 64 hex chars = 66 total)
  const validatePrefundTxHash = (hash: string): boolean => {
    if (!hash.startsWith('0x') || hash.length !== 66) {
      return false;
    }
    const hexPart = hash.substring(2);
    return /^[0-9a-fA-F]+$/.test(hexPart);
  };

  const handlePrefundSubmit = () => {
    if (!prefundTxHash.trim()) {
      setError('Please enter a transaction hash');
      return;
    }
    
    if (!validatePrefundTxHash(prefundTxHash.trim())) {
      setError('Transaction hash must be valid: 0x followed by exactly 64 hexadecimal characters (66 characters total)');
      return;
    }
    
    setIsPrefunded(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isPrefunded || !prefundTxHash.trim()) {
      setError('Please complete the prefund step first');
      return;
    }
    
    if (!token) {
      setError('Authentication required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Build payout_bps from payout structure
      let payoutBps: number[] | undefined = undefined;
      if (winnerTakeAll) {
        payoutBps = [10000]; // 100%
      } else if (numPayoutSpots && payoutPercentages) {
        const spots = parseInt(numPayoutSpots, 10);
        if (!isNaN(spots) && spots > 0) {
          const percentages: number[] = [];
          for (let i = 1; i <= spots; i++) {
            const pct = parseFloat(payoutPercentages[i] || '0');
            if (!isNaN(pct) && pct > 0) {
              percentages.push(Math.round(pct * 100)); // Convert to basis points
            }
          }
          if (percentages.length > 0) {
            payoutBps = percentages;
          }
        }
      }

      // Build payload (matches create-game format)
      const payload = {
        club_id: club.id,
        title: entryFeeAmount ? `${entryFeeAmount} ${gameCurrency} Game` : 'Entry Fee Game',
        description: null,
        clubgg_link: clubggLink.trim() || null,
        scheduled_time: startNow ? null : (scheduledTime || null),
        gating_type: entryFeeAmount && parseFloat(entryFeeAmount) > 0 ? 'entry_fee' : 'open',
        entry_fee_amount: entryFeeAmount ? parseFloat(entryFeeAmount) : null,
        entry_fee_currency: gameCurrency,
        max_participants: numPlayers ? parseInt(numPlayers, 10) : null,
        payout_bps: payoutBps,
        game_password: gamePassword.trim() || null,
      };

      const res = await authedFetch('/api/game-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefund_tx_hash: prefundTxHash.trim(),
          payload,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit game request');
      }

      // Success - show toast and close
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit game request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-black dark:text-zinc-100">Request Game</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Prefund Step */}
            <div className="border-b-2 border-primary pb-4 mb-6">
              <h3 className="text-lg font-semibold mb-4 text-black dark:text-zinc-100">
                Step 1: Prefund (Required)
              </h3>
              {!isPrefunded ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-100">
                      Prefund Transaction Hash <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={prefundTxHash}
                      onChange={(e) => setPrefundTxHash(e.target.value)}
                      onPaste={async (e) => {
                        const el = e.currentTarget;
                        const start = el.selectionStart ?? 0;
                        const end = el.selectionEnd ?? prefundTxHash.length;
                        const text = await getPasteText(e);
                        if (text != null && text !== '') {
                          e.preventDefault();
                          setPrefundTxHash((prev) => prev.slice(0, start) + text + prev.slice(end));
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100 font-mono text-sm"
                      placeholder="0x..."
                    />
                    <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
                      <strong>Important:</strong> You must complete the prefund payment before submitting your request. 
                      Enter the transaction hash from your payment transaction. This ensures you have funds ready for the game.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrefundSubmit}
                    className="px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
                  >
                    Confirm Prefund
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-green-800 dark:text-green-200 font-semibold">
                    ✓ Prefunded: {prefundTxHash.substring(0, 10)}...
                  </p>
                </div>
              )}
            </div>

            {/* Game Details (only show if prefunded) */}
            {isPrefunded && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-black dark:text-zinc-100">
                    Step 2: Game Details
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-100">
                        ClubGG Game URL
                      </label>
                      <input
                        type="text"
                        value={clubggLink}
                        onChange={(e) => setClubggLink(e.target.value)}
                        onPaste={async (e) => {
                          const el = e.currentTarget;
                          const start = el.selectionStart ?? 0;
                          const end = el.selectionEnd ?? clubggLink.length;
                          const text = await getPasteText(e);
                          if (text != null && text !== '') {
                            e.preventDefault();
                            setClubggLink((prev) => prev.slice(0, start) + text + prev.slice(end));
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100"
                        placeholder="https://clubgg.com/game/..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-100">
                        ClubGG Password (optional)
                      </label>
                      <input
                        type="text"
                        value={gamePassword}
                        onChange={(e) => setGamePassword(e.target.value)}
                        onPaste={async (e) => {
                          const el = e.currentTarget;
                          const start = el.selectionStart ?? 0;
                          const end = el.selectionEnd ?? gamePassword.length;
                          const text = await getPasteText(e);
                          if (text != null && text !== '') {
                            e.preventDefault();
                            setGamePassword((prev) => prev.slice(0, start) + text + prev.slice(end));
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100"
                        placeholder="Leave empty to set later"
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="checkbox"
                          id="startNow"
                          checked={startNow}
                          onChange={(e) => {
                            setStartNow(e.target.checked);
                            if (e.target.checked) {
                              setScheduledTime('');
                            }
                          }}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <label htmlFor="startNow" className="text-sm font-medium text-black dark:text-zinc-100">
                          Start game now
                        </label>
                      </div>
                      {!startNow && (
                        <input
                          type="datetime-local"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          onPaste={async (e) => {
                            const text = await getPasteText(e);
                            if (text != null && text !== '') {
                              e.preventDefault();
                              setScheduledTime(text);
                            }
                          }}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-100">
                        Entry Fee Amount
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={entryFeeAmount}
                        onChange={(e) => setEntryFeeAmount(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100"
                        placeholder="5"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-100">
                        Game Currency
                      </label>
                      <select
                        value={gameCurrency}
                        onChange={(e) => setGameCurrency(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100"
                      >
                        <option value="ETH">ETH</option>
                        <option value="USDC">USDC</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-black dark:text-zinc-100">
                        Number of Players (optional)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={numPlayers}
                        onChange={(e) => setNumPlayers(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100"
                        placeholder="10"
                      />
                    </div>

                    {/* Payout Structure - simplified version */}
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="checkbox"
                          id="winnerTakeAll"
                          checked={winnerTakeAll}
                          onChange={(e) => setWinnerTakeAll(e.target.checked)}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <label htmlFor="winnerTakeAll" className="text-sm font-medium text-black dark:text-zinc-100">
                          Winner takes all
                        </label>
                      </div>
                      {!winnerTakeAll && (
                        <div className="space-y-2">
                          <input
                            type="number"
                            min="1"
                            max="3"
                            value={numPayoutSpots}
                            onChange={(e) => setNumPayoutSpots(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100"
                            placeholder="Number of payout spots"
                          />
                          {numPayoutSpots && parseInt(numPayoutSpots, 10) > 0 && (
                            <div className="space-y-2">
                              {Array.from({ length: parseInt(numPayoutSpots, 10) }, (_, i) => i + 1).map(spot => (
                                <div key={spot}>
                                  <label className="block text-xs text-gray-600 dark:text-zinc-400 mb-1">
                                    Place {spot} (%)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={payoutPercentages[spot] || ''}
                                    onChange={(e) => setPayoutPercentages({ ...payoutPercentages, [spot]: e.target.value })}
                                    className="w-full px-3 py-1 border border-gray-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-zinc-700 text-black dark:text-zinc-100"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-zinc-700">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-3 bg-gray-200 dark:bg-zinc-700 text-gray-800 dark:text-zinc-200 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-zinc-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

