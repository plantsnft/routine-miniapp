"use client";

import { useMiniApp } from "@neynar/react";
import { useEffect, useState } from "react";

/**
 * Standard Farcaster in-feed popup prompt to add mini-app.
 * Shows when user has checked in but hasn't added the mini-app yet.
 */
export function AddMiniAppPrompt() {
  const { actions, added } = useMiniApp();
  const [showPrompt, setShowPrompt] = useState(false);

  // Show prompt after a brief delay to ensure smooth page load
  useEffect(() => {
    if (!added) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowPrompt(false);
    }
  }, [added]);

  if (!showPrompt || added) {
    return null;
  }

  const handleAddMiniApp = () => {
    try {
      actions.addMiniApp();
    } catch (error) {
      console.error("[AddMiniAppPrompt] Error adding mini-app:", error);
    }
  };

  return (
    <div
      style={{
        marginTop: 20,
        padding: "16px",
        background: "#000000",
        border: "2px solid #c1b400",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        textAlign: "center",
        animation: "fadeIn 0.3s ease-in",
      }}
    >
      <div
        style={{
          color: "#c1b400",
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        Add Catwalk to your home screen?
      </div>
      <p
        style={{
          color: "#ffffff",
          fontSize: 12,
          margin: 0,
          opacity: 0.8,
          lineHeight: 1.4,
        }}
      >
        Get quick access to check in daily and track your streak
      </p>
      <button
        onClick={handleAddMiniApp}
        style={{
          marginTop: 8,
          padding: "10px 20px",
          background: "#c1b400",
          color: "#000000",
          border: "2px solid #000000",
          borderRadius: 8,
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 14,
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#d4c700";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#c1b400";
        }}
      >
        Add Mini-App
      </button>
    </div>
  );
}

