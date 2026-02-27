/**
 * POST /api/superbowl-squares/games/[id]/admin-add - Admin manually adds players to reserved squares
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid: adminFid } = await requireAuth(req);
    if (!isAdmin(adminFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game ID required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { fid, displayName, pfpUrl, squareIndex } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Valid FID required" }, { status: 400 });
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

    // Can add admin squares in setup, claiming, or locked status
    if (!["setup", "claiming", "locked"].includes(game.status)) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Cannot add admin squares in ${game.status} status` 
      }, { status: 400 });
    }

    // Check admin squares limit
    const existingClaims = await pokerDb.fetch<any>("superbowl_squares_claims", {
      filters: { game_id: gameId },
      select: "id,claim_type,square_index",
      limit: 100,
    });

    const adminClaims = (existingClaims || []).filter((c: any) => c.claim_type === 'admin');
    if (adminClaims.length >= game.admin_squares_limit) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Admin squares limit reached (${game.admin_squares_limit})` 
      }, { status: 400 });
    }

    // Find available square
    const takenSquares = new Set((existingClaims || []).map((c: any) => c.square_index));
    
    let targetSquare = squareIndex;
    if (targetSquare !== undefined && targetSquare !== null) {
      // Specific square requested
      if (targetSquare < 0 || targetSquare >= 100) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Invalid square index (0-99)" }, { status: 400 });
      }
      if (takenSquares.has(targetSquare)) {
        return NextResponse.json<ApiResponse>({ ok: false, error: `Square ${targetSquare} is already taken` }, { status: 400 });
      }
    } else {
      // Auto-assign: find first available square
      for (let i = 0; i < 100; i++) {
        if (!takenSquares.has(i)) {
          targetSquare = i;
          break;
        }
      }
      if (targetSquare === undefined) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "No available squares" }, { status: 400 });
      }
    }

    // Create claim
    const claim = await pokerDb.insert("superbowl_squares_claims", [
      {
        game_id: gameId,
        fid,
        square_index: targetSquare,
        claim_type: "admin",
        display_name: displayName || null,
        pfp_url: pfpUrl || null,
        claimed_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: `Admin added player ${fid} to square ${targetSquare}`,
        claim: claim[0],
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-squares/games/[id]/admin-add POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to add player" }, { status: 500 });
  }
}
