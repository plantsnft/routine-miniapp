'use client';

/**
 * AuthProvider - Manages Quick Auth authentication state for Poker mini app
 * 
 * This provider:
 * - Waits for sdk.actions.ready()
 * - Calls sdk.quickAuth.getToken() on mount
 * - Stores token in memory and sessionStorage (key: pokerAuthToken)
 * - Verifies token with /api/auth/verify
 * - Provides auth state via context
 * 
 * Usage:
 * - Wrap app in <AuthProvider>
 * - Use useAuth() hook to access auth state
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

const AUTH_TOKEN_KEY = 'pokerAuthToken';

export interface AuthProfile {
  fid: number;
  username?: string;
  pfpUrl?: string;
}

export type AuthStatus = 'loading' | 'authed' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  fid: number | null;
  profile: AuthProfile | null;
  retry: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  /**
   * Verify token with backend and update profile
   */
  const verifyToken = useCallback(async (authToken: string) => {
    const DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === '1';
    
    try {
      if (DEBUG) console.log('[AuthProvider] Verifying token with /api/auth/verify...');
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: authToken }),
      });

      if (DEBUG) console.log('[AuthProvider] /api/auth/verify status:', response.status);
      
      const data = await response.json();
      
      if (DEBUG) console.log('[AuthProvider] /api/auth/verify response keys:', Object.keys(data));

      if (data.ok && data.fid) {
        const profileData = {
          fid: data.fid,
          username: data.username,
          pfpUrl: data.pfpUrl,
        };
        if (DEBUG) console.log('[AuthProvider] Verification successful, setting profile:', { fid: profileData.fid, hasUsername: !!profileData.username });
        setProfile(profileData);
        setStatus('authed'); // CRITICAL: Set status to 'authed' BEFORE returning
        return true;
      } else {
        if (DEBUG) console.error('[AuthProvider] Token verification failed:', data.error);
        // Don't set status here - let caller handle retry logic
        return false;
      }
    } catch (error) {
      if (DEBUG) console.error('[AuthProvider] Token verification error:', error);
      // Don't set status here - let caller handle retry logic
      return false;
    }
  }, []);

  /**
   * Attempt to authenticate using Quick Auth with automatic retry
   */
  const attemptAuth = useCallback(async (isRetry = false) => {
    const DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === '1';
    
    try {
      setStatus('loading');

      // 1. Check if we're in a Mini App context
      let isInMiniApp = false;
      try {
        isInMiniApp = typeof sdk.isInMiniApp === 'function' && await sdk.isInMiniApp();
        if (DEBUG) console.log('[AuthProvider] isInMiniApp:', isInMiniApp);
      } catch (e) {
        if (DEBUG) console.warn('[AuthProvider] isInMiniApp check failed:', e);
      }

      // 2. Wait for SDK to be ready
      if (DEBUG) console.log('[AuthProvider] Waiting for sdk.actions.ready()...');
      await sdk.actions.ready();
      if (DEBUG) console.log('[AuthProvider] sdk.actions.ready() completed');

      // 3. Try to get token from sessionStorage first (for page reloads)
      if (typeof window !== 'undefined') {
        const storedToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
        if (storedToken) {
          if (DEBUG) console.log('[AuthProvider] Found stored token, verifying...');
          const isValid = await verifyToken(storedToken);
          if (isValid) {
            setToken(storedToken);
            if (DEBUG) console.log('[AuthProvider] Stored token verified, auth successful');
            return; // Successfully authenticated with stored token
          } else {
            // Stored token is invalid, clear it
            if (DEBUG) console.log('[AuthProvider] Stored token invalid, clearing...');
            sessionStorage.removeItem(AUTH_TOKEN_KEY);
          }
        }
      }

      // 4. Get new token from Quick Auth
      if (DEBUG) console.log('[AuthProvider] Calling sdk.quickAuth.getToken()...');
      let newToken: string | undefined;
      try {
        const result = await sdk.quickAuth.getToken();
        newToken = result.token;
        if (DEBUG) console.log('[AuthProvider] getToken() succeeded, token length:', newToken?.length || 0);
      } catch (getTokenError: any) {
        if (DEBUG) console.error('[AuthProvider] getToken() failed:', getTokenError);
        if (!isRetry) {
          if (DEBUG) console.log('[AuthProvider] First getToken() attempt failed, retrying in 400ms...');
          await new Promise(resolve => setTimeout(resolve, 400));
          // Retry the entire auth flow
          return attemptAuth(true);
        }
        throw getTokenError;
      }
      
      if (newToken) {
        // Store token in sessionStorage
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(AUTH_TOKEN_KEY, newToken);
        }

        // Verify token and set profile
        const isValid = await verifyToken(newToken);
        if (isValid) {
          setToken(newToken);
          if (DEBUG) console.log('[AuthProvider] Token verified, auth successful');
        } else {
          if (DEBUG) console.error('[AuthProvider] Token verification failed');
          // If not a retry, try once more
          if (!isRetry) {
            if (DEBUG) console.log('[AuthProvider] First verification failed, retrying in 400ms...');
            await new Promise(resolve => setTimeout(resolve, 400));
            return attemptAuth(true);
          }
          setStatus('error');
        }
      } else {
        if (DEBUG) console.warn('[AuthProvider] Quick Auth returned no token');
        // If not a retry, try once more
        if (!isRetry) {
          if (DEBUG) console.log('[AuthProvider] First attempt returned no token, retrying in 400ms...');
          await new Promise(resolve => setTimeout(resolve, 400));
          return attemptAuth(true);
        }
        setStatus('error');
      }
    } catch (error: any) {
      if (DEBUG) console.error('[AuthProvider] Authentication failed:', error);
      // If not a retry, try once more
      if (!isRetry) {
        if (DEBUG) console.log('[AuthProvider] First attempt threw error, retrying in 400ms...', error.message);
        await new Promise(resolve => setTimeout(resolve, 400));
        return attemptAuth(true);
      }
      setStatus('error');
    }
  }, [verifyToken]);

  /**
   * Retry authentication
   */
  const retry = useCallback(async () => {
    await attemptAuth(false); // Start fresh (not a retry)
  }, [attemptAuth]);

  /**
   * Logout - clear auth state and sessionStorage
   */
  const logout = useCallback(() => {
    setToken(null);
    setProfile(null);
    setStatus('error');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }, []);

  // Attempt auth on mount
  useEffect(() => {
    attemptAuth();
  }, [attemptAuth]);

  const value: AuthContextValue = {
    status,
    token,
    fid: profile?.fid || null,
    profile,
    retry,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

