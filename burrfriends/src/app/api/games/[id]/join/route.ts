import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess } from "~/lib/pokerPermissions";
import { requireNotBlocked } from "~/lib/userBlocks";
import { canUserJoinGame } from "~/lib/eligibility";
import { getCorrelationId } from "~/lib/correlation-id";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse, Game, GameParticipant, EligibilityResult } from "~/lib/types";
import { buildGameStartedPayload } from "~/lib/game-started-notification";

/**
 * POST /api/games/[id]/join
 * Join a game (or update eligibility)
 * 
 * MVP: Open signup - any authed user can join (unless blocked)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireNotBlocked - prevents blocked users from joining
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = getCorrelationId(req);
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    safeLog('info', '[games][join] User joining game', {
      correlationId,
      gameId,
      fid,
    });
    
    // MVP: Check if user is blocked (open signup, but blocked users cannot join)
    await requireNotBlocked(fid);
    
    // Verify game exists (no membership requirement for MVP)
    await requireGameAccess(fid, gameId);

    // Fetch game - use pokerDb
    const gamesRaw = await pokerDb.fetch<any>('burrfriends_games', {
      filters: { id: gameId },
      limit: 1,
    });

    if (!gamesRaw || gamesRaw.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const gameRaw = gamesRaw[0];
    // Map database fields to API fields (same as GET endpoints)
    // FIX: Use gating_type from database (can be 'stake_threshold'), don't infer from buy_in_amount
    const game: Game = {
      ...gameRaw,
      scheduled_time: gameRaw.game_date || null,
      title: gameRaw.name || null,
      gating_type: gameRaw.gating_type || (gameRaw.buy_in_amount && gameRaw.buy_in_amount > 0 ? 'entry_fee' : 'open'),
      entry_fee_amount: gameRaw.buy_in_amount,
      entry_fee_currency: gameRaw.buy_in_currency,
      staking_min_amount: gameRaw.staking_min_amount || null, // Include staking_min_amount for eligibility checks
    } as Game;

    // GATING: For prize-based games, no on-chain registration needed (buy_in_amount is always 0)
    // Only check on-chain status for legacy paid games (backward compatibility)
    const isPaidGame = gameRaw.buy_in_amount && parseFloat(String(gameRaw.buy_in_amount)) > 0;
    if (isPaidGame) {
      const onchainStatus = gameRaw.onchain_status;
      if (onchainStatus !== 'active') {
        return NextResponse.json<ApiResponse>(
          { 
            ok: false, 
            error: onchainStatus === 'failed' 
              ? "Game not active on-chain. Ask an admin to retry activation."
              : "Game not active on-chain yet. Please wait or ask an admin to activate it."
          },
          { status: 400 }
        );
      }
    }
    // Prize-based games: No on-chain check needed, proceed directly to join

    // REGISTRATION WINDOW ENFORCEMENT: Check if registration is open
    const { isRegistrationOpen } = await import('~/lib/game-registration');
    
    // Count current joined participants (status='joined' only)
    const joinedParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
      filters: { game_id: gameId, status: 'joined' },
      select: 'id',
    });
    const joinedCount = joinedParticipants.length;
    
    // Check if registration is open for this game
    const registrationStatus = isRegistrationOpen(
      {
        status: gameRaw.status,
        game_type: gameRaw.game_type,
        registration_close_minutes: gameRaw.registration_close_minutes,
        scheduled_time: gameRaw.game_date,
        game_date: gameRaw.game_date,
        max_participants: gameRaw.max_participants,
      },
      joinedCount
    );
    
    // If already a participant, allow them to re-join (update eligibility, etc.)
    const existingParticipants = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
      filters: { game_id: gameId, fid: fid },
      limit: 1,
    });
    const isExistingParticipant = existingParticipants.length > 0;

    // Phase 32: Sunday High Stakes — join requires approved signup unless already a participant
    if (gameRaw.is_sunday_high_stakes && !isExistingParticipant) {
      const signups = await pokerDb.fetch<any>('poker_sunday_high_stakes_signups', {
        filters: { game_id: gameId, fid, status: 'approved' },
        limit: 1,
      });
      if (!signups || signups.length === 0) {
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error: 'This is a Sunday High Stakes game. You must sign up and be approved before you can join.',
          },
          { status: 403 }
        );
      }
    }
    
    // Only block if registration is closed AND user is not already a participant
    if (!isExistingParticipant && !registrationStatus.isOpen) {
      safeLog('info', '[games][join] Registration closed, join blocked', {
        correlationId,
        gameId,
        gameType: gameRaw.game_type,
        reason: registrationStatus.reason,
        closeAt: registrationStatus.closeAt,
        joinedCount,
        max_participants: gameRaw.max_participants,
        blocked: true,
        fid,
      });
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: registrationStatus.reason || "Registration is closed",
          closeAt: registrationStatus.closeAt,
        },
        { status: 400 }
      );
    }
    
    safeLog('info', '[games][join] Registration check passed', {
      correlationId,
      gameId,
      gameType: gameRaw.game_type,
      registrationOpen: registrationStatus.isOpen,
      joinedCount,
      max_participants: gameRaw.max_participants,
      blocked: false,
      fid,
      isExistingParticipant,
    });

    // Note: existingParticipants already computed above for registration check
    const existingParticipant = existingParticipants[0];

    // Check eligibility and enforce staking requirements
    const eligibility = await canUserJoinGame(fid, game, undefined);

    // FIX: Enforce eligibility check - block join if user doesn't meet requirements (e.g., staking)
    if (!eligibility.eligible) {
      safeLog('info', '[games][join] User not eligible to join', {
        correlationId,
        gameId,
        fid,
        reason: eligibility.reason,
        message: eligibility.message,
        gatingType: game.gating_type,
        stakingMinAmount: game.staking_min_amount,
      });
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: eligibility.message || 'You are not eligible to join this game',
          eligibility: {
            eligible: eligibility.eligible,
            reason: eligibility.reason,
            message: eligibility.message,
          },
        },
        { status: 403 }
      );
    }

    // Upsert participant record - use pokerDb
    // Note: Schema only has: id, game_id, fid, status, tx_hash, paid_at, inserted_at, updated_at
    // Phase 3: For prize-based games, no payment needed - status is 'joined' immediately
    const participantData: any = {
      game_id: gameId,
      fid: fid,
      status: 'joined', // No payment, so status is 'joined' immediately
      tx_hash: null, // No payment transaction
      paid_at: null, // No payment
    };

    // If updating existing, preserve status if already 'paid' (for backward compatibility)
    if (existingParticipant) {
      // Keep 'paid' status if already set (legacy games)
      if (existingParticipant.status === 'paid') {
        participantData.status = 'paid';
        participantData.tx_hash = existingParticipant.tx_hash;
        participantData.paid_at = existingParticipant.paid_at;
      } else {
        // For new joins or 'joined' status, use 'joined' with no payment
        participantData.status = 'joined';
      }
      // Preserve legacy fields if they exist
      if ((existingParticipant as any).has_seen_password !== undefined) {
        (participantData as any).has_seen_password = (existingParticipant as any).has_seen_password;
      }
      if ((existingParticipant as any).password_viewed_at) {
        (participantData as any).password_viewed_at = (existingParticipant as any).password_viewed_at;
      }
    }

    const participant = await pokerDb.upsert<GameParticipant>('burrfriends_participants', participantData);
    const result = Array.isArray(participant) ? participant[0] : participant;

    // Phase 3: Auto-start logic for Sit and Go games (moved from payments/confirm)
    // Check if game is full after participant joins
    const maxParticipants = gameRaw.max_participants;
    if (maxParticipants !== null && maxParticipants !== undefined && gameRaw.status === 'open') {
      const allParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
        filters: { game_id: gameId, status: 'joined' },
        select: 'id,fid',
      });
      const participantCount = allParticipants.length;

      if (participantCount >= maxParticipants) {
        const isSitAndGo = maxParticipants === 9 && gameRaw.game_date === null;
        // Preview: never send game-start or auto-start when table fills
        if (gameRaw.is_preview) {
          // Skip: no status update, no notifications for preview games
        } else if (isSitAndGo) {
          // Auto-start sit and go game
          await pokerDb.update('burrfriends_games', { id: gameId }, {
            status: 'in_progress',
            game_date: new Date().toISOString(), // Set start time to now
          });
          
          safeLog('info', '[games][join][sit-and-go] Auto-started sit and go game', {
            correlationId,
            gameId,
            participantCount,
          });

          // Send notifications to all participants (reuse logic from payments/confirm)
          try {
            const {
              sendBulkNotifications,
              logNotificationEvent,
              notificationEventExists,
              generateNotificationId,
            } = await import('~/lib/notifications');
            const { APP_URL } = await import('~/lib/constants');
            const { decryptCreds } = await import('~/lib/crypto/credsVault');

            // Get participant FIDs (deduplicate)
            const participantFids = Array.from(new Set(allParticipants.map((p: any) => p.fid)));
            
            // Diagnostic logging
            const enableNotifications = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';
            safeLog('info', '[games][join][notifications] Notification check for game start', {
              correlationId,
              gameId,
              participantCount: participantFids.length,
              enabled: enableNotifications,
              envVarSet: process.env.ENABLE_PUSH_NOTIFICATIONS !== undefined,
            });
            
            if (!enableNotifications) {
              safeLog('warn', '[games][join][notifications] Notifications disabled - skipping game start notifications', {
                correlationId,
                gameId,
                participantCount: participantFids.length,
              });
            }

            // Try to decrypt password
            let passwordText = '';
            try {
              if ((gameRaw as any).creds_ciphertext && (gameRaw as any).creds_iv) {
                const creds = decryptCreds({
                  ciphertextB64: (gameRaw as any).creds_ciphertext,
                  ivB64: (gameRaw as any).creds_iv,
                  version: (gameRaw as any).creds_version || 1,
                });
                passwordText = creds.password || '';
              }
            } catch (decryptError: any) {
              safeLog('warn', '[games][join][notifications] Failed to decrypt password', {
                correlationId,
                gameId,
                error: decryptError.message,
              });
            }

            // Generate notification ID for idempotency
            const notificationId = generateNotificationId('game_full', gameId);
            
            // Check if already sent (idempotency) - check for each participant
            // Filter out participants who have already received this notification
            const participantFidsToNotify: number[] = [];
            for (const fid of participantFids) {
              const alreadySent = await notificationEventExists('game_full', gameId, fid);
              if (!alreadySent) {
                participantFidsToNotify.push(fid);
              }
            }
            
            if (participantFidsToNotify.length > 0) {
              const { title, body } = buildGameStartedPayload(gameRaw, participantCount, { passwordHint: !!passwordText });

              const results = await sendBulkNotifications(
                participantFidsToNotify,
                {
                  title,
                  body,
                  targetUrl: new URL(`/games/${gameId}?fromNotif=game_full`, APP_URL).href,
                },
                notificationId
              );

              // Log notification events (UPSERT handles idempotency - only skips if status='sent')
              for (const result of results) {
                if (result.fid !== undefined) {
                  // Check if already sent (skip retry if successful)
                  const alreadySent = await notificationEventExists('game_full', gameId, result.fid);
                  if (!alreadySent) {
                    await logNotificationEvent(
                      'game_full',
                      gameId,
                      result.fid,
                      result.success ? 'sent' : 'failed',
                      result.error
                    );
                  }
                }
              }

              const successCount = results.filter(r => r.success).length;
              const failedCount = results.filter(r => !r.success).length;
              
              safeLog('info', '[games][join][notifications] Game start notifications completed', {
                correlationId,
                gameId,
                requestedCount: participantFidsToNotify.length,
                successCount,
                failedCount,
                failedFids: results.filter(r => !r.success).map(r => r.fid).filter(Boolean),
              });
              
              // Log warning if some participants don't have subscriptions
              if (failedCount > 0) {
                safeLog('warn', '[games][join][notifications] Some participants may not have notification subscriptions', {
                  correlationId,
                  gameId,
                  failedCount,
                  totalRequested: participantFidsToNotify.length,
                });
              }
            } else {
              safeLog('info', '[games][join][notifications] No participants to notify (all already notified)', {
                correlationId,
                gameId,
                totalParticipants: participantFids.length,
              });
            }
          } catch (notificationError: any) {
            // Don't fail join if notifications fail
            safeLog('warn', '[games][join][notifications] Failed to send notifications', {
              correlationId,
              gameId,
              error: notificationError.message,
            });
          }
        }
      }
    }

    return NextResponse.json<ApiResponse<{ eligibility: EligibilityResult; participant: GameParticipant }>>({
      ok: true,
      data: {
        eligibility,
        participant: result,
      },
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      safeLog('warn', '[games][join] Authentication error', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors (blocked user, etc.)
    if (error.message?.includes('blocked') || error.message?.includes('Blocked')) {
      safeLog('warn', '[games][join] User blocked', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('member') || error.message?.includes('access')) {
      safeLog('warn', '[games][join] Access denied', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    safeLog('error', '[games][join] Error joining game', {
      correlationId,
      error: error?.message || "Failed to join game",
      stack: error?.stack,
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to join game" },
      { status: 500 }
    );
  }
}
