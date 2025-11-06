"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!isVisible) {
      setShouldRender(false);
      setShowGif(false);
      setGifLoaded(false);
      setGifError(false);
      setSecondsLeft(Math.ceil(duration / 1000));
      return;
    }

    // Start rendering when visible
    setShouldRender(true);
    const startTime = Date.now();

    // Small delay to ensure smooth transition
    const showTimer = setTimeout(() => {
      setShowGif(true);
    }, 50);

    // Countdown interval - update every second
    setSecondsLeft(Math.ceil(duration / 1000));
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-hide after exact duration - guaranteed to close
    const hideTimer = setTimeout(() => {
      setShowGif(false);
      setShouldRender(false);
      onComplete?.();
    }, duration);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearInterval(interval);
    };
  }, [isVisible, duration, onComplete]);

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

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        pointerEvents: "all", // Block all interactions - mandatory viewing
        opacity: showGif ? 1 : 0,
        transition: "opacity 0.3s ease-in-out",
        userSelect: "none", // Prevent text selection
        WebkitUserSelect: "none",
      }}
    >
      {/* GIF container - full screen, centered */}
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
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

        {/* GIF image - full screen */}
        {!gifError && (
          <img
            src={gifUrl}
            alt="Check-in animation"
            onLoad={handleGifLoad}
            onError={handleGifError}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain", // Maintain aspect ratio, fit within screen
              objectPosition: "center",
              display: gifLoaded ? "block" : "none",
            }}
          />
        )}

        {/* Optional: Add a subtle overlay or effects */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
            // Subtle gradient overlay for better visibility
            background: "radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.1) 100%)",
          }}
        />
        {/* Countdown - bottom right */}
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 10,
            background: "rgba(0,0,0,0.6)",
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
        
        {/* Prevent any clicks or interactions during mandatory viewing */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "all",
            cursor: "default",
          }}
          onClick={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

