'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

interface CreateSuperbowlSquaresGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateSuperbowlSquaresGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateSuperbowlSquaresGameModalProps) {
  const { token } = useAuth();
  const [totalPrizePool, setTotalPrizePool] = useState('30000000'); // 30M default
  const [title, setTitle] = useState('BETR SUPERBOWL PROPS');
  
  // Prize distribution (defaults: 15% Q1, 15% Q2, 30% Halftime, 40% Final)
  const [prizeQ1Pct, setPrizeQ1Pct] = useState(15);
  const [prizeQ2Pct, setPrizeQ2Pct] = useState(15);
  const [prizeHalftimePct, setPrizeHalftimePct] = useState(30);
  const [prizeFinalPct, setPrizeFinalPct] = useState(40);
  
  // Tier configuration (defaults)
  const [tier1MinStake, setTier1MinStake] = useState('200000000'); // 200M
  const [tier1Squares, setTier1Squares] = useState(3);
  const [tier2MinStake, setTier2MinStake] = useState('100000000'); // 100M
  const [tier2Squares, setTier2Squares] = useState(2);
  const [tier3MinStake, setTier3MinStake] = useState('50000000'); // 50M
  const [tier3Squares, setTier3Squares] = useState(1);
  
  // Square limits
  const [autoSquaresLimit, setAutoSquaresLimit] = useState(90);
  const [adminSquaresLimit, setAdminSquaresLimit] = useState(10);
  
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

    const pool = parseFloat(totalPrizePool);
    if (isNaN(pool) || pool <= 0) {
      setError('Total prize pool must be a positive number');
      return;
    }

    // Validate percentages
    const totalPct = prizeQ1Pct + prizeQ2Pct + prizeHalftimePct + prizeFinalPct;
    if (totalPct !== 100) {
      setError(`Prize percentages must sum to 100% (currently ${totalPct}%)`);
      return;
    }

    // Validate square limits
    if (autoSquaresLimit + adminSquaresLimit !== 100) {
      setError(`Auto + admin squares must equal 100 (currently ${autoSquaresLimit + adminSquaresLimit})`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await authedFetch('/api/superbowl-squares/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          totalPrizePool: pool,
          prizeQ1Pct: prizeQ1Pct / 100,
          prizeQ2Pct: prizeQ2Pct / 100,
          prizeHalftimePct: prizeHalftimePct / 100,
          prizeFinalPct: prizeFinalPct / 100,
          tier1MinStake: parseFloat(tier1MinStake),
          tier1SquaresPerUser: tier1Squares,
          tier2MinStake: parseFloat(tier2MinStake),
          tier2SquaresPerUser: tier2Squares,
          tier3MinStake: parseFloat(tier3MinStake),
          tier3SquaresPerUser: tier3Squares,
          autoSquaresLimit,
          adminSquaresLimit,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create game');
      }

      onSuccess?.();
      onClose();
      // Reset form
      setTotalPrizePool('30000000');
      setTitle('BETR SUPERBOWL PROPS');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create game');
    } finally {
      setSubmitting(false);
    }
  };

  const formatBetr = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '0';
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M`;
    return num.toLocaleString();
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
        overflow: 'auto',
      }}
      onClick={onClose}
    >
      <div
        className="hl-card"
        style={{
          maxWidth: '90%',
          width: '480px',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '24px',
          margin: '20px 0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: '#00ffc8' }}>
            Create Super Bowl Squares
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
          {/* Title */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Game Title
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
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
          </div>

          {pasteError && (
            <p style={{ fontSize: '0.875rem', color: 'var(--fire-2)', marginBottom: '8px' }}>{pasteError}</p>
          )}

          {/* Prize Pool */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-0)' }}>
              Total Prize Pool (BETR): <span style={{ color: '#00ffc8' }}>{formatBetr(totalPrizePool)}</span>
            </label>
            <input
              type="number"
              value={totalPrizePool}
              onChange={(e) => setTotalPrizePool(e.target.value)}
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
                setTotalPrizePool(cleaned);
              }}
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
            />
          </div>

          {/* Prize Distribution */}
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: '8px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-0)', fontWeight: 600 }}>
              Prize Distribution (must = 100%)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>Q1 %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={prizeQ1Pct}
                  onChange={(e) => setPrizeQ1Pct(parseInt(e.target.value) || 0)}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text == null || text === '') return;
                    const num = parseInt(text.replace(/,/g, '').trim(), 10);
                    if (Number.isNaN(num) || num < 0 || num > 100) {
                      e.preventDefault();
                      setPasteError('Invalid (0–100)');
                      setTimeout(() => setPasteError(null), 2000);
                      return;
                    }
                    e.preventDefault();
                    setPrizeQ1Pct(num);
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', color: '#1a1a1a' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>Q2 %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={prizeQ2Pct}
                  onChange={(e) => setPrizeQ2Pct(parseInt(e.target.value) || 0)}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text == null || text === '') return;
                    const num = parseInt(text.replace(/,/g, '').trim(), 10);
                    if (Number.isNaN(num) || num < 0 || num > 100) {
                      e.preventDefault();
                      setPasteError('Invalid (0–100)');
                      setTimeout(() => setPasteError(null), 2000);
                      return;
                    }
                    e.preventDefault();
                    setPrizeQ2Pct(num);
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', color: '#1a1a1a' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>Halftime %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={prizeHalftimePct}
                  onChange={(e) => setPrizeHalftimePct(parseInt(e.target.value) || 0)}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text == null || text === '') return;
                    const num = parseInt(text.replace(/,/g, '').trim(), 10);
                    if (Number.isNaN(num) || num < 0 || num > 100) {
                      e.preventDefault();
                      setPasteError('Invalid (0–100)');
                      setTimeout(() => setPasteError(null), 2000);
                      return;
                    }
                    e.preventDefault();
                    setPrizeHalftimePct(num);
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', color: '#1a1a1a' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>Final %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={prizeFinalPct}
                  onChange={(e) => setPrizeFinalPct(parseInt(e.target.value) || 0)}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text == null || text === '') return;
                    const num = parseInt(text.replace(/,/g, '').trim(), 10);
                    if (Number.isNaN(num) || num < 0 || num > 100) {
                      e.preventDefault();
                      setPasteError('Invalid (0–100)');
                      setTimeout(() => setPasteError(null), 2000);
                      return;
                    }
                    e.preventDefault();
                    setPrizeFinalPct(num);
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', color: '#1a1a1a' }}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: prizeQ1Pct + prizeQ2Pct + prizeHalftimePct + prizeFinalPct === 100 ? '#00ffc8' : 'var(--ember-2)', marginTop: '4px' }}>
              Total: {prizeQ1Pct + prizeQ2Pct + prizeHalftimePct + prizeFinalPct}%
            </p>
          </div>

          {/* Tier Configuration */}
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: '8px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-0)', fontWeight: 600 }}>
              Staking Tiers
            </label>
            
            {/* Tier 1 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-1)', minWidth: '40px' }}>Tier 1:</span>
              <select
                value={tier1MinStake}
                onChange={(e) => setTier1MinStake(e.target.value)}
                style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px', flex: 1, color: '#1a1a1a' }}
              >
                <option value="200000000">200M BETR</option>
                <option value="150000000">150M BETR</option>
                <option value="100000000">100M BETR</option>
              </select>
              <input
                type="number"
                min="1"
                max="10"
                value={tier1Squares}
                onChange={(e) => setTier1Squares(parseInt(e.target.value) || 1)}
                onPaste={async (e) => {
                  const text = await getPasteText(e);
                  if (text == null || text === '') return;
                  const num = Math.min(10, Math.max(1, parseInt(text.replace(/,/g, '').trim(), 10) || 1));
                  e.preventDefault();
                  setTier1Squares(num);
                }}
                style={{ padding: '4px', width: '50px', border: '1px solid #ccc', borderRadius: '4px', color: '#1a1a1a' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>squares</span>
            </div>
            
            {/* Tier 2 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-1)', minWidth: '40px' }}>Tier 2:</span>
              <select
                value={tier2MinStake}
                onChange={(e) => setTier2MinStake(e.target.value)}
                style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px', flex: 1, color: '#1a1a1a' }}
              >
                <option value="100000000">100M BETR</option>
                <option value="75000000">75M BETR</option>
                <option value="50000000">50M BETR</option>
              </select>
              <input
                type="number"
                min="1"
                max="10"
                value={tier2Squares}
                onChange={(e) => setTier2Squares(parseInt(e.target.value) || 1)}
                onPaste={async (e) => {
                  const text = await getPasteText(e);
                  if (text == null || text === '') return;
                  const num = Math.min(10, Math.max(1, parseInt(text.replace(/,/g, '').trim(), 10) || 1));
                  e.preventDefault();
                  setTier2Squares(num);
                }}
                style={{ padding: '4px', width: '50px', border: '1px solid #ccc', borderRadius: '4px', color: '#1a1a1a' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>squares</span>
            </div>
            
            {/* Tier 3 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-1)', minWidth: '40px' }}>Tier 3:</span>
              <select
                value={tier3MinStake}
                onChange={(e) => setTier3MinStake(e.target.value)}
                style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px', flex: 1, color: '#1a1a1a' }}
              >
                <option value="50000000">50M BETR</option>
                <option value="25000000">25M BETR</option>
                <option value="10000000">10M BETR</option>
              </select>
              <input
                type="number"
                min="1"
                max="10"
                value={tier3Squares}
                onChange={(e) => setTier3Squares(parseInt(e.target.value) || 1)}
                onPaste={async (e) => {
                  const text = await getPasteText(e);
                  if (text == null || text === '') return;
                  const num = Math.min(10, Math.max(1, parseInt(text.replace(/,/g, '').trim(), 10) || 1));
                  e.preventDefault();
                  setTier3Squares(num);
                }}
                style={{ padding: '4px', width: '50px', border: '1px solid #ccc', borderRadius: '4px', color: '#1a1a1a' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>squares</span>
            </div>
          </div>

          {/* Square Limits */}
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: '8px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-0)', fontWeight: 600 }}>
              Square Limits (must = 100)
            </label>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>Auto (stakers)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={autoSquaresLimit}
                  onChange={(e) => setAutoSquaresLimit(parseInt(e.target.value) || 0)}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text == null || text === '') return;
                    const num = parseInt(text.replace(/,/g, '').trim(), 10);
                    if (Number.isNaN(num) || num < 0 || num > 100) {
                      e.preventDefault();
                      setPasteError('Invalid (0–100)');
                      setTimeout(() => setPasteError(null), 2000);
                      return;
                    }
                    e.preventDefault();
                    setAutoSquaresLimit(num);
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '4px', width: '80px', display: 'block', marginTop: '4px', color: '#1a1a1a' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>Admin (reserved)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={adminSquaresLimit}
                  onChange={(e) => setAdminSquaresLimit(parseInt(e.target.value) || 0)}
                  onPaste={async (e) => {
                    const text = await getPasteText(e);
                    if (text == null || text === '') return;
                    const num = parseInt(text.replace(/,/g, '').trim(), 10);
                    if (Number.isNaN(num) || num < 0 || num > 100) {
                      e.preventDefault();
                      setPasteError('Invalid (0–100)');
                      setTimeout(() => setPasteError(null), 2000);
                      return;
                    }
                    e.preventDefault();
                    setAdminSquaresLimit(num);
                  }}
                  style={{ padding: '6px', border: '1px solid #ccc', borderRadius: '4px', width: '80px', display: 'block', marginTop: '4px', color: '#1a1a1a' }}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: autoSquaresLimit + adminSquaresLimit === 100 ? '#00ffc8' : 'var(--ember-2)', marginTop: '4px' }}>
              Total: {autoSquaresLimit + adminSquaresLimit}
            </p>
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
              style={{ 
                background: 'linear-gradient(90deg, #00ffc8, #00c8ff)',
                color: '#000'
              }}
            >
              {submitting ? 'Creating…' : 'Create Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
