/**
 * GET /api/admin/games/[id]/onchain-payload
 * Get Remix recovery payload for manually creating game on-chain
 * 
 * Returns the exact arguments to paste into Remix createGame() call
 * Admin-only endpoint for break-glass recovery when automatic registration fails
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isGlobalAdmin } from "~/lib/permissions";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess } from "~/lib/pokerPermissions";
import { getCreateGamePayload } from "~/lib/contract-ops";
import { GAME_ESCROW_CONTRACT } from "~/lib/constants";
import type { ApiResponse, Game } from "~/lib/types";

export async function GET(
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

    // Only provide payload for paid games
    if (!buyInAmount || parseFloat(String(buyInAmount)) <= 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game does not require on-chain registration (free game)" },
        { status: 400 }
      );
    }

    // Use onchain_game_id if set, otherwise use game.id
    const onchainGameId = (game as any).onchain_game_id || gameId;

    // Get payload
    const payload = getCreateGamePayload(
      onchainGameId,
      buyInAmount,
      buyInCurrency
    );

    return NextResponse.json<ApiResponse<{
      contractAddress: string;
      functionName: string;
      payload: typeof payload;
      instructions: string;
    }>>({
      ok: true,
      data: {
        contractAddress: GAME_ESCROW_CONTRACT,
        functionName: 'createGame',
        payload,
        instructions: `Call createGame(${payload.gameId}, "${payload.currencyAddress}", ${payload.entryFeeUnits}) on contract ${GAME_ESCROW_CONTRACT}`,
      },
    });
  } catch (error: any) {
    console.error("[API][admin][games][onchain-payload] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get on-chain payload" },
      { status: 500 }
    );
  }
}

