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
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 36,
          height: 36,
        }}
      >
        <div
          style={{
            fontSize: 28,
            animation: "float 2s ease-in-out infinite",
            color: "#999999",
          }}
        >
          🐱
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {/* Sleeping cat GIF - inline with button text */}
      <div
        style={{
          position: "relative",
          animation: "float 2s ease-in-out infinite",
          width: 36,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          verticalAlign: "middle",
        }}
      >
        {!gifLoaded && (
          <div
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#999999",
              fontSize: 28,
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
              width: 36,
              height: 36,
              objectFit: "contain",
              display: "block",
              verticalAlign: "middle",
            }}
          />
        )}
      </div>
    </div>
  );
}

