import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { isClubOwnerOrAdmin } from "~/lib/permissions";
import type { ApiResponse, GameParticipant, PaymentStatus } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * PATCH /api/games/[id]/participants/[playerFid]/payment-status
 * Update payment status for a participant (owner only)
 * Body: { fid: number, payment_status: PaymentStatus }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerFid: string }> }
) {
  try {
    const { id: gameId, playerFid } = await params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    
    if (!supabaseUrl || !SUPABASE_SERVICE_ROLE) {
      throw new Error("Supabase not configured");
    }

    const body = await req.json();
    const { fid, payment_status } = body;

    if (!fid || typeof fid !== 'number') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing or invalid fid" },
        { status: 400 }
      );
    }

    if (!payment_status || !['pending', 'paid', 'refunded', 'failed'].includes(payment_status)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Invalid payment_status" },
        { status: 400 }
      );
    }

    // Verify game exists and user is owner
    const gameRes = await fetch(
      `${supabaseUrl}/rest/v1/games?id=eq.${gameId}&select=*,club:clubs!inner(owner_fid)`,
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

    const gameData = games[0];
    const club = gameData.club as { owner_fid: number };

    if (!isClubOwnerOrAdmin(fid, club)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only club owner can update payment status" },
        { status: 403 }
      );
    }

    // Update participant payment status
    const updateData: any = {
      payment_status: payment_status as PaymentStatus,
      payment_confirmed_at: payment_status === 'paid' ? new Date().toISOString() : null,
    };

    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/game_participants?game_id=eq.${gameId}&player_fid=eq.${playerFid}`,
      {
        method: "PATCH",
        headers: SUPABASE_SERVICE_HEADERS,
        body: JSON.stringify(updateData),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(`Failed to update payment status: ${text}`);
    }

    // Fetch updated participant
    const fetchRes = await fetch(
      `${supabaseUrl}/rest/v1/game_participants?game_id=eq.${gameId}&player_fid=eq.${playerFid}&select=*`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    if (!fetchRes.ok) {
      throw new Error("Failed to fetch updated participant");
    }

    const participants: GameParticipant[] = await fetchRes.json();

    return NextResponse.json<ApiResponse<GameParticipant>>({
      ok: true,
      data: participants[0],
    });
  } catch (error: any) {
    console.error("[API][games][participants][payment-status] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to update payment status" },
      { status: 500 }
    );
  }
}

