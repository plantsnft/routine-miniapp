'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { SUNDAY_HIGH_STAKES_CLUBGG_URL } from '~/lib/constants';

const DEFAULT_TITLE = 'SUNDAY HIGH STAKES ARE BETR';

interface CreateSundayHighStakesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateSundayHighStakesModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateSundayHighStakesModalProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [password, setPassword] = useState('');
  const [clubggUrl, setClubggUrl] = useState(SUNDAY_HIGH_STAKES_CLUBGG_URL);
  const [qcUrl, setQcUrl] = useState('');
  const [startsAt, setStartsAt] = useState('');
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
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    const trimmedTitle = title.trim() || DEFAULT_TITLE;
    const trimmedPassword = password.trim();
    const trimmedUrl = clubggUrl.trim() || SUNDAY_HIGH_STAKES_CLUBGG_URL;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch('/api/sunday-high-stakes/contests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          password: trimmedPassword,
          clubggUrl: trimmedUrl,
          qcUrl: qcUrl.trim() || undefined,
          startsAt: startsAt.trim() ? new Date(startsAt.trim()).toISOString() : undefined,
          isPreview,
        }),
      }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create contest');
      }
      onSuccess?.();
      onClose();
      setTitle(DEFAULT_TITLE);
      setPassword('');
      setClubggUrl(SUNDAY_HIGH_STAKES_CLUBGG_URL);
      setQcUrl('');
      setStartsAt('');
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
          maxWidth: '420px',
          width: '100%',
          border: '1px solid var(--stroke)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: '1.25rem' }}>Create SUNDAY HIGH STAKES ARE BETR</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={DEFAULT_TITLE}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', color: '#1a1a1a' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Password (shown to users after submit)</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Club GG room password"
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', color: '#1a1a1a' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Club GG URL (button link after submit)</label>
            <input
              type="url"
              value={clubggUrl}
              onChange={(e) => setClubggUrl(e.target.value)}
              placeholder={SUNDAY_HIGH_STAKES_CLUBGG_URL}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', color: '#1a1a1a' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>QC URL (optional). If set, only submissions whose cast is a quote of this reference will be accepted.</label>
            <input
              type="url"
              value={qcUrl}
              onChange={(e) => setQcUrl(e.target.value)}
              placeholder="https://warpcast.com/..."
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', color: '#1a1a1a' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Start time (optional). Submissions allowed from start until 30 min after.</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', color: '#1a1a1a' }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPreview}
                onChange={(e) => setIsPreview(e.target.checked)}
              />
              <span style={{ fontSize: '0.875rem' }}>Preview (admin-only submissions)</span>
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
