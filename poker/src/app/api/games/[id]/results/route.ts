import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { isClubOwnerOrAdmin } from "~/lib/permissions";
import type { ApiResponse, Game, Club } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * GET /api/games/[id]/results
 * Get all results for a game
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    if (!SUPABASE_URL) {
      throw new Error("Supabase not configured");
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/game_results?game_id=eq.${gameId}&select=*&order=position.asc`,
      {
        method: "GET",
        headers: SUPABASE_SERVICE_HEADERS,
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch results: ${text}`);
    }

    const results = await res.json();
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: results,
    });
  } catch (error: any) {
    console.error("[API][games][results] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch results" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/games/[id]/results
 * Add/update results (owner only)
 * Body: { fid: number, results: [{ player_fid, position, payout_amount, payout_currency, net_profit }] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const body = await req.json();
    const { fid, results } = body;

    if (!fid || !results || !Array.isArray(results)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing fid or results array" },
        { status: 400 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      throw new Error("Supabase not configured");
    }

    // Verify game ownership
    const gameRes = await fetch(
      `${SUPABASE_URL}/rest/v1/games?id=eq.${gameId}&select=*,club:clubs!inner(owner_fid)`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    if (!gameRes.ok) {
      throw new Error("Failed to fetch game");
    }

    const games: any[] = await gameRes.json();
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const game = games[0];
    const viewerFid = parseInt(fid, 10);

    if (!isClubOwnerOrAdmin(viewerFid, game.club)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only club owner can enter results" },
        { status: 403 }
      );
    }

    // Delete existing results for this game
    await fetch(
      `${SUPABASE_URL}/rest/v1/game_results?game_id=eq.${gameId}`,
      {
        method: "DELETE",
        headers: SUPABASE_SERVICE_HEADERS,
      }
    );

    // Insert new results
    const resultsData = results.map((r: any) => ({
      game_id: gameId,
      player_fid: r.player_fid,
      position: r.position || null,
      payout_amount: r.payout_amount || null,
      payout_currency: r.payout_currency || 'USD',
      net_profit: r.net_profit || null,
    }));

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/game_results`, {
      method: "POST",
      headers: {
        ...SUPABASE_SERVICE_HEADERS,
        Prefer: "return=representation",
      },
      body: JSON.stringify(resultsData),
    });

    if (!insertRes.ok) {
      const text = await insertRes.text();
      throw new Error(`Failed to save results: ${text}`);
    }

    const savedResults = await insertRes.json();

    // Update game status to completed
    await fetch(
      `${SUPABASE_URL}/rest/v1/games?id=eq.${gameId}`,
      {
        method: "PATCH",
        headers: SUPABASE_SERVICE_HEADERS,
        body: JSON.stringify({ status: 'completed' }),
      }
    );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: savedResults,
    });
  } catch (error: any) {
    console.error("[API][games][results] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to save results" },
      { status: 500 }
    );
  }
}
