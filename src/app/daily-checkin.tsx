"use client";

import { useEffect, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export default function DailyCheckin() {
  const [fid, setFid] = useState<number | null>(null);
  const [_loadingUser, setLoadingUser] = useState(true);

  const [checkedIn, setCheckedIn] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState<string | null>(null);
  const [_loadingStreak, setLoadingStreak] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [animationKeyframes, setAnimationKeyframes] = useState<string>("");

  // Helper function to calculate time until next 9 AM Pacific
  const calculateTimeUntilNext = (): string => {
    const now = new Date();
    
    // Get current time components in Pacific timezone
    const pacificFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const pacificParts = pacificFormatter.formatToParts(now);
    const pacificHour = parseInt(pacificParts.find(p => p.type === "hour")?.value || "0");
    const pacificMinute = parseInt(pacificParts.find(p => p.type === "minute")?.value || "0");
    
    // Calculate hours and minutes until next 9 AM Pacific
    let hoursUntil = 0;
    let minutesUntil = 0;
    
    if (pacificHour >= 9) {
      // Next check-in is tomorrow at 9 AM
      hoursUntil = (24 - pacificHour) + 9 - 1; // Hours until midnight + 9 hours
      minutesUntil = 60 - pacificMinute;
    } else {
      // Next check-in is today at 9 AM
      hoursUntil = 9 - pacificHour - 1; // Hours until 9 AM
      minutesUntil = 60 - pacificMinute;
    }
    
    // Adjust for minutes
    if (minutesUntil >= 60) {
      hoursUntil += 1;
      minutesUntil -= 60;
    }
    
    // Format the result
    if (hoursUntil > 0) {
      return `${hoursUntil}h ${minutesUntil}m`;
    }
    return `${minutesUntil}m`;
  };

  // Update countdown timer every minute
  useEffect(() => {
    if (!checkedIn) return; // Only show countdown if already checked in
    
    const updateTimer = () => {
      setTimeUntilNext(calculateTimeUntilNext());
    };
    
    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [checkedIn]);

  // Function to format last check-in date/time
  const formatLastCheckIn = (timestamp: string | null): string => {
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
  };

  // Function to fetch user's streak from the API
  const fetchStreak = useCallback(async (userId: number) => {
    try {
      setLoadingStreak(true);
      const res = await fetch(`/api/checkin?fid=${userId}`);
      const data = await res.json();
      
      if (data?.ok) {
        setStreak(data.streak || 0);
        setLastCheckIn(data.last_checkin || null);
        // Check if user has already checked in today (based on 9 AM Pacific reset)
        setCheckedIn(data.hasCheckedInToday || false);
        // Update countdown if already checked in
        if (data.hasCheckedInToday) {
          setTimeUntilNext(calculateTimeUntilNext());
        }
      }
    } catch (err) {
      console.error("Error fetching streak:", err);
      // Don't show error to user, just don't update streak
    } finally {
      setLoadingStreak(false);
    }
  }, []);

  // Auto-sign in when opened in Warpcast/Farcaster mini app
  useEffect(() => {
    const autoSignIn = async () => {
      // Check if we're in a Farcaster/Warpcast context
      const isInWarpcast = typeof window !== "undefined" && 
        ((window as any).farcaster || sdk?.actions?.signIn);
      
      // If we already have an FID, don't try to sign in again
      if (fid || !isInWarpcast) {
        setLoadingUser(false);
        return;
      }

      // Try to resolve from query string first (for dev/testing)
      try {
        const qs = typeof window !== "undefined" ? window.location.search : "";
        if (qs) {
          const res = await fetch("/api/siwn" + qs);
          const data = await res.json();
          if (data?.ok && data?.fid) {
            const userId = Number(data.fid);
            setFid(userId);
            setErrorMessage("");
            await fetchStreak(userId);
            setLoadingUser(false);
            return;
          }
        }
      } catch (_e) {
        // Continue to auto-sign in
      }

      // Auto-sign in using SDK
      try {
        setErrorMessage("");
        
        if (!sdk?.actions?.signIn) {
          setLoadingUser(false);
          return;
        }

        // Generate nonce and auto-sign in
        const nonce = Math.random().toString(36).slice(2);
        const result = await sdk.actions.signIn({
          nonce,
          acceptAuthAddress: true,
        });

        if (!result) {
          setLoadingUser(false);
          return;
        }

        // Verify with backend
        const resp = await fetch("/api/siwn", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...result,
            nonce,
          }),
        });

        const json = await resp.json();

        if (resp.ok && json?.ok && json?.fid) {
          const userId = Number(json.fid);
          setFid(userId);
          setErrorMessage("");
          await fetchStreak(userId);
        } else {
          // Silent fail - user can still manually sign in if needed
          console.error("[SIWN] Auto-sign in failed:", json?.error);
        }
      } catch (err) {
        // Silent fail - user can still manually sign in if needed
        console.error("[SIWN] Auto-sign in error:", err);
      } finally {
        setLoadingUser(false);
      }
    };

    autoSignIn();
  }, [fetchStreak, fid]);

  // 2) real SIWN inside Warpcast
  const handleSignIn = async () => {
    try {
      setErrorMessage("");
      
      // Check if SDK actions are available
      // When opened in a regular browser (not Warpcast), sdk.actions.signIn might not exist
      if (!sdk?.actions?.signIn) {
        setErrorMessage(
          "Sign-in is not available. Please open this app inside Warpcast by clicking a link in a cast, not in a regular web browser."
        );
        return;
      }

      // ask the host for SIWN
      const nonce = Math.random().toString(36).slice(2);
      
      let result;
      try {
        result = await sdk.actions.signIn({
          nonce,
          acceptAuthAddress: true,
        });
      } catch (signInError: any) {
        console.error("[SIWN] signIn error:", signInError);
        setErrorMessage(
          signInError?.message ||
            "Failed to initiate sign-in. Please ensure you're in Warpcast and try again."
        );
        return;
      }

      // Validate result structure
      if (!result) {
        setErrorMessage("Sign-in returned no result. Please try again.");
        return;
      }

      // result should have hash, signature, maybe fid
      // 👇 Include nonce in the request body (Neynar requires it for verification)
      const resp = await fetch("/api/siwn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // send what Warpcast gave us PLUS the nonce we generated
        body: JSON.stringify({
          ...result,
          nonce, // Include the nonce we generated
        }),
      });

      const json = await resp.json();

      if (resp.ok && json?.ok && json?.fid) {
        const userId = Number(json.fid);
        setFid(userId);
        setErrorMessage("");
        // Fetch streak after signing in
        await fetchStreak(userId);
      } else {
        setErrorMessage(
          json?.error || "Signed in but server could not resolve FID."
        );
      }
    } catch (err: any) {
      console.error("[SIWN] handleSignIn error:", err);
      setErrorMessage(
        err?.message ||
          "Sign-in failed. Please open this inside Warpcast and try again."
      );
    }
  };

  const handleCheckIn = async () => {
    if (checkedIn || status === "saving") return;

    if (!fid) {
      setStatus("error");
      setErrorMessage(
        "No Farcaster user found. Tap ‘Sign in with Farcaster’ first."
      );
      return;
    }

    setStatus("saving");
    setErrorMessage("");

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setCheckedIn(true);
        // Update streak from the response (server returns the new streak)
        if (data.streak !== undefined) {
          setStreak(data.streak);
        } else {
          // Fallback: increment if we have a current streak
          setStreak((s) => (s ?? 0) + 1);
        }
        // Update last check-in time to now
        setLastCheckIn(new Date().toISOString());
        // Update countdown
        setTimeUntilNext(calculateTimeUntilNext());
        
        // Generate dramatic animation keyframes for success animation
        // More chips, longer duration, more dramatic movement
        const chipCount = 50;
        const animations: string[] = [];
        
        for (let i = 0; i < chipCount; i++) {
          const randomX = (Math.random() - 0.5) * 1200; // Much larger horizontal spread
          const randomY = Math.random() * 800 - 400; // Larger vertical spread
          const rotation = Math.random() * 1440 - 720; // More rotation (2-4 full rotations)
          const scale = 0.2 + Math.random() * 0.3; // Vary final scale
          const delay = Math.random() * 0.5; // Stagger the start times
          const duration = 4 + Math.random() * 2; // 4-6 seconds duration
          const bounceY = Math.random() * 200 - 100; // Add bounce effect
          
          animations.push(`
            @keyframes chipFly${i} {
              0% {
                transform: translateY(-50%) translateX(0) rotate(0deg) scale(1);
                opacity: 1;
              }
              20% {
                transform: translateY(-50%) translateX(${randomX * 0.3}px) translateY(${randomY * 0.3 + bounceY}px) rotate(${rotation * 0.2}deg) scale(1.2);
                opacity: 1;
              }
              50% {
                transform: translateY(-50%) translateX(${randomX * 0.7}px) translateY(${randomY * 0.7}px) rotate(${rotation * 0.5}deg) scale(0.8);
                opacity: 0.8;
              }
              100% {
                transform: translateY(-50%) translateX(${randomX}px) translateY(${randomY}px) rotate(${rotation}deg) scale(${scale});
                opacity: 0;
              }
            }
            .chip-${i} {
              animation: chipFly${i} ${duration}s ease-out ${delay}s forwards;
            }
          `);
        }
        
        setAnimationKeyframes(animations.join(""));
        
        setStatus("done");
      } else if (res.status === 409) {
        // Already checked in today - fetch current streak to show it
        if (fid) {
          await fetchStreak(fid);
        }
        setStatus("error");
        setCheckedIn(true); // Show as checked in
        setErrorMessage(
          data?.error || 
          "You've already checked in today! Come back at 9 AM Pacific time tomorrow."
        );
      } else {
        setStatus("error");
        setErrorMessage(data?.detail || data?.error || "Unknown error");
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err?.message || "Network error");
    }
  };

  return (
    <>
      {/* Success animation - dramatic logo chips flying like poker chips */}
      {status === "done" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            pointerEvents: "none",
            overflow: "hidden",
            background: "rgba(0, 0, 0, 0.3)", // Slight background dim for effect
          }}
        >
          {Array.from({ length: 50 }, (_, i) => {
            // Distribute chips across screen with more variation
            const leftPos = (i * 2) % 100;
            // Generate consistent random values per chip index
            const seed = i * 7919; // Use prime number for better distribution
            const size = 50 + (seed % 40); // Vary chip sizes (50-90px)
            const isGold = (seed % 2) === 0; // Alternate gold or black
            
            return (
              <div
                key={i}
                className={`chip-${i}`}
                style={{
                  position: "absolute",
                  left: `${leftPos}%`,
                  top: "50%",
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: "50%",
                  background: isGold ? "#c1b400" : "#000000",
                  border: isGold ? "4px solid #000000" : "4px solid #c1b400",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: `${size * 0.4}px`,
                  transform: "translateY(-50%)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5), 0 0 20px rgba(193, 180, 0, 0.3)",
                  filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))",
                }}
              >
                🐾
              </div>
            );
          })}
          {animationKeyframes && <style>{animationKeyframes}</style>}
        </div>
      )}

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
          Check in once per day to keep your streak and earn $CATWALK later.
        </p>

        {/* Display current streak and check-in info if user is signed in */}
        {fid && streak !== null && streak > 0 && (
          <div
            style={{
              marginBottom: 16,
              padding: 14,
              background: "#c1b400",
              borderRadius: 12,
              border: "2px solid #000000",
            }}
          >
            <p
              style={{
                margin: 0,
                marginBottom: 6,
                color: "#000000",
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              🔥 {streak} day{streak === 1 ? "" : "s"} streak
            </p>
            {lastCheckIn && (
              <p style={{ margin: 0, marginBottom: 4, color: "#000000", fontSize: 13, opacity: 0.8 }}>
                Last check-in: {formatLastCheckIn(lastCheckIn)}
              </p>
            )}
            {checkedIn && timeUntilNext && (
              <p style={{ margin: 0, color: "#000000", fontSize: 13, fontWeight: 500 }}>
                Next check-in: {timeUntilNext} (9 AM Pacific)
              </p>
            )}
          </div>
        )}

        {/* show sign-in button only as fallback if auto-sign in failed and we're not in Warpcast */}
        {!fid && typeof window !== "undefined" && !(window as any).farcaster && !sdk?.actions?.signIn ? (
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
        ) : null}

        {/* main check-in button */}
        <button
          onClick={handleCheckIn}
          disabled={checkedIn || status === "saving"}
          style={{
            background:
              checkedIn || status === "saving"
                ? "#666666"
                : "#c1b400",
            color: checkedIn ? "#999999" : "#000000",
            border: "2px solid #000000",
            borderRadius: 9999,
            padding: "12px 24px",
            cursor: checkedIn || status === "saving" ? "not-allowed" : "pointer",
            fontWeight: 700,
            width: "100%",
            fontSize: 16,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!checkedIn && status !== "saving") {
              e.currentTarget.style.background = "#d4c700";
            }
          }}
          onMouseLeave={(e) => {
            if (!checkedIn && status !== "saving") {
              e.currentTarget.style.background = "#c1b400";
            }
          }}
        >
          {status === "saving"
            ? "Saving..."
            : checkedIn
            ? "✅ Checked in for today"
            : "Daily /Catwalk Checkin"}
        </button>

        {status === "done" && (
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
            {streak !== null && (
              <p style={{ margin: 0, color: "#000000", fontWeight: 700, fontSize: 20 }}>
                🔥 {streak} day{streak === 1 ? "" : "s"} streak
              </p>
            )}
            {timeUntilNext && (
              <p style={{ margin: 0, marginTop: 6, color: "#000000", fontSize: 13, opacity: 0.8 }}>
                Next check-in: {timeUntilNext} (9 AM Pacific)
              </p>
            )}
          </div>
        )}
        {(status === "error" || errorMessage) && (
          <p style={{ marginTop: 12, color: "#c1b400", fontWeight: 600 }}>
            {errorMessage || "Couldn't save to Supabase ❌"}
          </p>
        )}
      </div>
    </>
  );
}
