'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { NOTIFICATIONS_BROADCAST_ADMIN_FIDS } from '~/lib/constants';

export default function AdminBroadcastPage() {
  const { fid: currentFid, status: authStatus, token, retry } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [stakingMinAmount, setStakingMinAmount] = useState<number | null>(null);
  const [participationFilter, setParticipationFilter] = useState<string>('all');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (authStatus === 'loading') {
      return;
    }
    
    if (authStatus === 'authed' && currentFid && token) {
      // Check if user is in NOTIFICATIONS_BROADCAST_ADMIN_FIDS
      if (NOTIFICATIONS_BROADCAST_ADMIN_FIDS.includes(currentFid)) {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
        setError('Not authorized. Only broadcast admins can access this page.');
      }
    } else if (authStatus === 'error') {
      setError(null);
    }
  }, [authStatus, currentFid, token]);

  // Preview: Get count of eligible users (non-blocking)
  useEffect(() => {
    if (!token || !isAuthorized) {
      setPreviewCount(null);
      return;
    }

    const previewEligibleCount = async () => {
      try {
        setPreviewLoading(true);
        
        // Build query parameters
        const params = new URLSearchParams();
        if (stakingMinAmount) {
          params.append('stakingMinAmount', stakingMinAmount.toString());
        }
        if (participationFilter && participationFilter !== 'all') {
          params.append('participationFilter', participationFilter);
        }

        const res = await authedFetch(`/api/notifications/broadcast?${params.toString()}`, {
          method: 'GET',
        }, token);

        const data = await res.json();
        if (res.ok && data.ok) {
          setPreviewCount(data.data?.count ?? null);
        } else {
          setPreviewCount(null);
        }
      } catch (err) {
        // Silently fail - preview is optional
        setPreviewCount(null);
      } finally {
        setPreviewLoading(false);
      }
    };

    // Debounce preview calls
    const timer = setTimeout(() => {
      previewEligibleCount();
    }, 500);

    return () => clearTimeout(timer);
  }, [stakingMinAmount, participationFilter, token, isAuthorized]);

  const handleSend = async () => {
    if (!token) {
      setError('Not authenticated');
      return;
    }

    if (!title.trim() || !body.trim()) {
      setError('Title and body are required');
      return;
    }

    if (title.length > 32) {
      setError('Title must be <= 32 characters');
      return;
    }

    if (body.length > 128) {
      setError('Body must be <= 128 characters');
      return;
    }

    try {
      setSending(true);
      setError(null);
      setSuccess(null);

      const res = await authedFetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          targetUrl: targetUrl.trim() || undefined,
          stakingMinAmount: stakingMinAmount || undefined,
          participationFilter: participationFilter !== 'all' ? participationFilter : undefined,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to send broadcast');
        return;
      }

      setSuccess(`Broadcast sent successfully! Sent to ${data.data?.successCount || 0} users.`);
      setTitle('');
      setBody('');
      setTargetUrl('');
      setStakingMinAmount(null);
      setParticipationFilter('all');
      setPreviewCount(null);
    } catch (err: any) {
      setError(err.message || 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  // Show loading state while auth is loading
  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p style={{ color: 'var(--text-muted)' }}>Signing in...</p>
        </div>
      </main>
    );
  }

  // Show error state with retry button if auth failed
  if (authStatus === 'error') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p className="mb-4" style={{ color: 'var(--fire-2)' }}>Authentication failed. Please try again.</p>
          {retry && (
            <button
              onClick={retry}
              className="btn-primary"
            >
              Retry Sign-In
            </button>
          )}
        </div>
      </main>
    );
  }

  // Show not authorized if authed but not admin
  if (authStatus === 'authed' && isAuthorized === false) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p className="mb-4" style={{ color: 'var(--fire-2)' }}>Not authorized. Only broadcast admins can access this page.</p>
          <Link href="/" className="mt-4 inline-block" style={{ color: 'var(--fire-1)' }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
          Admin: Broadcast Message
        </h1>

        {error && (
          <div className="mb-4 hl-card" style={{ borderColor: 'var(--fire-2)' }}>
            <p style={{ color: 'var(--fire-2)' }}>{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 hl-card" style={{ borderColor: 'var(--teal-1)' }}>
            <p style={{ color: 'var(--teal-1)' }}>{success}</p>
          </div>
        )}

        <div className="hl-card space-y-6">
          {/* Title */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Title <span style={{ color: 'var(--fire-2)' }}>*</span>
              <span className="ml-2 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                ({title.length}/32 characters)
              </span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input text-base"
              placeholder="New game announcement"
              maxLength={32}
            />
          </div>

          {/* Body */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Message <span style={{ color: 'var(--fire-2)' }}>*</span>
              <span className="ml-2 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                ({body.length}/128 characters)
              </span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="input text-base"
              placeholder="Enter your message here..."
              rows={4}
              maxLength={128}
            />
          </div>

          {/* Target URL (optional) */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Target URL (optional)
            </label>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="input text-base"
              placeholder="/clubs/burrfriends/games"
            />
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Where users will be directed when they tap the notification
            </p>
          </div>

          {/* Staking Filter */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Filter by Staking Requirement (optional)
            </label>
            <select
              value={stakingMinAmount === null ? '' : stakingMinAmount.toString()}
              onChange={(e) => {
                const value = e.target.value;
                setStakingMinAmount(value === '' ? null : parseFloat(value));
              }}
              className="input text-base"
            >
              <option value="">None (send to all subscribers)</option>
              <option value="5">5 BETR</option>
              <option value="25">25 BETR</option>
              <option value="50">50 BETR</option>
              <option value="200">200 BETR</option>
            </select>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Only send to users who have staked at least this amount of BETR
            </p>
          </div>

          {/* Participation Filter */}
          <div>
            <label className="label text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Filter by Game Participation (optional)
            </label>
            <select
              value={participationFilter}
              onChange={(e) => setParticipationFilter(e.target.value)}
              className="input text-base"
            >
              <option value="all">All subscribers</option>
              <option value="recent">Recent players (last 30 days)</option>
              <option value="active">Active players (last 7 days)</option>
              <option value="never">Never played</option>
            </select>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Filter subscribers by their game participation history
            </p>
          </div>

          {/* Preview Count */}
          {(previewCount !== null || previewLoading) && (
            <div className="hl-card" style={{ 
              padding: '1rem', 
              backgroundColor: 'var(--bg-1)',
              borderColor: 'var(--teal-1)'
            }}>
              <p style={{ color: 'var(--text-0)', fontWeight: 600 }}>
                {previewLoading ? (
                  'Calculating...'
                ) : (
                  `Will send to ${previewCount} ${previewCount === 1 ? 'user' : 'users'}`
                )}
              </p>
            </div>
          )}

          {/* Send Button */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={handleSend}
              disabled={sending || !title.trim() || !body.trim()}
              className="btn-primary"
            >
              {sending ? 'Sending...' : 'Send Broadcast'}
            </button>
            <Link href="/" className="btn-secondary">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
