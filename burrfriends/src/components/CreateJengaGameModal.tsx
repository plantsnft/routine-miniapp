'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

type CreateJengaGameModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onGameCreated: () => void;
  token: string;
};

export default function CreateJengaGameModal({ isOpen, onClose, onGameCreated, token }: CreateJengaGameModalProps) {
  const router = useRouter();
  const [prizeAmount, setPrizeAmount] = useState<string>('');
  const [turnTimeMinutes, setTurnTimeMinutes] = useState<string>('5');
  const [stakingMinAmount, setStakingMinAmount] = useState<number | null>(null);
  const [community, setCommunity] = useState<'betr' | 'minted_merch'>('betr');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const handleCreate = async () => {
    const prize = parseFloat(prizeAmount);
    const minutes = parseInt(turnTimeMinutes, 10);
    const turnTimeSeconds = minutes * 60;

    if (isNaN(prize) || prize <= 0) {
      setError('Prize amount must be greater than 0');
      return;
    }

    if (isNaN(minutes) || minutes < 1 || minutes > 60) {
      setError('Turn time must be between 1 and 60 minutes');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await authedFetch(
        '/api/jenga/games',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prizeAmount: prize,
            turnTimeSeconds,
            stakingMinAmount: stakingMinAmount ?? null,
            community,
          }),
        },
        token
      ).then((r) => r.json());

      if (res?.ok && res?.data?.id) {
        const gameId = res.data.id;
        setPrizeAmount('');
        setTurnTimeMinutes('5');
        setStakingMinAmount(null);
        onGameCreated(); // Refresh games list as fallback
        onClose();
        // Navigate to the created game page
        router.push(`/jenga?gameId=${gameId}`);
      } else {
        setError(res?.error || 'Failed to create game');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

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
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="hl-card"
        style={{
          maxWidth: '90%',
          width: '400px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: 'var(--text-0)', marginBottom: '16px', fontSize: '1.125rem' }}>
          Create JENGA Game
        </h3>

        {error && (
          <div style={{ color: 'var(--ember-2)', marginBottom: '16px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-0)', marginBottom: '4px', fontSize: '0.875rem' }}>
            Prize Amount (BETR):
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
            placeholder="e.g., 100"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid var(--stroke)',
              borderRadius: '6px',
              background: 'var(--bg-1)',
              color: 'var(--text-0)',
            }}
          />
        </div>

        {pasteError && (
          <p style={{ fontSize: '0.875rem', color: 'var(--fire-2)', marginBottom: '8px' }}>{pasteError}</p>
        )}

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', color: 'var(--text-0)', marginBottom: '4px', fontSize: '0.875rem' }}>
            Turn Time (minutes):
          </label>
          <input
            type="number"
            min="1"
            max="60"
            value={turnTimeMinutes}
            onChange={(e) => setTurnTimeMinutes(e.target.value)}
            onPaste={async (e) => {
              const text = await getPasteText(e);
              if (text == null || text === '') return;
              const num = parseInt(text.replace(/,/g, '').trim(), 10);
              if (Number.isNaN(num) || num < 1 || num > 60) {
                e.preventDefault();
                setPasteError('Invalid number (1–60)');
                setTimeout(() => setPasteError(null), 2000);
                return;
              }
              e.preventDefault();
              setTurnTimeMinutes(String(num));
            }}
            placeholder="1-60 minutes"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid var(--stroke)',
              borderRadius: '6px',
              background: 'var(--bg-1)',
              color: 'var(--text-0)',
            }}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginTop: '4px' }}>
            Each player has this much time per turn (1-60 minutes)
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: 'var(--text-0)', marginBottom: '4px', fontSize: '0.875rem' }}>
            Token gating (optional)
          </label>
          <select
            value={stakingMinAmount === null ? '' : stakingMinAmount.toString()}
            onChange={(e) => {
              const value = e.target.value;
              setStakingMinAmount(value === '' ? null : parseFloat(value));
            }}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid var(--stroke)',
              borderRadius: '6px',
              background: 'var(--bg-1)',
              color: 'var(--text-0)',
            }}
          >
            <option value="">None (default)</option>
            <option value="1000000">1M BETR</option>
            <option value="5000000">5M BETR</option>
            <option value="25000000">25M BETR</option>
            <option value="50000000">50M BETR</option>
            <option value="200000000">200M BETR</option>
          </select>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginTop: '4px' }}>
            Require players to have staked this amount of BETR to join
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

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={creating} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !prizeAmount || !turnTimeMinutes}
            className="btn-primary"
            style={{ background: 'var(--fire-1)' }}
          >
            {creating ? 'Creating...' : 'Create Game'}
          </button>
        </div>
      </div>
    </div>
  );
}
