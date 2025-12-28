import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { requireGameAccess } from "~/lib/pokerPermissions";
import { requireNotBlocked } from "~/lib/userBlocks";
import { GAME_ESCROW_CONTRACT, BASE_USDC_ADDRESS, BASE_RPC_URL } from "~/lib/constants";
import { isPaidGame } from "~/lib/games";
import { amountToUnits } from "~/lib/amounts";
import { GAME_ESCROW_ABI } from "~/lib/contracts";
import type { ApiResponse, Game } from "~/lib/types";

/**
 * POST /api/payments/prepare
 * Prepare payment transaction data for a game
 * 
 * MVP: Open signup - any authed user can prepare payment (unless blocked)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * SAFETY: Uses requireNotBlocked - prevents blocked users from making payments
 */
export async function POST(req: NextRequest) {
  try {
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    const body = await req.json();
    const { gameId } = body;

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

    // MVP: Check if user is blocked (open signup, but blocked users cannot pay)
    await requireNotBlocked(fid);

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

    // Map database fields to API fields (same mapping as GET endpoints)
    const gameRaw = gamesRaw[0];
    const game: Game = {
      ...gameRaw,
      scheduled_time: gameRaw.game_date || null,
      title: gameRaw.name || null,
      gating_type: gameRaw.buy_in_amount && gameRaw.buy_in_amount > 0 ? 'entry_fee' : 'open',
      entry_fee_amount: gameRaw.buy_in_amount,
      entry_fee_currency: gameRaw.buy_in_currency,
    } as Game;

    if (!isPaidGame(game) || !game.entry_fee_amount) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game does not require payment" },
        { status: 400 }
      );
    }

    // REGISTRATION WINDOW ENFORCEMENT: Check if registration is open
    const { isRegistrationOpen } = await import('~/lib/game-registration');
    const { safeLog } = await import('~/lib/redaction');
    const { getCorrelationId } = await import('~/lib/correlation-id');
    const correlationId = getCorrelationId(req);
    
    // Count current joined participants (status='joined' only)
    const joinedParticipants = await pokerDb.fetch<any>('participants', {
      filters: { game_id: gameId, status: 'joined' },
      select: 'id',
    });
    const joinedCount = joinedParticipants.length;
    
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
      joinedCount
    );
    
    // Check if user is already a participant (allow existing participants to prepare payment)
    const existingParticipants = await pokerDb.fetch<any>('participants', {
      filters: { game_id: gameId, fid: fid },
      limit: 1,
    });
    const isExistingParticipant = existingParticipants.length > 0;
    
    // Only block if registration is closed AND user is not already a participant
    if (!isExistingParticipant && !registrationStatus.isOpen) {
      const startTime = (gameRaw as any).game_date;
      const closeAt = registrationStatus.closeAt;
      
      safeLog('info', '[registration] blocked', {
        gameId,
        gameType: (gameRaw as any).game_type || 'standard',
        startTime,
        closeAt,
        now: new Date().toISOString(),
        route: '/api/payments/prepare',
        reason: registrationStatus.reason,
        fid,
      });
      
      return NextResponse.json<ApiResponse>(
        { 
          ok: false, 
          error: registrationStatus.reason || "Registration is closed",
          registrationCloseAt: closeAt,
          now: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // GATING: Require on-chain status to be 'active' for paid games
    const onchainStatus = (gameRaw as any).onchain_status;
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

    // Use on-chain game ID for transaction preparation (should match game.id for paid games)
    const onchainGameId = (gameRaw as any).onchain_game_id || gameId;

    // Verify game exists on-chain before allowing payment (additional safety check)
    // Games must be created on the contract via createGame() before players can join
    if (GAME_ESCROW_CONTRACT && BASE_RPC_URL) {
      try {
        const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
        const contract = new ethers.Contract(GAME_ESCROW_CONTRACT, GAME_ESCROW_ABI, provider);
        const contractGame = await contract.getGame(onchainGameId);
        
        if (!contractGame || !contractGame.isActive) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: "Game is not active on-chain. The game must be registered on the contract before players can join." },
            { status: 400 }
          );
        }
      } catch (checkError: any) {
        // If contract call fails (e.g., game doesn't exist), return helpful error
        if (checkError.message?.includes('Game not active') || checkError.message?.includes('does not exist')) {
          return NextResponse.json<ApiResponse>(
            { ok: false, error: "Game is not active on-chain. The game must be registered on the contract before players can join." },
            { status: 400 }
          );
        }
        // For other errors (network issues, etc.), log but continue (let transaction fail naturally)
        console.error("[payments/prepare] Error checking game on-chain:", checkError);
      }
    }

    const currency = (game.entry_fee_currency || 'ETH') as 'ETH' | 'USDC' | 'BASE_ETH';
    const isETH = currency === 'ETH' || currency === 'BASE_ETH';
    const amount = game.entry_fee_amount.toString();

    // Convert to wei/token units with proper decimal handling
    const amountWei = amountToUnits(amount, currency);
    const tokenAddress = isETH ? null : BASE_USDC_ADDRESS;

    // Prepare transaction data (use onchain_game_id for contract call)
    return NextResponse.json<ApiResponse<{
      contractAddress: string;
      gameId: string;
      amount: string;
      amountWei: string;
      currency: string;
      tokenAddress: string | null;
      isETH: boolean;
      functionName: string;
    }>>({
      ok: true,
      data: {
        contractAddress: GAME_ESCROW_CONTRACT,
        gameId: onchainGameId,
        amount,
        amountWei,
        currency,
        tokenAddress,
        isETH,
        functionName: 'joinGame',
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
    if (error.message?.includes('member') || error.message?.includes('access')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 403 }
      );
    }

    console.error("[API][payments][prepare] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to prepare payment" },
      { status: 500 }
    );
  }
}
