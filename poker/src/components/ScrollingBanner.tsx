'use client';

import { useState, useEffect, useMemo } from 'react';
import { authedFetch } from '~/lib/authedFetch';
import { useAuth } from '~/components/AuthProvider';
import type { Game } from '~/lib/types';

export function ScrollingBanner() {
  const { token, status: authStatus } = useAuth();
  const [nextGame, setNextGame] = useState<Game | null>(null);
  const [countdown, setCountdown] = useState<string>('');

  useEffect(() => {
    if (authStatus !== 'authed' || !token) return;

    const fetchNextGame = async () => {
      try {
        const res = await authedFetch('/api/games', { method: 'GET' }, token);
        if (!res.ok) return;
        
        const data = await res.json();
        if (!data.ok || !data.data) return;

        const now = new Date();
        // Find the next upcoming game that hasn't started yet
        const upcoming = data.data
          .filter((game: Game) => {
            if (game.status !== 'open' && game.status !== 'scheduled') return false;
            const startTime = game.scheduled_time;
            if (!startTime) return false;
            return new Date(startTime) > now;
          })
          .sort((a: Game, b: Game) => {
            const timeA = new Date(a.scheduled_time || 0).getTime();
            const timeB = new Date(b.scheduled_time || 0).getTime();
            return timeA - timeB;
          })[0];

        if (upcoming) {
          setNextGame(upcoming);
        }
      } catch (_err) {
        // Silently fail - banner is non-critical
        console.error('Failed to fetch next game for banner:', _err);
      }
    };

    fetchNextGame();
  }, [authStatus, token]);

  useEffect(() => {
    if (!nextGame) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const startTime = nextGame.scheduled_time;
      if (!startTime) {
        setCountdown('');
        return;
      }

      const now = new Date();
      const start = new Date(startTime);
      const diff = start.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown('');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setCountdown(`Next game in ${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setCountdown(`Next game in ${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setCountdown(`Next game in ${minutes}m ${seconds}s`);
      } else {
        setCountdown(`Next game in ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [nextGame]);

  // Create alternating banner items with poker chips
  const bannerItems = useMemo(() => {
    const message1 = 'Welcome to Giveaway Games';
    const message2 = 'Add the mini app with notifications on for the latest on new';
    const message3 = 'Join games below';
    const messages = [message1, message2, message3];
    
    const repetitions = 15;
    const items = [];
    
    const pokerChip = (
      <svg
        key="chip"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        style={{ display: 'inline-block', margin: '0 8px', verticalAlign: 'middle' }}
      >
        <circle cx="7" cy="7" r="6.5" fill="#FF3B1A" stroke="#8B0000" strokeWidth="0.5" />
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="#8B0000" strokeWidth="0.3" opacity="0.6" />
        <circle cx="7" cy="7" r="2" fill="none" stroke="#8B0000" strokeWidth="0.2" opacity="0.4" />
      </svg>
    );
    
    for (let i = 0; i < repetitions; i++) {
      // Cycle through all three messages
      const message = messages[i % messages.length];
      items.push(
        <span key={`item-${i}`} style={{ display: 'inline-flex', alignItems: 'center', marginRight: '4px' }}>
          <span style={{ color: 'var(--fire-1)', fontSize: '12px', fontWeight: 500 }}>
            {message}
          </span>
          {pokerChip}
        </span>
      );
    }
    
    return items;
  }, []);

  return (
    <div 
      className="scrolling-banner"
      style={{
        backgroundColor: 'var(--bg-0)',
        borderBottom: '1px solid var(--stroke)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      <div className="scrolling-content" style={{ 
        display: 'inline-flex',
        whiteSpace: 'nowrap',
        alignItems: 'center',
      }}>
        {/* Duplicate content for seamless loop */}
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {bannerItems}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {bannerItems}
        </span>
      </div>
    </div>
  );
}

