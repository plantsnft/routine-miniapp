import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess, requireClubOwner, getClubForGame } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { getCorrelationId } from "~/lib/correlation-id";
import { safeLog } from "~/lib/redaction";
import { normalizeGame, enrichGameWithRegistrationStatus } from "~/lib/games";
import { getBaseScanTxUrl } from "~/lib/explorer";
import type { ApiResponse, Game } from "~/lib/types";

/**
 * GET /api/games/[id]
 * Get a single game by ID
 * 
 * MVP: Open signup - any authed user can view games
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 */
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // Verify game exists (no membership requirement for MVP)
    await requireGameAccess(fid, gameId);

    // Fetch game - use pokerDb
    const gamesRaw = await pokerDb.fetch<any>('games', {
      filters: { id: gameId },
      select: '*',
      limit: 1,
    });

    if (!gamesRaw || gamesRaw.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    // Fetch viewer's participant record if they're a participant
    // IMPORTANT: Include refunded participants so transaction receipts can be displayed
    let viewerParticipant = null;
    try {
      const viewerParticipants = await pokerDb.fetch('participants', {
        filters: { game_id: gameId, fid: fid },
        select: '*',
        limit: 1,
      });
      if (viewerParticipants && viewerParticipants.length > 0) {
        viewerParticipant = viewerParticipants[0];
        // Ensure all transaction fields are included (tx_hash, refund_tx_hash, payout_tx_hash, etc.)
      }
    } catch (participantError: any) {
      // Log but don't fail - participant data is optional
      safeLog('warn', '[games][id] Failed to fetch viewer participant', {
        gameId,
        fid,
        error: participantError?.message || 'Unknown error',
      });
    }

    // Normalize game fields (handles buy_in_* and entry_fee_* fields)
    const normalizedGame = normalizeGame(gamesRaw[0]);
    
    // Count current participants for registration status
    let currentParticipantCount = 0;
    try {
      const participants = await pokerDb.fetch<any>('participants', {
        filters: { game_id: gameId, status: 'joined' },
        select: 'id',
      });
      currentParticipantCount = participants.length;
    } catch (participantError: any) {
      // Log but don't fail - participant count is optional for registration status
      safeLog('warn', '[games][id] Failed to fetch participant count for registration status', {
        gameId,
        error: participantError?.message || 'Unknown error',
      });
    }
    
    // Map additional fields for API compatibility and enrich with registration status
    const settleTxHash = gamesRaw[0].settle_tx_hash || null;
    const baseGame: Game = {
      ...normalizedGame,
      scheduled_time: gamesRaw[0].game_date || null,
      title: gamesRaw[0].name || null,
      max_participants: gamesRaw[0].max_participants || null,
      settle_tx_hash: settleTxHash,
      settle_tx_url: getBaseScanTxUrl(settleTxHash) ?? undefined,
      game_type: gamesRaw[0].game_type || 'standard',
      registration_close_minutes: gamesRaw[0].registration_close_minutes ?? 0,
    } as Game;

    const game = enrichGameWithRegistrationStatus(baseGame, currentParticipantCount);

    // Payouts with Basescan URLs when game is settled (for tracking and verification)
    let payouts: Array<{ fid: number; amount: number; txHash: string; txUrl: string | null }> = [];
    if (settleTxHash && (gamesRaw[0].status === 'settled' || gamesRaw[0].status === 'completed')) {
      try {
        const withPayout = await pokerDb.fetch<any>('participants', {
          filters: { game_id: gameId },
          select: 'fid,payout_amount,payout_tx_hash',
          limit: 500,
        });
        payouts = (withPayout || [])
          .filter((p: any) => p?.payout_tx_hash)
          .map((p: any) => ({
            fid: Number(p.fid),
            amount: parseFloat(String(p.payout_amount || 0)),
            txHash: String(p.payout_tx_hash),
            txUrl: getBaseScanTxUrl(p.payout_tx_hash),
          }));
      } catch {
        // non-blocking
      }
    }

    // Get version for deployment verification
    const gitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown';

    // Return game with optional viewer participant data and payouts (Basescan URLs for verification)
    // IMPORTANT: Use no-store to ensure refund status is always fresh
    const response = NextResponse.json<ApiResponse<Game & { viewerParticipant?: any; payouts?: Array<{ fid: number; amount: number; txHash: string; txUrl: string | null }> }>>({
      ok: true,
      data: {
        ...game,
        ...(viewerParticipant && { viewerParticipant }),
        ...(payouts.length > 0 && { payouts }),
      },
    });
    
    // Ensure no caching for refund status
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('X-App-Version', gitSha);
    
    return response;
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('member') || error.message?.includes('access')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][games][id] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch game" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/games/[id]
 * Update a game (club owner or global admin only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireClubOwner - only club owner can update games
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const correlationId = getCorrelationId(req);
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // Verify game exists
    const clubId = await requireGameAccess(fid, gameId);
    
    // SAFETY: Require club ownership (or global admin)
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
    }

    const body = await req.json();
    const {
      name,
      buy_in_amount,
      buy_in_currency,
      game_date,
      clubgg_link,
      onchain_status,
      onchain_tx_hash,
      onchain_error,
      trigger_contract_redeploy,
    } = body;

    // Fetch existing game to check if entry fee changed (for paid games)
    const existingGames = await pokerDb.fetch<any>('games', {
      filters: { id: gameId },
      select: '*',
      limit: 1,
    });
    const existingGame = existingGames?.[0];
    const isPaidGame = existingGame?.buy_in_amount && parseFloat(String(existingGame.buy_in_amount)) > 0;
    const entryFeeChanged = buy_in_amount !== undefined && 
      existingGame?.buy_in_amount !== undefined &&
      parseFloat(String(buy_in_amount)) !== parseFloat(String(existingGame.buy_in_amount));
    const currencyChanged = buy_in_currency !== undefined && 
      existingGame?.buy_in_currency !== undefined &&
      buy_in_currency !== existingGame.buy_in_currency;

    // Build update data (only include provided fields)
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (buy_in_amount !== undefined) updateData.buy_in_amount = parseFloat(String(buy_in_amount));
    if (buy_in_currency !== undefined) updateData.buy_in_currency = buy_in_currency;
    if (game_date !== undefined) updateData.game_date = game_date;
    if (clubgg_link !== undefined) updateData.clubgg_link = clubgg_link;
    if (onchain_status !== undefined) updateData.onchain_status = onchain_status;
    if (onchain_tx_hash !== undefined) updateData.onchain_tx_hash = onchain_tx_hash;
    if (onchain_error !== undefined) updateData.onchain_error = onchain_error;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    safeLog('info', '[games][update] Updating game', {
      correlationId,
      gameId,
      fid,
      fields: Object.keys(updateData),
      isPaidGame,
      entryFeeChanged,
      currencyChanged,
      trigger_contract_redeploy,
    });

    // For paid games, if entry fee or currency changed (or explicit trigger), reset onchain status to trigger redeployment
    if (isPaidGame && (trigger_contract_redeploy || entryFeeChanged || currencyChanged)) {
      updateData.onchain_status = 'pending';
      updateData.onchain_tx_hash = null;
      updateData.onchain_error = null;
      
      safeLog('info', '[games][update] Paid game edit requires contract redeployment', {
        correlationId,
        gameId,
        entryFeeChanged,
        currencyChanged,
      });
    }

    // Update game - use pokerDb
    const updatedGames = await pokerDb.update<Game>('games',
      { id: gameId },
      updateData
    );

    const updatedGame = Array.isArray(updatedGames) && updatedGames.length > 0 
      ? updatedGames[0] 
      : null;

    if (!updatedGame) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found or update failed" },
        { status: 404 }
      );
    }

    // Map database fields to API fields
    const updatedGameRaw = updatedGame as any;
    const game: Game = {
      ...updatedGameRaw,
      scheduled_time: updatedGameRaw.game_date || null,
      title: updatedGameRaw.name || null,
      entry_fee_amount: updatedGameRaw.buy_in_amount || null,
      entry_fee_currency: updatedGameRaw.buy_in_currency || null,
      gating_type: updatedGameRaw.buy_in_amount ? 'entry_fee' : 'open',
    } as Game;

    // For paid games, automatically trigger contract redeployment if needed
    if (isPaidGame && (trigger_contract_redeploy || entryFeeChanged || currencyChanged)) {
      try {
        const { createGameOnContract } = await import('~/lib/contract-ops');
        const { isPaidGame: checkIsPaidGame } = await import('~/lib/games');
        
        if (checkIsPaidGame(game) && game.entry_fee_amount) {
          const entryFeeAmount = parseFloat(String(updatedGameRaw.buy_in_amount || game.entry_fee_amount));
          const entryFeeCurrency = updatedGameRaw.buy_in_currency || game.entry_fee_currency || 'USDC';
          const onchainGameId = updatedGameRaw.id; // Use game ID as on-chain game ID
          
          safeLog('info', '[games][update] Automatically redeploying contract for paid game', {
            correlationId,
            gameId,
            onchainGameId,
            entryFeeAmount,
            entryFeeCurrency,
          });

          const txHash = await createGameOnContract(
            onchainGameId,
            entryFeeAmount,
            entryFeeCurrency,
            correlationId
          );

          // Update game with on-chain registration success
          await pokerDb.update('games',
            { id: gameId },
            {
              onchain_status: 'active',
              onchain_game_id: onchainGameId,
              onchain_tx_hash: txHash === 'IDEMPOTENT_SUCCESS' ? null : txHash,
              onchain_error: null,
            }
          );

          // Refresh game data
          const refreshedGames = await pokerDb.fetch<any>('games', {
            filters: { id: gameId },
            select: '*',
            limit: 1,
          });
          const refreshedGame = refreshedGames?.[0];
          if (refreshedGame) {
            game.onchain_status = refreshedGame.onchain_status;
            game.onchain_tx_hash = refreshedGame.onchain_tx_hash;
            game.onchain_error = refreshedGame.onchain_error;
            game.onchain_game_id = refreshedGame.onchain_game_id;
          }

          safeLog('info', '[games][update] Contract redeployed successfully', {
            correlationId,
            gameId,
            txHash,
          });
        }
      } catch (contractError: any) {
        // Contract redeployment failed - log but don't fail the update
        const errorMessage = contractError.message || String(contractError);
        const redactedError = errorMessage
          .replace(/0x[a-fA-F0-9]{40}/g, '[REDACTED_ADDRESS]')
          .substring(0, 500);

        await pokerDb.update('games',
          { id: gameId },
          {
            onchain_status: 'failed',
            onchain_error: redactedError,
          }
        );

        safeLog('error', '[games][update] Contract redeployment failed', {
          correlationId,
          gameId,
          error: redactedError,
        });

        // Still return success, but include error in response
        return NextResponse.json<ApiResponse<Game>>({
          ok: true,
          data: { ...game, onchain_status: 'failed', onchain_error: redactedError } as Game,
          error: `Game updated but contract redeployment failed: ${redactedError}`,
        });
      }
    }

    safeLog('info', '[games][update] Game updated successfully', {
      correlationId,
      gameId,
      fid,
    });

    return NextResponse.json<ApiResponse<Game>>({
      ok: true,
      data: game,
    });
  } catch (error: any) {
    // Handle auth errors
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    // Handle permission errors
    if (error.message?.includes('owner') || error.message?.includes('permission')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][games][id][PATCH] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to update game" },
      { status: 500 }
    );
  }
}
