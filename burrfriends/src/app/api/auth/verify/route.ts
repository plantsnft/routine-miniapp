import { NextRequest, NextResponse } from 'next/server';
import { createClient, Errors } from '@farcaster/quick-auth';
import { getNeynarClient } from '~/lib/neynar';
import { safeLog } from '~/lib/redaction';
import { cacheGet, cacheSet, CACHE_NS, CACHE_TTL } from '~/lib/cache';
import { isUserBlocked } from '~/lib/userBlocks';

const client = createClient();

interface CachedProfile {
  username?: string;
  pfpUrl?: string;
}

/**
 * POST /api/auth/verify
 * 
 * Verifies a Quick Auth JWT token and returns trusted FID.
 * Optionally hydrates user profile from Neynar.
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.1):
 * Caches profile by FID with 10 min TTL to reduce Neynar calls on repeated verifications.
 * 
 * CONTRACT:
 * - Success: 200 with { ok: true, fid, username?, pfpUrl? }
 * - Failure: 401 with { ok: false, error: '...' }
 * - Never returns 200 with ok:false
 * 
 * Request: { token: string }
 * Response: { ok: true, fid: number, username?: string, pfpUrl?: string } | { ok: false, error: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = body.token;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Token is required' },
        { status: 401 }
      );
    }

    // Get domain from request host (must match what client used)
    const hostHeader = req.headers.get('host');
    const origin = req.headers.get('origin');
    const domain = hostHeader ? hostHeader.split(':')[0] : 'localhost';

    try {
      // Verify the JWT using Quick Auth library
      const payload = await client.verifyJwt({
        token,
        domain,
      });

      // Extract FID from token (payload.sub contains the FID)
      // payload.sub can be a number or string, normalize to number
      // GUARDRAIL: FID comes ONLY from verified JWT, never from client input
      const fid = typeof payload.sub === 'string' 
        ? parseInt(payload.sub, 10)
        : typeof payload.sub === 'number'
        ? payload.sub
        : null;
      
      if (!fid || (typeof fid === 'number' && isNaN(fid))) {
        return NextResponse.json(
          { ok: false, error: 'Invalid token: FID not found' },
          { status: 401 }
        );
      }

      // Phase 20: Check if user is blocked
      const blocked = await isUserBlocked(fid);
      if (blocked) {
        safeLog('info', '[auth/verify] Blocked user attempted access', { fid });
        return NextResponse.json(
          { ok: false, error: 'blocked', blocked: true },
          { status: 403 }
        );
      }

      // GUARDRAIL: Neynar hydration must NOT block auth
      // Return fid immediately; Neynar is optional enrichment
      let username: string | undefined;
      let pfpUrl: string | undefined;

      // OPTIMIZATION: Check cache first (§3.1)
      const cacheKey = String(fid);
      const cached = cacheGet<CachedProfile>(CACHE_NS.AUTH_PROFILE, cacheKey);
      if (cached) {
        username = cached.username;
        pfpUrl = cached.pfpUrl;
      } else {
        // Try to hydrate profile from Neynar (non-blocking, errors are caught)
        try {
          const neynarClient = getNeynarClient();
          const { users } = await neynarClient.fetchBulkUsers({ fids: [fid] });
          if (users && users.length > 0) {
            const user = users[0] as any; // Type assertion to access flexible user properties
            username = user.username;
            // Neynar user object may have pfp_url or pfp.url depending on SDK version
            pfpUrl = user.pfp_url || user.pfp?.url || user.avatar_url;
            // Store in cache for next request
            cacheSet<CachedProfile>(CACHE_NS.AUTH_PROFILE, cacheKey, { username, pfpUrl }, CACHE_TTL.AUTH_PROFILE);
          }
        } catch (neynarError) {
          // GUARDRAIL: Neynar failure does NOT block authentication
          // Log but don't fail - Neynar fetch is optional enrichment only
          console.warn('[auth/verify] Optional Neynar profile fetch failed (auth still succeeds):', neynarError);
        }
      }

      // Always return fid (auth succeeded), with optional username/pfpUrl if available
      // Log success (redacted) for debugging
      safeLog('info', '[auth/verify] Verification successful', {
        host: hostHeader,
        origin: origin?.substring(0, 50) || 'none',
        fid,
        hasUsername: !!username,
        hasPfpUrl: !!pfpUrl,
      });

      return NextResponse.json({
        ok: true,
        fid, // GUARDRAIL: FID from verified JWT only
        username,
        pfpUrl,
      }, { status: 200 });
    } catch (e) {
      if (e instanceof Errors.InvalidTokenError) {
        safeLog('info', '[auth/verify] Invalid token', {
          host: hostHeader,
          origin: origin?.substring(0, 50) || 'none',
          error: e.message,
        });
        return NextResponse.json(
          { ok: false, error: 'Invalid token' },
          { status: 401 }
        );
      }
      throw e;
    }
  } catch (error: any) {
    safeLog('error', '[auth/verify] Token verification error', {
      host: req.headers.get('host'),
      origin: req.headers.get('origin')?.substring(0, 50) || 'none',
      error: error.message,
    });
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 401 } // Changed from 500 to 401 for consistency
    );
  }
}
