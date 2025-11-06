/**
 * Streak display component showing user's current streak and last check-in info.
 */

"use client";

interface StreakDisplayProps {
  streak: number | null;
  lastCheckIn: string | null;
  checkedIn: boolean;
  timeUntilNext: string | null;
}

function formatLastCheckIn(timestamp: string | null): string {
  if (!timestamp) return "";

  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;

    // Format as date
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return formatter.format(date);
  } catch {
    return "";
  }
}

export function StreakDisplay({
  streak,
  lastCheckIn,
  checkedIn,
  timeUntilNext,
}: StreakDisplayProps) {
  if (streak === null || streak === 0) return null;

  return (
    <div
      style={{
        marginBottom: 8,
        padding: 8,
        background: "#c1b400",
        borderRadius: 8,
        border: "1px solid #000000",
      }}
    >
      <p
        style={{
          margin: 0,
          marginBottom: 4,
          color: "#000000",
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        🔥 {streak} day{streak === 1 ? "" : "s"} streak
      </p>
      {!checkedIn && lastCheckIn && (
        <p style={{ margin: 0, marginBottom: 2, color: "#000000", fontSize: 10, opacity: 0.8 }}>
          Last check-in: {formatLastCheckIn(lastCheckIn)}
        </p>
      )}
      {checkedIn && timeUntilNext && (
        <p style={{ margin: 0, color: "#000000", fontSize: 10, fontWeight: 400 }}>
          Next check-in: {timeUntilNext} (9 AM Pacific)
        </p>
      )}
    </div>
  );
}

