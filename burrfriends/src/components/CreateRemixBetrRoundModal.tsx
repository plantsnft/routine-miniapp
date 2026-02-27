'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

interface CreateRemixBetrRoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Phase 12.1: Renamed to FRAMEDL BETR, added gameDate field
export function CreateRemixBetrRoundModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateRemixBetrRoundModalProps) {
  const { token } = useAuth();
  const [prizeAmount, setPrizeAmount] = useState('');
  const [submissionsCloseAt, setSubmissionsCloseAt] = useState('');
  const [roundLabel, setRoundLabel] = useState('');
  const [gameDate, setGameDate] = useState(''); // Phase 12.1: Framedl puzzle date
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

    const amount = parseFloat(prizeAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Prize amount must be a positive number');
      return;
    }

    if (!submissionsCloseAt) {
      setError('Submissions close time is required');
      return;
    }
    const closeTime = new Date(submissionsCloseAt);
    if (isNaN(closeTime.getTime()) || closeTime.getTime() <= Date.now()) {
      setError('Submissions close time must be in the future');
      return;
    }

    // Phase 12.1: Validate gameDate
    if (!gameDate || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
      setError('Framedl puzzle date is required (YYYY-MM-DD)');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await authedFetch('/api/remix-betr/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prizeAmount: amount,
          submissionsCloseAt: closeTime.toISOString(),
          roundLabel: roundLabel.trim() || undefined,
          gameDate: gameDate, // Phase 12.1: Framedl puzzle date
          community,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create round');
      }

      onSuccess?.();
      onClose();
      setPrizeAmount('');
      setSubmissionsCloseAt('');
      setRoundLabel('');
      setGameDate(''); // Phase 12.1: Reset gameDate
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create round');
    } finally {
      setSubmitting(false);
    }
  };

  // Set default close time to 1 hour from now
  const defaultCloseTime = new Date();
  defaultCloseTime.setHours(defaultCloseTime.getHours() + 1);
  const defaultCloseTimeString = defaultCloseTime.toISOString().slice(0, 16);

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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-0)' }}>
            Create FRAMEDL BETR Round
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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Framedl Puzzle Date
            </label>
            <input
              type="date"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
              onPaste={async (e) => {
                const text = await getPasteText(e);
                if (text != null && text !== '') {
                  e.preventDefault();
                  setGameDate(text);
                }
              }}
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginTop: '4px' }}>
              Which day&apos;s Framedl puzzle should players submit?
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Prize Amount (BETR)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={prizeAmount}
              onChange={(e) => setPrizeAmount(e.target.value)}
              onPaste={async (e) => {
                const text = await getPasteText(e);
                if (text == null || text === '') return;
                const cleaned = text.replace(/,/g, '').trim();
                const num = parseFloat(cleaned);
                if (Number.isNaN(num) || num < 0) {
                  e.preventDefault();
                  return;
                }
                e.preventDefault();
                setPrizeAmount(cleaned);
              }}
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Submissions Close At
            </label>
            <input
              type="datetime-local"
              value={submissionsCloseAt || defaultCloseTimeString}
              onChange={(e) => setSubmissionsCloseAt(e.target.value)}
              onPaste={async (e) => {
                const text = await getPasteText(e);
                if (text != null && text !== '') {
                  e.preventDefault();
                  setSubmissionsCloseAt(text);
                }
              }}
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Round Label (optional)
            </label>
            <input
              type="text"
              value={roundLabel}
              onChange={(e) => setRoundLabel(e.target.value)}
              onPaste={async (e) => {
                const input = e.currentTarget;
                const start = input.selectionStart ?? 0;
                const end = input.selectionEnd ?? roundLabel.length;
                const text = await getPasteText(e);
                if (text != null && text !== '') {
                  e.preventDefault();
                  setRoundLabel((prev) => prev.slice(0, start) + text + prev.slice(end));
                }
              }}
              placeholder="e.g., Round 1, January 2026"
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
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
              {submitting ? 'Creating…' : 'Create Round'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
