"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/hooks/useAuth";
import { useCheckin } from "~/hooks/useCheckin";
import { CheckinAnimation } from "~/components/CheckinAnimation";
import { CheckinButton } from "~/components/CheckinButton";
import { StreakDisplay } from "~/components/StreakDisplay";
import { isInWarpcast } from "~/lib/auth";

/**
 * Daily check-in component.
 * Handles authentication, streak tracking, and check-in functionality.
 */
export default function DailyCheckin() {
  const [showAnimation, setShowAnimation] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Use checkin hook for check-in functionality
  const checkin = useCheckin();

  // Use auth hook for authentication
  const { fid, error: authError, signIn } = useAuth((fid) => {
    // When user signs in, fetch their streak
    checkin.fetchStreak(fid);
  });

  // Update countdown timer every minute when checked in
  useEffect(() => {
    if (!checkin.status.checkedIn) return;

    const updateTimer = () => {
      // This will be handled by the hook, but we can update the display
      if (fid) {
        checkin.fetchStreak(fid);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [checkin.status.checkedIn, fid, checkin]);

  /**
   * Handle check-in button click.
   */
  const handleCheckIn = async () => {
    if (!fid) {
      checkin.clearError();
      return;
    }

    const result = await checkin.performCheckIn(fid);

    if (result.success) {
      setShowAnimation(true);
      setShowSuccessMessage(true);
    }
  };

  /**
   * Handle manual sign-in button click.
   */
  const handleSignIn = async () => {
    await signIn();
  };

  return (
    <>
      {/* Success animation */}
      <CheckinAnimation
        isVisible={showAnimation}
        onComplete={() => {
          setShowAnimation(false);
        }}
      />

      <div
        style={{
          marginTop: 0,
          background: "#000000",
          border: "2px solid #c1b400",
          borderRadius: 16,
          padding: 20,
          position: "relative",
        }}
      >
        <p style={{ margin: 0, marginBottom: 16, color: "#ffffff", fontSize: 14, lineHeight: 1.5 }}>
          Check in once per day to keep your streak and earn{" "}
          <a
            href="https://dexscreener.com/base/0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#c1b400",
              textDecoration: "underline",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            $CATWALK
          </a>{" "}
          later.
        </p>

        {/* Display current streak and check-in info if user is signed in */}
        {fid && checkin.status.streak !== null && checkin.status.streak > 0 && (
          <StreakDisplay
            streak={checkin.status.streak}
            lastCheckIn={checkin.status.lastCheckIn}
            checkedIn={checkin.status.checkedIn}
            timeUntilNext={checkin.status.timeUntilNext}
          />
        )}

        {/* Show sign-in button only as fallback if auto-sign in failed and we're not in Warpcast */}
        {!fid &&
          typeof window !== "undefined" &&
          !isInWarpcast() && (
            <button
              onClick={handleSignIn}
              style={{
                background: "#c1b400",
                color: "#000000",
                border: "2px solid #000000",
                borderRadius: 9999,
                padding: "12px 24px",
                cursor: "pointer",
                fontWeight: 700,
                marginBottom: 12,
                width: "100%",
                fontSize: 16,
              }}
            >
              Sign in with Farcaster
            </button>
          )}

        {/* Main check-in button */}
        <CheckinButton
          checkedIn={checkin.status.checkedIn}
          saving={checkin.saving}
          onClick={handleCheckIn}
        />

        {/* Success message */}
        {showSuccessMessage && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              background: "#c1b400",
              borderRadius: 12,
              border: "3px solid #000000",
            }}
          >
            <p
              style={{
                margin: 0,
                marginBottom: 8,
                color: "#000000",
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              ✅ Saved successfully!
            </p>
            <p style={{ margin: 0, marginBottom: 10, color: "#000000", fontSize: 14, opacity: 0.9 }}>
              Thank you for taking a virtual catwalk today
            </p>
            {checkin.status.streak !== null && (
              <p style={{ margin: 0, color: "#000000", fontWeight: 700, fontSize: 20 }}>
                🔥 {checkin.status.streak} day{checkin.status.streak === 1 ? "" : "s"} streak
              </p>
            )}
            {checkin.status.timeUntilNext && (
              <p style={{ margin: 0, marginTop: 6, color: "#000000", fontSize: 13, opacity: 0.8 }}>
                Next check-in: {checkin.status.timeUntilNext} (9 AM Pacific)
              </p>
            )}
            {checkin.status.lastCheckIn && (
              <p style={{ margin: 0, marginTop: 6, color: "#000000", fontSize: 13, opacity: 0.8 }}>
                Checked in today: {new Date(checkin.status.lastCheckIn).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </p>
            )}
          </div>
        )}

        {/* Error message */}
        {(checkin.error || authError) && (
          <p style={{ marginTop: 12, color: "#c1b400", fontWeight: 600 }}>
            {checkin.error || authError || "An error occurred ❌"}
          </p>
        )}
      </div>
    </>
  );
}
