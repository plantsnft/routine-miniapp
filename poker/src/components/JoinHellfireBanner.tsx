'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

interface BannerItem {
  title: string;
  subtitle?: string; // Optional subtitle
  href?: string;
  logoSrc?: string;
  onClick?: () => void;
  isAction?: boolean; // If true, uses onClick instead of href
}

interface JoinHellfireBannerProps {
  items: BannerItem[];
  className?: string;
}

export function JoinHellfireBanner({ items, className = '' }: JoinHellfireBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prefersReducedMotion = useRef(false);

  // Check for reduced motion preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      prefersReducedMotion.current = mediaQuery.matches;
      
      const handleChange = (e: MediaQueryListEvent) => {
        prefersReducedMotion.current = e.matches;
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  // Auto-rotate logic
  useEffect(() => {
    if (items.length <= 1 || prefersReducedMotion.current) {
      return;
    }

    if (isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 5000); // 5 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [items.length, isPaused]);

  const handleMouseEnter = useCallback(() => {
    setIsPaused(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPaused(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsPaused(true);
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;

      // Only treat as swipe if horizontal movement is greater than vertical
      // and horizontal movement is at least 25px
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= 25) {
        e.preventDefault(); // Prevent default to avoid scrolling
        if (dx > 0) {
          // Swipe right - previous
          setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
        } else {
          // Swipe left - next
          setCurrentIndex((prev) => (prev + 1) % items.length);
        }
      }

      setTouchStart(null);
      // Resume auto-rotate after a delay
      setTimeout(() => {
        setIsPaused(false);
      }, 1000);
    },
    [touchStart, items.length]
  );

  const handleTouchMove = useCallback(() => {
    // Keep paused while dragging
    if (touchStart) {
      setIsPaused(true);
    }
  }, [touchStart]);

  const currentItem = items[currentIndex];

  if (!currentItem) {
    return null;
  }

  const handleClick = async (e: React.MouseEvent) => {
    if (currentItem.onClick) {
      e.preventDefault();
      // If it's a composeCast action, handle it with dynamic import
      if (currentItem.title === 'Request to join the group chat') {
        try {
          const { sdk } = await import('@farcaster/miniapp-sdk');
          if (sdk?.actions?.composeCast) {
            // Use the specific Giveaway Games page URL
            const { GIVEAWAY_GAMES_CLUB_SLUG } = await import('~/lib/constants');
            const miniAppUrl = `https://poker-swart.vercel.app/clubs/${GIVEAWAY_GAMES_CLUB_SLUG}/games`;
            await sdk.actions.composeCast({
              text: 'i would like to join giveaway games @tormental.. view the mini app here to get in on the action',
              embeds: [miniAppUrl],
            });
          }
        } catch (error) {
          console.error('Failed to open cast composer:', error);
          // Fallback: call original onClick if available
          if (currentItem.onClick) {
            currentItem.onClick();
          }
        }
      } else {
        // Otherwise call the original onClick
        currentItem.onClick();
      }
    }
  };

  // If it's an action item, use a button instead of Link
  if (currentItem.isAction && currentItem.onClick) {
    return (
      <button
        onClick={handleClick}
        className={`w-full rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-3 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-zinc-800 active:scale-[0.99] transition ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        aria-label={currentItem.title}
      >
        {/* Logo */}
        {currentItem.logoSrc && (
          <img
            src={currentItem.logoSrc}
            alt=""
            className="w-8 h-8 rounded object-cover flex-shrink-0"
            role="presentation"
          />
        )}

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">
            {currentItem.title}
          </div>
          {currentItem.subtitle && (
            <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">
              {currentItem.subtitle}
            </div>
          )}
        </div>

        {/* Dots indicator (clickable) */}
        {items.length > 1 && (
          <div className="flex items-center gap-1 flex-shrink-0" role="tablist" aria-label="Banner slides">
            {items.map((_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-current={index === currentIndex ? 'true' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCurrentIndex(index);
                  setIsPaused(true);
                  // Resume auto-rotate after 3 seconds
                  setTimeout(() => {
                    setIsPaused(false);
                  }, 3000);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-colors cursor-pointer ${
                  index === currentIndex
                    ? 'bg-gray-900 dark:bg-zinc-100'
                    : 'bg-gray-300 dark:bg-zinc-600'
                }`}
                aria-label={`Slide ${index + 1} of ${items.length}`}
                style={{ border: 'none', background: 'none', padding: 0 }}
              />
            ))}
          </div>
        )}

        {/* Screen reader text for slide position */}
        <span className="sr-only">
          Slide {currentIndex + 1} of {items.length}: {currentItem.title}
        </span>
      </button>
    );
  }

  // Regular link item
  return (
    <Link
      href={currentItem.href || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-3 py-2 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-zinc-800 active:scale-[0.99] transition ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      aria-label={currentItem.title}
    >
      {/* Logo */}
      {currentItem.logoSrc && (
        <img
          src={currentItem.logoSrc}
          alt=""
          className="w-8 h-8 rounded object-cover flex-shrink-0"
          role="presentation"
        />
      )}

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">
          {currentItem.title}
        </div>
        {currentItem.subtitle && (
          <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">
            {currentItem.subtitle}
          </div>
        )}
      </div>

      {/* Dots indicator (clickable) */}
      {items.length > 1 && (
        <div className="flex items-center gap-1 flex-shrink-0" role="tablist" aria-label="Banner slides">
          {items.map((_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-current={index === currentIndex ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(index);
                setIsPaused(true);
                // Resume auto-rotate after 3 seconds
                setTimeout(() => {
                  setIsPaused(false);
                }, 3000);
              }}
              className={`w-1.5 h-1.5 rounded-full transition-colors cursor-pointer ${
                index === currentIndex
                  ? 'bg-gray-900 dark:bg-zinc-100'
                  : 'bg-gray-300 dark:bg-zinc-600'
              }`}
              aria-label={`Slide ${index + 1} of ${items.length}`}
              style={{ border: 'none', background: 'none', padding: 0 }}
            />
          ))}
        </div>
      )}

      {/* Screen reader text for slide position */}
      <span className="sr-only">
        Slide {currentIndex + 1} of {items.length}: {currentItem.title}
      </span>
    </Link>
  );
}

