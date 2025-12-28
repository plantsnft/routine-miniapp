'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';

/**
 * Notification settings component
 * 
 * - Toggle to enable/disable notifications (updates enabled flag in subscription)
 * - Button to add mini app (triggers SDK action addMiniApp() which prompts user to add app)
 * - Token/URL come from webhook events, not manual collection
 */
export function NotificationSettings() {
  const { token, fid, status: authStatus } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [hasMiniAppAdded, setHasMiniAppAdded] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingNotification, setTestingNotification] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  
  // Admin broadcast state
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastTargetUrl, setBroadcastTargetUrl] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Check subscription status and admin status on mount
  useEffect(() => {
    if (authStatus === 'authed' && token && fid) {
      checkSubscriptionStatus();
    }
  }, [authStatus, token, fid]);

  const checkSubscriptionStatus = async () => {
    if (!token || !fid) return;

    try {
      const res = await authedFetch('/api/notifications/status', { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.data) {
          setEnabled(data.data.enabled || false);
          setHasToken(data.data.hasToken || false);
          setHasMiniAppAdded(data.data.hasMiniAppAdded || false);
          // isAdmin is computed server-side from NOTIFICATIONS_BROADCAST_ADMIN_FIDS
          setIsAdmin(data.data.isAdmin || false);
        }
      }
    } catch (_err) {
      // If we can't check, assume not subscribed and not admin
      setEnabled(false);
      setHasToken(false);
      setHasMiniAppAdded(false);
      setIsAdmin(false);
    }
  };

  const handleToggle = async () => {
    if (!token || !fid || loading) return;
    if (authStatus !== 'authed') {
      setError('Please sign in to enable notifications');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const shouldEnable = !enabled;

      if (shouldEnable) {
        // Enable notifications (set enabled=true)
        // Note: Token/URL will come from webhook when user adds app
        const res = await authedFetch(
          '/api/notifications/subscribe',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'farcaster',
              payload: null, // Token comes from webhook, not here
            }),
          },
          token
        );

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to enable notifications');
        }

        setEnabled(true);
      } else {
        // Disable notifications (set enabled=false)
        const res = await authedFetch(
          '/api/notifications/subscribe',
          { method: 'DELETE' },
          token
        );

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to disable notifications');
        }

        setEnabled(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update notification settings');
      console.error('[NotificationSettings] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Robust helper to add mini app or enable notifications
   * Handles cases where SDK actions may not be available
   */
  const tryAddOrEnableNotifications = async (mode: 'add' | 'enable') => {
    if (!token || !fid || loading) return;

    setLoading(true);
    setError(null);

    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      const actions = sdk?.actions as any; // Use any to access potentially undefined enableNotifications
      
      if (mode === 'enable') {
        // Prefer enableNotifications if available
        if (actions?.enableNotifications && typeof actions.enableNotifications === 'function') {
          await actions.enableNotifications();
          console.log('[NotificationSettings] enableNotifications called successfully');
          setTimeout(() => {
            checkSubscriptionStatus();
          }, 2000);
          setLoading(false);
          return;
        } else if (actions?.addMiniApp) {
          // Fallback to addMiniApp if enableNotifications not available
          console.warn('[NotificationSettings] enableNotifications not available, using addMiniApp');
          await actions.addMiniApp();
          setTimeout(() => {
            checkSubscriptionStatus();
          }, 2000);
          setLoading(false);
          return;
        }
      } else {
        // mode === 'add'
        if (actions?.addMiniApp) {
          await actions.addMiniApp();
          setTimeout(() => {
            checkSubscriptionStatus();
          }, 2000);
          setLoading(false);
          return;
        }
      }
      
      // Neither action available - show user-friendly error
      const errorMsg = 'This action only works inside Warpcast / Farcaster. Open this mini app in Warpcast to add/enable notifications.';
      setError(errorMsg);
      console.warn('[NotificationSettings] SDK actions not available', {
        mode,
        hasAddMiniApp: !!actions?.addMiniApp,
        hasEnableNotifications: !!actions?.enableNotifications,
      });
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to add/enable notifications';
      setError(errorMsg);
      console.error('[NotificationSettings] Error in tryAddOrEnableNotifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    if (!token || !fid || testingNotification) return;
    if (authStatus !== 'authed') {
      setTestResult('Please sign in to test notifications');
      return;
    }

    setTestingNotification(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await authedFetch(
        '/api/notifications/test-self',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        token
      );

      const data = await res.json();
      
      if (data.ok && data.data) {
        const { successCount, failedCount, attempted } = data.data;
        if (successCount > 0) {
          setTestResult(`✓ Test notification sent successfully (${successCount}/${attempted})`);
        } else {
          setTestResult(`✗ Test notification failed (${failedCount}/${attempted} failed). Check that you have added the mini app and enabled notifications.`);
        }
      } else {
        setTestResult(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setTestResult(`Error: ${err.message || 'Failed to send test notification'}`);
      console.error('[NotificationSettings] Error testing notification:', err);
    } finally {
      setTestingNotification(false);
    }
  };

  const handleBroadcast = async () => {
    if (!token || !fid || broadcasting) return;
    if (authStatus !== 'authed') {
      setBroadcastResult('Please sign in to send broadcast');
      return;
    }

    // Validate inputs
    if (!broadcastTitle.trim()) {
      setBroadcastResult('Title is required');
      return;
    }
    if (!broadcastBody.trim()) {
      setBroadcastResult('Body is required');
      return;
    }
    if (broadcastTitle.length > 32) {
      setBroadcastResult('Title must be 32 characters or less');
      return;
    }
    if (broadcastBody.length > 128) {
      setBroadcastResult('Body must be 128 characters or less');
      return;
    }

    setBroadcasting(true);
    setBroadcastResult(null);
    setError(null);

    try {
      const res = await authedFetch(
        '/api/notifications/broadcast',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: broadcastTitle.trim(),
            body: broadcastBody.trim(),
            targetUrl: broadcastTargetUrl.trim() || undefined,
          }),
        },
        token
      );

      const data = await res.json();
      
      if (data.ok && data.data) {
        const { audienceCount, successCount, failedCount: _failedCount, attempted } = data.data;
        setBroadcastResult(`✓ Broadcast sent: ${successCount}/${attempted} successful to ${audienceCount} enabled subscribers`);
      } else {
        setBroadcastResult(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setBroadcastResult(`Error: ${err.message || 'Failed to send broadcast'}`);
      console.error('[NotificationSettings] Error sending broadcast:', err);
    } finally {
      setBroadcasting(false);
    }
  };

  // Don't render if not authenticated
  if (authStatus !== 'authed' || !fid) {
    return null;
  }

  return (
    <div className="hl-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Push Notifications</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Get notified when new games are created or your game becomes full
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading || enabled === null}
          style={{
            position: 'relative',
            display: 'inline-flex',
            height: '24px',
            width: '44px',
            alignItems: 'center',
            borderRadius: '9999px',
            transition: 'background-color 0.2s',
            backgroundColor: enabled ? 'var(--fire-1)' : 'var(--stroke)',
            opacity: loading ? 0.5 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none',
          }}
          aria-label={enabled ? 'Disable notifications' : 'Enable notifications'}
        >
          <span
            style={{
              display: 'inline-block',
              height: '16px',
              width: '16px',
              transform: enabled ? 'translateX(24px)' : 'translateX(4px)',
              borderRadius: '9999px',
              backgroundColor: 'var(--text-primary)',
              transition: 'transform 0.2s',
            }}
          />
        </button>
      </div>
      
      {/* Render based on miniapp_added and enabled state */}
      {!hasMiniAppAdded && (
        // Case A: Mini app NOT installed
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--stroke)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Add this mini app to your Warpcast to receive notifications
          </p>
          <button
            onClick={() => tryAddOrEnableNotifications('add')}
            disabled={loading}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '14px', minHeight: 'auto' }}
          >
            Add Mini App to Warpcast
          </button>
        </div>
      )}
      
      {hasMiniAppAdded && enabled === false && (
        // Case B: Mini app installed but notifications OFF
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--stroke)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Turn on notifications to get notified when new games are created or your game becomes full
          </p>
          <button
            onClick={() => tryAddOrEnableNotifications('enable')}
            disabled={loading}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '14px', minHeight: 'auto' }}
          >
            Enable Notifications in Warpcast
          </button>
        </div>
      )}
      
      {hasMiniAppAdded && enabled === true && !hasToken && (
        // Case C: Mini app installed, notifications ON, but no token yet
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--stroke)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Notifications requested. Enable in Warpcast to finish.
          </p>
          <button
            onClick={() => tryAddOrEnableNotifications('enable')}
            disabled={loading}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '14px', minHeight: 'auto' }}
          >
            Enable Notifications in Warpcast
          </button>
        </div>
      )}
      
      {hasMiniAppAdded && enabled === true && hasToken && (
        // Case D: Normal state - mini app installed, notifications ON, token present
        // (No additional UI needed here, toggle already shown above)
        null
      )}

      {/* Admin broadcast panel - only show for admins */}
      {isAdmin && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--stroke)' }}>
          <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Admin Broadcast</h4>
          
          <div className="space-y-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-primary)' }}>
                Title <span style={{ color: 'var(--text-muted)' }}>(max 32 chars)</span>
              </label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                maxLength={32}
                className="input"
                style={{ color: 'var(--text-primary)' }}
                placeholder="Broadcast title"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{broadcastTitle.length}/32</p>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-primary)' }}>
                Body <span style={{ color: 'var(--text-muted)' }}>(max 128 chars)</span>
              </label>
              <textarea
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                maxLength={128}
                rows={3}
                className="input"
                style={{ color: 'var(--text-primary)' }}
                placeholder="Broadcast message"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{broadcastBody.length}/128</p>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-primary)' }}>
                Target URL <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={broadcastTargetUrl}
                onChange={(e) => setBroadcastTargetUrl(e.target.value)}
                className="input"
                style={{ color: 'var(--text-primary)' }}
                placeholder="/clubs or https://..."
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleBroadcast}
                disabled={broadcasting || loading || !broadcastTitle.trim() || !broadcastBody.trim()}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '14px', minHeight: 'auto' }}
              >
                {broadcasting ? 'Sending...' : 'Send Broadcast'}
              </button>
              <button
                onClick={handleTestNotification}
                disabled={testingNotification || loading}
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '14px', minHeight: 'auto' }}
              >
                {testingNotification ? 'Sending...' : 'Test to Me Only'}
              </button>
            </div>

            {broadcastResult && (
              <p className="text-xs mt-2" style={{ color: broadcastResult.startsWith('✓') ? '#10b981' : '#f59e0b' }}>
                {broadcastResult}
              </p>
            )}
            {testResult && (
              <p className="text-xs mt-2" style={{ color: testResult.startsWith('✓') ? '#10b981' : '#f59e0b' }}>
                {testResult}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs mt-2" style={{ color: 'var(--fire-2)' }}>{error}</p>
      )}
      {loading && enabled === null && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Loading...</p>
      )}
    </div>
  );
}
