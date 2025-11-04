"use client";

/**
 * HomeTab component displays the main landing content for the mini app.
 * 
 * This is the default tab that users see when they first open the mini app.
 * It provides the Catwalk welcome message and check-in information.
 * 
 * @example
 * ```tsx
 * <HomeTab />
 * ```
 */
export function HomeTab() {
  return (
    <div className="px-6 py-4">
      <div className="max-w-md mx-auto">
        <div
          style={{
            background: "#f4f0ff",
            border: "1px solid rgba(139,92,246,0.25)",
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, marginBottom: 8, color: "#3b0764", fontSize: 24, fontWeight: 700 }}>
            🐾 Welcome to Catwalk
          </h2>
          <p style={{ margin: 0, marginBottom: 12, color: "#6b21a8", fontSize: 16, lineHeight: 1.5 }}>
            Take your daily virtual catwalk and build your streak! Check in once per day to keep your streak going and earn $CATWALK later.
          </p>
          <div style={{ marginTop: 16, padding: 12, background: "#ede9fe", borderRadius: 8, border: "1px solid #c4b5fd" }}>
            <p style={{ margin: 0, marginBottom: 8, color: "#5b21b6", fontWeight: 600, fontSize: 14 }}>
              📅 Daily Reset
            </p>
            <p style={{ margin: 0, color: "#6b21a8", fontSize: 13 }}>
              Your check-in window resets every day at 9 AM Pacific time. Make sure to check in before then to keep your streak alive!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 