import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { decryptPassword } from "~/lib/crypto";
import type { ApiResponse, Game, GameParticipant } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * GET /api/games/[id]/password
 * Get game password (only if user is eligible)
 * Query: ?fid=123
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid');

    if (!fid) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing fid parameter" },
        { status: 401 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      throw new Error("Supabase not configured");
    }

    // Fetch game
    const gameRes = await fetch(
      `${SUPABASE_URL}/rest/v1/games?id=eq.${gameId}&select=*`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    if (!gameRes.ok) {
      throw new Error("Failed to fetch game");
    }

    const games: Game[] = await gameRes.json();
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found" },
        { status: 404 }
      );
    }

    const game = games[0];

    // Check if password exists
    if (!game.game_password_encrypted) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "No password set for this game" },
        { status: 404 }
      );
    }

    // Check if password has expired
    if (game.password_expires_at) {
      const expiresAt = new Date(game.password_expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Password has expired" },
          { status: 403 }
        );
      }
    }

    // Fetch participant record
    const participantRes = await fetch(
      `${SUPABASE_URL}/rest/v1/game_participants?game_id=eq.${gameId}&player_fid=eq.${fid}&select=*`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    if (!participantRes.ok) {
      throw new Error("Failed to fetch participant record");
    }

    const participants: GameParticipant[] = await participantRes.json();
    const participant = participants[0];

    if (!participant) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "You are not a participant in this game" },
        { status: 403 }
      );
    }

    if (!participant.is_eligible) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "You are not eligible to view the password" },
        { status: 403 }
      );
    }

    // Decrypt password
    const password = decryptPassword(game.game_password_encrypted);

    // Update participant record to mark password as viewed
    if (!participant.has_seen_password) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/game_participants?id=eq.${participant.id}`,
        {
          method: "PATCH",
          headers: SUPABASE_SERVICE_HEADERS,
          body: JSON.stringify({
            has_seen_password: true,
            password_viewed_at: new Date().toISOString(),
          }),
        }
      );
    }

    return NextResponse.json<ApiResponse<{ password: string }>>({
      ok: true,
      data: { password },
    });
  } catch (error: any) {
    console.error("[API][games][password] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch password" },
      { status: 500 }
    );
  }
}
