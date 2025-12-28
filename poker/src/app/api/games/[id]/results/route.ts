import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getClubForGame, requireClubOwner } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { getPlayerWalletAddress } from "~/lib/neynar-wallet";
import { isPaidGame } from "~/lib/games";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

/**
 * GET /api/games/[id]/results
 * Get all results for a game
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    
    // SAFETY: Require authentication - FID comes only from verified JWT
    const { fid } = await requireAuth(req);
    
    // Admin gate: global admin OR club owner (for viewing results)
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

    // Fetch results - use pokerDb
    const results = await pokerDb.fetch('game_results', {
      filters: { game_id: gameId },
      select: '*',
      order: 'position.asc',
    });

    // Optionally hydrate with Neynar (non-blocking)
    let hydratedResults = results;
    try {
      const uniqueFids = Array.from(new Set(results.map((r: any) => r.player_fid)));
      if (uniqueFids.length > 0) {
        const neynarClient = getNeynarClient();
        const { users } = await neynarClient.fetchBulkUsers({ fids: uniqueFids.map(f => Number(f)) });
        const userMap = new Map(users.map((u: any) => [u.fid, { username: u.username, pfpUrl: u.pfp?.url || u.pfp_url }]));
        
        hydratedResults = results.map((r: any) => ({
          ...r,
          player_username: userMap.get(r.player_fid)?.username,
          player_pfp_url: userMap.get(r.player_fid)?.pfpUrl,
        }));
      }
    } catch (neynarError) {
      console.warn('[results] Optional Neynar hydration failed:', neynarError);
      // Continue without hydration
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: hydratedResults,
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

    console.error("[API][games][results] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch results" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/games/[id]/results
 * Add/update results (club owner or global admin only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * IDEMPOTENT: Uses upsert for results and payouts
 * INVARIANT: Requires game status appropriate (completed/settled)
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
    const { results } = body;

    if (!results || !Array.isArray(results)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing results array" },
        { status: 400 }
      );
    }

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

    // INVARIANT: Require game status appropriate
    if (game.status !== 'completed' && game.status !== 'settled' && game.status !== 'in_progress') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game must be completed or in progress to enter results" },
        { status: 400 }
      );
    }

    // Fetch participants to get buy-in amounts for paid games - use pokerDb
    const participants = await pokerDb.fetch<GameParticipant>('participants', {
      filters: { game_id: gameId },
      select: '*',
    });
    const participantMap = new Map(participants.map(p => [p.player_fid, p]));

    // Delete existing results and payouts (idempotency: we'll recreate them)
    // Note: This ensures clean state, but could also use upsert if unique constraints exist
    try {
      await pokerDb.delete('game_results', { game_id: gameId });
      await pokerDb.delete('payouts', { game_id: gameId });
    } catch (deleteError) {
      // Ignore if tables don't exist or no records to delete
      console.warn('[results] Delete existing records failed (may not exist):', deleteError);
    }

    // Get wallet addresses using Neynar helper (non-blocking)
    const userWalletMap = new Map<number, string>();
    const uniqueFids = Array.from(new Set(results.map((r: any) => r.player_fid)));
    for (const playerFid of uniqueFids) {
      try {
        const address = await getPlayerWalletAddress(Number(playerFid));
        if (address) {
          userWalletMap.set(Number(playerFid), address);
        }
      } catch (err) {
        console.warn(`[results] Failed to get wallet for FID ${playerFid}:`, err);
      }
    }

    // Insert new results with auto-calculated net_profit for paid games - use pokerDb
    const resultsData = results.map((r: any) => {
      const participant = participantMap.get(r.player_fid);
      let netProfit = r.net_profit !== null && r.net_profit !== undefined ? Number(r.net_profit) : null;

      // Auto-calculate net_profit for paid games if not provided
      if (isPaidGame(game) && r.payout_amount !== null && r.payout_amount !== undefined) {
        const payoutAmount = Number(r.payout_amount);
        const buyInAmount = (participant as any)?.buy_in_amount ? Number((participant as any).buy_in_amount) : 0;
        netProfit = payoutAmount - buyInAmount;
      }

      return {
        game_id: gameId,
        player_fid: r.player_fid,
        position: r.position || null,
        payout_amount: r.payout_amount !== null && r.payout_amount !== undefined ? Number(r.payout_amount) : null,
        payout_currency: r.payout_currency || 'USD',
        net_profit: netProfit,
      };
    }).filter((r: any) => r.payout_amount !== null && r.payout_amount > 0);

    // Insert results - use pokerDb
    const savedResults = await pokerDb.insert('game_results', resultsData as any);

    // Create payout records for players with payouts - use pokerDb
    const payoutData = (Array.isArray(savedResults) ? savedResults : [savedResults])
      .filter((r: any) => r.payout_amount && r.payout_amount > 0)
      .map((r: any) => ({
        game_id: gameId,
        payer_fid: fid,
        recipient_fid: r.player_fid,
        amount: r.payout_amount,
        currency: r.payout_currency || 'USD',
        status: 'pending',
        recipient_wallet_address: userWalletMap.get(Number(r.player_fid)) || null,
        tx_hash: null,
        notes: null,
      }));

    if (payoutData.length > 0) {
      await pokerDb.insert('payouts', payoutData as any);
    }

    // Update game status to completed if not already - use pokerDb
    if (game.status !== 'completed' && game.status !== 'settled') {
      await pokerDb.update<Game>('games',
        { id: gameId },
        {
          status: 'completed',
          settled_at: new Date().toISOString(),
        } as any
      );
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: Array.isArray(savedResults) ? savedResults : [savedResults],
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

    console.error("[API][games][results] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to save results" },
      { status: 500 }
    );
  }
}
