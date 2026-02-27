'use client';

/**
 * Phase 43: Admin Feedback – View and reply to feedback tickets.
 * Shows submitter and reply author profile (pfp, display name) instead of FID.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isAdmin } from '~/lib/admin';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

interface FeedbackTicketSummary {
  id: string;
  fid: number;
  message: string;
  status: string;
  created_at: string;
  reply_count: number;
}

interface FeedbackDetail {
  id: string;
  fid: number;
  message: string;
  status: string;
  created_at: string;
  images: string[];
  replies: Array<{ id: string; fid: number; message: string; created_at: string }>;
}

type Profile = { display_name?: string; username?: string; avatar_url?: string };

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function displayName(p: Profile | undefined, fid: number): string {
  if (!p) return `FID ${fid}`;
  return p.display_name || p.username || `FID ${fid}`;
}

export default function AdminFeedbackPage() {
  const { fid, status: authStatus, token } = useAuth();
  const [tickets, setTickets] = useState<FeedbackTicketSummary[]>([]);
  const [profiles, setProfiles] = useState<Record<number, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const authorized = fid ? isAdmin(fid) : false;

  const fetchProfiles = useCallback(
    async (fids: number[]) => {
      if (!token || fids.length === 0) return;
      const unique = [...new Set(fids)].filter((n) => n > 0);
      if (unique.length === 0) return;
      try {
        const res = await authedFetch(`/api/users/bulk?fids=${unique.join(',')}`, { method: 'GET' }, token);
        const data = await res.json();
        if (res.ok && Array.isArray(data?.data)) {
          setProfiles((prev) => {
            const next = { ...prev };
            data.data.forEach((u: { fid: number; display_name?: string; username?: string; avatar_url?: string }) => {
              next[u.fid] = { display_name: u.display_name, username: u.username, avatar_url: u.avatar_url };
            });
            return next;
          });
        }
      } catch {
        // ignore
      }
    },
    [token]
  );

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/feedback', { method: 'GET' }, token);
      const data = await res.json();
      if (data?.ok && Array.isArray(data?.data?.tickets)) {
        const list = data.data.tickets;
        setTickets(list);
        const fids = list.map((t: FeedbackTicketSummary) => t.fid).filter((n: number) => n > 0);
        if (fids.length > 0) {
          fetchProfiles(fids);
        }
      } else {
        setTickets([]);
      }
    } catch {
      setTickets([]);
      setError('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [token, fetchProfiles]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      setLoadingDetail(true);
      try {
        const res = await authedFetch(`/api/feedback/${id}`, { method: 'GET' }, token);
        const data = await res.json();
        if (data?.ok && data?.data) {
          const d = { ...data.data, images: data.data.images ?? [] } as FeedbackDetail;
          setDetail(d);
          const fids = [d.fid, ...(d.replies ?? []).map((r) => r.fid)].filter((n) => n > 0);
          if (fids.length > 0) fetchProfiles(fids);
        } else {
          setDetail(null);
        }
      } catch {
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [token, fetchProfiles]
  );

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!authorized) {
      setLoading(false);
      setError('Admin access required');
      return;
    }
    if (token) loadTickets();
  }, [authStatus, authorized, token, loadTickets]);

  useEffect(() => {
    if (selectedId && token) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, token, loadDetail]);

  const handleReply = async () => {
    if (!token || !selectedId || !replyMessage.trim()) return;
    setReplying(true);
    try {
      const res = await authedFetch(
        `/api/feedback/${selectedId}/replies`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: replyMessage.trim() }),
        },
        token
      );
      const data = await res.json();
      if (data?.ok) {
        setReplyMessage('');
        loadDetail(selectedId);
        loadTickets();
      } else {
        setError(data?.error || 'Failed to add reply');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add reply');
    } finally {
      setReplying(false);
    }
  };

  const handleStatusChange = async (newStatus: 'open' | 'resolved') => {
    if (!token || !selectedId) return;
    setStatusUpdating(true);
    try {
      const res = await authedFetch(
        `/api/feedback/${selectedId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        },
        token
      );
      const data = await res.json();
      if (data?.ok) {
        loadDetail(selectedId);
        loadTickets();
      }
    } finally {
      setStatusUpdating(false);
    }
  };

  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <p style={{ color: 'var(--text-1)' }}>Loading...</p>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p style={{ color: '#ef4444' }}>Admin access required</p>
          <Link href="/admin/dashboard" style={{ color: 'var(--fire-1)', marginTop: '16px', display: 'inline-block' }}>
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        <Link href="/admin/dashboard" style={{ color: 'var(--fire-1)', fontSize: '0.875rem', marginBottom: '24px', display: 'inline-block' }}>
          ← Back to Dashboard
        </Link>

        <h1 style={{ color: 'var(--text-0)', fontSize: '1.5rem', marginBottom: '16px' }}>Feedback</h1>

        {error && (
          <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', minHeight: '400px' }}>
          {/* Ticket list */}
          <div className="hl-card" style={{ padding: '16px' }}>
            <h2 style={{ color: 'var(--text-0)', fontSize: '1rem', marginBottom: '12px' }}>Tickets</h2>
            {loading ? (
              <p style={{ color: 'var(--text-2)' }}>Loading...</p>
            ) : tickets.length === 0 ? (
              <p style={{ color: 'var(--text-2)' }}>No feedback yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      background: selectedId === t.id ? 'rgba(45, 212, 191, 0.15)' : 'var(--bg-2)',
                      border: `1px solid ${selectedId === t.id ? 'var(--fire-1)' : 'var(--stroke)'}`,
                      borderRadius: '8px',
                      color: 'var(--text-0)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '0.9rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.message}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                      <img
                        src={profiles[t.fid]?.avatar_url || DEFAULT_PFP}
                        alt=""
                        style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                      <span>{displayName(profiles[t.fid], t.fid)}</span>
                      <span>·</span>
                      <span>{formatDate(t.created_at)} · {t.status} · {t.reply_count} repl{t.reply_count === 1 ? 'y' : 'ies'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail view */}
          <div className="hl-card" style={{ padding: '16px' }}>
            {!selectedId ? (
              <p style={{ color: 'var(--text-2)' }}>Select a ticket</p>
            ) : loadingDetail ? (
              <p style={{ color: 'var(--text-2)' }}>Loading...</p>
            ) : detail ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-2)', fontSize: '0.8rem', cursor: 'pointer' }}
                    onClick={() => openFarcasterProfile(detail.fid, profiles[detail.fid]?.username ?? null)}
                  >
                    <img
                      src={profiles[detail.fid]?.avatar_url || DEFAULT_PFP}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <span style={{ color: 'var(--text-0)', fontWeight: 500 }}>{displayName(profiles[detail.fid], detail.fid)}</span>
                    <span>· {formatDate(detail.created_at)}</span>
                  </div>
                  <select
                    value={detail.status}
                    onChange={(e) => handleStatusChange(e.target.value as 'open' | 'resolved')}
                    disabled={statusUpdating}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.8rem',
                      background: 'var(--bg-2)',
                      color: 'var(--text-0)',
                      border: '1px solid var(--stroke)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <p style={{ color: 'var(--text-0)', whiteSpace: 'pre-wrap', marginBottom: '12px' }}>{detail.message}</p>
                {detail.images.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    {detail.images.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt=""
                          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '6px' }}
                        />
                      </a>
                    ))}
                  </div>
                )}
                {detail.replies.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ color: 'var(--text-2)', fontSize: '0.75rem', marginBottom: '8px' }}>Replies</div>
                    {detail.replies.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          padding: '8px 10px',
                          background: 'var(--bg-2)',
                          borderRadius: '6px',
                          marginBottom: '6px',
                          borderLeft: '3px solid var(--fire-1)',
                        }}
                      >
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '4px', cursor: 'pointer' }}
                          onClick={() => openFarcasterProfile(r.fid, profiles[r.fid]?.username ?? null)}
                        >
                          <img
                            src={profiles[r.fid]?.avatar_url || DEFAULT_PFP}
                            alt=""
                            style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }}
                          />
                          <span style={{ color: 'var(--text-0)', fontWeight: 500 }}>{displayName(profiles[r.fid], r.fid)}</span>
                          <span>· Admin · {formatDate(r.created_at)}</span>
                        </div>
                        <p style={{ color: 'var(--text-0)', margin: 0, whiteSpace: 'pre-wrap' }}>{r.message}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Reply..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--stroke)',
                      background: 'var(--bg-2)',
                      color: 'var(--text-0)',
                      fontSize: '0.9rem',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      marginBottom: '8px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={replying || !replyMessage.trim()}
                    className="btn-primary"
                    style={{ padding: '8px 16px' }}
                  >
                    {replying ? 'Sending...' : 'Reply'}
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-2)' }}>Could not load ticket</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
