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
        <span style={{ fontSize: 24, marginBottom: 4 }}>🏠</span>
        <span style={{ fontSize: 12, fontWeight: activeTab === Tab.Home ? 700 : 400 }}>
          Home
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
    </div>
  </div>
);
