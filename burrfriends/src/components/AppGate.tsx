'use client';

/**
 * AppGate - BETR WITH BURR access control
 *
 * Requires Neynar score ≥ 0.60 OR 50M+ $BETR staked.
 * Checks /api/auth/gate when user is authed.
 * Fail open: on any fetch/API error, allow access.
 */

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';

const GATE_DENIED_MESSAGE =
  'A neynar score of 0.60 is required BETR WITH BURR app unless you are staking 50m $BETR';

type GateState = 'idle' | 'checking' | 'allowed' | 'denied';

export function AppGate({ children }: { children: React.ReactNode }) {
  const { status, token } = useAuth();
  const [gateState, setGateState] = useState<GateState>('idle');

  useEffect(() => {
    if (status !== 'authed' || !token) {
      setGateState('idle');
      return;
    }

    let cancelled = false;
    setGateState('checking');

    fetch('/api/auth/gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data: { allowed?: boolean; message?: string }) => {
        if (cancelled) return;
        if (data.allowed) {
          setGateState('allowed');
        } else {
          setGateState('denied');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setGateState('allowed');
      });

    return () => {
      cancelled = true;
    };
  }, [status, token]);

  // Not authed: show children (app handles login/error UI)
  if (status !== 'authed' || !token) {
    return <>{children}</>;
  }

  // Authed: check gate (idle = about to check)
  if (gateState === 'idle' || gateState === 'checking') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          color: 'var(--text-2, #888)',
        }}
      >
        Checking access…
      </div>
    );
  }

  if (gateState === 'allowed') {
    return <>{children}</>;
  }

  // gateState === 'denied'
  return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <p style={{ color: 'var(--text-1, #fff)', marginBottom: '8px' }}>
          {GATE_DENIED_MESSAGE}
        </p>
      </div>
    );
}
