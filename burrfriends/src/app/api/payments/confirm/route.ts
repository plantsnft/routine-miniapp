import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess } from "~/lib/pokerPermissions";
import { requireNotBlocked } from "~/lib/userBlocks";
import { GAME_ESCROW_CONTRACT } from "~/lib/constants";
import { isPaidGame } from "~/lib/games";
import { decryptPassword } from "~/lib/crypto";
import { verifyJoinGameTransaction } from "~/lib/blockchain-verify";
import { amountToUnits } from "~/lib/amounts";
import { getPlayerWalletAddress, getAllPlayerWalletAddresses } from "~/lib/neynar-wallet";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

/**
 * POST /api/payments/confirm
 * Confirm payment transaction and update participant status
 * 
 * CRITICAL: Only marks as paid after verifying on-chain transaction
 * IDEMPOTENT: If already paid with same tx_hash, returns success
 * 
 * MVP: Open signup - any authed user can confirm payment (unless blocked)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireNotBlocked - prevents blocked users from confirming payments
 */
export async function POST(req: NextRequest) {
  try {
    const correlationId = getCorrelationId(req);
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    safeLog('info', '[payments][confirm] Payment confirmation started', {
      correlationId,
      fid,
    });
    
    const body = await req.json();
    const { gameId, txHash } = body;

    if (!gameId || !txHash) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing gameId or txHash" },
        { status: 400 }
      );
    }

    if (!GAME_ESCROW_CONTRACT) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Escrow contract not configured" },
        { status: 500 }
      );
    }

    // MVP: Check if user is blocked (open signup, but blocked users cannot confirm payments)
    await requireNotBlocked(fid);

    // Verify game exists (no membership requirement for MVP)
    await requireGameAccess(fid, gameId);

    // Fetch game - use any type for raw DB result
    const games = await pokerDb.fetch<any>('burrfriends_games', {
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

    const gameRaw = games[0];
    
    // Map database fields to API fields
    const game: Game = {
      ...gameRaw,
      scheduled_time: (gameRaw as any).game_date || null,
      title: (gameRaw as any).name || null,
      gating_type: (gameRaw as any).buy_in_amount && (gameRaw as any).buy_in_amount > 0 ? 'entry_fee' : 'open',
      entry_fee_amount: (gameRaw as any).buy_in_amount,
      entry_fee_currency: (gameRaw as any).buy_in_currency,
    } as Game;
    
    // GATING: Require on-chain status to be 'active' for paid games
    const onchainStatus = (gameRaw as any).onchain_status;
    const onchainGameId = (gameRaw as any).onchain_game_id || gameId;
    
    // Quick check if user already paid (before registration check for idempotency)
    const quickParticipantCheck = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
      filters: { game_id: gameId, fid: fid },
      limit: 1,
    });
    
    // REGISTRATION WINDOW ENFORCEMENT: Check if registration is open (defense-in-depth)
    // This check happens after quick participant check (already-paid users can proceed)
    // but before transaction verification and participant creation
    const { isRegistrationOpen } = await import('~/lib/game-registration');
    
    // Count current joined participants (status='joined' only) for registration check
    const joinedParticipantsForRegCheck = await pokerDb.fetch<any>('burrfriends_participants', {
      filters: { game_id: gameId, status: 'joined' },
      select: 'id',
    });
    const joinedCountForRegCheck = joinedParticipantsForRegCheck.length;
    
    // Check if registration is open for this game
    const registrationStatus = isRegistrationOpen(
      {
        status: (gameRaw as any).status,
        game_type: (gameRaw as any).game_type,
        registration_close_minutes: (gameRaw as any).registration_close_minutes,
        scheduled_time: (gameRaw as any).game_date,
        game_date: (gameRaw as any).game_date,
        max_participants: (gameRaw as any).max_participants,
      },
      joinedCountForRegCheck
    );
    
    // Only check registration window if user is not already a participant
    // (Existing participants can confirm/recover payments even after registration closes)
    const isExistingParticipantForRegCheck = quickParticipantCheck.length > 0;
    
    if (!isExistingParticipantForRegCheck && !registrationStatus.isOpen) {
      const startTime = (gameRaw as any).game_date;
      const closeAt = registrationStatus.closeAt;
      
      safeLog('info', '[registration] blocked', {
        gameId,
        gameType: (gameRaw as any).game_type || 'standard',
        startTime,
        closeAt,
        now: new Date().toISOString(),
        route: '/api/payments/confirm',
        reason: registrationStatus.reason,
        fid,
      });
      
      // Block payment confirmation - do NOT create a valid participant seat
      // If a payment was already made on-chain, user should contact admins
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: registrationStatus.reason || "Registration is closed. Please contact an admin if you believe this is an error.",
          registrationCloseAt: closeAt,
          now: new Date().toISOString(),
        },
        { status: 400 }
      );
    }
    
    // CAPACITY ENFORCEMENT: Check if game is full (max_participants) before allowing payment
    // Use getEffectiveMaxParticipants helper for consistency with registration checks
    const { getEffectiveMaxParticipants } = await import('~/lib/game-registration');
    const gameTypeForCapacity = (gameRaw as any).game_type || 'standard';
    const maxParticipantsRaw = (gameRaw as any).max_participants;
    const effectiveMax = getEffectiveMaxParticipants({
      game_type: gameTypeForCapacity,
      max_participants: maxParticipantsRaw,
    });
    
    if (effectiveMax !== null && effectiveMax !== undefined) {
      // Count current joined participants (status='joined' only)
      const joinedParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
        filters: { game_id: gameId, status: 'joined' },
        select: 'id',
      });
      const joinedCount = joinedParticipants.length;
      
      // Check if user is already a participant (allow existing participants to confirm/recover)
      // Note: isExistingParticipantForRegCheck already computed above
      const isExistingParticipant = isExistingParticipantForRegCheck;
      
      // Only block if game is full AND user is not already a participant
      // Use > instead of >= to allow joining when exactly at capacity (defensive)
      if (!isExistingParticipant && joinedCount >= effectiveMax) {
        safeLog('info', '[payments][confirm] Game capacity reached, payment blocked', {
          correlationId,
          gameId,
          game_type: gameTypeForCapacity,
          max_participants: maxParticipantsRaw,
          effectiveMax,
          joinedCount,
          blocked: true,
          fid,
        });
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Game is full. Maximum participants reached." },
          { status: 409, headers: { 'Cache-Control': 'no-store, must-revalidate' } }
        );
      }
      
      safeLog('info', '[payments][confirm] Capacity check passed', {
        correlationId,
        gameId,
        game_type: gameTypeForCapacity,
        max_participants: maxParticipantsRaw,
        effectiveMax,
        joinedCount,
        blocked: false,
        fid,
        isExistingParticipant,
      });
    } else {
      // No max_participants set - allow unlimited participants
      safeLog('info', '[payments][confirm] No max_participants set, allowing unlimited participants', {
        correlationId,
        gameId,
        game_type: gameTypeForCapacity,
        max_participants: maxParticipantsRaw,
        fid,
      });
    }
    
    // Note: quickParticipantCheck already computed above for registration check
    const alreadyPaid = quickParticipantCheck.length > 0 && 
      (quickParticipantCheck[0].status === 'paid' || quickParticipantCheck[0].status === 'joined');
    
    // If already paid, return success immediately (idempotent - don't say "game does not require payment")
    if (alreadyPaid) {
      safeLog('info', '[payments/confirm] User already paid, returning existing participant', {
        correlationId,
        gameId,
        fid,
      });
      let gamePassword = null;
      if ((gameRaw as any).game_password_encrypted) {
        try {
          gamePassword = decryptPassword((gameRaw as any).game_password_encrypted);
        } catch (_err) {
          // Old encryption format - silently fail
        }
      }
      return NextResponse.json<ApiResponse<{
        participant: GameParticipant;
        game_password: string | null;
        clubgg_link: string | null;
      }>>({
        ok: true,
        data: {
          participant: quickParticipantCheck[0],
          game_password: gamePassword,
          clubgg_link: (gameRaw as any).clubgg_link ?? null,
        },
      });
    }
    
    // Now check if game requires payment (only if not already paid)
    if (!isPaidGame(game) || !game.entry_fee_amount) {
      safeLog('warn', '[payments/confirm] Game does not require payment', {
        correlationId,
        gameId,
        fid,
        buy_in_amount: (gameRaw as any).buy_in_amount,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `This game does not require payment. Entry fee: ${game.entry_fee_amount || 'none'}` },
        { status: 400 }
      );
    }
    
    if (onchainStatus !== 'active') {
      safeLog('warn', '[payments/confirm] Game not active on-chain', {
        correlationId,
        gameId,
        fid,
        onchainStatus,
      });
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

    // IDEMPOTENCY CHECK 1: Check if txHash already exists in DB (any game/user) - if found with this gameId/fid, return success
    const existingByTxHash = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
      filters: { tx_hash: txHash },
      limit: 1,
    });
    
    if (existingByTxHash.length > 0) {
      const existing = existingByTxHash[0];
      // If this txHash is already associated with this game and user, return success (idempotent)
      if ((existing.game_id === gameId) && ((existing as any).fid === fid || (existing as any).player_fid === fid)) {
        // Decrypt password for return
        let gamePassword = null;
        if ((gameRaw as any).game_password_encrypted) {
          try {
            gamePassword = decryptPassword((gameRaw as any).game_password_encrypted);
          } catch (_err) {
            // Old encryption format - silently fail (new games use creds_ciphertext)
          }
        }
        
        safeLog('info', '[payments/confirm] Transaction already confirmed (idempotent)', {
          correlationId,
          gameId,
          onchainGameId,
          fid,
          txHash,
        });
        
        const response = NextResponse.json<ApiResponse<{
          participant: GameParticipant;
          game_password: string | null;
          clubgg_link: string | null;
        }>>({
          ok: true,
          data: {
            participant: existing,
            game_password: gamePassword,
            clubgg_link: (gameRaw as any).clubgg_link ?? null,
          },
        });
        response.headers.set('Cache-Control', 'no-store, must-revalidate');
        return response;
      }
      // If txHash exists for different game/user, reject (prevent replay)
      safeLog('error', '[payments/confirm] Transaction hash already used for different game/user', {
        correlationId,
        gameId,
        fid,
        txHash,
        existingGameId: existing.game_id,
        existingFid: (existing as any).fid,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "This transaction has already been used for a different game or user." },
        { status: 409 }
      );
    }
    
    // IDEMPOTENCY CHECK 2: Check if user already paid this game (different txHash)
    // Note: quickParticipantCheck already computed above
    if (quickParticipantCheck.length > 0) {
      const existing = quickParticipantCheck[0];
      // Accept both 'joined' and 'paid' statuses for backward compatibility
      if ((existing.status === 'paid' || existing.status === 'joined') && existing.tx_hash && existing.tx_hash !== txHash) {
        safeLog('warn', '[payments/confirm] User already paid with different transaction', {
          correlationId,
          gameId,
          fid,
          txHash,
          existingTxHash: existing.tx_hash,
        });
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "You have already paid for this game with a different transaction." },
          { status: 400 }
        );
      }
    }

    // Get all allowed wallet addresses for this FID (custody + verified addresses)
    const allowedAddresses = await getAllPlayerWalletAddresses(fid);
    if (allowedAddresses.length === 0) {
      safeLog('error', '[payments/confirm] No wallet addresses found for user', {
        correlationId,
        gameId,
        fid,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Could not retrieve player wallet address. Please ensure your wallet is connected." },
        { status: 400 }
      );
    }

    // Calculate expected amount in token units
    const currency = game.entry_fee_currency || 'ETH';
    const expectedAmount = amountToUnits(game.entry_fee_amount.toString(), currency as 'ETH' | 'USDC' | 'BASE_ETH' | 'BETR');

    // CRITICAL BINDING CHECKS: Verify transaction on-chain BEFORE marking as paid
    // Must verify:
    // 1. tx is on Base and successful
    // 2. tx matches expected game_id (amount check is lenient - check contract state if mismatch)
    // 3. tx recipient/contract address matches expected (BurrfriendsGameEscrow contract)
    // 4. tx sender address is in the allowed addresses list (security binding)
    // 5. tx hash reuse is prevented (DB unique constraint + code checks)
    const verification = await verifyJoinGameTransaction(
      txHash,
      onchainGameId,
      allowedAddresses,
      expectedAmount
    );

    // If verification failed OR amount mismatch, check contract state to see if user actually joined
    let checkedContractState = false;
    let isJoinedOnChain = false;
    if (!verification.valid || verification.amountMismatch) {
      // Check contract participants mapping - if user is joined on-chain (verified via allowlist), accept despite amount mismatch
      try {
        const { ethers } = await import('ethers');
        const { GAME_ESCROW_CONTRACT, BASE_RPC_URL } = await import('~/lib/constants');
        const { GAME_ESCROW_ABI } = await import('~/lib/contracts');
        const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
        const contract = new ethers.Contract(
          GAME_ESCROW_CONTRACT,
          GAME_ESCROW_ABI,
          provider
        );
        
        // Check each allowed address to see if any shows as joined
        for (const addr of allowedAddresses) {
          try {
            const participantInfo = await contract.participants(onchainGameId, addr);
            const hasPaid = participantInfo?.hasPaid || participantInfo?.[2] || false;
            const hasRefunded = participantInfo?.hasRefunded || participantInfo?.[3] || false;
            if (hasPaid === true && hasRefunded === false) {
              isJoinedOnChain = true;
              checkedContractState = true;
              break;
            }
          } catch (_err) {
            // Continue to next address
            continue;
          }
        }
      } catch (contractErr) {
        // Contract check failed - proceed with normal verification
        safeLog('warn', '[payments/confirm] Failed to check contract state for amount mismatch', {
          correlationId,
          gameId,
          error: (contractErr as any)?.message,
        });
      }
    }

    // If verification failed AND not joined on-chain, reject
    if (!verification.valid && !isJoinedOnChain) {
      // SAFETY: Log verification failure with details (redacted) but safe error to client
      safeLog('error', '[payments/confirm] Transaction verification failed', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        txHash,
        error: verification.error,
        expectedGameId: onchainGameId,
        allowedAddresses: allowedAddresses.length,
        expectedAmount,
        currency,
      });
      
      // Return appropriate status code based on error type
      const statusCode = verification.error?.includes('not linked') ? 403 : 400;
      
      // Structured logging for 403 allowlist failures
      if (statusCode === 403) {
        safeLog('warn', '[payments][confirm] Allowlist check failed - 403', {
          correlationId,
          gameId,
          onchainGameId,
          fid,
          txHash,
          payerAddress: verification.verifiedPlayerAddress || 'unknown',
          allowedAddressesCount: allowedAddresses.length,
          // Redact actual allowed addresses for privacy (only log count)
        });
      }
      
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: verification.error || "Transaction verification failed. Please ensure the transaction is confirmed and matches the game requirements." 
        },
        { status: statusCode }
      );
    }

    // CRITICAL: Verify the transaction is bound to THIS specific game
    // The verification function now decodes the transaction input to extract the actual gameId
    // This prevents attackers from using a payment for game A to claim creds for game B
    if (verification.verifiedGameId !== onchainGameId) {
      safeLog('error', '[payments/confirm] Game ID binding check failed - transaction is for different game', {
        correlationId,
        expectedGameId: onchainGameId,
        actualGameId: verification.verifiedGameId,
        fid,
        txHash,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "This transaction is for a different game. Each transaction can only be used once for the specific game it was created for." },
        { status: 400 }
      );
    }

    // Address is verified to be in allowlist by verifyJoinGameTransaction
    // This check should not be needed (verifyJoinGameTransaction already rejected), but kept for defense in depth
    if (!verification.addressInAllowlist) {
      safeLog('warn', '[payments/confirm] Address not in allowlist (should not happen - verifyJoinGameTransaction should have rejected)', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        txHash,
        payerAddress: verification.verifiedPlayerAddress || 'unknown',
        allowedAddressesCount: allowedAddresses.length,
        // Redact actual allowed addresses for privacy
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Payment sent from wallet not linked to this Farcaster account." },
        { status: 403 }
      );
    }

    // If amount mismatch occurred but user is joined on-chain, log warning but proceed
    if (verification.amountMismatch && isJoinedOnChain) {
      safeLog('warn', '[payments/confirm] Amount mismatch but user joined on-chain - accepting payment', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        txHash,
        expectedAmount,
        actualAmount: verification.actualAmount || 'N/A',
        transferLogVerified: verification.transferLogVerified || false,
        currency,
        checkedContractState: true,
        isJoinedOnChain: true,
      });
    }
    
    // If transfer logs couldn't be verified (but no mismatch), log for monitoring
    if (!verification.transferLogVerified && !verification.amountMismatch && currency === 'USDC') {
      safeLog('warn', '[payments/confirm] USDC Transfer log verification not performed - monitoring', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        txHash,
        expectedAmount,
        currency,
      });
    }

    // Note: Tx hash reuse prevention is already checked by existingByTxHash above (lines 188-217)
    // If we reach here, existingByTxHash check passed (either no existing txHash or it matches this game/user)

    // Upsert participant with payment confirmed - use pokerDb
    // IMPORTANT: Database schema uses 'fid', not 'player_fid'
    // Use status 'joined' to indicate successful payment (standardized status)
    // SAFETY: tx_hash is only set here after verifyJoinGameTransaction passes (line 314)
    // This ensures tx_hash is only written after verified on-chain payment/join
    const participantData: any = {
      game_id: gameId,
      fid: fid, // Use 'fid' to match database schema
      status: 'joined', // Standardized status for successful payment
      tx_hash: txHash, // SAFETY: Only set after verified on-chain transaction (verifyJoinGameTransaction at line 314)
      paid_at: new Date().toISOString(),
    };

    // Preserve existing fields if updating
    // Note: quickParticipantCheck already computed above
    if (quickParticipantCheck.length > 0) {
      // Don't set is_eligible or join_reason - these fields don't exist in schema
    }

    const participant = await pokerDb.upsert<GameParticipant>('burrfriends_participants', participantData);
    const result = Array.isArray(participant) ? participant[0] : participant;

    // Decrypt password
    let gamePassword = null;
    if ((gameRaw as any).game_password_encrypted) {
      try {
        gamePassword = decryptPassword((gameRaw as any).game_password_encrypted);
      } catch (_err) {
        // Old encryption format - silently fail (new games use creds_ciphertext)
      }
    }

      safeLog('info', '[payments/confirm] Payment confirmed successfully', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        txHash,
        participantId: result.id,
        addressInAllowlist: verification.addressInAllowlist,
        verifiedPlayerAddress: verification.verifiedPlayerAddress,
        allowedAddressesCount: allowedAddresses.length,
        dbUpsertOccurred: true,
      });

    // Hook B: Check if game is full and notify participants
    // Run in-request but wrapped in try/catch so failures never block payment confirmation
    if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
      try {
        const maxParticipants = (gameRaw as any).max_participants;
        const gameStatus = (gameRaw as any).status;

        // Only notify if game has max_participants set and status is still 'open'
        if (maxParticipants !== null && maxParticipants !== undefined && gameStatus === 'open') {
          // Helper function to determine if a participant is paid
          // EXACT logic: paid if status='paid' OR payment_status='paid' OR (status='joined' && tx_hash)
          // Exclude refunded/cancelled: status !== 'refunded' && !refund_tx_hash
          const isPaidParticipant = (p: any): boolean => {
            // Check if refunded/cancelled first (exclude these)
            if (p.status === 'refunded' || (p.refund_tx_hash && p.refund_tx_hash.trim().length > 0)) {
              return false;
            }
            // Check paid conditions
            if (p.status === 'paid') {
              return true;
            }
            if ((p as any).payment_status === 'paid') {
              return true;
            }
            if (p.status === 'joined' && p.tx_hash && p.tx_hash.trim().length > 0) {
              return true;
            }
            return false;
          };

          // Fetch all participants with fields needed for isPaidParticipant()
          const allParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
            filters: { game_id: gameId },
            select: 'id,fid,status,tx_hash,refund_tx_hash',
          });

          // Filter to paid participants using helper
          const paidParticipants = allParticipants.filter(isPaidParticipant);
          const paidCount = paidParticipants.length;

          // Robust logging before full check
          const statusCounts = allParticipants.reduce((acc: Record<string, number>, p: any) => {
            const status = p.status || 'unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {});

          safeLog('info', '[payments/confirm][notifications] Checking if game is full', {
            gameId,
            maxParticipants,
            paidCount,
            totalParticipants: allParticipants.length,
            statusCounts,
          });

          // Check if game is now full
          if (paidCount >= maxParticipants) {
            // Phase 3: Auto-start sit and go games when 9th player pays
            const isSitAndGo = maxParticipants === 9 && (gameRaw as any).game_date === null;
            
            if (isSitAndGo) {
              // Update game status and set start time
              await pokerDb.update('burrfriends_games', gameId, {
                status: 'in_progress',
                game_date: new Date().toISOString(), // Set start time to now
              });
              
              safeLog('info', '[payments/confirm][sit-and-go] Auto-started sit and go game', {
                gameId,
                participantCount: paidCount,
              });
            }
            
            const {
              sendBulkNotifications,
              logNotificationEvent,
              notificationEventExists,
              generateNotificationId,
            } = await import('~/lib/notifications');
            const { APP_URL } = await import('~/lib/constants');
            const { decryptCreds } = await import('~/lib/crypto/credsVault');

            // Get participant FIDs (deduplicate)
            const participantFids = Array.from(new Set(paidParticipants.map((p: any) => p.fid)));

            // Debug logging
            safeLog('info', '[payments/confirm][notifications] Game is full, sending notifications', {
              gameId,
              paidParticipantCount: participantFids.length,
              maxParticipants,
            });

            // Safety check: if no recipients, log why
            if (participantFids.length === 0) {
              safeLog('warn', '[payments/confirm][notifications] Game is full but no recipient FIDs found', {
                gameId,
                paidParticipantsCount: paidParticipants.length,
                statusCounts,
              });
            }

            // Try to decrypt password (new format: creds_ciphertext)
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
              // Password decryption failed - leave passwordText empty
              safeLog('warn', '[payments/confirm][notifications] Failed to decrypt password', {
                gameId,
                error: decryptError?.message || String(decryptError),
              });
            }

            // Build notification body (will be truncated to max 128 chars in enforceConstraints)
            let notificationBody = 'Game is starting.';
            if (passwordText && passwordText.trim() !== '') {
              const passwordPart = ` Password: ${passwordText}`;
              // Ensure total body <= 128 chars (enforceConstraints will truncate, but try to fit here)
              if (notificationBody.length + passwordPart.length <= 128) {
                notificationBody += passwordPart;
              } else {
                // Truncate password if needed
                const maxPasswordLen = 128 - notificationBody.length - 3; // "..." 
                notificationBody += ` Password: ${passwordText.substring(0, maxPasswordLen)}...`;
              }
            } else {
              notificationBody += ' Open the app to view password.';
            }

            // Generate stable notification ID
            const notificationId = generateNotificationId('game_full', gameId);

            // Send notifications to all participants (with timeout handled inside)
            const results = await sendBulkNotifications(
              participantFids,
              {
                title: 'Game is starting',
                body: notificationBody,
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

            safeLog('info', '[payments/confirm][notifications] Game full notifications completed', {
              gameId,
              participantCount: participantFids.length,
              maxParticipants,
              successCount: results.filter(r => r.success).length,
              failedCount: results.filter(r => !r.success).length,
              hasPassword: !!passwordText,
            });
          } else {
            // Game not full - log why
            safeLog('info', '[payments/confirm][notifications] Game not full yet', {
              gameId,
              paidCount,
              maxParticipants,
              needed: maxParticipants - paidCount,
            });
          }
        } else {
          // Log why we skipped notification check
          if (maxParticipants === null || maxParticipants === undefined) {
            safeLog('info', '[payments/confirm][notifications] Skipping check - no max_participants set', { gameId });
          } else if (gameStatus !== 'open') {
            safeLog('info', '[payments/confirm][notifications] Skipping check - game status is not open', {
              gameId,
              gameStatus,
            });
          }
        }
      } catch (notificationError: any) {
        // Log but don't throw - payment confirmation should succeed even if notifications fail
        safeLog('error', '[payments/confirm][notifications] Failed to send game full notifications', {
          gameId,
          error: notificationError?.message || String(notificationError),
        });
      }
    }

    const response = NextResponse.json<ApiResponse<{
      participant: GameParticipant;
      game_password: string | null;
      clubgg_link: string | null;
      warning?: string;
    }>>({
      ok: true,
      data: {
        participant: result,
        game_password: gamePassword,
        clubgg_link: (gameRaw as any).clubgg_link ?? null,
        ...(verification.amountMismatch && isJoinedOnChain ? { warning: 'amount_mismatch_but_joined_onchain' } : {}),
      },
    });
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    return response;
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle blocked user
    if (error.message?.includes('blocked') || error.message?.includes('Blocked')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('member') || error.message?.includes('access')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][payments][confirm] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to confirm payment" },
      { status: 500 }
    );
  }
}
