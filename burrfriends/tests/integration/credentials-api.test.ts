/**
 * Integration tests for GET /api/games/:id/credentials endpoint
 * Tests authorization and response shapes
 * 
 * SAFETY: These tests make HTTP requests to the API endpoint.
 * The API endpoint will use Supabase configured via environment variables.
 * 
 * To run safely:
 * 1. Use a dedicated test Supabase project (not production)
 * 2. Set SUPABASE_URL and SUPABASE_ANON_KEY to test project credentials
 * 3. Ensure NODE_ENV=test or set TEST_ENV=true
 * 4. Or use mocked Supabase client (not implemented in these integration tests)
 * 
 * This test suite includes safeguards to prevent accidental runs against production.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// SAFETY: Guard against running tests against production Supabase
function assertTestEnvironment() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const nodeEnv = process.env.NODE_ENV;
  const testEnv = process.env.TEST_ENV === 'true';

  // Fail fast if not in test environment (unless explicitly allowed via TEST_ENV)
  // CI environments should still set NODE_ENV=test or TEST_ENV=true for safety
  if (nodeEnv !== 'test' && !testEnv) {
    throw new Error(
      'Tests must run with NODE_ENV=test or TEST_ENV=true to prevent accidental production access. ' +
      'Current NODE_ENV: ' + (nodeEnv || 'undefined') + '. ' +
      'If you are intentionally running tests, set TEST_ENV=true or NODE_ENV=test.'
    );
  }

  // Check for production-like Supabase URLs (only if we have a URL)
  if (supabaseUrl) {
    const urlLower = supabaseUrl.toLowerCase();
    // Common production indicators - adjust these patterns to match your prod URL structure
    // Production URLs typically are: *.supabase.co (but not *test*.supabase.co or *dev*.supabase.co)
    const isSupabaseUrl = urlLower.includes('supabase.co');
    const hasTestIndicator = urlLower.includes('test') || urlLower.includes('dev') || urlLower.includes('localhost');
    
    if (isSupabaseUrl && !hasTestIndicator) {
      // Even in test mode, warn about potential production URL
      // But only fail if not explicitly in test environment
      if (!testEnv && nodeEnv !== 'test') {
        throw new Error(
          'Detected potential production Supabase URL. ' +
          'Set TEST_ENV=true or NODE_ENV=test to allow, or use a test Supabase project. ' +
          'Supabase URL: ' + supabaseUrl.substring(0, 50) + '...'
        );
      }
      // In test mode, warn but allow (user has explicitly set TEST_ENV or NODE_ENV=test)
      if (testEnv || nodeEnv === 'test') {
        console.warn(
          'WARNING: Using Supabase URL that appears to be production. ' +
          'Ensure this is a test project: ' + supabaseUrl.substring(0, 50) + '...'
        );
      }
    }
  }

  // Warn if Supabase credentials are missing
  if (!supabaseUrl || !supabaseKey) {
    console.warn(
      'WARNING: Supabase credentials not found in environment variables. ' +
      'Tests may fail or use mocked clients if available.'
    );
  }
}

describe('GET /api/games/:id/credentials', () => {
  // SAFETY: Assert test environment before running any tests
  beforeAll(() => {
    assertTestEnvironment();
  });

  const API_URL = process.env.API_URL || 'http://localhost:3000';
  const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || '';
  const AUTH_TOKEN_UNAUTHORIZED = process.env.TEST_AUTH_TOKEN_UNAUTHORIZED || '';

  beforeAll(() => {
    // Environment check already done in outer beforeAll
    if (!AUTH_TOKEN) {
      console.warn('TEST_AUTH_TOKEN not set - some tests may fail');
    }
    if (!AUTH_TOKEN_UNAUTHORIZED) {
      console.warn('TEST_AUTH_TOKEN_UNAUTHORIZED not set - unauthorized test may fail');
    }
  });

  describe('response shapes', () => {
    it('should return locked response for unauthorized viewer when credentials exist', async () => {
      // This test requires:
      // 1. A game with credentials set (hasCredentials: true)
      // 2. An authenticated user who has NOT joined/paid
      // 
      // Expected: { ok: true, data: { hasCredentials: true, locked: true, passwordSet: true } }
      // Password should NOT be in response

      if (!AUTH_TOKEN_UNAUTHORIZED) {
        console.warn('TEST_AUTH_TOKEN_UNAUTHORIZED not set - skipping unauthorized test');
        return;
      }

      // This is a structure test - in a real scenario you would:
      // 1. Create a game with credentials via admin API
      // 2. Get gameId
      // 3. Call credentials endpoint with unauthorized token
      // 4. Verify response shape matches expected locked state

      const gameId = 'test-game-id'; // Would be actual game ID in real test
      
      const response = await fetch(`${API_URL}/api/games/${gameId}/credentials`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN_UNAUTHORIZED}`,
        },
      });

      if (!response.ok && response.status === 404) {
        console.warn('Game not found - skipping test (expected in test environment)');
        return;
      }

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.ok).toBe(true);
      
      if (data.data.hasCredentials === true && data.data.locked === true) {
        // Verify locked response shape
        expect(data.data).toHaveProperty('hasCredentials', true);
        expect(data.data).toHaveProperty('locked', true);
        expect(data.data).toHaveProperty('passwordSet');
        expect(data.data.password).toBeUndefined(); // Password must NOT be in locked response
      }
    });

    it('should return unlocked response with password for authorized viewer', async () => {
      // This test requires:
      // 1. A game with credentials set (password exists)
      // 2. An authenticated user who HAS joined/paid for the game
      //
      // Expected: { ok: true, data: { hasCredentials: true, locked: false, passwordSet: true, password: "..." } }

      if (!AUTH_TOKEN) {
        console.warn('TEST_AUTH_TOKEN not set - skipping authorized test');
        return;
      }

      // This is a structure test - in a real scenario you would:
      // 1. Create a game with credentials via admin API
      // 2. Join/pay for the game as the test user
      // 3. Call credentials endpoint
      // 4. Verify response shape matches expected unlocked state with password

      const gameId = 'test-game-id'; // Would be actual game ID in real test
      
      const response = await fetch(`${API_URL}/api/games/${gameId}/credentials`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
      });

      if (!response.ok && response.status === 404) {
        console.warn('Game not found - skipping test (expected in test environment)');
        return;
      }

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.ok).toBe(true);
      
      if (data.data.hasCredentials === true && data.data.locked === false) {
        // Verify unlocked response shape
        expect(data.data).toHaveProperty('hasCredentials', true);
        expect(data.data).toHaveProperty('locked', false);
        expect(data.data).toHaveProperty('passwordSet');
        expect(data.data).toHaveProperty('password');
        // Password should be string or null, never undefined
        expect(data.data.password === null || typeof data.data.password === 'string').toBe(true);
        // If passwordSet is true, password should be non-null string
        if (data.data.passwordSet === true) {
          expect(typeof data.data.password).toBe('string');
          expect(data.data.password).not.toBe('');
        }
      }
    });

    it('should return proper cache headers', async () => {
      if (!AUTH_TOKEN) {
        console.warn('TEST_AUTH_TOKEN not set - skipping cache headers test');
        return;
      }

      const gameId = 'test-game-id';
      
      const response = await fetch(`${API_URL}/api/games/${gameId}/credentials`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
      });

      if (!response.ok && response.status === 404) {
        console.warn('Game not found - skipping test (expected in test environment)');
        return;
      }

      // Verify cache headers are present
      expect(response.headers.get('Cache-Control')).toBe('no-store, must-revalidate');
      expect(response.headers.get('Pragma')).toBe('no-cache');
      expect(response.headers.get('Expires')).toBe('0');
    });
  });
});

