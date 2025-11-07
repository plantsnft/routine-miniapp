"use client";

import { useEffect, useState } from "react";

/**
 * Sleeping cat component.
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

  // Don't render anything until GIF is loaded or error occurs
  if (!gifLoaded && !gifError) {
    return null;
  }

  // Only show emoji fallback if GIF actually failed to load
  if (gifError) {
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
        <div
          style={{
            width: 70,
            height: 70,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "float 2s ease-in-out infinite",
            fontSize: 42,
            color: "#999999",
            backgroundColor: "transparent",
          }}
        >
          🐱
        </div>
      </div>
    );
  }

  // Show GIF once loaded
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
      <div
        style={{
          width: 70,
          height: 70,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "float 2s ease-in-out infinite",
          backgroundColor: "transparent",
        }}
      >
        <img
          src="/sleeping-cat.gif"
          alt="Sleeping cat"
          style={{
            width: 70,
            height: 70,
            objectFit: "contain",
            display: "block",
            verticalAlign: "middle",
            backgroundColor: "transparent",
            mixBlendMode: "normal",
          }}
        />
      </div>
    </div>
  );
}

