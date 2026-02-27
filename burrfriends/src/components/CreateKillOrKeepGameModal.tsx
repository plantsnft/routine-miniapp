'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';

interface CreateKillOrKeepGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Phase 38: Create KILL OR KEEP game from Admin Create Game hub.
 * Title, Preview/Live, community default betr.
 */
export function CreateKillOrKeepGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateKillOrKeepGameModalProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState('KILL OR KEEP');
  const [isPreview, setIsPreview] = useState(false);
  const [community] = useState<'betr' | 'minted_merch'>('betr');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Authentication required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await authedFetch('/api/kill-or-keep/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'KILL OR KEEP',
          isPreview,
          community,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create game');
      }

      onSuccess?.();
      onClose();
      setTitle('KILL OR KEEP');
      setIsPreview(false);
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
          <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.25rem' }}>Create KILL OR KEEP Game</h2>
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
              placeholder="KILL OR KEEP"
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
            {submitting ? 'Creating...' : 'Create KILL OR KEEP Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
