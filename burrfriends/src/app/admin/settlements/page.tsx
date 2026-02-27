'use client';

/**
 * /admin/settlements
 * Full settlement history with pagination
 * 
 * Phase 18.4: Settlement History Page
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isAdmin as checkIsAdmin } from '~/lib/admin';
import { formatRelativeTime } from '~/lib/utils';

interface Settlement {
  game_type: string;
  game_id: string;
  prize_amount: number;
  tx_hash: string | null;
  settled_at: string;
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

export default function SettlementsPage() {
  const { fid, status: authStatus, token } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (authStatus === 'authed' && fid) {
      setIsAdmin(checkIsAdmin(fid));
    }
  }, [authStatus, fid]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    loadSettlements(0);
  }, [token, isAdmin]);

  const loadSettlements = async (newOffset: number) => {
    if (newOffset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await authedFetch(`/api/admin/settlement-history?limit=50&offset=${newOffset}`, {}, token!);
      const data = await res.json();

      if (data.ok) {
        if (newOffset === 0) {
          setSettlements(data.data.settlements);
        } else {
          setSettlements(prev => [...prev, ...data.data.settlements]);
        }
        setHasMore(data.data.hasMore);
        setTotal(data.data.total || 0);
        setOffset(newOffset + 50);
      }
    } catch (e) {
      console.error('Failed to load settlements:', e);
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
          <h1 style={{ color: 'var(--text-0)', marginBottom: '16px' }}>Access Denied</h1>
          <p style={{ color: 'var(--text-1)', marginBottom: '16px' }}>Admin access required.</p>
          <Link href="/clubs/burrfriends/games" style={{ color: 'var(--fire-1)' }}>
            ← Back to Games
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ color: 'var(--text-0)', margin: '0 0 8px 0', fontSize: '1.5rem' }}>
            SETTLEMENT HISTORY
          </h1>
          <Link href="/admin/dashboard" style={{ color: 'var(--fire-1)', fontSize: '0.875rem' }}>
            ← Back to Dashboard
          </Link>
        </div>

        {/* Total count */}
        {total > 0 && (
          <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', marginBottom: '16px' }}>
            {total} total settlements
          </p>
        )}

        {/* Settlements Table */}
        <div className="hl-card" style={{ padding: '16px' }}>
          {loading ? (
            <p style={{ color: 'var(--text-1)', textAlign: 'center' }}>Loading settlements...</p>
          ) : settlements.length === 0 ? (
            <p style={{ color: 'var(--text-1)', textAlign: 'center' }}>No settlements found</p>
          ) : (
            <>
              {/* Table Header */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 100px 120px 60px', 
                gap: '8px', 
                padding: '8px 0', 
                borderBottom: '1px solid var(--stroke)',
                fontSize: '0.75rem',
                color: 'var(--text-2)',
                textTransform: 'uppercase',
              }}>
                <span>Game Type</span>
                <span style={{ textAlign: 'right' }}>Amount</span>
                <span style={{ textAlign: 'right' }}>Date</span>
                <span style={{ textAlign: 'center' }}>Tx</span>
              </div>

              {/* Table Body */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {settlements.map((s, idx) => (
                  <div 
                    key={`${s.game_type}-${s.game_id}-${idx}`} 
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 100px 120px 60px', 
                      gap: '8px', 
                      padding: '12px 0',
                      borderBottom: '1px solid var(--bg-2)',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span style={{ color: 'var(--text-0)' }}>
                      {GAME_TYPE_LABELS[s.game_type] || s.game_type}
                    </span>
                    <span style={{ color: 'var(--fire-1)', fontWeight: 600, textAlign: 'right' }}>
                      {s.prize_amount.toLocaleString()}
                    </span>
                    <span style={{ color: 'var(--text-2)', textAlign: 'right' }}>
                      {formatRelativeTime(s.settled_at)}
                    </span>
                    <span style={{ textAlign: 'center' }}>
                      {s.tx_hash ? (
                        <a
                          href={`https://basescan.org/tx/${s.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--fire-1)' }}
                        >
                          🔗
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-2)' }}>—</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <button
                    onClick={() => loadSettlements(offset)}
                    disabled={loadingMore}
                    className="btn-primary"
                    style={{ padding: '10px 24px' }}
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
