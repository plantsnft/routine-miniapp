'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';

interface CreateTakeFromThePileGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const DEFAULT_PRIZE = 5_000_000;
const DEFAULT_DEADLINE_MINUTES = 60;

/**
 * Phase 37: Create TAKE FROM THE PILE game from Admin Create Game hub.
 * Title, Preview/Live, community default betr, optional prize_pool_amount, pick_deadline_minutes.
 */
export function CreateTakeFromThePileGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTakeFromThePileGameModalProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState('TAKE FROM THE PILE');
  const [isPreview, setIsPreview] = useState(false);
  const [community] = useState<'betr' | 'minted_merch'>('betr');
  const [prizePool, setPrizePool] = useState(String(DEFAULT_PRIZE));
  const [pickDeadlineMinutes, setPickDeadlineMinutes] = useState(String(DEFAULT_DEADLINE_MINUTES));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Authentication required');
      return;
    }

    const prizeNum = parseInt(prizePool.replace(/\D/g, ''), 10) || DEFAULT_PRIZE;
    const deadlineNum = parseInt(pickDeadlineMinutes, 10) || DEFAULT_DEADLINE_MINUTES;

    setSubmitting(true);
    setError(null);

    try {
      const res = await authedFetch('/api/take-from-the-pile/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'TAKE FROM THE PILE',
          isPreview,
          community,
          prize_pool_amount: prizeNum,
          pick_deadline_minutes: Math.min(1440, Math.max(1, deadlineNum)),
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create game');
      }

      onSuccess?.();
      onClose();
      setTitle('TAKE FROM THE PILE');
      setIsPreview(false);
      setPrizePool(String(DEFAULT_PRIZE));
      setPickDeadlineMinutes(String(DEFAULT_DEADLINE_MINUTES));
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create game';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '450px',
          width: '100%',
          border: isPreview ? '2px solid #eab308' : '1px solid var(--stroke)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.25rem' }}>Create TAKE FROM THE PILE Game</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-1)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.875rem', display: 'block', marginBottom: '6px' }}>
              Game Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="TAKE FROM THE PILE"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-2)',
                border: '1px solid var(--stroke)',
                borderRadius: '8px',
                color: 'var(--text-0)',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.875rem', display: 'block', marginBottom: '6px' }}>
              Prize pool (BETR)
            </label>
            <input
              type="text"
              value={prizePool}
              onChange={(e) => setPrizePool(e.target.value.replace(/\D/g, ''))}
              placeholder="5000000"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-2)',
                border: '1px solid var(--stroke)',
                borderRadius: '8px',
                color: 'var(--text-0)',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.875rem', display: 'block', marginBottom: '6px' }}>
              Turn deadline (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={pickDeadlineMinutes}
              onChange={(e) => setPickDeadlineMinutes(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-2)',
                border: '1px solid var(--stroke)',
                borderRadius: '8px',
                color: 'var(--text-0)',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.875rem', display: 'block', marginBottom: '8px' }}>
              Game Visibility
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setIsPreview(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: !isPreview ? '2px solid var(--fire-1)' : '1px solid var(--stroke)',
                  background: !isPreview ? 'rgba(0,255,200,0.1)' : 'var(--bg-2)',
                  color: !isPreview ? 'var(--fire-1)' : 'var(--text-1)',
                  cursor: 'pointer',
                  fontWeight: !isPreview ? 600 : 400,
                  fontSize: '0.875rem',
                }}
              >
                Live Game
              </button>
              <button
                type="button"
                onClick={() => setIsPreview(true)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: isPreview ? '2px solid #eab308' : '1px solid var(--stroke)',
                  background: isPreview ? 'rgba(234,179,8,0.1)' : 'var(--bg-2)',
                  color: isPreview ? '#eab308' : 'var(--text-1)',
                  cursor: 'pointer',
                  fontWeight: isPreview ? 600 : 400,
                  fontSize: '0.875rem',
                }}
              >
                Preview Only
              </button>
            </div>
            {isPreview && (
              <p style={{ color: '#eab308', fontSize: '0.75rem', marginTop: '6px' }}>
                Preview games are only visible in the admin dashboard. Use TEST link to play.
              </p>
            )}
          </div>

          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '12px' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '12px',
              background: submitting ? 'var(--bg-2)' : 'var(--fire-1)',
              color: submitting ? 'var(--text-2)' : 'var(--bg-0)',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Creating...' : 'Create TAKE FROM THE PILE Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
