'use client';

import { useState, useEffect } from 'react';
import type { Game } from '~/lib/types';
import { computeRegistrationCloseAt, isRegistrationOpen, hasGameStarted } from '~/lib/game-registration';

interface RegistrationInfoBadgeProps {
  game: Game & { 
    registrationCloseAt?: string | null;
    registrationOpen?: boolean;
    hasStarted?: boolean;
  };
  participantCount: number;
  className?: string;
}

/**
 * Component to display registration info badge (countdown or status)
 * Shows registration window information for games
 */
export function RegistrationInfoBadge({ game, participantCount, className = '' }: RegistrationInfoBadgeProps) {
  const [infoLabel, setInfoLabel] = useState<string>('');
  
  const gameType = game.game_type || 'standard';
  const status = game.status || 'open';
  
  // Defensive: compute closeAt with fallback, validate it's a valid date string or null
  let closeAt: string | null = null;
  try {
    closeAt = game.registrationCloseAt ?? computeRegistrationCloseAt(game);
    // Validate closeAt is a valid ISO string if provided
    if (closeAt) {
      const testDate = new Date(closeAt);
      if (isNaN(testDate.getTime())) {
        closeAt = null; // Invalid date, treat as null
      }
    }
  } catch (_err) {
    closeAt = null; // Fallback to null if computation fails
  }
  
  // Defensive: compute registration status with fallback
  let registrationStatus: { isOpen: boolean; reason?: string; closeAt?: string | null };
  try {
    registrationStatus = game.registrationOpen !== undefined
      ? { isOpen: game.registrationOpen, closeAt }
      : isRegistrationOpen(game, participantCount, new Date());
  } catch (_err) {
    // Fallback: assume registration is open if computation fails
    registrationStatus = { isOpen: true, closeAt };
  }
  
  // Defensive: compute hasStarted with fallback
  let hasStarted: boolean;
  try {
    hasStarted = game.hasStarted !== undefined
      ? game.hasStarted
      : hasGameStarted(game, new Date());
  } catch (_err) {
    // Fallback: assume not started if computation fails
    hasStarted = false;
  }

  useEffect(() => {
    // Only show info badge if game is open and hasn't settled/cancelled/closed
    if (status !== 'open') {
      setInfoLabel('');
      return;
    }

    if (!registrationStatus.isOpen) {
      // Registration is closed - show when it closed
      if (closeAt) {
        try {
          const closeDate = new Date(closeAt);
          // Validate date is valid
          if (isNaN(closeDate.getTime())) {
            setInfoLabel('Registration closed');
            return;
          }
          const localTime = closeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          // Defensive: ensure localTime is valid string
          if (localTime && typeof localTime === 'string') {
            setInfoLabel(`Registration closed at ${localTime}`);
          } else {
            setInfoLabel('Registration closed');
          }
        } catch (_err) {
          // Fallback if date parsing fails
          setInfoLabel('Registration closed');
        }
      } else {
        setInfoLabel('Registration closed');
      }
      return;
    }

    // Registration is open
    if (gameType === 'large_event' && closeAt && hasStarted) {
      // For large_event with close time after start, show countdown
      // Validate closeAt is a valid date string
      let closeDate: Date;
      try {
        closeDate = new Date(closeAt);
        if (isNaN(closeDate.getTime())) {
          // Invalid date - fallback to "Registration open"
          setInfoLabel('Registration open');
          return;
        }
      } catch (_err) {
        // Invalid date string - fallback
        setInfoLabel('Registration open');
        return;
      }

      const updateCountdown = () => {
        try {
          const now = new Date();
          const diff = closeDate.getTime() - now.getTime();
          
          if (diff <= 0) {
            // Past close time
            const localTime = closeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (localTime && typeof localTime === 'string') {
              setInfoLabel(`Registration closed at ${localTime}`);
            } else {
              setInfoLabel('Registration closed');
            }
          } else {
            // Calculate time remaining
            const totalSeconds = Math.floor(diff / 1000);
            if (isNaN(totalSeconds) || totalSeconds < 0) {
              setInfoLabel('Registration closed');
              return;
            }
            
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            
            // Defensive: ensure numbers are valid
            const hoursStr = hours > 0 ? hours.toString() : '';
            const minutesStr = minutes.toString().padStart(2, '0');
            const secondsStr = seconds.toString().padStart(2, '0');
            
            if (hours > 0) {
              setInfoLabel(`Registration closes in ${hoursStr}:${minutesStr}:${secondsStr}`);
            } else {
              setInfoLabel(`Registration closes in ${minutesStr}:${secondsStr}`);
            }
          }
        } catch (_err) {
          // Fallback if countdown calculation fails
          setInfoLabel('Registration open');
        }
      };

      updateCountdown();
      
      // Check for reduced motion preference
      const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        return;
      }

      // Update every 1s when within 1 hour, otherwise 5s (or no update if >1h and not within window)
      const now = new Date();
      const timeToClose = closeDate.getTime() - now.getTime();
      
      // Only set up interval if timeToClose is valid and positive
      if (isNaN(timeToClose) || timeToClose <= 0) {
        return;
      }
      
      const intervalMs = timeToClose > 0 && timeToClose <= 60 * 60 * 1000 ? 1000 : 5000;
      
      const interval = setInterval(updateCountdown, intervalMs);
      return () => clearInterval(interval);
    } else {
      // Standard game or no close time - don't show info badge (primary badge already shows "Registration open")
      setInfoLabel('');
    }
  }, [status, gameType, closeAt, registrationStatus.isOpen, hasStarted, participantCount]);

  // Don't show badge if it would just say "Registration open" (primary badge already handles this)
  if (!infoLabel || infoLabel === 'Registration open') {
    return null;
  }

  const isClosed = !registrationStatus.isOpen;
  const isClosingSoon = closeAt && hasStarted && registrationStatus.isOpen && 
    new Date(closeAt).getTime() - Date.now() < 5 * 60 * 1000;

  return (
    <span className={`hl-badge ${
      isClosed 
        ? 'hl-badge--muted' 
        : isClosingSoon
        ? 'hl-badge--fire'
        : ''
    } ${className}`}>
      {infoLabel}
    </span>
  );
}

