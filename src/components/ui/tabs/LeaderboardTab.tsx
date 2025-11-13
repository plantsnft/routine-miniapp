"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { LeaderboardEntry } from "~/lib/models";
import { useHapticFeedback } from "~/hooks/useHapticFeedback";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";

const DEFAULT_PFP = "https://warpcast.com/~/assets/default-avatar.png";

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
  const { triggerHaptic } = useHapticFeedback();
  const [sortBy, setSortBy] = useState<SortBy>("streak");
  const [walkSortMode, setWalkSortMode] = useState<WalkSortMode>("current_streak");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalHolders, setTotalHolders] = useState<number | null>(null);
  
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
          setTotalHolders(data?.totalHolders || null);
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
            onClick={() => {
              triggerHaptic("light");
              setSortBy("streak");
            }}
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
          <button
            onClick={() => {
              triggerHaptic("light");
              setSortBy("holdings");
            }}
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
              onClick={() => {
                triggerHaptic("light");
                setWalkSortMode("current_streak");
              }}
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
              onClick={() => {
                triggerHaptic("light");
                setWalkSortMode("all_time");
              }}
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
                triggerHaptic("light");
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
                      setTotalHolders(data?.totalHolders || null);
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

        {/* Coming Soon placeholder for Top Holders */}
        {!loading && !error && sortBy === "holdings" && entries.length === 0 && (
          <div
            style={{
              padding: "40px 20px",
              background: "#000000",
              border: "2px solid #c1b400",
              borderRadius: 12,
              textAlign: "center",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* Scrolling ticker text */}
            <div
              style={{
                overflow: "hidden",
                whiteSpace: "nowrap",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  animation: "ticker 20s linear infinite",
                  color: "#c1b400",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                🚧 Coming Soon • The Top Holders leaderboard is being built • Check back soon to see who holds the most $CATWALK tokens! • 🚧 Coming Soon • The Top Holders leaderboard is being built • Check back soon to see who holds the most $CATWALK tokens! •
              </div>
            </div>
            
            {/* Buy Button */}
            <a
              href="https://app.uniswap.org/swap?chain=base&outputCurrency=0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => triggerHaptic("light")}
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "#c1b400",
                color: "#000000",
                border: "2px solid #c1b400",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#d4c500";
                e.currentTarget.style.borderColor = "#d4c500";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#c1b400";
                e.currentTarget.style.borderColor = "#c1b400";
              }}
            >
              Buy $CATWALK Here
            </a>
          </div>
        )}

        {/* Leaderboard entries */}
        {!loading && !error && entries.length > 0 && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {entries.map((entry) => {
                const displayLabel = entry.displayName?.trim() || "";
                const usernameLabel = entry.username ? `@${entry.username}` : `FID ${entry.fid}`;
                const primaryText = displayLabel || usernameLabel;
                const linkHref =
                  entry.profileUrl || `https://warpcast.com/~/users/${entry.fid.toString()}`;

                return (
              <div
                key={`${entry.fid}-${sortBy}`}
                style={{
                  padding: "4px 8px",
                  background: "#000000",
                  border: "2px solid #c1b400",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    minWidth: "24px",
                    textAlign: "center",
                    color: "#c1b400",
                    fontSize: entry.rank <= 3 ? 12 : 10,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {getRankEmoji(entry.rank)}
                </div>

                {/* Profile Picture */}
                <Link
                  href={linkHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center" }}
                  aria-label={`View Farcaster profile for ${primaryText}`}
                >
                  <img
                    src={entry.pfp_url || DEFAULT_PFP}
                    alt={primaryText}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "1px solid #c1b400",
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                </Link>

                {/* Name and badge in one line */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                  <Link
                    href={linkHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#ffffff",
                      fontSize: 11,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: 1.2,
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span>{primaryText}</span>
                    {CATWALK_CREATOR_FIDS.includes(entry.fid) && (
                      <span style={{ color: "#c1b400", fontWeight: 700, fontSize: 10 }}>
                        🐱 Catwalk Creator
                      </span>
                    )}
                  </Link>
                  {/* Yellow badge inline */}
                  {sortBy === "holdings" ? (
                    <span
                      style={{
                        color: "#000000",
                        fontSize: 9,
                        background: "#c1b400",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      💰 {formatTokenBalance(entry.tokenBalance)} $CATWALK
                    </span>
                  ) : (
                    walkSortMode === "current_streak" ? (
                      <span
                        style={{
                          color: "#000000",
                          fontSize: 9,
                          background: "#c1b400",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        🔥 {entry.streak} day{entry.streak === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span
                        style={{
                          color: "#000000",
                          fontSize: 9,
                          background: "#c1b400",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        🐱 {entry.total_checkins || 0} walk{entry.total_checkins === 1 ? "" : "s"}
                      </span>
                    )
                  )}
                </div>
              </div>
              );
            })}
            </div>
            
            {/* Total holdings and holders display */}
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
              {sortBy === "holdings" && totalHolders !== null && (
                <p
                  style={{
                    margin: 0,
                    marginBottom: 12,
                    color: "#c1b400",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Total Token Holders: {totalHolders.toLocaleString()}
                </p>
              )}
              <p
                style={{
                  margin: 0,
                  marginBottom: 8,
                  color: "#c1b400",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {sortBy === "holdings" ? "Farcaster Users Holdings" : "Total $CATWALK Holdings"}
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

        {/* Empty state - only show for streak mode, not holdings */}
        {!loading && !error && entries.length === 0 && sortBy !== "holdings" && (
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
