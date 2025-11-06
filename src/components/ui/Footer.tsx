"use client";

import React from "react";
import { useMiniApp } from "@neynar/react";
import { Tab } from "~/components/App";

const CATWALK_CHANNEL_URL = "https://farcaster.xyz/~/channel/Catwalk";

interface FooterProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export const Footer: React.FC<FooterProps> = ({ activeTab, setActiveTab }) => {
  const { actions } = useMiniApp();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleVisitChannel = async () => {
    try {
      setIsLoading(true);
      await actions.openUrl(CATWALK_CHANNEL_URL);
    } catch (error) {
      console.error("Error opening channel:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
      background: "#000000",
      borderTop: "2px solid #c1b400",
      padding: "7px 16px 5px 16px", // Reduced from 12px 16px 8px 16px (40% reduction: 12*0.6=7.2≈7, 8*0.6=4.8≈5)
      zIndex: 50,
      boxShadow: "0 -4px 12px rgba(193, 180, 0, 0.2)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          maxWidth: "600px",
          margin: "0 auto",
          marginBottom: 8,
        }}
      >
      <button
        onClick={() => setActiveTab(Tab.Home)}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 16px", // Reduced from 8px 16px (50% reduction to match 40% overall)
          color: activeTab === Tab.Home ? "#c1b400" : "#666666",
          transition: "color 0.2s",
        }}
      >
        <img 
          src="/logo.png" 
          alt="Go Home" 
          style={{ 
            width: "20px", // Reduced from 24px (17% reduction)
            height: "20px", // Reduced from 24px (17% reduction) 
            objectFit: "contain",
            marginBottom: 2, // Reduced from 4px (50% reduction)
            opacity: activeTab === Tab.Home ? 1 : 0.6,
          }}
          onError={(e) => {
            // Fallback to emoji if image doesn't load
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent && !parent.querySelector("span.fallback-emoji")) {
              const fallback = document.createElement("span");
              fallback.className = "fallback-emoji";
              fallback.textContent = "🏠";
              fallback.style.fontSize = "20px"; // Reduced from 24px (17% reduction)
              fallback.style.marginBottom = "2px"; // Reduced from 4px
              parent.insertBefore(fallback, target);
            }
          }}
        />
        <span style={{ fontSize: 10, fontWeight: activeTab === Tab.Home ? 700 : 400 }}> {/* Reduced from 12px (17% reduction) */}
          go home
        </span>
      </button>
      <button
        onClick={() => setActiveTab(Tab.Leaderboard)}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 16px", // Reduced from 8px 16px
          color: activeTab === Tab.Leaderboard ? "#c1b400" : "#666666",
          transition: "color 0.2s",
        }}
      >
        <span style={{ fontSize: 20, marginBottom: 2 }}>🏆</span> {/* Reduced from 24px and 4px */}
        <span style={{ fontSize: 10, fontWeight: activeTab === Tab.Leaderboard ? 700 : 400 }}> {/* Reduced from 12px */}
          Leaderboard
        </span>
      </button>
      <button
        onClick={() => setActiveTab(Tab.Feed)}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 16px", // Reduced from 8px 16px
          color: activeTab === Tab.Feed ? "#c1b400" : "#666666",
          transition: "color 0.2s",
        }}
      >
        <span style={{ fontSize: 20, marginBottom: 2 }}>📱</span> {/* Reduced from 24px and 4px */}
        <span style={{ fontSize: 10, fontWeight: activeTab === Tab.Feed ? 700 : 400 }}> {/* Reduced from 12px */}
          Feed
        </span>
      </button>
      </div>
      
      {/* Visit /Catwalk Button - Thin and long */}
      <button
        onClick={handleVisitChannel}
        disabled={isLoading}
        style={{
          width: "100%",
          maxWidth: "600px",
          margin: "0 auto",
          padding: "6px 16px",
          background: "#c1b400",
          color: "#000000",
          border: "2px solid #000000",
          borderRadius: 8,
          fontSize: "11px", // Reduced from 12px (10% reduction: 12*0.9=10.8≈11)
          fontWeight: 700,
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.6 : 1,
          transition: "all 0.2s",
          textAlign: "center",
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
        {isLoading ? "Loading..." : "Visit /Catwalk"}
      </button>
    </div>
  );
};
