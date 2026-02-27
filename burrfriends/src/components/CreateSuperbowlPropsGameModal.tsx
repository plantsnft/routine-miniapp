'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

interface CreateSuperbowlPropsGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const STAKING_OPTIONS = [
  { value: null, label: 'No staking requirement' },
  { value: 1_000_000, label: '1M BETR' },
  { value: 5_000_000, label: '5M BETR' },
  { value: 25_000_000, label: '25M BETR' },
  { value: 50_000_000, label: '50M BETR' },
  { value: 100_000_000, label: '100M BETR' },
  { value: 200_000_000, label: '200M BETR' },
];

export function CreateSuperbowlPropsGameModal({ isOpen, onClose, onCreated }: CreateSuperbowlPropsGameModalProps) {
  const { token } = useAuth();
  const [totalPrizePool, setTotalPrizePool] = useState<string>('10000000');
  const [stakingMinAmount, setStakingMinAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!token) return;

    const prizePool = parseInt(totalPrizePool);
    if (isNaN(prizePool) || prizePool <= 0) {
      setError('Enter a valid prize pool amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await authedFetch('/api/superbowl-props/games', {
        method: 'POST',
        body: JSON.stringify({
          totalPrizePool: prizePool,
          stakingMinAmount,
        }),
      }, token);

      const data = await res.json();

      if (data.ok) {
        onCreated?.();
        onClose();
      } else {
        setError(data.error || 'Failed to create game');
      }
    } catch (e) {
      setError('Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--stroke)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
        }}
      >
        <h2 style={{ color: 'var(--fire-1)', fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>
          Create BETR SUPERBOWL: PROPS
        </h2>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: 'var(--text-2)', fontSize: '0.875rem', display: 'block', marginBottom: '4px' }}>
            Prize Pool (BETR)
          </label>
          <input
            type="number"
            value={totalPrizePool}
            onChange={(e) => setTotalPrizePool(e.target.value)}
            onPaste={async (e) => {
              const text = await getPasteText(e);
              if (text == null || text === '') return;
              const cleaned = text.replace(/,/g, '').trim();
              const num = parseInt(cleaned, 10);
              if (Number.isNaN(num) || num < 0) {
                e.preventDefault();
                return;
              }
              e.preventDefault();
              setTotalPrizePool(cleaned);
            }}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--stroke)',
              background: 'var(--bg-2)',
              color: 'var(--text-1)',
            }}
          />
          <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>
            {(parseInt(totalPrizePool) / 1_000_000).toFixed(1)}M BETR
          </span>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ color: 'var(--text-2)', fontSize: '0.875rem', display: 'block', marginBottom: '4px' }}>
            Staking Requirement
          </label>
          <select
            value={stakingMinAmount === null ? '' : stakingMinAmount}
            onChange={(e) => setStakingMinAmount(e.target.value === '' ? null : parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--stroke)',
              background: 'var(--bg-2)',
              color: 'var(--text-1)',
            }}
          >
            {STAKING_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value === null ? '' : opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--stroke)',
              background: 'transparent',
              color: 'var(--text-2)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--fire-1)',
              color: 'white',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Create Game'}
          </button>
        </div>
      </div>
    </div>
  );
}
