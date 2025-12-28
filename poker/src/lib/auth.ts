/**
 * Authentication utilities for Poker mini app
 * Uses Farcaster Quick Auth JWT tokens
 */

import { NextRequest } from 'next/server';
import { createClient, Errors } from '@farcaster/quick-auth';

const client = createClient();

/**
 * Result of requireAuth() - contains the authenticated user's FID
 */
export interface AuthResult {
  fid: number;
}

/**
 * Require authentication for a request.
 * 
 * GUARDRAIL: FID must ONLY come from verified JWT token, never from client body/query.
 * This function verifies the JWT and extracts FID from the token payload.
 * 
 * Token extraction order:
 * 1. tokenOverride parameter (if provided) - use when route already parsed body
 * 2. Authorization header: Bearer <token> (preferred method)
 * 
 * Standard: All API routes should use Authorization: Bearer <token> header.
 * Body token fallback is only for POST /api/auth/verify convenience.
 * 
 * @param req - Next.js request object
 * @param tokenOverride - Optional token string (to avoid double-parsing request body)
 * @returns Promise<AuthResult> - Contains the authenticated FID (from verified JWT)
 * @throws Error if authentication fails
 */
export async function requireAuth(req: NextRequest, tokenOverride?: string): Promise<AuthResult> {
  // Prefer tokenOverride (if route already parsed body)
  // Then try Authorization header (preferred method)
  let token: string | null = tokenOverride || null;
  
  if (!token) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    throw new Error('No authentication token provided. Use Authorization: Bearer <token> header');
  }

  // Get domain for JWT verification
  // CRITICAL: Domain must match exactly what the client used when requesting the token
  // The Farcaster SDK generates tokens using window.location.hostname, so we MUST use
  // the host header from the request (not env vars) to ensure they match
  const hostHeader = req.headers.get('host');
  const domain = hostHeader ? hostHeader.split(':')[0] : 'localhost'; // Remove port if present

  try {
    // Verify the JWT
    const payload = await client.verifyJwt({
      token,
      domain,
    });

    // Extract FID from token (payload.sub contains the FID)
    // payload.sub can be a number or string, normalize to number
    const fid = typeof payload.sub === 'string' 
      ? parseInt(payload.sub, 10)
      : typeof payload.sub === 'number'
      ? payload.sub
      : null;
    
    if (!fid || (typeof fid === 'number' && isNaN(fid))) {
      throw new Error('Invalid token: FID not found in token');
    }

    return { fid };
  } catch (e) {

    if (e instanceof Errors.InvalidTokenError) {
      throw new Error('Invalid or expired token');
    }
    if (e instanceof Error) {
      throw e;
    }
    throw new Error('Token verification failed');
  }
}

/**
 * Extract token from request (for use in routes that need to handle body separately)
 */
export function extractTokenFromRequest(req: NextRequest): string | null {
  // Try Authorization header first
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Create a standardized error response for authentication failures
 */
/**
 * Create a standardized error response for authentication failures
 * Note: status parameter is for documentation, actual status should be set in NextResponse
 */
export function createAuthErrorResponse(message: string, _status: number = 401) {
  return {
    ok: false,
    error: message,
  };
}
