/**
 * Shared React hooks for common patterns
 */

import { useState, useEffect } from 'react';
import type { User } from './types';

/**
 * Hook to get current user from localStorage and API
 * Returns user data if available, null otherwise
 */
export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userFid = localStorage.getItem('userFid');
        if (!userFid) {
          setLoading(false);
          return;
        }

        const userRes = await fetch(`/api/users?fid=${userFid}`);
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData.data);
        }
      } catch (err) {
        console.error('[useCurrentUser] Error loading user:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  return { user, loading, userFid: user?.fid ?? null };
}

/**
 * Simple hook to get user FID from localStorage (no API call)
 */
export function useUserFid(): number | null {
  const [fid, setFid] = useState<number | null>(null);

  useEffect(() => {
    const storedFid = localStorage.getItem('userFid');
    if (storedFid) {
      setFid(parseInt(storedFid, 10));
    }
  }, []);

  return fid;
}

