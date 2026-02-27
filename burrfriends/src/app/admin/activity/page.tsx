'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isAdmin as checkIsAdmin } from '~/lib/admin';
import { formatRelativeTime } from '~/lib/utils';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';

interface ActivityEvent {
  type: 'game_created' | 'signup' | 'settlement';
  game_type: string;
  game_id: string;
  fid?: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  prize_amount?: number;
  timestamp: string;
}

const GAME_TYPE_LABELS: Record<string, string> = {
  betr_guesser: 'BETR GUESSER',
  buddy_up: 'BUDDY UP',
  the_mole: 'THE MOLE',
  steal_no_steal: 'STEAL OR NO STEAL',
  jenga: 'JENGA',
  remix_betr: 'REMIX BETR',
  weekend_game: 'WEEKEND GAME',
  poker: 'POKER',
  superbowl_squares: 'SUPERBOWL SQUARES',
  superbowl_props: 'SUPERBOWL PROPS',
  bullied: 'BULLIED',
  in_or_out: 'IN OR OUT',
  take_from_the_pile: 'TAKE FROM THE PILE',
  kill_or_keep: 'KILL OR KEEP',
  nl_holdem: 'NL HOLDEM',
  art_contest: 'TO SPINFINITY AND BEYOND ART CONTEST',
  sunday_high_stakes: 'SUNDAY HIGH STAKES ARE BETR',
  ncaa_hoops: 'NCAA HOOPS',
};

export default function ActivityPage() {
  const { fid, status: authStatus, token } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (authStatus === 'authed' && fid) {
      setIsAdmin(checkIsAdmin(fid));
    }
  }, [authStatus, fid]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    loadEvents(0);
  }, [token, isAdmin]);

  const loadEvents = async (newOffset: number) => {
    if (newOffset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await authedFetch(`/api/admin/activity-feed?limit=50&offset=${newOffset}`, {}, token!);
      const data = await res.json();

      if (data.ok) {
        if (newOffset === 0) {
          setEvents(data.data.events);
        } else {
          setEvents(prev => [...prev, ...data.data.events]);
        }
        setHasMore(data.data.hasMore);
        setOffset(newOffset + 50);
      }
    } catch (e) {
      console.error('Failed to load activity:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto text-center">
          <p style={{ color: 'var(--text-1)' }}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!fid || !isAdmin) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto text-center">
          <h1 style={{ color: 'var(--text-0)', marginBottom: '16px' }}>Activity Log</h1>
          <p style={{ color: 'var(--text-1)' }}>Admin access required</p>
          <Link href="/admin/dashboard" className="btn-primary" style={{ marginTop: '16px', display: 'inline-block' }}>
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'game_created': return '🎮';
      case 'signup': return '👤';
      case 'settlement': return '💰';
      default: return '📋';
    }
  };

  const getEventLabel = (event: ActivityEvent) => {
    const gameLabel = GAME_TYPE_LABELS[event.game_type] || event.game_type;
    switch (event.type) {
      case 'game_created':
        return `${gameLabel} game created`;
      case 'signup':
        const name = event.display_name || event.username || `FID ${event.fid}`;
        return `${name} signed up for ${gameLabel}`;
      case 'settlement':
        return `${gameLabel} settled (${event.prize_amount?.toLocaleString() || 0} BETR)`;
      default:
        return 'Unknown event';
    }
  };

  return (
    <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-3xl mx-auto">
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.5rem' }}>ACTIVITY LOG</h1>
          <Link href="/admin/dashboard" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>
            ← Back to Dashboard
          </Link>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-1)', textAlign: 'center' }}>Loading activity...</p>
        ) : events.length === 0 ? (
          <p style={{ color: 'var(--text-1)', textAlign: 'center' }}>No activity yet</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {events.map((event, idx) => (
                <div
                  key={`${event.type}-${event.game_id}-${event.timestamp}-${idx}`}
                  className="hl-card"
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  <span style={{ fontSize: '1.25rem' }}>{getEventIcon(event.type)}</span>
                  
                  {event.type === 'signup' && event.pfp_url && (
                    <Image
                      src={event.pfp_url}
                      alt=""
                      width={32}
                      height={32}
                      style={{ borderRadius: '50%' }}
                    />
                  )}
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-0)', fontSize: '0.875rem' }}>
                      {event.type === 'signup' && event.fid != null ? (
                        <>
                          <span
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => openFarcasterProfile(event.fid!, event.username ?? null)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFarcasterProfile(event.fid!, event.username ?? null); } }}
                          >
                            {event.display_name || event.username || `FID ${event.fid}`}
                          </span>
                          {' signed up for '}
                          {GAME_TYPE_LABELS[event.game_type] || event.game_type}
                        </>
                      ) : (
                        getEventLabel(event)
                      )}
                    </div>
                    <div style={{ color: 'var(--text-2)', fontSize: '0.75rem' }}>
                      {formatRelativeTime(event.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button
                  onClick={() => loadEvents(offset)}
                  disabled={loadingMore}
                  className="btn-secondary"
                  style={{ padding: '10px 24px' }}
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
