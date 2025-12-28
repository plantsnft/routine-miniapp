'use client';

import { useState, useEffect } from 'react';
import type { Game } from '~/lib/types';

interface GameRegistrationStatusProps {
  game: Game & { 
    registrationCloseAt?: string | null;
    registrationOpen?: boolean;
    hasStarted?: boolean;
  };
  className?: string;
}

/**
 * Component to display game registration status and countdown
 * Shows registration window information for large_event games
 */
export function GameRegistrationStatus({ game, className = '' }: GameRegistrationStatusProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [hasStarted, setHasStarted] = useState<boolean>(game.hasStarted || false);
  
  const gameType = game.game_type || 'standard';
  const registrationCloseAt = game.registrationCloseAt;
  const registrationOpen = game.registrationOpen !== undefined ? game.registrationOpen : true;
  const startTime = game.scheduled_time;
  
  // Show countdown for all games with a start time (before start: "Starts in...")
  // For large_event games, also show "Registration closes in..." after start
  if (!startTime && gameType !== 'large_event') {
    return null;
  }
  
  useEffect(() => {
    if (!startTime && gameType !== 'large_event') {
      setTimeRemaining('');
      return;
    }
    
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    const updateCountdown = () => {
      const now = new Date();
      const startDate = startTime ? new Date(startTime) : null;
      const closeDate = registrationCloseAt ? new Date(registrationCloseAt) : null;
      
      // Check if game has started
      const started = startDate ? now >= startDate : false;
      setHasStarted(started);
      
      // If registration is closed, show closed message
      if (!registrationOpen) {
        setTimeRemaining('Registration closed');
        return;
      }
      
      // If game hasn't started yet, show "Starts in MM:SS" or "HH:MM:SS"
      if (!started && startDate) {
        const diff = startDate.getTime() - now.getTime();
        if (diff <= 0) {
          setTimeRemaining('Starting now');
        } else {
          const totalSeconds = Math.floor(diff / 1000);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;
          
          if (hours > 0) {
            setTimeRemaining(`Starts in ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
          } else {
            setTimeRemaining(`Starts in ${minutes}:${seconds.toString().padStart(2, '0')}`);
          }
        }
        return;
      }
      
      // Game has started - for large_event only, show countdown until registration closes
      if (started && gameType === 'large_event' && closeDate) {
        const diff = closeDate.getTime() - now.getTime();
        if (diff <= 0) {
          setTimeRemaining('Registration closed');
        } else {
          const totalSeconds = Math.floor(diff / 1000);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          
          if (minutes > 0) {
            setTimeRemaining(`Registration closes in ${minutes}:${seconds.toString().padStart(2, '0')}`);
          } else {
            setTimeRemaining(`Registration closes in ${seconds}s`);
          }
        }
      } else if (started) {
        // Standard game after start - show started
        setTimeRemaining('Game started');
      } else {
        setTimeRemaining('Registration open');
      }
    };
    
    // Update immediately
    updateCountdown();
    
    // Don't set interval if reduced motion is preferred
    if (prefersReducedMotion) {
      return;
    }
    
    // Update every 1s when within 1 hour of relevant time, otherwise 5s
    const now = new Date();
    const startDate = startTime ? new Date(startTime) : null;
    const closeDate = registrationCloseAt ? new Date(registrationCloseAt) : null;
    
    let intervalMs = 5000; // Default 5s
    if (startDate) {
      const timeToStart = startDate.getTime() - now.getTime();
      if (timeToStart > 0 && timeToStart <= 60 * 60 * 1000) {
        intervalMs = 1000; // Within 1 hour of start, update every 1s
      }
    }
    if (closeDate && gameType === 'large_event') {
      const timeToClose = closeDate.getTime() - now.getTime();
      if (timeToClose > 0 && timeToClose <= 60 * 60 * 1000) {
        intervalMs = 1000; // Within 1 hour of close, update every 1s
      }
    }
    
    const interval = setInterval(updateCountdown, intervalMs);
    
    return () => clearInterval(interval);
  }, [registrationCloseAt, startTime, registrationOpen, hasStarted, gameType]);
  
  // Don't render anything if no status to show
  if (!timeRemaining && !hasStarted && !registrationCloseAt) {
    return null;
  }
  
  const isClosed = !registrationOpen;
  const isClosingSoon = registrationCloseAt && hasStarted && registrationOpen && 
    new Date(registrationCloseAt).getTime() - Date.now() < 5 * 60 * 1000; // Less than 5 minutes
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {hasStarted && !isClosed && (
        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
          Started
        </span>
      )}
      {timeRemaining && (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          isClosed 
            ? 'bg-red-100 text-red-800' 
            : isClosingSoon
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-blue-100 text-blue-800'
        }`}>
          {timeRemaining}
        </span>
      )}
    </div>
  );
}

