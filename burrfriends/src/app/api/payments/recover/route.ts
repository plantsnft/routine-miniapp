import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess } from "~/lib/pokerPermissions";
import { requireNotBlocked } from "~/lib/userBlocks";
import { GAME_ESCROW_CONTRACT, BASE_RPC_URL } from "~/lib/constants";
import { GAME_ESCROW_ABI } from "~/lib/contracts";
import { getAllPlayerWalletAddresses } from "~/lib/neynar-wallet";
import { isPaidGame } from "~/lib/games";
import { safeLog } from "~/lib/redaction";
import { getCorrelationId } from "~/lib/correlation-id";
import { ethers } from "ethers";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

/**
 * POST /api/payments/recover
 * Recover participant record by checking on-chain state
 * Used when user has paid on-chain but database doesn't have the record
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireNotBlocked - prevents blocked users from recovering
 */
export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    safeLog('info', '[payments][recover] Recovery attempt started', {
      correlationId,
      fid,
    });
    
    const body = await req.json();
    const { gameId, txHash } = body; // Support optional txHash for direct recovery

    if (!gameId) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing gameId" },
        { status: 400 }
      );
    }

    if (!GAME_ESCROW_CONTRACT) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Escrow contract not configured" },
        { status: 500 }
      );
    }

    // MVP: Check if user is blocked
    await requireNotBlocked(fid);

    // Verify game exists
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
    
    // Map database fields to API fields (same as GET /api/games/[id])
    const game = {
      ...gameRaw,
      scheduled_time: gameRaw.game_date || null,
      title: gameRaw.name || null,
      entry_fee_amount: gameRaw.buy_in_amount || null,
      entry_fee_currency: gameRaw.buy_in_currency || null,
      gating_type: gameRaw.buy_in_amount ? 'entry_fee' : 'open',
    } as Game;
    
    if (!isPaidGame(game)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game does not require payment" },
        { status: 400, headers: { 'Cache-Control': 'no-store, must-revalidate' } }
      );
    }
    
    // CAPACITY ENFORCEMENT: Check if game is full (max_participants) before recovering
    // Note: Recovery is allowed for existing participants even if game appears full
    // (they may have paid but DB record is missing)
    // Use effectiveMax for large_event with NULL max_participants (open-registration)
    const gameTypeForCapacity = (gameRaw as any).game_type || 'standard';
    const maxParticipants = (gameRaw as any).max_participants;
    const effectiveMax = gameTypeForCapacity === 'large_event' && (maxParticipants === null || maxParticipants === undefined)
      ? 99
      : maxParticipants;
    
    if (effectiveMax !== null && effectiveMax !== undefined) {
      // Count current joined participants (status='joined' only)
      const joinedParticipants = await pokerDb.fetch<any>('burrfriends_participants', {
        filters: { game_id: gameId, status: 'joined' },
        select: 'id',
      });
      const joinedCount = joinedParticipants.length;
      
      // Check if user is already a participant (recovery should work for existing participants)
      const existingParticipants = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
        filters: { game_id: gameId, fid: fid },
        limit: 1,
      });
      const isExistingParticipant = existingParticipants.length > 0;
      
      // Only block if game is full AND user is not already a participant
      // (If they're already a participant, allow recovery even if game appears full)
      if (!isExistingParticipant && joinedCount >= effectiveMax) {
        safeLog('info', '[payments][recover] Game capacity reached, recovery blocked', {
          correlationId,
          gameId,
          max_participants: maxParticipants,
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
      
      safeLog('info', '[payments][recover] Capacity check passed', {
        correlationId,
        gameId,
        max_participants: maxParticipants,
        effectiveMax,
        joinedCount,
        blocked: false,
        fid,
        isExistingParticipant,
      });
    }

    // Use on-chain game ID if available (same logic as confirm endpoint)
    const onchainGameId = gameRaw.onchain_game_id || gameId;
    
    // Get all allowed wallet addresses for this FID
    const allowedAddresses = await getAllPlayerWalletAddresses(fid);
    if (allowedAddresses.length === 0) {
      safeLog('warn', '[payments][recover] No wallet addresses found for user', {
        correlationId,
        gameId,
        fid,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Could not retrieve player wallet address. Please ensure your wallet is connected." },
        { status: 400 }
      );
    }
    
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const contract = new ethers.Contract(
      GAME_ESCROW_CONTRACT,
      GAME_ESCROW_ABI,
      provider
    );

    try {
      let actualPayerAddress: string | null = null;
      let hasPaidOnChain = false;
      
      // If txHash provided, verify transaction and extract actual payer address
      if (txHash) {
        safeLog('info', '[payments][recover] Using txHash-based recovery', {
          correlationId,
          gameId,
          onchainGameId,
          fid,
          txHash,
        });
        
        try {
          const { verifyTransactionExists } = await import('~/lib/blockchain-verify');
          const txCheck = await verifyTransactionExists(txHash);
          if (!txCheck.confirmed) {
            return NextResponse.json<ApiResponse<{ 
              recovered: boolean;
              hasPaidOnChain: boolean;
            }>>({
              ok: true,
              data: { recovered: false, hasPaidOnChain: false },
            });
          }
          
          // Fetch transaction to get sender address
          const txResponse = await fetch(BASE_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getTransactionByHash',
              params: [txHash],
              id: 1,
            }),
          });
          
          if (txResponse.ok) {
            const txData = await txResponse.json();
            if (txData.result) {
              actualPayerAddress = txData.result.from?.toLowerCase() || null;
              
              // Verify transaction is for this game
              if (txData.result.to?.toLowerCase() === GAME_ESCROW_CONTRACT.toLowerCase()) {
                // Decode transaction to verify gameId
                const contractInterface = new ethers.Interface(GAME_ESCROW_ABI);
                try {
                  const decoded = contractInterface.parseTransaction({ 
                    data: txData.result.input, 
                    value: txData.result.value 
                  });
                  if (decoded?.name === 'joinGame' && decoded.args[0] === onchainGameId && actualPayerAddress) {
                    // Transaction is valid for this game - verify payer address is in allowlist
                    const normalizedAllowed = allowedAddresses.map((addr: string) => addr.toLowerCase());
                    if (normalizedAllowed.includes(actualPayerAddress)) {
                      // Address is in allowlist - check contract participants mapping
                      const participantInfo = await contract.participants(onchainGameId, actualPayerAddress);
                      const hasPaid = participantInfo?.hasPaid || participantInfo?.[2] || false;
                      const hasRefunded = participantInfo?.hasRefunded || participantInfo?.[3] || false;
                      hasPaidOnChain = hasPaid === true && hasRefunded === false;
                    } else {
                      safeLog('warn', '[payments][recover] Payer address not in allowlist', {
                        correlationId,
                        gameId,
                        fid,
                        txHash,
                        actualPayerAddress,
                        allowedAddresses: allowedAddresses.length,
                      });
                      // Don't treat as paid if address not in allowlist
                    }
                  }
                } catch (decodeErr) {
                  safeLog('warn', '[payments][recover] Failed to decode transaction', {
                    correlationId,
                    gameId,
                    txHash,
                    error: (decodeErr as any)?.message,
                  });
                }
              }
            }
          }
        } catch (txErr) {
          safeLog('warn', '[payments][recover] TxHash verification failed, falling back to address lookup', {
            correlationId,
            gameId,
            txHash,
            error: (txErr as any)?.message,
          });
        }
      }
      
      // Fallback: Check contract participants mapping for each allowed address
      if (!hasPaidOnChain) {
        for (const addr of allowedAddresses as string[]) {
          try {
            const participantInfo = await contract.participants(onchainGameId, addr);
            const hasPaid = participantInfo?.hasPaid || participantInfo?.[2] || false;
            const hasRefunded = participantInfo?.hasRefunded || participantInfo?.[3] || false;
            if (hasPaid === true && hasRefunded === false) {
              hasPaidOnChain = true;
              actualPayerAddress = addr.toLowerCase();
              break; // Found a paid address, stop checking
            }
          } catch (_err) {
            // Continue to next address if this one fails
            continue;
          }
        }
      }

      safeLog('info', '[payments][recover] On-chain participant check', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        hasPaidOnChain,
        actualPayerAddress: actualPayerAddress || 'unknown',
        usedTxHash: Boolean(txHash),
      });

      if (!hasPaidOnChain) {
        // Return 200 with recovered:false (not 400) so UI doesn't treat it as an error
        return NextResponse.json<ApiResponse<{ 
          recovered: boolean;
          hasPaidOnChain: boolean;
        }>>({
          ok: true,
          data: {
            recovered: false,
            hasPaidOnChain: false,
          },
        });
      }

      // User has paid on-chain - check if database has record
      const existingParticipants = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
        filters: { game_id: gameId, fid: fid },
        limit: 1,
      });

      // Check if record already exists with 'joined' or 'paid' status (backward compatibility)
      if (existingParticipants.length > 0 && (existingParticipants[0].status === 'paid' || existingParticipants[0].status === 'joined')) {
        // Already have paid record - return it with password
        // Decrypt password for return (same logic as confirm endpoint)
        let gamePassword = null;
        if (gameRaw.game_password_encrypted) {
          try {
            const { decryptPassword } = await import('~/lib/crypto');
            gamePassword = decryptPassword(gameRaw.game_password_encrypted);
          } catch (_err) {
            // Old encryption format - silently fail (new games use creds_ciphertext)
          }
        }

        safeLog('info', '[payments][recover] Participant record already exists', {
          correlationId,
          gameId,
          fid,
        });
        const response = NextResponse.json<ApiResponse<{ 
          participant: GameParticipant; 
          recovered: boolean;
          game_password: string | null;
          clubgg_link: string | null;
        }>>({
          ok: true,
          data: {
            participant: existingParticipants[0],
            recovered: false, // Already existed
            game_password: gamePassword,
            clubgg_link: gameRaw.clubgg_link ?? null,
          },
        });
        response.headers.set('Cache-Control', 'no-store, must-revalidate');
        return response;
      }

      // Need to create/update participant record (backfill)
      // Use status 'joined' to indicate successful payment (standardized)
      // SAFETY: tx_hash is only set here after on-chain verification (hasPaidOnChain check above)
      // This ensures tx_hash is only written after verified on-chain payment/join
      const participantData: any = {
        game_id: gameId,
        fid: fid,
        status: 'joined', // Standardized status for successful payment
        tx_hash: txHash || null, // SAFETY: Only set if hasPaidOnChain === true (verified on-chain at lines 215-274)
      };

      const participant = await pokerDb.upsert<GameParticipant>('burrfriends_participants', participantData);
      const result = Array.isArray(participant) ? participant[0] : participant;

      // Decrypt password for return (same logic as confirm endpoint)
      let gamePassword = null;
      if (gameRaw.game_password_encrypted) {
        try {
          const { decryptPassword } = await import('~/lib/crypto');
          gamePassword = decryptPassword(gameRaw.game_password_encrypted);
        } catch (_err) {
          // Old encryption format - silently fail (new games use creds_ciphertext)
        }
      }

      safeLog('info', '[payments][recover] Participant record recovered', {
        correlationId,
        gameId,
        onchainGameId,
        fid,
        participantId: result.id,
        txHash: txHash || 'none',
        actualPayerAddress: actualPayerAddress || 'unknown',
        allowedAddressesCount: allowedAddresses.length,
        dbUpsertOccurred: true,
      });

      const response = NextResponse.json<ApiResponse<{ 
        participant: GameParticipant; 
        recovered: boolean;
        game_password: string | null;
        clubgg_link: string | null;
      }>>({
        ok: true,
        data: {
          participant: result,
          recovered: true,
          game_password: gamePassword,
          clubgg_link: gameRaw.clubgg_link ?? null,
        },
      });
      response.headers.set('Cache-Control', 'no-store, must-revalidate');
      return response;

    } catch (contractError: any) {
      safeLog('error', '[payments][recover] Contract call failed', {
        correlationId,
        gameId,
        fid,
        error: contractError?.message || contractError,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Failed to check on-chain state. Please try again or contact support." },
        { status: 500 }
      );
    }
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      safeLog('warn', '[payments][recover] Authentication error', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('blocked') || error.message?.includes('Blocked')) {
      safeLog('warn', '[payments][recover] User blocked', {
        correlationId,
        error: error.message,
      });
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    safeLog('error', '[payments][recover] Error', {
      correlationId,
      error: error?.message || "Failed to recover participant",
      stack: error?.stack,
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to recover participant" },
      { status: 500 }
    );
  }
}

