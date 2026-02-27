import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getClubForGame, requireClubOwner } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { GAME_ESCROW_CONTRACT, BASE_RPC_URL } from "~/lib/constants";
import { GAME_ESCROW_ABI } from "~/lib/contracts";
import { getPlayerWalletAddress } from "~/lib/neynar-wallet";
import { isPaidGame } from "~/lib/games";
import { logRefundEvent } from "~/lib/audit-logger";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

/**
 * POST /api/games/[id]/refund
 * Refund a player's entry fee (club owner or global admin only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * IDEMPOTENT: If already refunded, returns success (no-op)
 * INVARIANT: Prevents refund if already settled
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // Admin gate: global admin OR club owner
    const clubId = await getClubForGame(gameId);
    if (!clubId) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }
    
    if (!isGlobalAdmin(fid)) {
      await requireClubOwner(fid, clubId);
    }

    const body = await req.json();
    const { playerFid, playerAddress: providedAddress } = body;

    if (!playerFid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing playerFid" },
        { status: 400 }
      );
    }

    if (!GAME_ESCROW_CONTRACT) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Escrow contract not configured" },
        { status: 500 }
      );
    }

    // Fetch game - use pokerDb
    const games = await pokerDb.fetch<Game>('burrfriends_games', {
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

    if (!isPaidGame(game)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "This is not a paid game" },
        { status: 400 }
      );
    }

    // Get player wallet address
    let playerAddress = providedAddress;
    if (!playerAddress || !ethers.isAddress(playerAddress)) {
      playerAddress = await getPlayerWalletAddress(playerFid);
      if (!playerAddress || !ethers.isAddress(playerAddress)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Could not determine player wallet address" },
          { status: 400 }
        );
      }
    }

    // Fetch participant - use pokerDb
    const participants = await pokerDb.fetch<GameParticipant>('burrfriends_participants', {
      filters: { game_id: gameId, fid: playerFid },
      limit: 1,
    });

    if (!participants || participants.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Participant not found" },
        { status: 404 }
      );
    }

    const participant = participants[0];

    // IDEMPOTENCY: If already refunded, return success
    if (participant.status === 'refunded') {
      return NextResponse.json<ApiResponse<{
        participant: GameParticipant;
        refundTxHash: string | null;
        message: string;
      }>>({
        ok: true,
        data: {
          participant,
          refundTxHash: participant.tx_hash || null,
          message: 'Participant already refunded',
        },
      });
    }

    // INVARIANT: Prevent refund if already settled
    if (participant.status === 'settled') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot refund participant who is already settled" },
        { status: 400 }
      );
    }

    // Verify participant has paid
    if (participant.status !== 'paid') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Participant has not paid" },
        { status: 400 }
      );
    }

    // Call smart contract refund function
    const masterWalletPrivateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
    if (!masterWalletPrivateKey) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Master wallet private key not configured" },
        { status: 500 }
      );
    }

    let refundTxHash: string;
    try {
      const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
      const wallet = new ethers.Wallet(masterWalletPrivateKey, provider);
      const contract = new ethers.Contract(
        GAME_ESCROW_CONTRACT,
        GAME_ESCROW_ABI,
        wallet
      );

      safeLog('info', '[refund] Calling contract.refundPlayer', {
        gameId,
        fid,
        playerFid,
        playerAddress,
      });
      const tx = await contract.refundPlayer(gameId, playerAddress);
      safeLog('info', '[refund] Transaction sent, waiting for confirmation', {
        gameId,
        fid,
        txHash: tx.hash,
      });
      const receipt = await tx.wait();
      
      if (!receipt || !receipt.hash) {
        throw new Error("Transaction failed: no receipt");
      }

      refundTxHash = receipt.hash;
      safeLog('info', '[refund] Transaction confirmed', {
        gameId,
        fid,
        refundTxHash,
      });

      // AUDIT TRAIL: Log refund event (contains actor_fid, action, game_id, participant fid, tx_hash, timestamp)
      await logRefundEvent({
        gameId,
        clubId: game.club_id,
        callerFid: fid, // actor_fid
        playerFid, // participant fid
        amount: game.entry_fee_amount?.toString() || '0',
        currency: game.entry_fee_currency || 'ETH',
        txHash: refundTxHash,
        timestamp: new Date().toISOString(),
      });
    } catch (contractError: any) {
      safeLog('error', '[refund] Contract call error', {
        gameId,
        fid,
        playerFid,
        error: contractError?.message || contractError?.reason,
      });
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: `Contract refund failed: ${contractError?.reason || contractError?.message || 'Unknown error'}` 
        },
        { status: 500 }
      );
    }

    // Update participant status - use pokerDb
    const updated = await pokerDb.update<GameParticipant>('burrfriends_participants',
      { game_id: gameId, fid: playerFid },
      {
        status: 'refunded',
        tx_hash: refundTxHash,
      } as any
    );

    const updatedParticipant = Array.isArray(updated) ? updated[0] : updated;

    return NextResponse.json<ApiResponse<{
      participant: GameParticipant;
      refundTxHash: string;
    }>>({
      ok: true,
      data: {
        participant: updatedParticipant,
        refundTxHash,
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
    // Handle permission errors
    if (error.message?.includes('owner') || error.message?.includes('permission')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][games][refund] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to process refund" },
      { status: 500 }
    );
  }
}
