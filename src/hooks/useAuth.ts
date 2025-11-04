/**
 * Custom hook for managing authentication state.
 * Handles auto-sign-in and manual sign-in flows.
 */

import { useState, useEffect, useCallback } from "react";
import { isInWarpcast, signInFromQueryString, signInWithFarcaster } from "~/lib/auth";

interface UseAuthResult {
  fid: number | null;
  username: string | undefined;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for managing authentication state and operations.
 * Automatically attempts sign-in when in Warpcast context.
 */
export function useAuth(onSignInSuccess?: (fid: number) => void): UseAuthResult {
  const [fid, setFid] = useState<number | null>(null);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Perform manual sign-in.
   */
  const signIn = useCallback(async () => {
    setError(null);
    const result = await signInWithFarcaster();

    if (result.ok && result.fid) {
      setFid(result.fid);
      setUsername(result.username);
      onSignInSuccess?.(result.fid);
    } else {
      setError(result.error || "Sign-in failed");
    }
  }, [onSignInSuccess]);

  /**
   * Auto-sign in when opened in Warpcast/Farcaster mini app.
   */
  useEffect(() => {
    const autoSignIn = async () => {
      // Check if we're in a Farcaster/Warpcast context
      if (!isInWarpcast()) {
        setLoading(false);
        return;
      }

      // If we already have an FID, don't try to sign in again
      if (fid) {
        setLoading(false);
        return;
      }

      try {
        setError(null);

        // Try to resolve from query string first (for dev/testing)
        if (typeof window !== "undefined") {
          const qs = window.location.search;
          if (qs) {
            const result = await signInFromQueryString(qs);
            if (result?.ok && result.fid) {
              setFid(result.fid);
              setUsername(result.username);
              setLoading(false);
              onSignInSuccess?.(result.fid);
              return;
            }
          }
        }

        // Auto-sign in using SDK
        const result = await signInWithFarcaster();
        if (result.ok && result.fid) {
          setFid(result.fid);
          setUsername(result.username);
          onSignInSuccess?.(result.fid);
        } else {
          // Silent fail - user can still manually sign in if needed
          console.error("[useAuth] Auto-sign in failed:", result.error);
        }
      } catch (err) {
        // Silent fail - user can still manually sign in if needed
        console.error("[useAuth] Auto-sign in error:", err);
      } finally {
        setLoading(false);
      }
    };

    autoSignIn();
  }, [fid, onSignInSuccess]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    fid,
    username,
    loading,
    error,
    signIn,
    clearError,
  };
}

