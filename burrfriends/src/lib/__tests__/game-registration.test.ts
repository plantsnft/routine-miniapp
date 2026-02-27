/**
 * Unit tests for game registration badge helpers
 * 
 * Tests verify that:
 * - getGameBadges() returns correct primary badge for all game states
 * - Defensive fallbacks work when enriched fields are missing
 * - No errors are thrown even with invalid/missing data
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGameBadges } from '../game-registration';

describe('getGameBadges', () => {
  const now = new Date('2024-01-15T12:00:00Z');
  const participantCount = 5;

  // Freeze time for deterministic tests
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('standard game, open, not started', () => {
    it('should return primary "Open" when status is open and game has not started', () => {
      const game = {
        status: 'open' as const,
        game_type: 'standard' as const,
        scheduled_time: '2024-01-15T14:00:00Z', // 2 hours in future
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Open');
      expect(result.infoLabel).toBeNull();
    });

    it('should work without enriched fields (fallback to helpers)', () => {
      const game = {
        status: 'open' as const,
        game_type: 'standard' as const,
        scheduled_time: '2024-01-15T14:00:00Z',
        // No hasStarted, registrationOpen, registrationCloseAt
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Open');
      expect(result.infoLabel).toBeNull();
    });
  });

  describe('standard game, started, open', () => {
    it('should return primary "In progress" when game has started and registration is open', () => {
      const game = {
        status: 'open' as const,
        game_type: 'standard' as const,
        scheduled_time: '2024-01-15T11:00:00Z', // 1 hour in past
        hasStarted: true,
        registrationOpen: true,
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('In progress');
      expect(result.infoLabel).toBeNull();
    });

    it('should compute hasStarted from scheduled_time if not provided', () => {
      const game = {
        status: 'open' as const,
        game_type: 'standard' as const,
        scheduled_time: '2024-01-15T11:00:00Z', // 1 hour in past
        // No hasStarted - should compute from scheduled_time
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('In progress');
      expect(result.infoLabel).toBeNull();
    });
  });

  describe('large_event, started, registration open, closeAt in future', () => {
    it('should return primary "In progress" when game started and registration still open', () => {
      const closeAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // 10 min in future
      const game = {
        status: 'open' as const,
        game_type: 'large_event' as const,
        scheduled_time: '2024-01-15T11:00:00Z', // 1 hour in past
        registration_close_minutes: 15,
        hasStarted: true,
        registrationOpen: true,
        registrationCloseAt: closeAt,
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('In progress');
      expect(result.infoLabel).toBeNull(); // Info badge handled by component
    });
  });

  describe('large_event, started, registration closed, closeAt in past', () => {
    it('should return primary "Registration closed" when registration closed but game active', () => {
      const closeAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // 5 min in past
      const game = {
        status: 'open' as const,
        game_type: 'large_event' as const,
        scheduled_time: '2024-01-15T11:00:00Z', // 1 hour in past
        registration_close_minutes: 15,
        hasStarted: true,
        registrationOpen: false,
        registrationCloseAt: closeAt,
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Registration closed');
      expect(result.infoLabel).toBeNull();
    });
  });

  describe('settled/cancelled/closed statuses', () => {
    it('should return "Settled" for settled status', () => {
      const game = {
        status: 'settled' as const,
        game_type: 'standard' as const,
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Settled');
      expect(result.infoLabel).toBeNull();
    });

    it('should return "Cancelled" for cancelled status', () => {
      const game = {
        status: 'cancelled' as const,
        game_type: 'standard' as const,
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Cancelled');
      expect(result.infoLabel).toBeNull();
    });

    it('should return "Closed" for closed status', () => {
      const game = {
        status: 'closed' as const,
        game_type: 'standard' as const,
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Closed');
      expect(result.infoLabel).toBeNull();
    });
  });

  describe('missing fields - defensive fallbacks', () => {
    it('should handle missing status gracefully (defaults to "open")', () => {
      const game = {
        // No status field
        game_type: 'standard' as const,
        scheduled_time: '2024-01-15T14:00:00Z',
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Open'); // Default status
      expect(result.infoLabel).toBeNull();
    });

    it('should handle missing enriched fields (compute from basic fields)', () => {
      const game = {
        status: 'open' as const,
        game_type: 'standard' as const,
        scheduled_time: '2024-01-15T11:00:00Z', // Past
        max_participants: 10,
        // No hasStarted, registrationOpen, registrationCloseAt
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('In progress'); // Computed from scheduled_time
      expect(result.infoLabel).toBeNull();
    });

    it('should handle null/undefined values gracefully', () => {
      const game = {
        status: null,
        game_type: null,
        scheduled_time: null,
        hasStarted: undefined,
        registrationOpen: undefined,
        registrationCloseAt: null,
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Open'); // Safe default
      expect(result.infoLabel).toBeNull();
    });

    it('should not throw errors with invalid date strings', () => {
      const game = {
        status: 'open' as const,
        game_type: 'standard' as const,
        scheduled_time: 'invalid-date-string',
      };

      // Should not throw
      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBeTruthy();
      expect(typeof result.primaryLabel).toBe('string');
      expect(result.infoLabel).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle game with no scheduled time (not started)', () => {
      const game = {
        status: 'open' as const,
        game_type: 'standard' as const,
        // No scheduled_time
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('Open');
      expect(result.infoLabel).toBeNull();
    });

    it('should handle large_event without close time (no time-based closure)', () => {
      const game = {
        status: 'open' as const,
        game_type: 'large_event' as const,
        scheduled_time: '2024-01-15T11:00:00Z',
        // No registration_close_minutes or closeAt
        hasStarted: true,
        registrationOpen: true,
      };

      const result = getGameBadges(game, participantCount, now);
      expect(result.primaryLabel).toBe('In progress');
      expect(result.infoLabel).toBeNull();
    });
  });
});

