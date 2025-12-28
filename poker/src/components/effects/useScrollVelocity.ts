'use client';

import { useEffect, useRef, useState } from 'react';

interface ScrollVelocity {
  velocity: number;
  direction: number; // -1 (up), 0 (still), 1 (down)
}

/**
 * Tracks scroll velocity with smoothing for smoke wind effects
 */
export function useScrollVelocity(): ScrollVelocity {
  const [velocity, setVelocity] = useState({ velocity: 0, direction: 0 });
  const lastScrollY = useRef(0);
  const lastTime = useRef(Date.now());
  const smoothedVelocity = useRef(0);

  useEffect(() => {
    let rafId: number;

    const handleScroll = () => {
      const now = Date.now();
      const currentScrollY = window.scrollY;
      const deltaTime = Math.max(now - lastTime.current, 1);
      const deltaY = currentScrollY - lastScrollY.current;

      // Calculate raw velocity (px/ms, clamped)
      const rawVelocity = Math.abs(deltaY / deltaTime) * 1000; // Convert to px/s
      const direction = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;

      // Smooth the velocity using exponential moving average (lerp ~0.15)
      const smoothingFactor = 0.15;
      smoothedVelocity.current =
        smoothedVelocity.current * (1 - smoothingFactor) + rawVelocity * smoothingFactor;

      // Apply decay when scroll stops
      if (Math.abs(deltaY) < 0.5) {
        smoothedVelocity.current *= 0.92; // Decay
        if (smoothedVelocity.current < 5) {
          smoothedVelocity.current = 0;
        }
      }

      setVelocity({
        velocity: Math.min(smoothedVelocity.current, 1500), // Cap at 1500px/s
        direction,
      });

      lastScrollY.current = currentScrollY;
      lastTime.current = now;
    };

    // Use RAF for smoother updates
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      handleScroll();
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return velocity;
}




