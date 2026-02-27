'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';

interface CreateStealNoStealHeadsUpYouWinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (gameId: string) => void;
}

const DEFAULT_HOLDER_FID = 308588;
const DEFAULT_DECIDER_FID = 417851;

export function CreateStealNoStealHeadsUpYouWinModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateStealNoStealHeadsUpYouWinModalProps) {
  const { token } = useAuth();
  const [holderFid, setHolderFid] = useState(String(DEFAULT_HOLDER_FID));
  const [deciderFid, setDeciderFid] = useState(String(DEFAULT_DECIDER_FID));
  const [betrAmount, setBetrAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Authentication required');
      return;
    }

    const holder = parseInt(holderFid.trim(), 10);
    const decider = parseInt(deciderFid.trim(), 10);
    const amount = parseFloat(betrAmount.trim());

    if (isNaN(holder) || holder <= 0) {
      setError('Holder FID must be a positive number');
      return;
    }
    if (isNaN(decider) || decider <= 0) {
      setError('Decider FID must be a positive number');
      return;
    }
    if (holder === decider) {
      setError('Holder and Decider must be different');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      setError('BETR amount must be >= 0');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Create game with whitelist [holder, decider], min 2 players, auto-start
      const createRes = await authedFetch('/api/steal-no-steal/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "HEADS UP Steal or No Steal",
          prizeAmount: amount,
          decisionTimeSeconds: 60,
          decisionWindowSeconds: 86400,
          whitelistFids: [holder, decider],
          minPlayersToStart: 2,
          startCondition: 'players',
        }),
      }, token);

      const createData = await createRes.json();
      if (!createRes.ok || !createData.ok) {
        throw new Error(createData.error || 'Failed to create game');
      }

      const gameId = createData.data?.id;
      if (!gameId) {
        throw new Error('Game created but no ID returned');
      }

      // 2. Create round 1 with one YOU WIN match (holder=playerA, decider=playerB)
      const roundRes = await authedFetch(
        `/api/steal-no-steal/games/${gameId}/rounds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customMatches: [{
              playerAFid: holder,
              playerBFid: decider,
              briefcaseAmount: amount,
              briefcaseLabel: 'YOU WIN',
            }],
          }),
        },
        token
      );

      const roundData = await roundRes.json();
      if (!roundRes.ok || !roundData.ok) {
        throw new Error(roundData.error || 'Failed to create round');
      }

      onSuccess?.(gameId);
      onClose();
      setHolderFid(String(DEFAULT_HOLDER_FID));
      setDeciderFid(String(DEFAULT_DECIDER_FID));
      setBetrAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create HEADS UP game');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="hl-card"
        style={{
          maxWidth: '90%',
          width: '400px',
          padding: '24px',
          border: '2px solid var(--fire-1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-0)' }}>
            Create HEADS UP Steal or No Steal
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none"
            style={{ color: 'var(--text-1)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '16px' }}>
          Creates a 2-player game with whitelist, auto-starts, and one round with a YOU WIN match.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Holder FID (Player A)
            </label>
            <input
              type="number"
              min={1}
              value={holderFid}
              onChange={(e) => setHolderFid(e.target.value.replace(/\D/g, '').slice(0, 10))}
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Decider FID (Player B)
            </label>
            <input
              type="number"
              min={1}
              value={deciderFid}
              onChange={(e) => setDeciderFid(e.target.value.replace(/\D/g, '').slice(0, 10))}
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              BETR Amount
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={betrAmount}
              onChange={(e) => setBetrAmount(e.target.value)}
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--ember-2)', marginBottom: '12px', fontSize: '0.875rem' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Creating…' : 'Create HEADS UP'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
