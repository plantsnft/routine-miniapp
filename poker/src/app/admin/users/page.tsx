'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isGlobalAdmin } from '~/lib/permissions';
import { formatDate } from '~/lib/utils';

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

export default function AdminUsersPage() {
  const { fid: currentFid, status: authStatus, token, retry } = useAuth();
  const [blocks, setBlocks] = useState<UserBlock[]>([]);
  const [profiles, setProfiles] = useState<Record<number, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockFid, setBlockFid] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (authStatus === 'loading') {
      // Still loading auth - wait
      setLoading(true);
      setError(null);
      return;
    }
    
    if (authStatus === 'authed' && currentFid && token) {
      // Check if user is global admin
      if (isGlobalAdmin(currentFid)) {
        setIsAuthorized(true);
        loadBlocks();
      } else {
        setIsAuthorized(false);
        setError('Not authorized. Only global admins can access this page.');
        setLoading(false);
      }
    } else if (authStatus === 'error') {
      // Auth failed - show retry option
      setError(null); // Clear any previous errors
      setLoading(false);
    } else {
      // Not authed (shouldn't happen if status is correct, but handle gracefully)
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
        // Load profiles for blocked users (non-blocking)
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

    try {
      // Batch fetch profiles from Neynar (non-blocking, fail gracefully)
      const res = await fetch(`/api/users?fids=${fids.join(',')}`);
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
      // Non-blocking - just log
      console.warn('Failed to load user profiles:', err);
    }
  };

  const handleBlock = async () => {
    if (!token) {
      setError('Not authenticated');
      return;
    }

    const fidNum = parseInt(blockFid, 10);
    if (isNaN(fidNum)) {
      setError('Invalid FID');
      return;
    }

    try {
      setBlocking(true);
      setError(null);

      const res = await authedFetch('/api/admin/blocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fid: fidNum,
          reason: blockReason || undefined,
        }),
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to block user');
        return;
      }

      // Refresh blocklist
      setBlockFid('');
      setBlockReason('');
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
      const res = await authedFetch(`/api/admin/blocks/${targetFid}`, {
        method: 'DELETE',
      }, token);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to unblock user');
        return;
      }

      // Refresh blocklist
      await loadBlocks();
    } catch (err: any) {
      setError(err.message || 'Failed to unblock user');
    }
  };

  // Show loading state while auth is loading
  if (authStatus === 'loading' || (loading && !blocks.length && !error)) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-black">Signing in...</p>
        </div>
      </main>
    );
  }

  // Show error state with retry button if auth failed
  if (authStatus === 'error') {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600 mb-4">Authentication failed. Please try again.</p>
          <button
            onClick={retry}
            className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
          >
            Retry sign-in
          </button>
          <Link href="/" className="mt-4 ml-4 inline-block text-primary hover:underline">
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  // Show not authorized if authed but not admin
  if (authStatus === 'authed' && isAuthorized === false) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600 mb-4">Not authorized. Only global admins can access this page.</p>
          <Link href="/" className="mt-4 inline-block text-primary hover:underline">
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  // Show error if we have an error and no blocks loaded
  if (error && !blocks.length && authStatus === 'authed') {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Error: {error}</p>
          <Link href="/" className="mt-4 inline-block text-primary hover:underline">
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-primary hover:underline mb-4 inline-block">
          ← Back to Home
        </Link>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h1 className="text-3xl font-bold mb-6 text-black">Admin: User Blocklist</h1>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          {/* Block User Form */}
          <div className="mb-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-black">Block User</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">FID</label>
                <input
                  type="number"
                  value={blockFid}
                  onChange={(e) => setBlockFid(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Enter FID to block"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Reason (optional)</label>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Optional reason for blocking"
                  rows={3}
                />
              </div>
              <button
                onClick={handleBlock}
                disabled={blocking || !blockFid}
                className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {blocking ? 'Blocking...' : 'Block User'}
              </button>
            </div>
          </div>

          {/* Blocked Users List */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-black">Blocked Users ({blocks.length})</h2>
            {blocks.length === 0 ? (
              <p className="text-black">No blocked users</p>
            ) : (
              <div className="space-y-4">
                {blocks.map((block) => {
                  const profile = profiles[block.fid];
                  return (
                    <div
                      key={block.fid}
                      className="p-4 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {profile?.pfp_url && (
                              <img
                                src={profile.pfp_url}
                                alt=""
                                className="w-10 h-10 rounded-full"
                              />
                            )}
                            <div>
                              <p className="font-semibold">
                                {profile?.display_name || profile?.username || `FID ${block.fid}`}
                              </p>
                              <p className="text-sm text-black">FID: {block.fid}</p>
                            </div>
                          </div>
                          {block.reason && (
                            <p className="text-sm text-gray-700 mb-2">
                              <strong>Reason:</strong> {block.reason}
                            </p>
                          )}
                          <p className="text-xs text-gray-500">
                            Blocked at: {formatDate(block.blocked_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleUnblock(block.fid)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                        >
                          Unblock
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

