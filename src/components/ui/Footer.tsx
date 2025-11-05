import React from "react";
import { Tab } from "~/components/App";

interface FooterProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export const Footer: React.FC<FooterProps> = ({ activeTab, setActiveTab }) => (
  <div
    style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      background: "#000000",
      borderTop: "2px solid #c1b400",
      padding: "12px 16px",
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
          padding: "8px 16px",
          color: activeTab === Tab.Home ? "#c1b400" : "#666666",
          transition: "color 0.2s",
        }}
      >
        <img 
          src="/logo.png" 
          alt="Go Home" 
          style={{ 
            width: "24px", 
            height: "24px", 
            objectFit: "contain",
            marginBottom: 4,
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
              fallback.style.fontSize = "24px";
              fallback.style.marginBottom = "4px";
              parent.insertBefore(fallback, target);
            }
          }}
        />
        <span style={{ fontSize: 12, fontWeight: activeTab === Tab.Home ? 700 : 400 }}>
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
          padding: "8px 16px",
          color: activeTab === Tab.Leaderboard ? "#c1b400" : "#666666",
          transition: "color 0.2s",
        }}
      >
        <span style={{ fontSize: 24, marginBottom: 4 }}>🏆</span>
        <span style={{ fontSize: 12, fontWeight: activeTab === Tab.Leaderboard ? 700 : 400 }}>
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
          padding: "8px 16px",
          color: activeTab === Tab.Feed ? "#c1b400" : "#666666",
          transition: "color 0.2s",
        }}
      >
        <span style={{ fontSize: 24, marginBottom: 4 }}>📱</span>
        <span style={{ fontSize: 12, fontWeight: activeTab === Tab.Feed ? 700 : 400 }}>
          Feed
        </span>
      </button>
    </div>
  </div>
);
