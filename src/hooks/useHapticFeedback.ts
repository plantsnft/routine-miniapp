"use client";

import { useCallback } from "react";
import { useMiniApp } from "@neynar/react";
import { type Haptics } from "@farcaster/miniapp-sdk";

/**
 * Custom hook for haptic feedback throughout the app.
 * Provides a simple function to trigger haptic feedback on user interactions.
 */
export function useHapticFeedback() {
  const { haptics } = useMiniApp();

  /**
   * Triggers haptic feedback with light-medium intensity.
   * Use this for button clicks, link taps, and other interactive elements.
   */
  const triggerHaptic = useCallback(
    async (intensity: Haptics.ImpactOccurredType = "light") => {
      if (!haptics) return;

      try {
        await haptics.impactOccurred(intensity);
      } catch (error) {
        // Silently fail - haptics might not be available in all contexts
        console.debug("Haptic feedback not available:", error);
      }
    },
    [haptics]
  );

  return { triggerHaptic };
}

