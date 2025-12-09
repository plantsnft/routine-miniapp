import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { canUserJoinGame } from "~/lib/eligibility";
import type { ApiResponse, Game, GameParticipant, EligibilityResult } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * POST /api/games/[id]/join
 * Join a game (or update eligibility)
 * Body: { fid: number }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;
    const body = await req.json();
    const { fid } = body;

    if (!fid || typeof fid !== 'number') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing or invalid fid" },
        { status: 400 }
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

    // Check if already a participant
    const participantRes = await fetch(
      `${SUPABASE_URL}/rest/v1/game_participants?game_id=eq.${gameId}&player_fid=eq.${fid}&select=*`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    let existingParticipant: GameParticipant | undefined;
    if (participantRes.ok) {
      const participants: GameParticipant[] = await participantRes.json();
      existingParticipant = participants[0];
    }

    // Check eligibility
    const eligibility = await canUserJoinGame(fid, game, existingParticipant);

    // Upsert participant record
    const participantData: any = {
      game_id: gameId,
      player_fid: fid,
      is_eligible: eligibility.eligible,
      join_reason: eligibility.reason,
    };

    // If updating existing, keep password viewing status
    if (existingParticipant) {
      participantData.has_seen_password = existingParticipant.has_seen_password;
      participantData.password_viewed_at = existingParticipant.password_viewed_at;
    }

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
      throw new Error(`Failed to join game: ${text}`);
    }

    return NextResponse.json<ApiResponse<{ eligibility: EligibilityResult; participant: GameParticipant }>>({
      ok: true,
      data: {
        eligibility,
        participant: (await upsertRes.json())[0],
      },
    });
  } catch (error: any) {
    console.error("[API][games][join] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to join game" },
      { status: 500 }
    );
  }
}
