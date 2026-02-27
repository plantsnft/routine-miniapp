/**
 * POST /api/admin/games/[id]/mark-onchain-active
 * Mark game as active on-chain after manual Remix recovery
 * 
 * Verifies the transaction hash matches expected createGame() call,
 * then updates onchain_status to 'active' and stores tx_hash
 * Admin-only endpoint for break-glass recovery when automatic registration fails
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isGlobalAdmin } from "~/lib/permissions";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess } from "~/lib/pokerPermissions";
import { verifyCreateGameTransaction } from "~/lib/contract-ops";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse, Game } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication and global admin
    const { fid } = await requireAuth(req);
    if (!isGlobalAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    // Verify game exists
    await requireGameAccess(fid, gameId);

    // Parse request body
    const body = await req.json();
    const { tx_hash } = body;

    if (!tx_hash || typeof tx_hash !== 'string') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing or invalid tx_hash" },
        { status: 400 }
      );
    }

    // Fetch game
    const games = await pokerDb.fetch<Game>('games', {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const game = games[0];
    const buyInAmount = (game as any).buy_in_amount;
    const buyInCurrency = (game as any).buy_in_currency || 'USDC';

    // Only allow marking active for paid games
    if (!buyInAmount || parseFloat(String(buyInAmount)) <= 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game does not require on-chain registration (free game)" },
        { status: 400 }
      );
    }

    // Use onchain_game_id if set, otherwise use game.id
    const onchainGameId = (game as any).onchain_game_id || gameId;

    // Verify transaction matches expected createGame call
    const isValid = await verifyCreateGameTransaction(
      tx_hash,
      onchainGameId,
      buyInCurrency,
      buyInAmount.toString()
    );

    if (!isValid) {
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: "Transaction does not match expected createGame() call. Verify tx_hash is correct and calls createGame with matching parameters." 
        },
        { status: 400 }
      );
    }

    // Update game status to active
    await pokerDb.update('games',
      { id: gameId },
      {
        onchain_status: 'active',
        onchain_game_id: onchainGameId,
        onchain_tx_hash: tx_hash,
        onchain_error: null,
      }
    );

    safeLog('info', '[admin][games][mark-onchain-active] Game marked active after manual recovery', {
      gameId,
      onchainGameId,
      tx_hash,
      adminFid: fid,
    });

    return NextResponse.json<ApiResponse<{ success: boolean }>>({
      ok: true,
      data: { success: true },
    });
  } catch (error: any) {
    safeLog('error', '[admin][games][mark-onchain-active] Error:', {
      error: error.message || String(error),
    });
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to mark game as active" },
      { status: 500 }
    );
  }
}

