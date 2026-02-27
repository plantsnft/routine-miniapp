'use client';

import { useState, useEffect, useRef } from 'react';
import { authedFetch } from '~/lib/authedFetch';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';

type Row = { fid: number; registered_at: string; source?: string | null };

interface BetrGamesRegistrationsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function BetrGamesRegistrationsListModal({
  isOpen,
  onClose,
  token,
}: BetrGamesRegistrationsListModalProps) {
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [rows, setRows] = useState<Row[]>([]);
  const [fetchTime, setFetchTime] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [profiles, setProfiles] = useState<Record<number, { display_name?: string; username?: string; avatar_url?: string }>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !token) return;
    let cancelled = false;
    setLoadState('loading');
    setErrorMessage('');
    setProfiles({});
    (async () => {
      try {
        const res = await authedFetch(
          '/api/admin/betr-games-registrations?limit=500',
          { method: 'GET' },
          token
        );
        const data = await res.json();
        if (cancelled || !mounted.current) return;
        if (!res.ok || !data?.ok) {
          if (res.status === 403) {
            setErrorMessage('Unable to load. You may not have permission.');
          } else {
            setErrorMessage('Unable to load.');
          }
          setLoadState('error');
          return;
        }
        const list = (Array.isArray(data?.data) ? data.data : []) as Row[];
        setRows(list);
        setFetchTime(new Date());

        if (list.length > 0) {
          try {
            const bulkRes = await authedFetch(
              `/api/users/bulk?fids=${list.map((r: Row) => r.fid).join(',')}`,
              { method: 'GET' },
              token
            );
            const bulkData = await bulkRes.json();
            if (cancelled || !mounted.current) return;
            const next: Record<number, { display_name?: string; username?: string; avatar_url?: string }> = {};
            if (bulkRes.ok && Array.isArray(bulkData?.data)) {
              bulkData.data.forEach((u: { fid: number; display_name?: string; username?: string; avatar_url?: string }) => {
                next[u.fid] = { display_name: u.display_name, username: u.username, avatar_url: u.avatar_url };
              });
            }
            if (!cancelled && mounted.current) setProfiles(next);
          } catch {
            if (!cancelled && mounted.current) setProfiles({});
          }
        } else if (!cancelled && mounted.current) {
          setProfiles({});
        }
        if (!cancelled && mounted.current) setLoadState('success');
      } catch (e: unknown) {
        if (!cancelled && mounted.current) {
          const err = e as { message?: string; code?: string };
          if (
            typeof err?.message === 'string' &&
            (err.message.includes('Session') ||
              err.message.includes('expired') ||
              err.message.includes('401'))
          ) {
            setErrorMessage('Session expired. Please refresh.');
          } else if (err?.code === 'AUTH_EXPIRED') {
            setErrorMessage('Session expired. Please refresh.');
          } else {
            setErrorMessage('Unable to load. You may not have permission.');
          }
          setLoadState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, token]);

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
      }}
      onClick={onClose}
    >
      <div
        className="hl-card"
        style={{
          maxWidth: '95%',
          width: '420px',
          maxHeight: '85vh',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-0)' }}>
            BETR GAMES — Registrations
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

        {loadState === 'loading' && (
          <p style={{ color: 'var(--text-1)', marginBottom: '16px' }}>Loading…</p>
        )}

        {loadState === 'error' && (
          <p style={{ color: 'var(--text-1)', marginBottom: '16px' }}>{errorMessage}</p>
        )}

        {loadState === 'success' && (
          <>
            <p style={{ color: 'var(--text-2)', fontSize: '12px', marginBottom: '8px' }}>
              As of {fetchTime ? fetchTime.toLocaleString() : ''}
            </p>
            <p style={{ color: 'var(--text-1)', fontSize: '13px', marginBottom: '12px' }}>
              {rows.length === 0
                ? 'No one has registered yet.'
                : `${rows.length} registered`}
            </p>

            {rows.length > 0 && (
              <div
                style={{
                  overflowY: 'auto',
                  maxHeight: '50vh',
                  marginBottom: '16px',
                  border: '1px solid var(--stroke)',
                  borderRadius: '8px',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-1)' }}>
                    <tr>
                      <th
                        style={{
                          padding: '8px 10px',
                          textAlign: 'right',
                          color: 'var(--text-2)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--stroke)',
                        }}
                      >
                        #
                      </th>
                      <th
                        style={{
                          padding: '8px 10px',
                          textAlign: 'left',
                          color: 'var(--text-2)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--stroke)',
                        }}
                      >
                        Registrant
                      </th>
                      <th
                        style={{
                          padding: '8px 10px',
                          textAlign: 'right',
                          color: 'var(--text-2)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--stroke)',
                        }}
                      >
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={r.fid}
                        style={{
                          borderBottom: '1px solid var(--stroke)',
                          background: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : undefined,
                        }}
                      >
                        <td
                          style={{
                            padding: '6px 10px',
                            textAlign: 'right',
                            color: 'var(--text-1)',
                          }}
                        >
                          {i + 1}
                        </td>
                        <td
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            color: 'var(--text-0)',
                          }}
                        >
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                            onClick={() => openFarcasterProfile(r.fid, profiles[r.fid]?.username ?? null)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(r.fid, profiles[r.fid]?.username ?? null); } }}
                          >
                            {profiles[r.fid]?.avatar_url && (
                              <img
                                src={profiles[r.fid].avatar_url}
                                alt=""
                                className="w-8 h-8 rounded-full"
                                style={{ objectFit: 'cover', flexShrink: 0 }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {profiles[r.fid]
                                ? profiles[r.fid].display_name || profiles[r.fid].username || `FID ${r.fid}`
                                : `FID ${r.fid}`}
                            </span>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '6px 10px',
                            textAlign: 'right',
                            color: 'var(--text-1)',
                          }}
                        >
                          {formatDate(r.registered_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <button onClick={onClose} className="btn-primary" style={{ width: '100%' }}>
          Close
        </button>
      </div>
    </div>
  );
}
