'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

interface CreateBetrGuesserGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateBetrGuesserGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateBetrGuesserGameModalProps) {
  const { token } = useAuth();
  const [prizeAmount, setPrizeAmount] = useState('');
  const [guessesCloseAt, setGuessesCloseAt] = useState('');
  const [closeCondition, setCloseCondition] = useState<'at_time' | 'min_players' | 'whichever_first'>('at_time');
  const [minPlayersToStart, setMinPlayersToStart] = useState<number>(5);
  const [stakingMinAmount, setStakingMinAmount] = useState<number | null>(null);
  const [community, setCommunity] = useState<'betr' | 'minted_merch'>('betr');
  const [whitelistFids, setWhitelistFids] = useState<string[]>(['', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

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

    if (closeCondition === 'at_time' || closeCondition === 'whichever_first') {
      if (!guessesCloseAt) {
        setError('Guesses close time is required');
        return;
      }
      const closeTime = new Date(guessesCloseAt);
      if (isNaN(closeTime.getTime()) || closeTime.getTime() <= Date.now()) {
        setError('Guesses close time must be in the future');
        return;
      }
    }
    if (closeCondition === 'min_players' || closeCondition === 'whichever_first') {
      if (minPlayersToStart < 1 || minPlayersToStart > 99) {
        setError('Min players must be between 1 and 99');
        return;
      }
    }
    const parsedWhitelist = whitelistFids.map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n > 0);
    if (parsedWhitelist.length > 0 && parsedWhitelist.length !== 5) {
      setError('Invite-only list must have exactly 5 FIDs, or leave all empty for open game');
      return;
    }

    setSubmitting(true);
    setError(null);

    let closeTimeIso: string;
    if (closeCondition === 'min_players' && !guessesCloseAt) {
      const d = new Date();
      d.setHours(d.getHours() + 24);
      closeTimeIso = d.toISOString();
    } else {
      const fallback = new Date();
      fallback.setHours(fallback.getHours() + 1);
      closeTimeIso = new Date(guessesCloseAt || fallback.toISOString().slice(0, 16)).toISOString();
    }
    const minPlayers =
      closeCondition === 'min_players' || closeCondition === 'whichever_first'
        ? minPlayersToStart
        : undefined;

    try {
      const res = await authedFetch('/api/betr-guesser/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prizeAmount: amount,
          guessesCloseAt: closeTimeIso,
          stakingMinAmount: stakingMinAmount ?? null,
          minPlayersToStart: minPlayers ?? undefined,
          startCondition: closeCondition,
          community,
          ...(parsedWhitelist.length === 5 && { whitelistFids: parsedWhitelist }),
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create game');
      }

      onSuccess?.();
      onClose();
      setPrizeAmount('');
      setGuessesCloseAt('');
      setStakingMinAmount(null);
      setWhitelistFids(['', '', '', '', '']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game');
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
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-0)' }}>
            Create BETR GUESSER Game
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
          {pasteError && (
            <p style={{ fontSize: '0.875rem', color: 'var(--fire-2)', marginBottom: '8px' }}>{pasteError}</p>
          )}
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
                  setPasteError('Invalid number');
                  setTimeout(() => setPasteError(null), 2000);
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
              When do guesses close?
            </label>
            <select
              value={closeCondition}
              onChange={(e) => setCloseCondition(e.target.value as 'at_time' | 'min_players' | 'whichever_first')}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            >
              <option value="at_time">At a specific time only</option>
              <option value="whichever_first">When N guesses or at time, whichever first</option>
              <option value="min_players">When N players have submitted</option>
            </select>
            {(closeCondition === 'at_time' || closeCondition === 'whichever_first') && (
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-2)' }}>
                  Guesses close at
                </label>
                <input
                  type="datetime-local"
                  value={guessesCloseAt || defaultCloseTimeString}
                  onChange={(e) => setGuessesCloseAt(e.target.value)}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text != null && text !== '') {
                      e.preventDefault();
                      setGuessesCloseAt(text);
                    }
                  }}
                  required
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
                />
              </div>
            )}
            {(closeCondition === 'min_players' || closeCondition === 'whichever_first') && (
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-2)' }}>
                  Min guesses to close
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={minPlayersToStart}
                  onChange={(e) => setMinPlayersToStart(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text == null || text === '') return;
                    const num = parseInt(text.replace(/,/g, '').trim(), 10);
                    if (Number.isNaN(num) || num < 1 || num > 99) {
                      e.preventDefault();
                      setPasteError('Invalid number (1–99)');
                      setTimeout(() => setPasteError(null), 2000);
                      return;
                    }
                    e.preventDefault();
                    setMinPlayersToStart(num);
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '6px', width: '80px', color: '#1a1a1a' }}
                />
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Token gating (optional)
            </label>
            <select
              value={stakingMinAmount === null ? '' : stakingMinAmount.toString()}
              onChange={(e) => {
                const value = e.target.value;
                setStakingMinAmount(value === '' ? null : parseFloat(value));
              }}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            >
              <option value="">None (default)</option>
              <option value="1000000">1M BETR</option>
              <option value="5000000">5M BETR</option>
              <option value="25000000">25M BETR</option>
              <option value="50000000">50M BETR</option>
              <option value="200000000">200M BETR</option>
            </select>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '4px' }}>
              Require players to have staked this amount of BETR to join
            </p>
          </div>

          {/* Phase 13.9: Optional invite-only (5 FIDs) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Invite-only (optional)
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '8px' }}>
              Enter exactly 5 FIDs to make this game invite-only. Leave all empty for open game.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {whitelistFids.map((val, i) => (
                <input
                  key={i}
                  type="number"
                  min={1}
                  placeholder={`FID ${i + 1}`}
                  value={val}
                  onChange={(e) => {
                    const next = [...whitelistFids];
                    next[i] = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setWhitelistFids(next);
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '6px', color: '#1a1a1a' }}
                />
              ))}
            </div>
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
              {submitting ? 'Creating…' : 'Create Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
