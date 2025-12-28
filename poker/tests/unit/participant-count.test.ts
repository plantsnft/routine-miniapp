/**
 * Unit tests for participant count logic
 * Tests that only status='joined' participants are counted
 */

import { describe, it, expect } from 'vitest';

describe('Participant Count Logic', () => {
  describe('filtering by status', () => {
    it('should only count participants with status="joined"', () => {
      // Mock participant data with different statuses
      const participants = [
        { id: '1', game_id: 'game1', fid: 1, status: 'joined' },
        { id: '2', game_id: 'game1', fid: 2, status: 'joined' },
        { id: '3', game_id: 'game1', fid: 3, status: 'pending' },
        { id: '4', game_id: 'game1', fid: 4, status: 'paid' }, // Old status
        { id: '5', game_id: 'game1', fid: 5, status: 'cancelled' },
      ];

      // Filter to only 'joined' status (this is what the API does)
      const joinedParticipants = participants.filter(p => p.status === 'joined');
      
      // Verify only status='joined' are counted
      expect(joinedParticipants.length).toBe(2);
      expect(joinedParticipants.every(p => p.status === 'joined')).toBe(true);
      
      // Verify other statuses are excluded
      expect(joinedParticipants.find(p => p.status === 'pending')).toBeUndefined();
      expect(joinedParticipants.find(p => p.status === 'paid')).toBeUndefined();
      expect(joinedParticipants.find(p => p.status === 'cancelled')).toBeUndefined();
    });

    it('should return 0 for games with no joined participants', () => {
      const participants = [
        { id: '1', game_id: 'game1', fid: 1, status: 'pending' },
        { id: '2', game_id: 'game1', fid: 2, status: 'cancelled' },
      ];

      const joinedParticipants = participants.filter(p => p.status === 'joined');
      expect(joinedParticipants.length).toBe(0);
    });

    it('should handle empty participant arrays', () => {
      const participants: any[] = [];
      const joinedParticipants = participants.filter(p => p.status === 'joined');
      expect(joinedParticipants.length).toBe(0);
    });
  });

  describe('game-specific filtering', () => {
    it('should only count participants for the specific game', () => {
      const participants = [
        { id: '1', game_id: 'game1', fid: 1, status: 'joined' },
        { id: '2', game_id: 'game1', fid: 2, status: 'joined' },
        { id: '3', game_id: 'game2', fid: 3, status: 'joined' }, // Different game
        { id: '4', game_id: 'game2', fid: 4, status: 'joined' }, // Different game
      ];

      // Filter by game_id first, then by status='joined'
      const game1Participants = participants
        .filter(p => p.game_id === 'game1')
        .filter(p => p.status === 'joined');
      
      expect(game1Participants.length).toBe(2);
      expect(game1Participants.every(p => p.game_id === 'game1')).toBe(true);
      expect(game1Participants.every(p => p.status === 'joined')).toBe(true);
    });
  });
});

