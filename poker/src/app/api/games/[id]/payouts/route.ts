import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getClubForGame, requireClubOwner } from "~/lib/pokerPermissions";
import { isGlobalAdmin } from "~/lib/permissions";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse, Payout } from "~/lib/types";

/**
 * GET /api/games/[id]/payouts
 * Get all payouts for a game (club owner or global admin only)
 * 
 * SAFETY: Uses requireAuth() - FID comes only from verified JWT
 * SAFETY: Uses pokerDb - enforces poker.* schema only
 * OPTIONAL: Hydrates with Neynar usernames/pfps (non-blocking)
 */
export async function GET(
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

    // Fetch payouts - use pokerDb
    const payouts = await pokerDb.fetch<Payout>('payouts', {
      filters: { game_id: gameId },
      select: '*',
      order: 'inserted_at.desc',
    });

    // Optionally hydrate with Neynar (non-blocking)
    let hydratedPayouts = payouts;
    try {
      const uniqueFids = Array.from(new Set([
        ...payouts.map((p: any) => p.recipient_fid),
        ...payouts.map((p: any) => p.payer_fid),
      ]));
      if (uniqueFids.length > 0) {
        const neynarClient = getNeynarClient();
        const { users } = await neynarClient.fetchBulkUsers({ fids: uniqueFids.map(f => Number(f)) });
        const userMap = new Map(users.map((u: any) => [u.fid, { username: u.username, pfpUrl: u.pfp?.url || u.pfp_url }]));
        
        hydratedPayouts = payouts.map((p: any) => ({
          ...p,
          recipient_username: userMap.get(p.recipient_fid)?.username,
          recipient_pfp_url: userMap.get(p.recipient_fid)?.pfpUrl,
          payer_username: userMap.get(p.payer_fid)?.username,
          payer_pfp_url: userMap.get(p.payer_fid)?.pfpUrl,
        }));
      }
    } catch (neynarError) {
      console.warn('[payouts] Optional Neynar hydration failed:', neynarError);
      // Continue without hydration
    }

    return NextResponse.json<ApiResponse<Payout[]>>({
      ok: true,
      data: hydratedPayouts,
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

    console.error("[API][games][payouts] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch payouts" },
      { status: 500 }
    );
  }
}
