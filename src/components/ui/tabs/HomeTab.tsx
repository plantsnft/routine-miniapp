"use client";

import DailyCheckin from "~/app/daily-checkin";

/**
 * HomeTab component displays the main landing content for the mini app.
 * 
 * This is the default tab that users see when they first open the mini app.
 * It provides the Catwalk welcome message and check-in functionality.
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
        <h2 
          style={{ 
            margin: 0, 
            marginBottom: 16, 
            color: "#3b0764", 
            fontSize: 24, 
            fontWeight: 700, 
            textAlign: "center",
            background: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
            padding: "12px 20px",
            borderRadius: 12,
            border: "2px solid #FFD700",
            boxShadow: "0 2px 8px rgba(255, 215, 0, 0.3)",
          }}
        >
          🐾 Welcome to Catwalk
        </h2>
        <DailyCheckin />
      </div>
    </div>
  );
} 