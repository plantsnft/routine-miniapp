'use client';

/**
 * Sunday High Stakes: Submit URL popup for clubs games page.
 * Fetches status for stake eligibility; shows URL input + Submit when eligible.
 * On success: MandatoryClubGGStepsModal with password + Club GG.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { MandatoryClubGGStepsModal } from '~/components/MandatoryClubGGStepsModal';

const RULES_TITLE = 'SUNDAY HIGH STAKES ARE BETR';

type StatusData = {
  stakeEligible?: boolean;
  stakedAmount?: string;
  canSubmit?: boolean;
  contest?: { id: string; title?: string; status: string } | null;
};

export interface SundayHighStakesSubmitPopupProps {
  isOpen: boolean;
  onClose: () => void;
  contestTitle?: string;
}

export function SundayHighStakesSubmitPopup({
  isOpen,
  onClose,
  contestTitle,
}: SundayHighStakesSubmitPopupProps) {
  const { token, status: authStatus } = useAuth();
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [castUrl, setCastUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ password: string; clubggUrl: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !token) return;
    setStatusData(null);
    setSubmitError(null);
    setSuccess(null);
    setCastUrl('');
    setLoading(true);
    authedFetch('/api/sunday-high-stakes/status', { method: 'GET' }, token)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.data) setStatusData(d.data);
      })
      .catch(() => setStatusData(null))
      .finally(() => setLoading(false));
  }, [isOpen, token]);

  const handleSubmit = async () => {
    if (!token || !castUrl.trim()) {
      setSubmitError('Cast URL is required.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await authedFetch(
        '/api/sunday-high-stakes/submit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ castUrl: castUrl.trim() }),
        },
        token
      );
      const d = await res.json();
      if (!d?.ok) {
        setSubmitError(d?.error ?? 'Submit failed.');
        return;
      }
      setSuccess({
        password: d.data?.password ?? '',
        clubggUrl: d.data?.clubggUrl ?? '',
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="hl-card max-w-md w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Submit URL
          </h3>
          {loading && (
            <p style={{ color: 'var(--text-1)' }}>Loading…</p>
          )}
          {!loading && authStatus !== 'authed' && (
            <p style={{ color: 'var(--text-1)' }}>Sign in to submit.</p>
          )}
          {!loading && authStatus === 'authed' && statusData && !statusData.canSubmit && !statusData.stakeEligible && (
            <p style={{ color: 'var(--text-1)' }}>
              You need 1M BETR staked to sign up. Your staked amount: {statusData.stakedAmount ?? '0'}.
            </p>
          )}
          {!loading && authStatus === 'authed' && statusData && (statusData.canSubmit || statusData.stakeEligible) && !success && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>
                  Cast URL (must include an image)
                </label>
                <input
                  type="url"
                  placeholder="https://warpcast.com/..."
                  value={castUrl}
                  onChange={(e) => setCastUrl(e.target.value)}
                  style={{
                    padding: '8px',
                    border: '1px solid var(--stroke)',
                    borderRadius: '6px',
                    width: '100%',
                    color: 'var(--text-0)',
                  }}
                />
              </div>
              {submitError && <p style={{ color: 'var(--ember-2)', fontSize: '0.875rem' }}>{submitError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          )}
          {!loading && success && (
            <p style={{ color: 'var(--fire-1)' }}>Submission received!</p>
          )}
        </div>
      </div>
      {success && (
        <MandatoryClubGGStepsModal
          gameTitle={contestTitle ?? RULES_TITLE}
          password={success.password}
          clubggUrl={success.clubggUrl}
          onClose={() => {
            setSuccess(null);
            onClose();
          }}
        />
      )}
    </>
  );
}
