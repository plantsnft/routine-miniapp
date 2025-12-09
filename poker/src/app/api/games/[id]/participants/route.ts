import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { isClubOwnerOrAdmin } from "~/lib/permissions";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * GET /api/games/[id]/participants
 * Get all participants for a game (owner only)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid'); // Current user FID for authorization

    if (!fid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing fid parameter for authorization" },
        { status: 401 }
      );
    }

    if (!SUPABASE_URL) {
      throw new Error("Supabase not configured");
    }

    // Verify game exists
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
    const isOwner = isClubOwnerOrAdmin(viewerFid, game.club);

    // If not owner, only return the current user's participation
    let query = `${SUPABASE_URL}/rest/v1/game_participants?game_id=eq.${gameId}`;
    if (!isOwner) {
      query += `&player_fid=eq.${fid}`;
    }
    query += `&select=*&order=inserted_at.desc`;

    // Fetch participants
    const participantsRes = await fetch(query, { headers: SUPABASE_SERVICE_HEADERS });

    if (!participantsRes.ok) {
      throw new Error("Failed to fetch participants");
    }

    const participants: GameParticipant[] = await participantsRes.json();

    return NextResponse.json<ApiResponse<GameParticipant[]>>({
      ok: true,
      data: participants,
    });
  } catch (error: any) {
    console.error("[API][games][participants] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch participants" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/games/[id]/participants
 * Manually add/update a participant (owner only)
 * Body: { player_fid: number, is_eligible: boolean, join_reason?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const body = await req.json();
    const { fid, player_fid, is_eligible, join_reason } = body;

    if (!fid || !player_fid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing fid or player_fid" },
        { status: 400 }
      );
    }

    if (!SUPABASE_URL) {
      throw new Error("Supabase not configured");
    }

    // Verify ownership (same as GET)
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
        { ok: false, error: "Only club owner can manage participants" },
        { status: 403 }
      );
    }

    // Upsert participant
    const participantData: any = {
      game_id: gameId,
      player_fid: parseInt(player_fid, 10),
      is_eligible: is_eligible !== undefined ? is_eligible : true,
      join_reason: join_reason || 'manual_override',
    };

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/game_participants`, {
      method: "POST",
      headers: {
        ...SUPABASE_SERVICE_HEADERS,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify([participantData]),
    });

    if (!upsertRes.ok) {
      const text = await upsertRes.text();
      throw new Error(`Failed to update participant: ${text}`);
    }

    const participants: GameParticipant[] = await upsertRes.json();

    return NextResponse.json<ApiResponse<GameParticipant>>({
      ok: true,
      data: participants[0],
    });
  } catch (error: any) {
    console.error("[API][games][participants] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to update participant" },
      { status: 500 }
    );
  }
}
