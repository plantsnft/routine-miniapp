'use client';

import { useState, useEffect, useRef, useMemo, memo } from 'react';

interface FloatingEggEmojisProps {
  gameId: string;
}

// Emoji options: chick, hatching chick, rooster
const EMOJIS = ['🐣', '🐥', '🐓'];
const EMOJI_COUNT = 3;

// Memoized component to prevent unnecessary re-renders
export const FloatingEggEmojis = memo(function FloatingEggEmojis({ gameId }: FloatingEggEmojisProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [bouncingEmoji, setBouncingEmoji] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Generate stable random positions for each emoji (based on gameId for consistency)
  const emojiPositions = useMemo(() => {
    // Use gameId as seed for consistent positioning per game
    const seed = gameId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    return Array.from({ length: EMOJI_COUNT }, (_, i) => {
      // Create a pseudo-random number based on seed and index
      const pseudoRandom = (seed + i * 7919) % 1000 / 1000; // Use prime for better distribution
      const pseudoRandom2 = (seed + i * 9973) % 1000 / 1000; // Second prime for Y position
      
      // Position in top row area (0-15% from top) with random horizontal spread (10-90%)
      // Clustered around the title/countdown timer row
      // Create slight clustering: first 2 emojis closer together, 3rd slightly offset
      let topPercent: number;
      let leftPercent: number;
      
      if (i < 2) {
        // First 2 emojis: clustered together (closer horizontal positions)
        // Top: 3-12% (around title row)
        // Left: 15-70% (avoiding edges, clustered in middle-left area)
        topPercent = 3 + pseudoRandom * 9; // 3-12%
        leftPercent = 15 + pseudoRandom2 * 55; // 15-70%
      } else {
        // 3rd emoji: slightly offset (right side, different vertical position)
        // Top: 5-14% (slightly different from first two)
        // Left: 60-85% (right side, avoiding countdown timer)
        topPercent = 5 + pseudoRandom * 9; // 5-14%
        leftPercent = 60 + pseudoRandom2 * 25; // 60-85%
      }
      
      return {
        top: topPercent,
        left: leftPercent,
        emoji: EMOJIS[i % EMOJIS.length],
        animationDelay: pseudoRandom * 2, // Stagger animations
      };
    });
  }, [gameId]);

  const handleEmojiClick = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (reducedMotion) return;
    
    // Set bouncing state
    setBouncingEmoji(index);
    
    // Reset after flip jump animation completes (400ms)
    // Emoji returns to same position (no repositioning)
    setTimeout(() => {
      setBouncingEmoji(null);
    }, 400);
  };

  if (reducedMotion) {
    // Still show emojis but static (no animations)
    return (
      <div ref={containerRef} className="floating-eggs-container" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
        {emojiPositions.map((pos, i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: `${pos.top}%`,
              left: `${pos.left}%`,
              fontSize: '14px',
              pointerEvents: 'auto',
              cursor: 'pointer',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation',
            }}
            onClick={(e) => handleEmojiClick(i, e)}
          >
            {pos.emoji}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="floating-eggs-container" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {emojiPositions.map((pos, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`floating-egg-emoji ${bouncingEmoji === i ? 'bouncing' : ''}`}
          style={{
            position: 'absolute',
            top: `${pos.top}%`,
            left: `${pos.left}%`,
            fontSize: '14px',
            pointerEvents: 'auto',
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'manipulation',
            animationDelay: `${pos.animationDelay}s`,
            willChange: 'transform',
          }}
          onClick={(e) => handleEmojiClick(i, e)}
        >
          {pos.emoji}
        </div>
      ))}
    </div>
  );
});
