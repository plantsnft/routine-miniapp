'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isGlobalAdmin } from '~/lib/permissions';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';

interface UserBlock {
  fid: number;
  is_blocked: boolean;
  blocked_by_fid: number;
  reason?: string | null;
  blocked_at: string;
  updated_at: string;
}

interface UserProfile {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
}

interface SearchResult {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
}

export default function AdminUsersPage() {
  const { fid: currentFid, status: authStatus, token, retry } = useAuth();
  const [blocks, setBlocks] = useState<UserBlock[]>([]);
  const [profiles, setProfiles] = useState<Record<number, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Block form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Blocked users search
  const [blockedSearchQuery, setBlockedSearchQuery] = useState('');
  
  // Countdown to next 2 AM UTC refresh
  const [nextRefreshCountdown, setNextRefreshCountdown] = useState('');
  
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  // Calculate countdown to next 2 AM UTC
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const next2AM = new Date(now);
      next2AM.setUTCHours(2, 0, 0, 0);
      if (now.getTime() >= next2AM.getTime()) {
        next2AM.setUTCDate(next2AM.getUTCDate() + 1);
      }
      const diff = next2AM.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setNextRefreshCountdown(`${hours}h ${mins}m`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (authStatus === 'loading') {
      setLoading(true);
      setError(null);
      return;
    }
    
    if (authStatus === 'authed' && currentFid && token) {
      if (isGlobalAdmin(currentFid)) {
        setIsAuthorized(true);
        loadBlocks();
      } else {
        setIsAuthorized(false);
        setError('Not authorized. Only global admins can access this page.');
        setLoading(false);
      }
    } else if (authStatus === 'error') {
      setError(null);
      setLoading(false);
    } else {
      setError(null);
      setLoading(false);
    }
  }, [authStatus, currentFid, token]);

  const loadBlocks = async () => {
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await authedFetch('/api/admin/blocks', { method: 'GET' }, token);

      if (!res.ok) {
        if (res.status === 403) {
          setError('Only global admins can access this page');
        } else {
          setError('Failed to load blocklist');
        }
        return;
      }

      const data = await res.json();
      if (data.ok) {
        setBlocks(data.data || []);
        loadProfiles(data.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load blocklist');
    } finally {
      setLoading(false);
    }
  };

  const loadProfiles = async (blockList: UserBlock[]) => {
    const fids = blockList.map(b => b.fid);
    if (fids.length === 0) return;
    if (!token) return;

    try {
      const res = await authedFetch(`/api/users/bulk?fids=${fids.join(',')}`, { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          const profilesMap: Record<number, UserProfile> = {};
          (Array.isArray(data.data) ? data.data : [data.data]).forEach((user: any) => {
            if (user.fid) {
              profilesMap[user.fid] = {
                fid: user.fid,
                username: user.username,
                display_name: user.display_name,
                pfp_url: user.pfp_url || user.avatar_url,
              };
            }
          });
          setProfiles(profilesMap);
        }
      }
    } catch (err) {
      console.warn('Failed to load user profiles:', err);
    }
  };

  // User search for blocking
  const searchUsers = useCallback(async (query: string) => {
    if (!token || query.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const res = await authedFetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`, { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.data) {
          setSearchResults(data.data);
          setShowDropdown(true);
        }
      }
    } catch (err) {
      console.warn('User search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [token]);

  // Debounce search
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchUsers]);

  const handleSelectUser = (user: SearchResult) => {
    setSelectedUser(user);
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  const handleClearSelection = () => {
    setSelectedUser(null);
    setSearchQuery('');
  };

  const handleBlock = async () => {
    if (!token || !selectedUser) {
      setError('Please select a user to block');
      return;
    }

    try {
      setBlocking(true);
      setError(null);

      const res = await authedFetch('/api/admin/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: selectedUser.fid }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to block user');
        return;
      }

      setSelectedUser(null);
      await loadBlocks();
    } catch (err: any) {
      setError(err.message || 'Failed to block user');
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblock = async (targetFid: number) => {
    if (!token) {
      setError('Not authenticated');
      return;
    }

    try {
      const res = await authedFetch(`/api/admin/blocks/${targetFid}`, { method: 'DELETE' }, token);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to unblock user');
        return;
      }
      await loadBlocks();
    } catch (err: any) {
      setError(err.message || 'Failed to unblock user');
    }
  };

  // Filter blocked users by search query
  const filteredBlocks = blockedSearchQuery.trim()
    ? blocks.filter(block => {
        const profile = profiles[block.fid];
        const query = blockedSearchQuery.toLowerCase();
        const name = profile?.display_name?.toLowerCase() || '';
        const username = profile?.username?.toLowerCase() || '';
        const fidStr = String(block.fid);
        return name.includes(query) || username.includes(query) || fidStr.includes(query);
      })
    : [];

  // Loading states
  if (authStatus === 'loading' || (loading && !blocks.length && !error)) {
    return (
      <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p style={{ color: 'var(--text-1)' }}>Loading...</p>
        </div>
      </main>
    );
  }

  if (authStatus === 'error') {
    return (
      <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p style={{ color: '#ef4444', marginBottom: '16px' }}>Authentication failed.</p>
          <button onClick={retry} className="btn-primary">Retry</button>
        </div>
      </main>
    );
  }

  if (authStatus === 'authed' && isAuthorized === false) {
    return (
      <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-2xl mx-auto">
          <p style={{ color: '#ef4444' }}>Not authorized. Only global admins can access this page.</p>
          <Link href="/admin/dashboard" style={{ color: 'var(--fire-1)', marginTop: '16px', display: 'inline-block' }}>
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <h1 style={{ color: 'var(--text-0)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '16px' }}>
          ADMIN: USER BLOCKLIST
        </h1>
        
        <Link href="/admin/dashboard" style={{ color: 'var(--fire-1)', fontSize: '0.875rem', marginBottom: '24px', display: 'inline-block' }}>
          ← Back to Dashboard
        </Link>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#ef4444', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Block User Section */}
        <div className="hl-card" style={{ padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ color: 'var(--text-0)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Block User
          </h3>
          
          {selectedUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              {selectedUser.pfp_url && (
                <img src={selectedUser.pfp_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
              )}
              <div style={{ flex: 1 }}>
                <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>
                  {selectedUser.display_name || selectedUser.username || `FID ${selectedUser.fid}`}
                </span>
                {selectedUser.username && (
                  <span style={{ color: 'var(--text-1)', marginLeft: '8px' }}>@{selectedUser.username}</span>
                )}
                <span style={{ color: 'var(--text-1)', marginLeft: '8px' }}>• FID: {selectedUser.fid}</span>
              </div>
              <button onClick={handleClearSelection} style={{ color: 'var(--text-1)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>✕</button>
              <button
                onClick={handleBlock}
                disabled={blocking}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontWeight: 600,
                  cursor: blocking ? 'not-allowed' : 'pointer',
                  opacity: blocking ? 0.5 : 1,
                }}
              >
                {blocking ? 'Blocking...' : 'Block'}
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder="Search by username..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--bg-2)',
                  borderRadius: '6px',
                  color: 'var(--text-0)',
                  fontSize: '0.875rem',
                }}
              />
              {searching && (
                <span style={{ position: 'absolute', right: '12px', top: '10px', color: 'var(--text-1)', fontSize: '0.75rem' }}>Searching...</span>
              )}
              
              {showDropdown && searchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  zIndex: 10,
                  width: '100%',
                  marginTop: '4px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--bg-2)',
                  borderRadius: '6px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}>
                  {searchResults.map((user) => (
                    <div
                      key={user.fid}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectUser(user)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectUser(user); } }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); openFarcasterProfile(user.fid, user.username ?? null); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1, minWidth: 0 }}
                      >
                        {user.pfp_url ? (
                          <img src={user.pfp_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                        ) : (
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-2)' }} />
                        )}
                        <div>
                          <div style={{ color: 'var(--text-0)', fontWeight: 500, fontSize: '0.875rem' }}>
                            {user.display_name || user.username || `FID ${user.fid}`}
                          </div>
                          <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>
                            {user.username && `@${user.username} • `}FID: {user.fid}
                          </div>
                        </div>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Burr's Blocks Section */}
        <div className="hl-card" style={{ padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ color: 'var(--text-0)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Burr&apos;s Blocks
          </h3>
          <p style={{ color: 'var(--text-1)', fontSize: '0.875rem', margin: 0 }}>
            Synced from Burr&apos;s Farcaster blocks. Next refresh in: <span style={{ color: 'var(--fire-1)' }}>{nextRefreshCountdown}</span>
          </p>
        </div>

        {/* Blocked Users Section */}
        <div className="hl-card" style={{ padding: '16px' }}>
          <h3 style={{ color: 'var(--text-0)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            {blocks.length} Blocked Users
          </h3>
          
          <input
            type="text"
            value={blockedSearchQuery}
            onChange={(e) => setBlockedSearchQuery(e.target.value)}
            placeholder="Search blocked users..."
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--bg-1)',
              border: '1px solid var(--bg-2)',
              borderRadius: '6px',
              color: 'var(--text-0)',
              fontSize: '0.875rem',
              marginBottom: '12px',
            }}
          />

          {blockedSearchQuery.trim() && filteredBlocks.length === 0 && (
            <p style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>No matching users found.</p>
          )}

          {filteredBlocks.map((block) => {
            const profile = profiles[block.fid];
            return (
              <div
                key={block.fid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--bg-2)',
                }}
              >
                <span
                  onClick={() => openFarcasterProfile(block.fid, profile?.username ?? null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, cursor: 'pointer' }}
                >
                  {profile?.pfp_url ? (
                    <img src={profile.pfp_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-2)' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>
                      {profile?.display_name || profile?.username || `FID ${block.fid}`}
                    </span>
                    {profile?.username && (
                      <span style={{ color: 'var(--text-1)', marginLeft: '8px' }}>@{profile.username}</span>
                    )}
                    <span style={{ color: 'var(--text-1)', marginLeft: '8px' }}>• FID: {block.fid}</span>
                  </div>
                </span>
                <button
                  onClick={() => handleUnblock(block.fid)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--fire-1)',
                    color: 'var(--fire-1)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Unblock
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
