'use client';

import { useState } from 'react';
import { useAuth } from '~/components/AuthProvider';

/**
 * Simple button component to add the mini app to Warpcast
 * Extracted from NotificationSettings for use by everyone
 */
export function AddMiniAppButton() {
  const { status: authStatus } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddMiniApp = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      const actions = sdk?.actions as any;
      
      if (actions?.addMiniApp) {
        await actions.addMiniApp();
        setLoading(false);
        return;
      }
      
      // Neither action available - show user-friendly error
      const errorMsg = 'This action only works inside Warpcast / Farcaster. Open this mini app in Warpcast to add it.';
      setError(errorMsg);
      console.warn('[AddMiniAppButton] SDK actions not available', {
        hasAddMiniApp: !!actions?.addMiniApp,
      });
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to add mini app';
      setError(errorMsg);
      console.error('[AddMiniAppButton] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Don't render if not authenticated
  if (authStatus !== 'authed') {
    return null;
  }

  return (
    <div className="hl-card p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Add Mini App</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Add this mini app to your Warpcast to get the full experience
          </p>
        </div>
        <button
          onClick={handleAddMiniApp}
          disabled={loading}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '14px', minHeight: 'auto' }}
        >
          {loading ? 'Adding...' : 'Add to Warpcast'}
        </button>
      </div>
      {error && (
        <p className="text-xs mt-2" style={{ color: 'var(--fire-2)' }}>{error}</p>
      )}
    </div>
  );
}






