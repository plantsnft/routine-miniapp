'use client';

import { useState, useEffect } from 'react';
import { authedFetch } from '~/lib/authedFetch';
import { useAuth } from './AuthProvider';

interface PlayerStatsData {
  fid: number;
  games_played: number;
  games_won: number;
  total_winnings: number;
  net_profit: number;
  // Phase 5: Removed total_entry_fees (no entry fees in prize-based games)
}

interface PlayerStatsProps {
  fid?: number; // Optional: if not provided, uses current user's FID
  compact?: boolean; // If true, shows compact version
}

export function PlayerStats({ fid: propFid, compact = false }: PlayerStatsProps) {
  const { fid: currentFid, token, status: authStatus } = useAuth();
  const [stats, setStats] = useState<PlayerStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use provided fid or current user's fid
  const targetFid = propFid || currentFid;

  useEffect(() => {
    if (authStatus === 'loading') {
      return;
    }

    if (!targetFid || !token) {
      setLoading(false);
      return;
    }

    fetchStats();
  }, [targetFid, token, authStatus]);

  const fetchStats = async () => {
    if (!targetFid || !token) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await authedFetch(`/api/stats?fid=${targetFid}`, {
        method: 'GET',
      }, token);

      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.error?.includes('not found') || data.data === null) {
          // No stats found - this is okay, user just hasn't played yet
          setStats(null);
        } else {
          setError(data.error || 'Failed to fetch stats');
        }
      } else {
        setStats(data.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="hl-card" style={{ padding: compact ? '1rem' : '1.5rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading stats...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hl-card" style={{ padding: compact ? '1rem' : '1.5rem', borderColor: 'var(--fire-2)' }}>
        <p style={{ color: 'var(--fire-2)' }}>{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="hl-card" style={{ padding: compact ? '1rem' : '1.5rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>No stats available yet. Play some games to see your statistics!</p>
      </div>
    );
  }

  // Calculate derived stats
  const winRate = stats.games_played > 0 
    ? ((stats.games_won / stats.games_played) * 100).toFixed(1)
    : '0.0';
  
  // Phase 5: No entry fees, so ROI is not applicable (removed ROI calculation)

  // Format BETR amounts
  const formatBETR = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (compact) {
    return (
      <div className="hl-card" style={{ padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.875rem' }}>
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Games Played</p>
            <p style={{ color: 'var(--text-0)', fontWeight: 600 }}>{stats.games_played}</p>
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Games Won</p>
            <p style={{ color: 'var(--text-0)', fontWeight: 600 }}>{stats.games_won}</p>
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Win Rate</p>
            <p style={{ color: 'var(--text-0)', fontWeight: 600 }}>{winRate}%</p>
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Net Profit</p>
            <p style={{ 
              color: stats.net_profit >= 0 ? 'var(--teal-1)' : 'var(--fire-2)', 
              fontWeight: 600 
            }}>
              {stats.net_profit >= 0 ? '+' : ''}{formatBETR(stats.net_profit)} BETR
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hl-card" style={{ padding: '1.5rem' }}>
      <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-0)' }}>
        Player Statistics
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Games Played</p>
          <p style={{ color: 'var(--text-0)', fontSize: '1.5rem', fontWeight: 700 }}>{stats.games_played}</p>
        </div>

        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Games Won</p>
          <p style={{ color: 'var(--text-0)', fontSize: '1.5rem', fontWeight: 700 }}>{stats.games_won}</p>
        </div>

        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Win Rate</p>
          <p style={{ color: 'var(--text-0)', fontSize: '1.5rem', fontWeight: 700 }}>{winRate}%</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Total Winnings</p>
          <p style={{ color: 'var(--text-0)', fontSize: '1.25rem', fontWeight: 600 }}>
            {formatBETR(stats.total_winnings)} BETR
          </p>
        </div>

        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Net Profit</p>
          <p style={{ 
            color: stats.net_profit >= 0 ? 'var(--teal-1)' : 'var(--fire-2)', 
            fontSize: '1.25rem', 
            fontWeight: 600 
          }}>
            {stats.net_profit >= 0 ? '+' : ''}{formatBETR(stats.net_profit)} BETR
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            (no entry fees)
          </p>
        </div>
      </div>
    </div>
  );
}
