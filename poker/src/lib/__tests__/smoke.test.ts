/**
 * Smoke tests - verify imports and basic functionality without external dependencies
 * 
 * These tests ensure core utilities can be imported and used without throwing errors.
 * They don't require Supabase, Farcaster, or any external services.
 */

import { describe, it, expect } from 'vitest';
import { 
  getEffectiveMaxParticipants,
  computeRegistrationCloseAt,
  hasGameStarted,
  isRegistrationOpen,
  getGameBadges,
} from '../game-registration';

describe('smoke tests - imports and basic functionality', () => {
  describe('getEffectiveMaxParticipants', () => {
    it('should import and execute without errors', () => {
      const result = getEffectiveMaxParticipants({
        game_type: 'standard',
        max_participants: 10,
      });
      expect(result).toBe(10);
    });

    it('should handle open-registration large_event', () => {
      const result = getEffectiveMaxParticipants({
        game_type: 'large_event',
        max_participants: null,
      });
      expect(result).toBe(99);
    });
  });

  describe('computeRegistrationCloseAt', () => {
    it('should import and execute without errors', () => {
      const result = computeRegistrationCloseAt({
        game_type: 'large_event',
        registration_close_minutes: 15,
        scheduled_time: '2024-01-15T12:00:00Z',
      });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should return null for standard games', () => {
      const result = computeRegistrationCloseAt({
        game_type: 'standard',
        scheduled_time: '2024-01-15T12:00:00Z',
      });
      expect(result).toBeNull();
    });
  });

  describe('hasGameStarted', () => {
    it('should import and execute without errors', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const result = hasGameStarted({
        scheduled_time: '2024-01-15T11:00:00Z',
      }, now);
      expect(typeof result).toBe('boolean');
      expect(result).toBe(true);
    });
  });

  describe('isRegistrationOpen', () => {
    it('should import and execute without errors', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const result = isRegistrationOpen({
        status: 'open',
        game_type: 'standard',
        max_participants: 10,
      }, 5, now);
      expect(result).toHaveProperty('isOpen');
      expect(typeof result.isOpen).toBe('boolean');
    });

    it('should handle cancelled games', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const result = isRegistrationOpen({
        status: 'cancelled',
        game_type: 'standard',
      }, 0, now);
      expect(result.isOpen).toBe(false);
    });
  });

  describe('getGameBadges', () => {
    it('should import and execute without errors', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const result = getGameBadges({
        status: 'open',
        game_type: 'standard',
        scheduled_time: '2024-01-15T14:00:00Z',
      }, 5, now);
      expect(result).toHaveProperty('primaryLabel');
      expect(result).toHaveProperty('infoLabel');
      expect(typeof result.primaryLabel).toBe('string');
      expect(result.infoLabel).toBeNull();
    });

    it('should return valid badge for all status types', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const statuses = ['open', 'settled', 'cancelled', 'closed'] as const;
      
      for (const status of statuses) {
        const result = getGameBadges({
          status,
          game_type: 'standard',
        }, 0, now);
        expect(result.primaryLabel).toBeTruthy();
        expect(typeof result.primaryLabel).toBe('string');
      }
    });
  });
});



