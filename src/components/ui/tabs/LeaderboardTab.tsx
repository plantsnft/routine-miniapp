"use client";

import { useState, useEffect } from "react";
import type { LeaderboardEntry } from "~/lib/models";

/**
 * LeaderboardTab component displays the top users by streak and $CATWALK holdings.
 * 
 * Shows users ranked by their check-in streak, with their Farcaster usernames
 * and $CATWALK token balances displayed.
 * 
 * @example
 * ```tsx
 * <LeaderboardTab />
 * ```
 */
export function LeaderboardTab() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/leaderboard?limit=50");
        const data = await res.json();

        if (data?.ok && data?.entries) {
          setEntries(data.entries);
        } else {
          setError(data?.error || "Failed to fetch leaderboard");
        }
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
        setError("Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const formatTokenBalance = (balance: number | undefined): string => {
    if (balance === undefined || balance === 0) return "0";
    if (balance >= 1000000) return `${(balance / 1000000).toFixed(2)}M`;
    if (balance >= 1000) return `${(balance / 1000).toFixed(2)}K`;
    return balance.toFixed(2);
  };

  const getRankEmoji = (rank: number): string => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  return (
    <div
      className="px-6 py-4"
      style={{ background: "transparent", minHeight: "100vh", position: "relative" }}
    >
      {/* Cat pattern borders - matching HomeTab style */}
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
        {/* Logo - Catwalk logo image */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <img
            src="/logo.png"
            alt="Catwalk Logo"
            style={{
              maxWidth: "200px",
              width: "100%",
              height: "auto",
              objectFit: "contain",
            }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
        </div>

        {/* Title */}
        <div
          style={{
            marginBottom: 20,
            padding: "16px",
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#c1b400",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            🏆 Leaderboard
          </h2>
          <p style={{ margin: "8px 0 0", color: "#ffffff", fontSize: 13, opacity: 0.8 }}>
            Top users by streak and $CATWALK holdings
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p style={{ color: "#c1b400", fontSize: 16 }}>Loading leaderboard...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div
            style={{
              padding: "20px",
              background: "#000000",
              border: "2px solid #c1b400",
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <p style={{ color: "#c1b400", fontSize: 14 }}>{error}</p>
          </div>
        )}

        {/* Leaderboard entries */}
        {!loading && !error && entries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {entries.map((entry) => (
              <div
                key={entry.fid}
                style={{
                  padding: "16px",
                  background: "#000000",
                  border: "2px solid #c1b400",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    minWidth: "50px",
                    textAlign: "center",
                    color: "#c1b400",
                    fontSize: entry.rank <= 3 ? 24 : 18,
                    fontWeight: 700,
                  }}
                >
                  {getRankEmoji(entry.rank)}
                </div>

                {/* User info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      marginBottom: 4,
                      color: "#ffffff",
                      fontSize: 16,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.displayName || entry.username || `FID: ${entry.fid}`}
                  </p>
                  {entry.username && (
                    <p
                      style={{
                        margin: 0,
                        color: "#c1b400",
                        fontSize: 13,
                        opacity: 0.8,
                      }}
                    >
                      @{entry.username}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                    <span
                      style={{
                        color: "#000000",
                        fontSize: 12,
                        background: "#c1b400",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontWeight: 600,
                      }}
                    >
                      🔥 {entry.streak} day{entry.streak === 1 ? "" : "s"}
                    </span>
                    {entry.tokenBalance !== undefined && entry.tokenBalance > 0 && (
                      <span
                        style={{
                          color: "#000000",
                          fontSize: 12,
                          background: "#c1b400",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontWeight: 600,
                        }}
                      >
                        💰 {formatTokenBalance(entry.tokenBalance)} $CATWALK
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div
            style={{
              padding: "40px 20px",
              background: "#000000",
              border: "2px solid #c1b400",
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <p style={{ color: "#ffffff", fontSize: 16, margin: 0 }}>
              No leaderboard entries yet. Be the first to check in!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

