"use client";

import { useEffect, useState } from "react";

interface ConfettiCelebrationProps {
  message: string;
  duration?: number; // Duration in milliseconds (default: 2000ms)
  onComplete?: () => void;
}

/**
 * Small confetti celebration component that shows a message with confetti animation.
 */
export function ConfettiCelebration({
  message,
  duration = 2000,
  onComplete,
}: ConfettiCelebrationProps) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  if (!show) return null;

  // Generate confetti particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 0.5 + Math.random() * 0.5,
  }));

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 100000,
        pointerEvents: "none",
      }}
    >
      {/* Confetti particles */}
      <div style={{ position: "relative", width: "200px", height: "200px" }}>
        {particles.map((particle) => (
          <div
            key={particle.id}
            style={{
              position: "absolute",
              left: `${particle.left}%`,
              top: "50%",
              width: "8px",
              height: "8px",
              background: ["#c1b400", "#ff6b6b", "#4ecdc4", "#ffe66d", "#ff9ff3"][
                particle.id % 5
              ],
              borderRadius: "50%",
              animation: `confetti-fall ${particle.duration}s ease-out ${particle.delay}s forwards`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* Message */}
      <div
        style={{
          background: "#000000",
          border: "2px solid #c1b400",
          borderRadius: 12,
          padding: "16px 24px",
          textAlign: "center",
          marginTop: "20px",
          boxShadow: "0 4px 20px rgba(193, 180, 0, 0.5)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#c1b400",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {message}
        </p>
      </div>

      <style>{`
        @keyframes confetti-fall {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateY(150px) rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

