'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';

interface CreateNlHoldemGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const STAKING_OPTIONS = [
  { value: '', label: 'None' },
  { value: '1000000', label: '1M BETR' },
  { value: '5000000', label: '5M BETR' },
  { value: '25000000', label: '25M BETR' },
  { value: '50000000', label: '50M BETR' },
  { value: '200000000', label: '200M BETR' },
];

/**
 * Phase 40: Create NL HOLDEM game from Admin Create Game hub.
 */
export function CreateNlHoldemGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateNlHoldemGameModalProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState('NL HOLDEM');
  const [isPreview, setIsPreview] = useState(false);
  const [community] = useState<'betr' | 'minted_merch'>('betr');
  const [startingStacks, setStartingStacks] = useState(1500);
  const [blindDurationMinutes, setBlindDurationMinutes] = useState(10);
  const [blindIncreasePct, setBlindIncreasePct] = useState(25);
  const [startingSmallBlind, setStartingSmallBlind] = useState(10);
  const [reshuffleType, setReshuffleType] = useState<'time' | 'hands'>('hands');
  const [reshuffleInterval, setReshuffleInterval] = useState(10);
  const [numberOfWinners, setNumberOfWinners] = useState(1);
  const [prizeAmountsText, setPrizeAmountsText] = useState('1000000');
  const [stakingMinAmount, setStakingMinAmount] = useState('');
  const [gamePassword, setGamePassword] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(9);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Authentication required');
      return;
    }

    const prizeAmounts = prizeAmountsText
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (prizeAmounts.length === 0) {
      setError('Enter at least one prize amount (e.g. 1000000 or 1000000,500000)');
      return;
    }
    if (numberOfWinners > prizeAmounts.length) {
      setError('Number of winners cannot exceed the number of prize amounts.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await authedFetch('/api/nl-holdem/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'NL HOLDEM',
          isPreview,
          community,
          startingStacks,
          blindDurationMinutes,
          blindIncreasePct,
          startingSmallBlind,
          reshuffleType,
          reshuffleInterval,
          numberOfWinners,
          prizeAmounts,
          prizeCurrency: 'BETR',
          stakingMinAmount: stakingMinAmount ? parseFloat(stakingMinAmount) : null,
          gamePassword: gamePassword.trim() || null,
          maxParticipants,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create game');
      }

      onSuccess?.();
      onClose();
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
          maxWidth: '480px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          border: isPreview ? '2px solid #eab308' : '1px solid var(--stroke)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.25rem' }}>Create NL HOLDEM Game</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="NL HOLDEM" style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)', fontSize: '0.875rem' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Starting stacks</label>
              <input type="number" min={1} value={startingStacks} onChange={(e) => setStartingStacks(parseInt(e.target.value, 10) || 1500)} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            </div>
            <div>
              <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Blind (min)</label>
              <input type="number" min={1} value={blindDurationMinutes} onChange={(e) => setBlindDurationMinutes(parseInt(e.target.value, 10) || 10)} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Blind increase %</label>
              <input type="number" min={0} max={200} value={blindIncreasePct} onChange={(e) => setBlindIncreasePct(parseInt(e.target.value, 10) || 25)} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            </div>
            <div>
              <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Starting small blind</label>
              <input type="number" min={1} value={startingSmallBlind} onChange={(e) => setStartingSmallBlind(parseInt(e.target.value, 10) || 10)} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Reshuffle</label>
              <select value={reshuffleType} onChange={(e) => setReshuffleType(e.target.value as 'time' | 'hands')} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }}>
                <option value="hands">By hands</option>
                <option value="time">By time</option>
              </select>
            </div>
            <div>
              <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Interval</label>
              <input type="number" min={1} value={reshuffleInterval} onChange={(e) => setReshuffleInterval(parseInt(e.target.value, 10) || 10)} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Winners</label>
              <input type="number" min={1} max={9} value={numberOfWinners} onChange={(e) => setNumberOfWinners(Math.min(9, Math.max(1, parseInt(e.target.value, 10) || 1)))} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            </div>
            <div>
              <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Max players</label>
              <input type="number" min={2} max={9} value={maxParticipants} onChange={(e) => setMaxParticipants(Math.min(9, Math.max(2, parseInt(e.target.value, 10) || 9)))} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Prize amounts (BETR, comma-separated)</label>
            <input type="text" value={prizeAmountsText} onChange={(e) => setPrizeAmountsText(e.target.value)} placeholder="1000000 or 1000000,500000" style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
            <p style={{ color: 'var(--text-2)', fontSize: '0.7rem', marginTop: '4px', marginBottom: 0 }}>e.g. 1000000 or 1000000,500000</p>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Staking min</label>
            <select value={stakingMinAmount} onChange={(e) => setStakingMinAmount(e.target.value)} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }}>
              {STAKING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Game password (optional)</label>
            <input type="text" value={gamePassword} onChange={(e) => setGamePassword(e.target.value)} placeholder="Leave empty for none" style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--stroke)', borderRadius: '6px', color: 'var(--text-0)' }} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ color: 'var(--text-1)', fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>Visibility</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setIsPreview(false)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: !isPreview ? '2px solid var(--fire-1)' : '1px solid var(--stroke)', background: !isPreview ? 'rgba(0,255,200,0.1)' : 'var(--bg-2)', color: !isPreview ? 'var(--fire-1)' : 'var(--text-1)', cursor: 'pointer', fontWeight: !isPreview ? 600 : 400, fontSize: '0.875rem' }}>Live</button>
              <button type="button" onClick={() => setIsPreview(true)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: isPreview ? '2px solid #eab308' : '1px solid var(--stroke)', background: isPreview ? 'rgba(234,179,8,0.1)' : 'var(--bg-2)', color: isPreview ? '#eab308' : 'var(--text-1)', cursor: 'pointer', fontWeight: isPreview ? 600 : 400, fontSize: '0.875rem' }}>Preview</button>
            </div>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '12px' }}>{error}</p>}

          <button type="submit" disabled={submitting} style={{ width: '100%', padding: '12px', background: submitting ? 'var(--bg-2)' : 'var(--fire-1)', color: submitting ? 'var(--text-2)' : 'var(--bg-0)', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.875rem', cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Creating...' : 'Create NL HOLDEM Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
