'use client';

/**
 * AppGate - BETR WITH BURR access control
 *
 * Gates the entire app. Users can access only if:
 * - Neynar score >= 0.6, OR
 * - Staked 50M+ $BETR (via Betrmint)
 *
 * When status !== 'authed', renders children (no gate check).
 * When status === 'authed', calls /api/auth/gate and shows overlay if denied.
 * On API error: fail open (render children).
 */

import { useEffect, useState, useRef } from 'react';
import { useAuth } from './AuthProvider';

const GATE_DENIED_MESSAGE =
  'A neynar score of 0.60 is required BETR WITH BURR app unless you are staking 50m $BETR';

type GateState = 'idle' | 'checking' | 'allowed' | 'denied' | 'error';

export function AppGate({ children }: { children: React.ReactNode }) {
  const { status, token } = useAuth();
  const [gateState, setGateState] = useState<GateState>('idle');
  const hasChecked = useRef(false);

  useEffect(() => {
    if (status !== 'authed' || !token || hasChecked.current) return;

    hasChecked.current = true;
    setGateState('checking');

    fetch('/api/auth/gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.allowed) {
          setGateState('allowed');
        } else {
          setGateState('denied');
        }
      })
      .catch(() => {
        // Fail open on error
        setGateState('allowed');
      });
  }, [status, token]);

  // Not authed: render children (no gate)
  if (status !== 'authed') {
    return <>{children}</>;
  }

  // Checking: show loading
  if (gateState === 'checking') {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen"
        style={{
          background: 'var(--bg-0)',
          color: 'var(--text-primary)',
        }}
      >
        <div
          className="h-8 w-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: 'var(--fire-1)' }}
        />
        <p className="mt-4" style={{ color: 'var(--text-muted)' }}>
          Checking access...
        </p>
      </div>
    );
  }

  // Denied: full-screen overlay
  if (gateState === 'denied') {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center p-6 z-[9999]"
        style={{
          background: 'var(--bg-0)',
          color: 'var(--text-primary)',
        }}
      >
        <p
          className="text-center text-lg max-w-md"
          style={{ color: 'var(--text-primary)' }}
        >
          {GATE_DENIED_MESSAGE}
        </p>
      </div>
    );
  }

  // Allowed or error (fail open): render children
  return <>{children}</>;
}
