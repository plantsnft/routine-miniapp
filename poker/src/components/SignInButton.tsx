'use client';

import { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import type { SiwnResponse } from '~/lib/types';

const DEV_FID =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEV_FID
    ? Number(process.env.NEXT_PUBLIC_DEV_FID)
    : undefined;

if (process.env.NODE_ENV === "development") {
  // This will show up in the browser console
  // after bundling, since NEXT_PUBLIC_ vars get inlined.
  // It's fine that it logs in dev only.
  // eslint-disable-next-line no-console
  console.log("[SignInButton] DEV_FID", DEV_FID);
}

export function SignInButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ fid: number; username?: string } | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const storedFid = localStorage.getItem('userFid');
    const storedUsername = localStorage.getItem('username');
    if (storedFid) {
      setUser({
        fid: parseInt(storedFid, 10),
        username: storedUsername || undefined,
      });
    }
  }, []);

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if we're in a mini app environment
      const isMiniApp =
        typeof sdk?.isInMiniApp === "function" ? await sdk.isInMiniApp() : false;

      // Handle dev fallback if not in mini app
      if (!isMiniApp) {
        if (!DEV_FID) {
          alert(
            "Sign-in with Farcaster only works inside the Farcaster mini app. For local dev, you can set NEXT_PUBLIC_DEV_FID in .env.local or open the app via the mini app preview."
          );
          setIsLoading(false);
          return;
        }

        // Dev fallback: simulate a sign-in as DEV_FID without using sdk.actions.signIn
        try {
          const fid = DEV_FID;

          // Upsert the user via existing users API
          await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fid }),
          });

          if (typeof window !== "undefined") {
            window.localStorage.setItem("userFid", String(fid));
            window.location.reload();
          }

          return;
        } catch (err) {
          console.error("[SignInButton] Dev sign-in failed", err);
          alert("Dev sign-in failed. Check console for details.");
          setIsLoading(false);
          return;
        }
      }

      // Generate a nonce for SIWN
      const nonce = crypto.randomUUID();

      // Sign in using the miniapp SDK actions
      // The SDK returns { message: string, signature: string } directly
      let signInResult: { message: string; signature: string } | null = null;

      try {
        signInResult = await sdk.actions.signIn({
          nonce,
          acceptAuthAddress: true,
        });
      } catch (signInError: any) {
        if (signInError?.name === 'RejectedByUser' || signInError?.message?.includes('rejected')) {
          console.warn('User rejected sign-in');
          setError('Sign-in was cancelled');
          setIsLoading(false);
          return;
        }
        console.error('Mini app signIn failed', signInError);
        setError('Sign-in failed. If you are testing in a normal browser, try inside the Farcaster mini app.');
        setIsLoading(false);
        return;
      }

      if (!signInResult || !signInResult.message || !signInResult.signature) {
        console.error('signIn returned invalid result:', signInResult);
        setError('Sign-in not available in this environment.');
        setIsLoading(false);
        return;
      }

      const { message, signature } = signInResult;

      // Verify with backend using the existing SIWN route
      const response = await fetch('/api/siwn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          signature,
          nonce,
        }),
      });

      const data: SiwnResponse = await response.json();

      if (!data.ok || !data.fid) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Create/update user record
      const userResponse = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: data.fid,
          username: data.username,
        }),
      });

      if (!userResponse.ok) {
        throw new Error('Failed to create user record');
      }

      const userData = { fid: data.fid, username: data.username };
      setUser(userData);
      
      // Store in localStorage for persistence
      localStorage.setItem('userFid', String(data.fid));
      if (data.username) {
        localStorage.setItem('username', data.username);
      }

      // Reload to refresh server components
      window.location.reload();
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setError(err.message || 'Sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (user) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-green-800">
          Signed in as {user.username || `FID ${user.fid}`}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <button
        onClick={handleSignIn}
        disabled={isLoading}
        className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Signing in...' : 'Sign in with Farcaster'}
      </button>
      {error && (
        <p className="mt-2 text-red-600 text-sm">{error}</p>
      )}
    </div>
  );
}
