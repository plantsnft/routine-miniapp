/**
 * Streak display component showing user's current streak and last check-in info.
 */

"use client";

interface StreakDisplayProps {
  streak: number | null;
  totalCheckins: number | null;
  lastCheckIn: string | null;
  checkedIn: boolean;
  timeUntilNext: string | null;
}

export function StreakDisplay({
  streak,
  totalCheckins,
  lastCheckIn: _lastCheckIn,
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
      {/* First line: Streak */}
      <p
        style={{
          margin: 0,
          marginBottom: 4,
          color: "#000000",
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        {streak} Day{streak === 1 ? "" : "s"} Catwalking Straight 🔥
      </p>
      {/* Second line: Next walk starts and Lifetime catwalks on same line */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {checkedIn && timeUntilNext && (
          <span style={{ color: "#000000", fontSize: 10, fontWeight: 400 }}>
            Next walk starts {timeUntilNext}
          </span>
        )}
        {totalCheckins !== null && totalCheckins > 0 && (
          <span style={{ color: "#000000", fontSize: 10, fontWeight: 400, marginLeft: checkedIn && timeUntilNext ? 8 : 0 }}>
            Lifetime Catwalks: {totalCheckins}
          </span>
        )}
      </div>
    </div>
  );
}

