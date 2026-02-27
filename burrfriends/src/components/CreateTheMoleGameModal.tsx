'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

interface CreateTheMoleGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateTheMoleGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTheMoleGameModalProps) {
  const { token } = useAuth();
  const [prizeAmount, setPrizeAmount] = useState('');
  const [stakingMinAmount, setStakingMinAmount] = useState<number | null>(null);
  const [startCondition, setStartCondition] = useState<'min_players' | 'at_time' | 'whichever_first'>('whichever_first');
  const [minPlayersToStart, setMinPlayersToStart] = useState<number>(5);
  const [signupClosesAt, setSignupClosesAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d.toISOString().slice(0, 16);
  });
  const [community, setCommunity] = useState<'betr' | 'minted_merch'>('betr');
  const [restrictToTournamentPlayers, setRestrictToTournamentPlayers] = useState(false);
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

    setSubmitting(true);
    setError(null);

    const closesAt =
      startCondition === 'at_time' || startCondition === 'whichever_first'
        ? new Date(signupClosesAt).toISOString()
        : undefined;
    const minPlayers =
      startCondition === 'min_players' || startCondition === 'whichever_first'
        ? minPlayersToStart
        : undefined;

    try {
      const res = await authedFetch('/api/the-mole/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prizeAmount: amount,
          stakingMinAmount: stakingMinAmount ?? null,
          minPlayersToStart: minPlayers,
          signupClosesAt: closesAt,
          startCondition,
          community,
          ...(restrictToTournamentPlayers ? { eligiblePlayersSource: 'tournament_alive' as const } : {}),
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create game');
      }

      onSuccess?.();
      onClose();
      setPrizeAmount('');
      setStakingMinAmount(null);
      setRestrictToTournamentPlayers(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game');
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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-0)' }}>
            Create THE MOLE Game
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

          {pasteError && (
            <p style={{ fontSize: '0.875rem', color: 'var(--fire-2)', marginBottom: '8px' }}>{pasteError}</p>
          )}

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

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              When does the game start?
            </label>
            <select
              value={startCondition}
              onChange={(e) => setStartCondition(e.target.value as 'min_players' | 'at_time' | 'whichever_first')}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            >
              <option value="whichever_first">When N players or at time, whichever first (default)</option>
              <option value="min_players">When N players sign up</option>
              <option value="at_time">At a specific time</option>
            </select>
            {(startCondition === 'min_players' || startCondition === 'whichever_first') && (
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-2)' }}>
                  Min players to start
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
            {(startCondition === 'at_time' || startCondition === 'whichever_first') && (
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-2)' }}>
                  Signups close at
                </label>
                <input
                  type="datetime-local"
                  value={signupClosesAt}
                  onChange={(e) => setSignupClosesAt(e.target.value)}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text != null && text !== '') {
                      e.preventDefault();
                      setSignupClosesAt(text);
                    }
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
                />
              </div>
            )}
          </div>

          {/* 16.6: Restrict to tournament players only */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={restrictToTournamentPlayers}
                onChange={(e) => setRestrictToTournamentPlayers(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-0)' }}>
                Restrict to tournament players only
              </span>
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '4px', marginLeft: '26px' }}>
              Only current BETR GAMES tournament players (alive) can sign up
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
