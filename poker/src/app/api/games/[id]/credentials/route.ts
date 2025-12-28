import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess, requireClubOwner } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { decryptCreds } from "~/lib/crypto/credsVault";
import { isPaidGame } from "~/lib/games";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

/**
 * GET /api/games/[id]/credentials
 * Get game credentials (ClubGG password)
 * 
 * Returns:
 * - hasCredentials: boolean (true if password is set)
 * - locked?: boolean (true if password exists but viewer not authorized)
 * - password?: string (only if unlocked)
 * 
 * Authorization:
 * - Viewer has joined (status='joined' or 'paid') OR
 * - Viewer is game creator/host/admin
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Decrypts credentials server-side only
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = getCorrelationId(req);
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // SAFETY: Require game access (club membership check)
    const clubId = await requireGameAccess(fid, gameId);

    // Fetch game - use pokerDb
    const games = await pokerDb.fetch<Game>('games', {
      filters: { id: gameId },
      select: '*',
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const game = games[0];

    // SAFETY: Check encryption key is configured early
    const encryptionKey = process.env.POKER_CREDS_ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.trim() === '') {
      safeLog('error', '[credentials] Encryption key missing', {
        correlationId,
        gameId,
        fid,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Server misconfigured: missing creds encryption key" },
        { status: 500 }
      );
    }

    // Validate all required fields are present and non-empty before attempting decrypt
    const hasCiphertext = Boolean(game.creds_ciphertext && game.creds_ciphertext.trim() !== '');
    const hasIv = Boolean(game.creds_iv && game.creds_iv.trim() !== '');
    const hasVersion = game.creds_version !== null && game.creds_version !== undefined;
    
    // If any required field is missing/null/empty, return hasCredentials:false (no decrypt attempt)
    if (!hasCiphertext || !hasIv) {
      safeLog('info', '[credentials] No credentials set for game (missing required fields)', {
        correlationId,
        gameId,
        fid,
        hasCredentials: false,
        hasCiphertext,
        hasIv,
        hasVersion,
      });
      return NextResponse.json<ApiResponse<{
        hasCredentials: boolean;
        locked?: boolean;
        password?: string | null;
        passwordSet?: boolean;
      }>>({
        ok: true,
        data: {
          hasCredentials: false,
          passwordSet: false,
          password: null,
        },
      }, {
        headers: { 
          'Cache-Control': 'no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    // Authorization check: viewer must have joined OR be host/admin
    // Host is defined as: game.creator_fid === viewerFid OR viewer is club owner/admin for game.club_id
    let isAuthorized = false;
    let isOwner = false;
    let isAdmin = false;
    
    // Check if viewer is global admin
    isAdmin = isGlobalAdmin(fid);
    if (isAdmin) {
      isAuthorized = true;
    }
    
    // Check if viewer is club owner for this game's club
    if (!isAuthorized) {
      try {
        await requireClubOwner(fid, clubId);
        isOwner = true;
        isAuthorized = true;
      } catch {
        // Not club owner, continue
      }
    }
    
    // Check if viewer is game creator (host)
    if (!isAuthorized && (game as any).creator_fid === fid) {
      isAuthorized = true;
    }
    
    // Check if viewer has joined (participant with status='joined')
    // NOTE: Production only uses status='joined'. For paid games, tx_hash is only set after verified on-chain payment
    // (see /api/payments/confirm and /api/payments/recover - both verify via verifyJoinGameTransaction/on-chain check)
    if (!isAuthorized) {
      const participants = await pokerDb.fetch<GameParticipant>('participants', {
        filters: { game_id: gameId, fid: fid },
        limit: 1,
      });
      
      if (participants && participants.length > 0) {
        const participant = participants[0];
        const participantStatus = (participant as any).status || participant.payment_status;
        // Only authorize if status is 'joined' (this is the only status used in production)
        if (participantStatus === 'joined') {
          // For paid games, require tx_hash to ensure they've actually paid
          // SAFETY: tx_hash is only set in /api/payments/confirm after verifyJoinGameTransaction passes,
          // and in /api/payments/recover after on-chain participant verification. Trust tx_hash presence.
          if (isPaidGame(game)) {
            if ((participant as any).tx_hash) {
              isAuthorized = true;
            }
          } else {
            // For free games, status='joined' is sufficient
            isAuthorized = true;
          }
        }
      }
    }

    // If not authorized, return locked response (do not decrypt)
    if (!isAuthorized) {
      safeLog('info', '[credentials] Credentials locked - viewer not authorized', {
        correlationId,
        gameId,
        fid,
        hasCredentials: true,
        authorized: false,
        isOwner,
        isAdmin,
      });
      return NextResponse.json<ApiResponse<{
        hasCredentials: boolean;
        locked: boolean;
        password?: string | null;
        passwordSet?: boolean;
      }>>({
        ok: true,
        data: {
          hasCredentials: true,
          locked: true,
          passwordSet: true, // Credentials exist but locked
        },
      }, {
        headers: { 
          'Cache-Control': 'no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    // Decrypt credentials server-side only (only if authorized)
    // At this point we've validated: hasCiphertext && hasIv are both true
    let creds;
    try {
      const credsVersion = game.creds_version || 1;
      const cipherLen = game.creds_ciphertext?.length || 0;
      const ivLen = game.creds_iv?.length || 0;
      
      creds = decryptCreds({
        ciphertextB64: game.creds_ciphertext!,
        ivB64: game.creds_iv!,
        version: credsVersion,
      });
      // SAFETY: Never log decrypted credentials - only log that decryption succeeded
      safeLog('info', '[credentials] Credentials decrypted successfully', { 
        correlationId,
        gameId, 
        fid, 
        hasCredentials: true,
        authorized: true,
        unlocked: true,
        creds_version: credsVersion,
        cipherLen,
        ivLen,
      });
    } catch (decryptError: any) {
      // Enhanced error logging (no password, only metadata)
      const credsVersion = game.creds_version || 1;
      const cipherLen = game.creds_ciphertext?.length || 0;
      const ivLen = game.creds_iv?.length || 0;
      
      safeLog('error', '[credentials] Decryption failed', { 
        correlationId,
        gameId, 
        fid,
        creds_version: credsVersion,
        cipherLen,
        ivLen,
        error: decryptError.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Failed to decrypt credentials. Please contact support." },
        { status: 500 }
      );
    }

    // Return decrypted password (never log the actual password)
    // Use password: null if empty, plus passwordSet boolean for unambiguous UI messaging
    const passwordValue = creds.password && creds.password.trim() !== '' ? creds.password : null;
    const passwordSet: boolean = !!(creds.password && creds.password.trim() !== '');
    
    return NextResponse.json<ApiResponse<{
      hasCredentials: boolean;
      locked?: boolean;
      password?: string | null;
      passwordSet?: boolean;
    }>>({
      ok: true,
      data: {
        hasCredentials: true,
        locked: false,
        password: passwordValue,
        passwordSet: passwordSet,
      },
    }, {
      headers: { 
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors - provide friendly UX messages
    if (error.message?.includes('member') || error.message?.includes('access')) {
      safeLog('warn', '[credentials] Permission denied', { 
        correlationId,
        gameId: (await params).id, 
        fid: error.fid || 'unknown', 
        error: error.message 
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "You're not on the roster—contact an admin." },
        { status: 403 }
      );
    }

    // Get gameId from params for error logging
    const { id: gameId } = await params;
    safeLog('error', '[credentials] Unexpected error', { 
      correlationId,
      gameId, 
      fid: error.fid || 'unknown', 
      error: error.message 
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to fetch credentials" },
      { status: 500 }
    );
  }
}
