"use client";

import { useEffect, useState } from "react";
import { useMiniApp } from "@neynar/react";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";

interface CreatorGreetingProps {
  onClose?: () => void;
}

/**
 * CreatorGreeting component shows a special greeting popup
 * when a Catwalk creator visits the mini app.
 */
export function CreatorGreeting({ onClose }: CreatorGreetingProps) {
  const { context } = useMiniApp();
  const [showGreeting, setShowGreeting] = useState(false);
  const [creatorName, setCreatorName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAndShowGreeting = async () => {
      const userFid = context?.user?.fid;
      
      // Check if user is logged in and is a creator
      if (!userFid || CATWALK_CREATOR_FIDS.length === 0) {
        setLoading(false);
        return;
      }

      // Check if this FID is in the creator list
      if (!CATWALK_CREATOR_FIDS.includes(userFid)) {
        setLoading(false);
        return;
      }

      // Check if we've already shown this greeting in this session
      const greetingKey = `catwalk_creator_greeting_${userFid}`;
      const hasSeenGreeting = sessionStorage.getItem(greetingKey);
      
      if (hasSeenGreeting) {
        setLoading(false);
        return;
      }

      // Fetch creator's name
      try {
        const res = await fetch(`/api/users?fids=${userFid}`);
        const data = await res.json();
        
        if (data.users && data.users.length > 0) {
          const user = data.users[0];
          setCreatorName(user.display_name || user.username || `FID: ${userFid}`);
        } else {
          // Fallback to username from context or FID
          setCreatorName(context?.user?.username || `FID: ${userFid}`);
        }
        
        // Mark as shown in session storage
        sessionStorage.setItem(greetingKey, "true");
        
        // Show the greeting
        setShowGreeting(true);
      } catch (error) {
        console.error("[CreatorGreeting] Error fetching creator name:", error);
        // Still show greeting with fallback name
        setCreatorName(context?.user?.username || context?.user?.displayName || `FID: ${userFid}`);
        sessionStorage.setItem(greetingKey, "true");
        setShowGreeting(true);
      } finally {
        setLoading(false);
      }
    };

    // Only check if SDK is loaded and context is available
    if (context?.user?.fid) {
      checkAndShowGreeting();
    } else {
      setLoading(false);
    }
  }, [context?.user?.fid]);

  const handleClose = () => {
    setShowGreeting(false);
    if (onClose) {
      onClose();
    }
  };

  // Don't render anything if loading or not showing
  if (loading || !showGreeting) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.85)",
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "#000000",
          border: "3px solid #c1b400",
          borderRadius: 20,
          padding: "32px 24px",
          width: "100%",
          maxWidth: "400px",
          textAlign: "center",
          boxShadow: "0 8px 32px rgba(193, 180, 0, 0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "transparent",
            border: "none",
            color: "#c1b400",
            fontSize: 28,
            cursor: "pointer",
            fontWeight: 700,
            padding: 0,
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          ×
        </button>

        {/* Greeting Content */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
            }}
          >
            🐱
          </div>
          <h2
            style={{
              color: "#c1b400",
              fontSize: 24,
              fontWeight: 900,
              margin: "0 0 16px 0",
              lineHeight: 1.3,
            }}
          >
            Thank you, {creatorName}!
          </h2>
          <p
            style={{
              color: "#ffffff",
              fontSize: 16,
              lineHeight: 1.6,
              margin: 0,
              padding: "0 8px",
            }}
          >
            Thank you for being a /catwalk creator. Your content fuels this channel and we are grateful you share your cat with the world.
          </p>
        </div>

        {/* Close button at bottom */}
        <button
          onClick={handleClose}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: "#c1b400",
            color: "#000000",
            border: "2px solid #000000",
            borderRadius: 12,
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#d4c700";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#c1b400";
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

