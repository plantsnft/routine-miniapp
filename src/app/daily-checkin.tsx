"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/hooks/useAuth";
import { useCheckin } from "~/hooks/useCheckin";
import { CheckinGifAnimation } from "~/components/CheckinGifAnimation";
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
    // When user signs in, fetch their streak (only if not already loading)
    if (fid && !checkin.loading) {
      checkin.fetchStreak(fid);
    }
  });

  // Initial fetch when fid is available (only once, prevent infinite loops)
  useEffect(() => {
    if (!fid || checkin.loading || checkin.status.streak !== null) return;
    
    // Only fetch if we don't have streak data yet
    checkin.fetchStreak(fid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid]); // Only depend on fid to prevent infinite loops

  // Update countdown timer every minute when checked in (only if not loading)
  useEffect(() => {
    if (!checkin.status.checkedIn || !fid || checkin.loading) return;

    const updateTimer = () => {
      // Only update if not currently loading to prevent overlapping requests
      if (fid && !checkin.loading) {
        checkin.fetchStreak(fid);
      }
    };

    // Don't fetch immediately - wait for the interval
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkin.status.checkedIn, fid, checkin.loading]);

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
      {/* Full-screen GIF animation on check-in success */}
      <CheckinGifAnimation
        isVisible={showAnimation}
        gifUrl="/checkin-animation.gif"
        duration={5000}
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
          overflow: "visible",
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

        {/* Question prompt with arrow - only show when user hasn't checked in */}
        {fid && !checkin.status.checkedIn && !checkin.saving && (
          <>
            <div
              style={{
                marginBottom: 20,
                padding: "20px",
                background: "#000000",
                border: "3px solid #c1b400",
                borderRadius: 12,
                textAlign: "center",
                position: "relative",
                boxShadow: "0 0 20px rgba(193, 180, 0, 0.3)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  marginBottom: 16,
                  color: "#c1b400",
                  fontSize: 16,
                  fontWeight: 700,
                  textShadow: "0 0 10px rgba(193, 180, 0, 0.5)",
                }}
              >
                Did you walk your cat today?
              </p>
            </div>
            
            {/* Small red arrow coming from right side pointing at the button */}
            <div
              className="arrow-pointer"
              style={{
                position: "absolute",
                right: "-40px",
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
            >
              <div style={{ position: "relative" }}>
                {/* Red glow effect behind arrow */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(255, 68, 68, 0.4) 0%, transparent 70%)",
                    animation: "pulseGlow 1.2s ease-in-out infinite",
                  }}
                />
                <svg
                  width="33"
                  height="33"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ff4444"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: "relative",
                    zIndex: 1,
                    filter: "drop-shadow(0 0 8px rgba(255, 68, 68, 1)) drop-shadow(0 0 16px rgba(255, 68, 68, 0.6))",
                  }}
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </div>
            </div>
            
            <style>{`
              @keyframes pulseArrow {
                0%, 100% {
                  transform: translateY(-50%) translateX(0) scale(1);
                  opacity: 1;
                }
                50% {
                  transform: translateY(-50%) translateX(-10px) scale(1.1);
                  opacity: 0.9;
                }
              }
              
              @keyframes pulseGlow {
                0%, 100% {
                  opacity: 0.6;
                  transform: translate(-50%, -50%) scale(1);
                }
                50% {
                  opacity: 1;
                  transform: translate(-50%, -50%) scale(1.3);
                }
              }
              
              .arrow-pointer {
                animation: pulseArrow 1.2s ease-in-out infinite;
              }
            `}</style>
          </>
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
