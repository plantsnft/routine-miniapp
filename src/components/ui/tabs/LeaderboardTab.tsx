"use client";

import { useState, useEffect } from "react";
import type { LeaderboardEntry } from "~/lib/models";

type SortBy = "holdings" | "streak" | "total_checkins";
type WalkSortMode = "current_streak" | "all_time";

/**
 * LeaderboardTab component displays two leaderboards:
 * 1. Top users by $CATWALK holdings
 * 2. Top users by check-in streak
 * 
 * Users can toggle between the two views.
 * 
 * @example
 * ```tsx
 * <LeaderboardTab />
 * ```
 */
export function LeaderboardTab() {
  const [sortBy, setSortBy] = useState<SortBy>("holdings");
  const [walkSortMode, setWalkSortMode] = useState<WalkSortMode>("current_streak");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Calculate total holdings across all entries
  const totalHoldings = entries.reduce((sum, entry) => sum + (entry.tokenBalance || 0), 0);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);
        // For walk sorting, use the appropriate sortBy value
        const actualSortBy = sortBy === "streak" && walkSortMode === "all_time" 
          ? "total_checkins" 
          : sortBy;
        const res = await fetch(`/api/leaderboard?sortBy=${actualSortBy}&limit=50`);
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
  }, [sortBy, walkSortMode]);

  const formatTokenBalance = (balance: number | undefined): string => {
    if (balance === undefined || balance === 0) return "0";
    if (balance >= 1000000000) return `${(balance / 1000000000).toFixed(2)}B`;
    if (balance >= 1000000) return `${(balance / 1000000).toFixed(2)}M`;
    if (balance >= 1000) return `${(balance / 1000).toFixed(2)}K`;
    // For values less than 1000, show up to 2 decimal places but remove trailing zeros
    const formatted = balance.toFixed(2);
    return formatted.replace(/\.?0+$/, "");
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
      style={{ 
        background: "transparent",
        minHeight: "100vh", 
        position: "relative" 
      }}
    >

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
            marginBottom: 16,
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
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            🏆 Leaderboard
          </h2>
        </div>

        {/* Toggle buttons */}
        <div
          style={{
            marginBottom: 20,
            display: "flex",
            gap: 12,
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            padding: 4,
          }}
        >
          <button
            onClick={() => setSortBy("holdings")}
            style={{
              flex: 1,
              padding: "12px 16px",
              background: sortBy === "holdings" ? "#c1b400" : "transparent",
              color: sortBy === "holdings" ? "#000000" : "#c1b400",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            💰 Top Holders
          </button>
          <button
            onClick={() => setSortBy("streak")}
            style={{
              flex: 1,
              padding: "12px 16px",
              background: sortBy === "streak" ? "#c1b400" : "transparent",
              color: sortBy === "streak" ? "#000000" : "#c1b400",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            🐱 Most Walks
          </button>
        </div>

        {/* Walk sorting mode toggle - only show when Most Walks is selected */}
        {sortBy === "streak" && (
          <div
            style={{
              marginBottom: 20,
              display: "flex",
              gap: 8,
              background: "#000000",
              border: "2px solid #c1b400",
              borderRadius: 12,
              padding: 4,
            }}
          >
            <button
              onClick={() => setWalkSortMode("current_streak")}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: walkSortMode === "current_streak" ? "#c1b400" : "transparent",
                color: walkSortMode === "current_streak" ? "#000000" : "#c1b400",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Current Streak
            </button>
            <button
              onClick={() => setWalkSortMode("all_time")}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: walkSortMode === "all_time" ? "#c1b400" : "transparent",
                color: walkSortMode === "all_time" ? "#000000" : "#c1b400",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              All Time
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p style={{ color: "#c1b400", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Loading leaderboard...</p>
            <p style={{ color: "#666666", fontSize: 12, opacity: 0.7 }}>
              Fetching token balances and rankings...
            </p>
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
            <p style={{ color: "#c1b400", fontSize: 12, marginBottom: 8, fontWeight: 700 }}>
              ⚠️ {error}
            </p>
            <button
              onClick={() => {
                setError(null);
                const fetchLeaderboard = async () => {
                  try {
                    setLoading(true);
                    const actualSortBy = sortBy === "streak" && walkSortMode === "all_time" 
                      ? "total_checkins" 
                      : sortBy;
                    const res = await fetch(`/api/leaderboard?sortBy=${actualSortBy}&limit=50`);
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
              }}
              style={{
                marginTop: 12,
                padding: "8px 16px",
                background: "#c1b400",
                color: "#000000",
                border: "2px solid #000000",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Leaderboard entries */}
        {!loading && !error && entries.length > 0 && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {entries.map((entry) => (
              <div
                key={`${entry.fid}-${sortBy}`}
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
                  <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                    {/* Show primary metric prominently */}
                    {sortBy === "holdings" ? (
                      <>
                        <span
                          style={{
                            color: "#000000",
                            fontSize: 13,
                            background: "#c1b400",
                            padding: "4px 10px",
                            borderRadius: 6,
                            fontWeight: 700,
                          }}
                        >
                          💰 {formatTokenBalance(entry.tokenBalance)} $CATWALK
                        </span>
                        {/* Don't show streak/days for Top Holders as requested */}
                      </>
                    ) : (
                      <>
                        {/* Show the appropriate metric based on walk sort mode */}
                        {walkSortMode === "current_streak" ? (
                          <span
                            style={{
                              color: "#000000",
                              fontSize: 13,
                              background: "#c1b400",
                              padding: "4px 10px",
                              borderRadius: 6,
                              fontWeight: 700,
                            }}
                          >
                            🔥 {entry.streak} day{entry.streak === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "#000000",
                              fontSize: 13,
                              background: "#c1b400",
                              padding: "4px 10px",
                              borderRadius: 6,
                              fontWeight: 700,
                            }}
                          >
                            🐱 {entry.total_checkins || 0} walk{entry.total_checkins === 1 ? "" : "s"}
                          </span>
                        )}
                        {/* Don't show token holdings in Most Walks tab */}
                      </>
                    )}
                  </div>
                </div>
              </div>
              ))}
            </div>
            
            {/* Total holdings display */}
            <div
              style={{
                marginTop: 20,
                padding: "16px",
                background: "#000000",
                border: "2px solid #c1b400",
                borderRadius: 12,
                textAlign: "center",
              }}
            >
              <p
                style={{
                  margin: 0,
                  marginBottom: 8,
                  color: "#c1b400",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Total $CATWALK Holdings
              </p>
              <p
                style={{
                  margin: 0,
                  color: "#ffffff",
                  fontSize: 24,
                  fontWeight: 700,
                }}
              >
                {formatTokenBalance(totalHoldings)} $CATWALK
              </p>
            </div>
          </>
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
            <p style={{ color: "#c1b400", fontSize: 24, margin: "0 0 12px 0" }}>
              🏁
            </p>
            <p style={{ color: "#c1b400", fontSize: 12, margin: "0 0 8px 0", fontWeight: 700 }}>
              No leaderboard entries yet
            </p>
            <p style={{ color: "#666666", fontSize: 12, margin: 0, opacity: 0.7 }}>
              Be the first to check in and claim your spot!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
