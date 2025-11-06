/**
 * Check-in button component with loading and disabled states.
 */

"use client";

import { SleepingCat } from "./SleepingCat";

interface CheckinButtonProps {
  checkedIn: boolean;
  saving: boolean;
  onClick: () => void;
}

export function CheckinButton({ checkedIn, saving, onClick }: CheckinButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={checkedIn || saving}
      style={{
        background: checkedIn || saving ? "#666666" : "#c1b400",
        color: checkedIn ? "#999999" : "#000000",
        border: "2px solid #000000",
        borderRadius: 9999,
        padding: "12px 24px",
        cursor: checkedIn || saving ? "not-allowed" : "pointer",
        fontWeight: 700,
        width: "100%",
        fontSize: 16,
        transition: "all 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
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
      {checkedIn && <SleepingCat />}
      <span>{saving ? "Saving..." : checkedIn ? "Cat is Resting" : "Walk Your Cat"}</span>
    </button>
  );
}

