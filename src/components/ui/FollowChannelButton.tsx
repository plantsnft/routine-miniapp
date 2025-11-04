"use client";

import { useState } from "react";

const CATWALK_CHANNEL_URL = "https://farcaster.xyz/~/channel/Catwalk";

export function FollowChannelButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleFollow = async () => {
    try {
      setIsLoading(true);
      
      // Try to use SDK to follow channel
      // Note: Farcaster SDK may not have direct channel follow, so we'll open the channel URL
      // Users can follow from there
      if (typeof window !== "undefined") {
        window.open(CATWALK_CHANNEL_URL, "_blank");
      }
      
      // Alternative: If SDK has followChannel method
      // if (sdk?.actions?.followChannel) {
      //   await sdk.actions.followChannel({ channelId: "catwalk" });
      //   setIsFollowing(true);
      // }
      
    } catch (error) {
      console.error("Error following channel:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleFollow}
      disabled={isLoading}
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#c1b400",
        color: "#000000",
        border: "1px solid #000000",
        borderRadius: 20,
        padding: "6px 16px",
        fontSize: "11px",
        fontWeight: 600,
        cursor: isLoading ? "not-allowed" : "pointer",
        opacity: isLoading ? 0.6 : 1,
        zIndex: 1000,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
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
      {isLoading ? "Loading..." : "Follow /Catwalk"}
    </button>
  );
}

