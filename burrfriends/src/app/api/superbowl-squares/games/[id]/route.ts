/**
 * GET /api/superbowl-squares/games/[id] - Get specific game details with all claims
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game ID required" }, { status: 400 });
    }

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Fetch all claims for this game
    const claims = await pokerDb.fetch<any>("superbowl_squares_claims", {
      filters: { game_id: gameId },
      order: "claimed_at.asc",
      limit: 100,
    });

    // One-time backfill: hydrate any claims missing pfp_url
    const unhydrated = (claims || []).filter((c: any) => !c.pfp_url);
    if (unhydrated.length > 0) {
      try {
        const { getNeynarClient } = await import("~/lib/neynar");
        const client = getNeynarClient();
        const uniqueFids = [...new Set(unhydrated.map((c: any) => c.fid))] as number[];
        const { users } = await client.fetchBulkUsers({ fids: uniqueFids });
        const profileMap = new Map<number, any>();
        for (const u of (users || []) as any[]) {
          profileMap.set(u.fid, u);
        }
        for (const c of unhydrated) {
          const u = profileMap.get(c.fid);
          if (u) {
            await pokerDb.update(
              "superbowl_squares_claims",
              { id: c.id },
              {
                display_name: u.display_name ?? null,
                pfp_url: u.pfp_url ?? u.pfp?.url ?? null,
              }
            );
            // Update in-memory for this response
            c.display_name = u.display_name ?? null;
            c.pfp_url = u.pfp_url ?? u.pfp?.url ?? null;
          }
        }
      } catch (hydrateErr) {
        console.error("[superbowl-squares/games/[id]] Backfill hydration failed:", hydrateErr);
        // Non-fatal - grid still renders with FID fallback
      }
    }

    // Build 10x10 grid representation
    const grid: (any | null)[] = Array(100).fill(null);
    for (const claim of claims || []) {
      if (claim.square_index >= 0 && claim.square_index < 100) {
        grid[claim.square_index] = {
          fid: claim.fid,
          displayName: claim.display_name,
          pfpUrl: claim.pfp_url,
          claimType: claim.claim_type,
          claimedAt: claim.claimed_at,
        };
      }
    }

    // Calculate stats
    const autoClaims = (claims || []).filter((c: any) => c.claim_type !== 'admin').length;
    const adminClaims = (claims || []).filter((c: any) => c.claim_type === 'admin').length;

    // Fetch settlements if game is settled
    let settlements: any[] = [];
    if (game.status === 'settled') {
      settlements = await pokerDb.fetch<any>("superbowl_squares_settlements", {
        filters: { game_id: gameId },
        order: "settled_at.asc",
        limit: 4,
      }) || [];
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        game,
        grid,
        claims: claims || [],
        stats: {
          totalClaimed: (claims || []).length,
          autoClaims,
          adminClaims,
          availableAutoSquares: game.auto_squares_limit - autoClaims,
          availableAdminSquares: game.admin_squares_limit - adminClaims,
        },
        settlements,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[superbowl-squares/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
