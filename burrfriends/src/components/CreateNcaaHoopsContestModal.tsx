'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';

const DEFAULT_TITLE = 'NCAA HOOPS Bracket';

interface CreateNcaaHoopsContestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateNcaaHoopsContestModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateNcaaHoopsContestModalProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [community, setCommunity] = useState('betr');
  const [picksCloseAt, setPicksCloseAt] = useState('');
  const [tournamentStartDate, setTournamentStartDate] = useState('');
  const [tournamentEndDate, setTournamentEndDate] = useState('');
  const [isPreview, setIsPreview] = useState(false);
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
      const body: Record<string, unknown> = {
        title: (title.trim() || DEFAULT_TITLE),
        community: community.trim() || 'betr',
        isPreview,
      };
      if (picksCloseAt) body.picks_close_at = picksCloseAt;
      if (tournamentStartDate) body.tournament_start_date = tournamentStartDate;
      if (tournamentEndDate) body.tournament_end_date = tournamentEndDate;
      const res = await authedFetch('/api/ncaa-hoops/contests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create contest');
      }
      onSuccess?.();
      onClose();
      setTitle(DEFAULT_TITLE);
      setCommunity('betr');
      setPicksCloseAt('');
      setTournamentStartDate('');
      setTournamentEndDate('');
      setIsPreview(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create contest');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-0)',
          padding: '24px',
          borderRadius: '12px',
          maxWidth: '400px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          border: '1px solid var(--stroke)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: '1.25rem', color: 'var(--text-0)' }}>Create NCAA HOOPS Contest</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-1)' }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={DEFAULT_TITLE}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--stroke)', background: 'var(--bg-2)', color: 'var(--text-0)' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-1)' }}>Community</label>
            <input
              type="text"
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
              placeholder="betr"
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--stroke)', background: 'var(--bg-2)', color: 'var(--text-0)' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-1)' }}>Picks close at (ISO)</label>
            <input
              type="datetime-local"
              value={picksCloseAt}
              onChange={(e) => setPicksCloseAt(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--stroke)', background: 'var(--bg-2)', color: 'var(--text-0)' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-1)' }}>Tournament start date</label>
            <input
              type="date"
              value={tournamentStartDate}
              onChange={(e) => setTournamentStartDate(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--stroke)', background: 'var(--bg-2)', color: 'var(--text-0)' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', color: 'var(--text-1)' }}>Tournament end date</label>
            <input
              type="date"
              value={tournamentEndDate}
              onChange={(e) => setTournamentEndDate(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--stroke)', background: 'var(--bg-2)', color: 'var(--text-0)' }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-1)' }}>
              <input
                type="checkbox"
                checked={isPreview}
                onChange={(e) => setIsPreview(e.target.checked)}
              />
              <span style={{ fontSize: '0.875rem' }}>Preview (admin-only)</span>
            </label>
          </div>
          {error && <p style={{ color: 'var(--ember-2)', fontSize: '0.875rem', marginBottom: '12px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
