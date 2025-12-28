'use client';

import { useState, useEffect } from 'react';
import type { Game } from '~/lib/types';

interface GameCountdownTimerProps {
  game: Game;
}

export function GameCountdownTimer({ game }: GameCountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [isLateRegistration, setIsLateRegistration] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const startTime = game.scheduled_time ? new Date(game.scheduled_time).getTime() : null;
      const registrationCloseAt = (game as any).registrationCloseAt 
        ? new Date((game as any).registrationCloseAt).getTime() 
        : null;

      // If game has started, show late registration timer
      if (startTime && now >= startTime) {
        setIsLateRegistration(true);
        
        // Show time until registration closes (if available)
        if (registrationCloseAt && now < registrationCloseAt) {
          const diff = registrationCloseAt - now;
          setTimeRemaining(formatTime(diff));
        } else {
          setTimeRemaining('Registration closed');
        }
      } else if (startTime) {
        // Show time until game starts
        setIsLateRegistration(false);
        const diff = startTime - now;
        if (diff <= 0) {
          setTimeRemaining('Starting...');
        } else {
          setTimeRemaining(formatTime(diff));
        }
      } else {
        setTimeRemaining('');
      }
    };

    // Update immediately
    updateTimer();

    // Update every second if we're showing seconds, otherwise every minute
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [game]);

  if (!timeRemaining) return null;

  return (
    <span 
      className="text-xs" 
      style={{ 
        color: 'var(--text-2)',
        fontSize: '10px',
        whiteSpace: 'nowrap',
        marginLeft: 'auto'
      }}
    >
      {isLateRegistration ? 'Late reg: ' : ''}{timeRemaining}
    </span>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);

  // If less than 60 seconds, show seconds
  if (totalSeconds < 60) {
    const seconds = totalSeconds;
    return `${seconds}s`;
  }

  // If less than 60 minutes, show minutes only
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  // If exactly 1 hour, show as minutes (60m)
  if (totalHours === 1 && totalMinutes === 60) {
    return '60m';
  }

  // If more than 1 hour, show hours and minutes
  const hours = totalHours;
  const minutes = totalMinutes % 60;
  
  if (minutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${minutes}m`;
}

