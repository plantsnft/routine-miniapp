'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

interface CreateStealNoStealGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateStealNoStealGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateStealNoStealGameModalProps) {
  const { token } = useAuth();
  const [prizeAmount, setPrizeAmount] = useState('');
  const [decisionTimeSeconds, setDecisionTimeSeconds] = useState<number>(600); // 10 min default (negotiation)
  // Phase 17.1: Decision window after negotiation ends
  const [decisionWindowSeconds, setDecisionWindowSeconds] = useState<number>(300); // 5 min default
  const [stakingMinAmount, setStakingMinAmount] = useState<number | null>(null);
  const [startCondition, setStartCondition] = useState<'players' | 'time' | 'either' | ''>('');
  const [minPlayersToStart, setMinPlayersToStart] = useState<number>(4);
  const [signupClosesAt, setSignupClosesAt] = useState<string>('');
  const [community, setCommunity] = useState<'betr' | 'minted_merch'>('betr');
  const [whitelistCount, setWhitelistCount] = useState<number>(0);
  const [whitelistFids, setWhitelistFids] = useState<string[]>([]);
  const [isPreview, setIsPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  if (!isOpen) return null;

  const setWhitelistCountAndResize = (n: number) => {
    setWhitelistCount(n);
    setWhitelistFids((prev) => {
      if (n <= 0) return [];
      if (prev.length >= n) return prev.slice(0, n);
      return [...prev, ...Array(n - prev.length).fill('')];
    });
  };

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

    if (startCondition === 'time' || startCondition === 'either') {
      if (!signupClosesAt) {
        setError('Signup close time is required for this option');
        return;
      }
      const closeTime = new Date(signupClosesAt);
      if (isNaN(closeTime.getTime()) || closeTime.getTime() <= Date.now()) {
        setError('Signup close time must be in the future');
        return;
      }
    }
    if (startCondition === 'players' || startCondition === 'either') {
      if (minPlayersToStart < 2 || minPlayersToStart > 99) {
        setError('Min players must be between 2 and 99');
        return;
      }
    }
    if (whitelistCount >= 1) {
      const parsed = whitelistFids.map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n > 0);
      if (parsed.length !== whitelistCount) {
        setError(`Please fill all ${whitelistCount} invite FIDs with valid positive numbers.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    const closesAt =
      startCondition === 'time' || startCondition === 'either'
        ? new Date(signupClosesAt).toISOString()
        : undefined;
    const minPlayers =
      startCondition === 'players' || startCondition === 'either'
        ? minPlayersToStart
        : undefined;

    try {
      const res = await authedFetch('/api/steal-no-steal/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prizeAmount: amount,
          decisionTimeSeconds,
          decisionWindowSeconds, // Phase 17.1
          stakingMinAmount: stakingMinAmount ?? null,
          minPlayersToStart: minPlayers ?? undefined,
          signupClosesAt: closesAt,
          startCondition: startCondition || undefined,
          community,
          isPreview,
          ...(whitelistCount >= 1 && {
            whitelistFids: whitelistFids.map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n > 0),
          }),
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
      setDecisionTimeSeconds(600);
      setDecisionWindowSeconds(300); // Phase 17.1: Reset to default
      setWhitelistCount(0);
      setWhitelistFids([]);
      setIsPreview(false);
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
          maxHeight: '90vh',
          overflowY: 'auto',
          border: isPreview ? '2px solid #eab308' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-0)' }}>
            Create STEAL OR NO STEAL Game
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
              Prize Pool (BETR)
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
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '4px' }}>
              Total prize pool. Briefcase amounts per match are set when creating each round.
            </p>
          </div>

          {/* Phase 17.1: Negotiation Time (Player A convinces Player B) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              🗣️ Negotiation Time
            </label>
            <select
              value={decisionTimeSeconds}
              onChange={(e) => setDecisionTimeSeconds(parseInt(e.target.value, 10))}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            >
              <option value="0">0 (no negotiation — Phase 17 special)</option>
              <option value="60">1 minute</option>
              <option value="120">2 minutes</option>
              <option value="300">5 minutes</option>
              <option value="600">10 minutes (default)</option>
              <option value="900">15 minutes</option>
              <option value="1800">30 minutes</option>
              <option value="3600">1 hour</option>
            </select>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '4px' }}>
              Time for Player A to convince Player B via chat. Player B cannot decide during this time.
            </p>
          </div>

          {/* Phase 17.1: Decision Window (after negotiation) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              ⚡ Decision Window
            </label>
            <select
              value={decisionWindowSeconds}
              onChange={(e) => setDecisionWindowSeconds(parseInt(e.target.value, 10))}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            >
              <option value="60">1 minute</option>
              <option value="120">2 minutes</option>
              <option value="300">5 minutes (default)</option>
              <option value="600">10 minutes</option>
              <option value="900">15 minutes</option>
              <option value="1800">30 minutes</option>
              <option value="86400">24 hours (Phase 17 special)</option>
            </select>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '4px' }}>
              Time Player B has to decide after negotiation ends. If they don&apos;t decide, Player A wins.
            </p>
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
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              When does the game start? (optional)
            </label>
            <select
              value={startCondition}
              onChange={(e) => setStartCondition(e.target.value as 'players' | 'time' | 'either' | '')}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            >
              <option value="">No auto-start (admin starts manually)</option>
              <option value="either">When N players or at time, whichever first</option>
              <option value="players">When N players sign up</option>
              <option value="time">At a specific time</option>
            </select>
            {(startCondition === 'players' || startCondition === 'either') && (
              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-2)' }}>
                  Min players to start (need at least 2)
                </label>
                <input
                  type="number"
                  min={2}
                  max={99}
                  value={minPlayersToStart}
                  onChange={(e) => setMinPlayersToStart(Math.max(2, Math.min(99, parseInt(e.target.value, 10) || 2)))}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text == null || text === '') return;
                    const num = parseInt(text.replace(/,/g, '').trim(), 10);
                    if (Number.isNaN(num) || num < 2 || num > 99) {
                      e.preventDefault();
                      setPasteError('Invalid number (2–99)');
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
            {(startCondition === 'time' || startCondition === 'either') && (
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

          {/* Phase 17: Invite-only (optional) — 1–99 FIDs */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Invite-only (optional)
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '8px' }}>
              Choose number of invited players (0 = open game). Then fill each FID.
            </p>
            <select
              value={whitelistCount}
              onChange={(e) => setWhitelistCountAndResize(parseInt(e.target.value, 10))}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a', marginBottom: '8px' }}
            >
              <option value={0}>0 — Open game (anyone can sign up)</option>
              {Array.from({ length: 99 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} invited player{n !== 1 ? 's' : ''}</option>
              ))}
            </select>
            {whitelistCount >= 1 && (
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
            )}
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

          {/* Phase 29: Live vs Preview */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
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
                  border: !isPreview ? '2px solid var(--fire-1)' : '1px solid #ccc',
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
                  border: isPreview ? '2px solid #eab308' : '1px solid #ccc',
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
