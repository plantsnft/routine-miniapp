"use client";

import { useState } from "react";

const CATWALK_CHANNEL_URL = "https://farcaster.xyz/~/channel/Catwalk";

interface FollowChannelButtonProps {
  isFollowing?: boolean;
}

export function FollowChannelButton({ isFollowing = false }: FollowChannelButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    try {
      setIsLoading(true);
      
      // Open channel URL in new tab (users can follow or visit from there)
      if (typeof window !== "undefined") {
        window.open(CATWALK_CHANNEL_URL, "_blank");
      }
      
    } catch (error) {
      console.error("Error opening channel:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#c1b400",
        color: "#000000",
        border: "2px solid #000000",
        borderRadius: 20,
        padding: "8px 20px",
        fontSize: "12px",
        fontWeight: 700,
        cursor: isLoading ? "not-allowed" : "pointer",
        opacity: isLoading ? 0.6 : 1,
        zIndex: 1000,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!isLoading) {
          e.currentTarget.style.background = "#d4c700";
        }
      }}
      onMouseLeave={(e) => {
        if (!isLoading) {
          e.currentTarget.style.background = "#c1b400";
        }
      }}
    >
      {isLoading ? "Loading..." : isFollowing ? "Visit the Channel" : "Follow /Catwalk"}
    </button>
  );
}

