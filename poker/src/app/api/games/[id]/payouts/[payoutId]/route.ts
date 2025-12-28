import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { isClubOwnerOrAdmin } from "~/lib/permissions";
import type { ApiResponse, Payout, PayoutStatus } from "~/lib/types";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * PATCH /api/games/[id]/payouts/[payoutId]
 * Update a payout (transaction hash, status, notes) - owner only
 * Body: { fid: number, tx_hash?: string, status?: PayoutStatus, notes?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payoutId: string }> }
) {
  try {
    const { id: gameId, payoutId } = await params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    
    if (!supabaseUrl || !SUPABASE_SERVICE_ROLE) {
      throw new Error("Supabase not configured");
    }

    const body = await req.json();
    const { fid, tx_hash, status, notes } = body;

    if (!fid || typeof fid !== 'number') {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing or invalid fid" },
        { status: 400 }
      );
    }

    // Verify game and ownership
    const gameRes = await fetch(
      `${supabaseUrl}/rest/v1/games?id=eq.${gameId}&select=club_id`,
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

    const clubRes = await fetch(
      `${supabaseUrl}/rest/v1/clubs?id=eq.${games[0].club_id}&select=owner_fid`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );
    const clubs = clubRes.ok ? await clubRes.json() : [];

    if (!clubs[0] || !isClubOwnerOrAdmin(fid, clubs[0])) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only club owner can update payouts" },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: any = {};
    if (tx_hash !== undefined) updateData.tx_hash = tx_hash || null;
    if (status !== undefined) {
      if (!['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Invalid payout status" },
          { status: 400 }
        );
      }
      updateData.status = status as PayoutStatus;
    }
    if (notes !== undefined) updateData.notes = notes || null;

    // Update payout
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/payouts?id=eq.${payoutId}`,
      {
        method: "PATCH",
        headers: SUPABASE_SERVICE_HEADERS,
        body: JSON.stringify(updateData),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(`Failed to update payout: ${text}`);
    }

    // Fetch updated payout
    const fetchRes = await fetch(
      `${supabaseUrl}/rest/v1/payouts?id=eq.${payoutId}&select=*`,
      { headers: SUPABASE_SERVICE_HEADERS }
    );

    if (!fetchRes.ok) {
      throw new Error("Failed to fetch updated payout");
    }

    const payouts: Payout[] = await fetchRes.json();

    return NextResponse.json<ApiResponse<Payout>>({
      ok: true,
      data: payouts[0],
    });
  } catch (error: any) {
    console.error("[API][games][payouts][payoutId] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to update payout" },
      { status: 500 }
    );
  }
}

