"use client";

import { useState, useEffect } from "react";
import { getAuthEvents } from "~/lib/authDebug";

interface DevAuthDebugProps {
  authState?: 'authenticated' | 'not_in_farcaster' | 'error' | 'loading';
  fid: number | null;
  error: string | null;
  retrySignIn?: () => Promise<void>;
}

/**
 * Dev-only auth debug overlay component.
 * Shows auth state, events, and debug controls.
 * Only rendered in development mode.
 */
export function DevAuthDebug({
  authState,
  fid,
  error,
  retrySignIn,
}: DevAuthDebugProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState(getAuthEvents());

  // Update events periodically
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const interval = setInterval(() => {
      setEvents(getAuthEvents());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Don't render in production
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const handleCopyDebug = async () => {
    if (typeof window === "undefined") return;
    try {
      const debugData = {
        authState,
        fid: fid ? 'present' : 'null',
        error,
        events: events.slice(-10), // Last 10 events
      };
      await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
    } catch {
      // Best-effort: silently fail
    }
  };

  const handleClearAutoFlag = () => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem("autoSignInAttempted");
    } catch {
      // Best-effort: silently fail
    }
  };

  const handleRetry = async () => {
    if (retrySignIn) {
      await retrySignIn();
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: isOpen ? "20px" : "20px",
        right: "20px",
        zIndex: 9999,
        fontFamily: "monospace",
        fontSize: "12px",
      }}
    >
      {isOpen ? (
        <div
          style={{
            backgroundColor: "#1a1a1a",
            border: "2px solid #8A63D2",
            borderRadius: "8px",
            padding: "12px",
            maxWidth: "400px",
            maxHeight: "500px",
            overflowY: "auto",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "14px", color: "#8A63D2" }}>Auth Debug</h3>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: "18px",
                padding: "0 8px",
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginBottom: "12px", padding: "8px", background: "#2a2a2a", borderRadius: "4px" }}>
            <div><strong>State:</strong> {authState || 'undefined'}</div>
            <div><strong>FID:</strong> {fid ? 'present' : 'null'}</div>
            <div><strong>Error:</strong> {error || 'none'}</div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <strong>Last {Math.min(10, events.length)} events:</strong>
            <div style={{ marginTop: "8px", maxHeight: "200px", overflowY: "auto" }}>
              {events.slice(-10).reverse().map((event, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: "8px",
                    padding: "6px",
                    background: "#2a2a2a",
                    borderRadius: "4px",
                    fontSize: "11px",
                  }}
                >
                  <div style={{ color: "#8A63D2", fontWeight: "bold" }}>
                    {event.name}
                  </div>
                  <div style={{ color: "#888", fontSize: "10px" }}>
                    {formatTimestamp(event.timestamp)}
                  </div>
                  {event.data && Object.keys(event.data).length > 0 && (
                    <div style={{ marginTop: "4px", color: "#ccc" }}>
                      {Object.entries(event.data).map(([key, value]) => (
                        <div key={key} style={{ marginLeft: "8px" }}>
                          {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <button
              onClick={handleCopyDebug}
              style={{
                padding: "6px 12px",
                backgroundColor: "#8A63D2",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Copy debug
            </button>
            <button
              onClick={handleClearAutoFlag}
              style={{
                padding: "6px 12px",
                backgroundColor: "#4a4a4a",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Clear auto flag
            </button>
            {retrySignIn && (
              <button
                onClick={handleRetry}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#4a4a4a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            backgroundColor: "#8A63D2",
            color: "#ffffff",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Auth Debug"
        >
          🔍
        </button>
      )}
    </div>
  );
}
