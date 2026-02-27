'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * AuthDebugOverlay - Shows auth state for debugging in Warpcast
 * Only renders when NEXT_PUBLIC_DEBUG_AUTH=1
 */
export function AuthDebugOverlay() {
  const { status, fid, token, profile } = useAuth();
  const [isInMiniApp, setIsInMiniApp] = useState<boolean | null>(null);
  const [lastVerifyStatus, setLastVerifyStatus] = useState<number | null>(null);
  const [buildSha, setBuildSha] = useState<string | null>(null);
  const [host, setHost] = useState<string>('');

  useEffect(() => {
    // Only show if debug mode is enabled
    if (process.env.NEXT_PUBLIC_DEBUG_AUTH !== '1') {
      return;
    }

    // Check if in mini app
    if (typeof sdk.isInMiniApp === 'function') {
      sdk.isInMiniApp().then(setIsInMiniApp).catch(() => setIsInMiniApp(false));
    }

    // Get host
    if (typeof window !== 'undefined') {
      setHost(window.location.host);
    }

    // Fetch build info from health endpoint
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setBuildSha(data.buildSha || null);
      })
      .catch(() => {});

    // Intercept fetch to /api/auth/verify to capture status
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (args[0]?.toString().includes('/api/auth/verify')) {
        setLastVerifyStatus(response.status);
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Only render if debug mode is enabled
  if (process.env.NEXT_PUBLIC_DEBUG_AUTH !== '1') {
    return null;
  }

  const isPreview = host.includes('vercel.app') && !host.includes('poker-swart.vercel.app');

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        color: '#fff',
        padding: '12px',
        borderRadius: '8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        maxWidth: '300px',
        zIndex: 9999,
        lineHeight: '1.4',
        border: '1px solid #333',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #444', paddingBottom: '4px' }}>
        🔍 Auth Debug
      </div>
      {isPreview && (
        <div style={{ color: '#ff6b6b', marginBottom: '8px', padding: '4px', backgroundColor: 'rgba(255, 0, 0, 0.2)', borderRadius: '4px' }}>
          ⚠️ PREVIEW DEPLOYMENT
        </div>
      )}
      <div style={{ marginBottom: '4px' }}>
        <strong>Status:</strong> <span style={{ color: status === 'authed' ? '#51cf66' : status === 'loading' ? '#ffd43b' : '#ff6b6b' }}>{status}</span>
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>isInMiniApp:</strong> {isInMiniApp === null ? 'checking...' : String(isInMiniApp)}
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>FID:</strong> {fid || 'null'}
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>Token:</strong> {token ? '✓' : '✗'}
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>Last Verify:</strong> {lastVerifyStatus ? `${lastVerifyStatus}` : '—'}
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>Host:</strong> {host || '—'}
      </div>
      {buildSha && (
        <div style={{ marginBottom: '4px', fontSize: '10px', color: '#aaa' }}>
          <strong>Build:</strong> {buildSha.substring(0, 7)}
        </div>
      )}
    </div>
  );
}

