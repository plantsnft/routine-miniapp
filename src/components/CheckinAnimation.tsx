/**
 * Check-in success animation component.
 * Displays flying chip animation when user successfully checks in.
 */

"use client";

import { useState, useEffect } from "react";

interface CheckinAnimationProps {
  isVisible: boolean;
  onComplete?: () => void;
}

const CHIP_COUNT = 50;
const ANIMATION_DURATION = 6000; // 6 seconds max

export function CheckinAnimation({ isVisible, onComplete }: CheckinAnimationProps) {
  const [animationKeyframes, setAnimationKeyframes] = useState<string>("");

  useEffect(() => {
    if (!isVisible) {
      setAnimationKeyframes("");
      return;
    }

    // Generate dramatic animation keyframes for success animation
    const animations: string[] = [];

    for (let i = 0; i < CHIP_COUNT; i++) {
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

    // Call onComplete after animation finishes
    const timer = setTimeout(() => {
      onComplete?.();
    }, ANIMATION_DURATION);

    return () => clearTimeout(timer);
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
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
      {Array.from({ length: CHIP_COUNT }, (_, i) => {
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
  );
}

