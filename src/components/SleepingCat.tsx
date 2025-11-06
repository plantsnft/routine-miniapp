"use client";

import { useEffect, useState } from "react";

/**
 * Sleeping cat component with animated zzz's.
 * Shows when user has checked in for the day.
 */
export function SleepingCat() {
  const [gifLoaded, setGifLoaded] = useState(false);
  const [gifError, setGifError] = useState(false);

  useEffect(() => {
    // Preload the GIF
    const img = new Image();
    img.src = "/sleeping-cat.gif";
    img.onload = () => {
      setGifLoaded(true);
      setGifError(false);
    };
    img.onerror = () => {
      console.error("[SleepingCat] Failed to load GIF: /sleeping-cat.gif");
      setGifError(true);
      setGifLoaded(false);
    };
  }, []);

  if (gifError) {
    // Fallback: show emoji cat if GIF fails to load
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 48,
            animation: "float 2s ease-in-out infinite",
          }}
        >
          🐱
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            fontSize: 16,
            color: "#c1b400",
            fontWeight: 700,
            animation: "fadeInOut 2s ease-in-out infinite",
          }}
        >
          <span style={{ animationDelay: "0s" }}>z</span>
          <span style={{ animationDelay: "0.2s" }}>z</span>
          <span style={{ animationDelay: "0.4s" }}>z</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {/* Sleeping cat GIF */}
      <div
        style={{
          position: "relative",
          animation: "float 2s ease-in-out infinite",
        }}
      >
        {!gifLoaded && (
          <div
            style={{
              width: 64,
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c1b400",
              fontSize: 24,
            }}
          >
            🐱
          </div>
        )}
        {gifLoaded && (
          <img
            src="/sleeping-cat.gif"
            alt="Sleeping cat"
            style={{
              width: 64,
              height: 64,
              objectFit: "contain",
              display: "block",
            }}
          />
        )}
      </div>

      {/* Animated zzz's */}
      <div
        style={{
          display: "flex",
          gap: 4,
          fontSize: 16,
          color: "#c1b400",
          fontWeight: 700,
          height: 20,
          alignItems: "center",
        }}
      >
        <span
          style={{
            animation: "riseFade 2s ease-in-out infinite",
            animationDelay: "0s",
          }}
        >
          z
        </span>
        <span
          style={{
            animation: "riseFade 2s ease-in-out infinite",
            animationDelay: "0.2s",
          }}
        >
          z
        </span>
        <span
          style={{
            animation: "riseFade 2s ease-in-out infinite",
            animationDelay: "0.4s",
          }}
        >
          z
        </span>
      </div>
    </div>
  );
}

