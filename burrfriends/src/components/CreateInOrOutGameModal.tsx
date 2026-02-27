'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

interface CreateInOrOutGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Phase 35: Create IN OR OUT game from Admin Create Game hub.
 * Simple modal: title (optional), Live Game vs Preview Only toggle.
 * Single game only: API returns 400 if any open/in_progress exists.
 */
export function CreateInOrOutGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateInOrOutGameModalProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState('IN OR OUT');
  const [isPreview, setIsPreview] = useState(false);
  const [community, setCommunity] = useState<'betr' | 'minted_merch'>('betr');
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
      const res = await authedFetch('/api/in-or-out/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'IN OR OUT',
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
      setTitle('IN OR OUT');
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
          <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.25rem' }}>Create IN OR OUT Game</h2>
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
              onPaste={async (e) => {
                const input = e.currentTarget;
                const start = input.selectionStart ?? 0;
                const end = input.selectionEnd ?? title.length;
                const text = await getPasteText(e);
                if (text != null && text !== '') {
                  e.preventDefault();
                  setTitle((prev) => prev.slice(0, start) + text + prev.slice(end));
                }
              }}
              placeholder="IN OR OUT"
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

          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
            <p style={{ color: 'var(--text-1)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-0)' }}>IN OR OUT:</strong> Choose Quit to receive a proportional share of $10M BETR or Stay to remain in the game and proceed to game #5. You may change your decision up until the timer ends OR everyone makes their decision. One game at a time.
            </p>
          </div>

          {/* Phase 36: Community selector */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Community
            </label>
            <select
              value={community}
              onChange={(e) => setCommunity(e.target.value as 'betr' | 'minted_merch')}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            >
              <option value="betr">BETR (default)</option>
              <option value="minted_merch">Minted Merch</option>
            </select>
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
            {submitting ? 'Creating...' : 'Create IN OR OUT Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
