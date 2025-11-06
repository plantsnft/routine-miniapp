/**
 * Check-in button component with loading and disabled states.
 */

"use client";

import { SleepingCat } from "./SleepingCat";

interface CheckinButtonProps {
  checkedIn: boolean;
  saving: boolean;
  onClick: () => void;
  streak?: number | null;
  totalCheckins?: number | null;
  timeUntilNext?: string | null;
}

export function CheckinButton({ 
  checkedIn, 
  saving, 
  onClick,
  streak,
  totalCheckins,
  timeUntilNext,
}: CheckinButtonProps) {
  const basePadding = 8;
  const tallerPadding = Math.round(basePadding * 1.35); // 35% taller

  return (
    <button
      onClick={onClick}
      disabled={checkedIn || saving}
      style={{
        background: checkedIn || saving ? "#666666" : "#c1b400",
        color: checkedIn ? "#999999" : "#000000",
        border: "2px solid #000000",
        borderRadius: 9999,
        padding: checkedIn && streak ? `${tallerPadding}px 24px` : "8px 24px",
        cursor: checkedIn || saving ? "not-allowed" : "pointer",
        fontWeight: 700,
        width: "100%",
        fontSize: 16,
        transition: "all 0.2s",
        display: "flex",
        flexDirection: checkedIn && streak ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: checkedIn && streak ? 4 : 8,
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!checkedIn && !saving) {
          e.currentTarget.style.background = "#d4c700";
        }
      }}
      onMouseLeave={(e) => {
        if (!checkedIn && !saving) {
          e.currentTarget.style.background = "#c1b400";
        }
      }}
    >
      {checkedIn && streak ? (
        <>
          {/* Top center: Days catwalking straight */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            gap: 6,
            width: "100%",
          }}>
            <span style={{ display: "inline-block", lineHeight: 1 }}>
              Cat is Resting
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}>
              <SleepingCat />
            </span>
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#000000",
            textAlign: "center",
            width: "100%",
          }}>
            {streak} Day{streak === 1 ? "" : "s"} Catwalking Straight
          </div>
          {/* Bottom row: timer left, lifetime right */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            fontSize: 10,
            fontWeight: 400,
            marginTop: 2,
          }}>
            {timeUntilNext && (
              <span style={{ color: "#000000" }}>
                Next walk starts {timeUntilNext}
              </span>
            )}
            {totalCheckins !== null && totalCheckins !== undefined && totalCheckins > 0 && (
              <span style={{ 
                color: "#000000",
                marginLeft: timeUntilNext ? 8 : 0,
              }}>
                Lifetime Catwalks: {totalCheckins}
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <span style={{ display: "inline-block", lineHeight: 1 }}>
            {saving ? "Saving..." : "Walk Your Cat"}
          </span>
        </>
      )}
    </button>
  );
}

