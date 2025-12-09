import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import type { ApiResponse, Game } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * GET /api/games/[id]
 * Get a single game by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!SUPABASE_URL) {
      throw new Error("Supabase not configured");
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/games?id=eq.${id}&select=*`,
      {
        method: "GET",
        headers: SUPABASE_SERVICE_HEADERS,
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch game: ${text}`);
    }

    const games: Game[] = await res.json();
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<Game>>({
      ok: true,
      data: games[0],
    });
  } catch (error: any) {
    console.error("[API][games][id] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch game" },
      { status: 500 }
    );
  }
}
