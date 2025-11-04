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
    <div className="px-6 py-4" style={{ background: "#ffffff", minHeight: "100vh" }}>
      {/* Cat pattern borders - alternating black and gold vertical stripes representing cats */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "30px",
          background: "repeating-linear-gradient(to bottom, #c1b400 0px, #c1b400 25px, #000000 25px, #000000 50px)",
          opacity: 0.15,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "30px",
          background: "repeating-linear-gradient(to bottom, #000000 0px, #000000 25px, #c1b400 25px, #c1b400 50px)",
          opacity: 0.15,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      
      <div className="max-w-md mx-auto" style={{ position: "relative", zIndex: 1 }}>
        <h2 
          style={{ 
            margin: 0, 
            marginBottom: 16, 
            color: "#000000", 
            fontSize: 24, 
            fontWeight: 700, 
            textAlign: "center",
            background: "#c1b400",
            padding: "12px 20px",
            borderRadius: 12,
            border: "3px solid #000000",
            boxShadow: "0 4px 12px rgba(193, 180, 0, 0.3)",
          }}
        >
          🐾 Welcome to Catwalk
        </h2>
        <DailyCheckin />
      </div>
    </div>
  );
} 