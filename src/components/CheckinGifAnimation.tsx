"use client";

import { useEffect, useState, useRef } from "react";

interface CheckinGifAnimationProps {
  isVisible: boolean;
  gifUrl?: string; // Optional: allow custom GIF URL
  duration?: number; // Animation duration in milliseconds (default: 5000ms)
  onComplete?: () => void;
}

/**
 * Full-screen GIF animation component for check-in success.
 * Displays a full-screen GIF that plays for 5 seconds (or custom duration).
 * 
 * @param isVisible - Whether the animation should be visible
 * @param gifUrl - URL to the GIF file (defaults to /checkin-animation.gif in public folder)
 * @param duration - Duration in milliseconds (default: 5000ms = 5 seconds)
 * @param onComplete - Callback when animation completes
 */
export function CheckinGifAnimation({
  isVisible,
  gifUrl = "/checkin-animation.gif",
  duration = 5000,
  onComplete,
}: CheckinGifAnimationProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const [gifLoaded, setGifLoaded] = useState(false);
  const [gifError, setGifError] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(Math.ceil(duration / 1000));
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number>(Math.ceil(duration / 1000));
  const onCompleteRef = useRef(onComplete);
  
  // Keep onComplete ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isVisible) {
      // Clean up timers when not visible
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setShouldRender(false);
      setShowGif(false);
      setGifLoaded(false);
      setGifError(false);
      const totalSeconds = Math.ceil(duration / 1000);
      setSecondsLeft(totalSeconds);
      countdownRef.current = totalSeconds;
      return;
    }

    // Prevent multiple intervals from running
    if (intervalRef.current || hideTimerRef.current) {
      return;
    }

    // Start rendering when visible
    setShouldRender(true);

    // Small delay to ensure smooth transition
    const showTimer = setTimeout(() => {
      setShowGif(true);
    }, 50);

    // Initialize countdown with exact seconds
    const totalSeconds = Math.ceil(duration / 1000);
    countdownRef.current = totalSeconds;
    setSecondsLeft(totalSeconds);

    // Countdown interval - update every second, counting down from totalSeconds to 0
    intervalRef.current = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current >= 0) {
        setSecondsLeft(countdownRef.current);
      } else {
        // Ensure interval is cleared when countdown completes
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 1000);

    // Auto-hide after exact duration - guaranteed to close after 5 seconds
    hideTimerRef.current = setTimeout(() => {
      console.log("[CheckinGifAnimation] Auto-dismissing after", duration, "ms");
      setSecondsLeft(0);
      setShowGif(false);
      setShouldRender(false);
      // Clean up interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      hideTimerRef.current = null;
      if (onCompleteRef.current) {
        onCompleteRef.current();
      }
    }, duration);

    return () => {
      clearTimeout(showTimer);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, duration]); // Remove onComplete from dependencies to prevent re-runs

  // Handle GIF load
  const handleGifLoad = () => {
    setGifLoaded(true);
  };

  const handleGifError = () => {
    console.error("[CheckinGifAnimation] Failed to load GIF:", gifUrl);
    // Mark as loaded (so loading indicator disappears) but show error state
    setGifLoaded(true);
    setGifError(true);
    // Note: Timer still runs for full 5 seconds even if GIF fails
  };

  if (!shouldRender) return null;

  // Handle click outside to dismiss
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only dismiss if clicking the backdrop, not the GIF itself
    if (e.target === e.currentTarget) {
      setShowGif(false);
      setShouldRender(false);
      // Clean up timers
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (onCompleteRef.current) {
        onCompleteRef.current();
      }
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        pointerEvents: "all",
        opacity: showGif ? 1 : 0,
        transition: "opacity 0.3s ease-in-out",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onClick={handleBackdropClick}
    >
      {/* GIF container - smaller, centered */}
      <div
        style={{
          width: "70%",
          maxWidth: "500px",
          maxHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          pointerEvents: "none", // Allow clicks to pass through to backdrop
        }}
        onClick={(e) => e.stopPropagation()} // Prevent backdrop click when clicking GIF
      >
        {/* Loading state - show while GIF loads */}
        {!gifLoaded && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "#c1b400",
              fontSize: 24,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            Loading...
          </div>
        )}

        {/* Error state - show if GIF fails to load */}
        {gifError && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "#c1b400",
              fontSize: 24,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            Check-in successful! 🎉
          </div>
        )}

        {/* GIF image - smaller, centered */}
        {!gifError && (
          <img
            src={gifUrl}
            alt="Check-in animation"
            onLoad={handleGifLoad}
            onError={handleGifError}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "center",
              display: gifLoaded ? "block" : "none",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Countdown - bottom right - only show if > 0 */}
        {secondsLeft > 0 && (
          <div
            style={{
              position: "absolute",
              right: 12,
              bottom: 10,
              background: "rgba(0,0,0,0.8)",
              color: "#c1b400",
              border: "1px solid #c1b400",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 12,
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            {secondsLeft}s
          </div>
        )}
      </div>
    </div>
  );
}

