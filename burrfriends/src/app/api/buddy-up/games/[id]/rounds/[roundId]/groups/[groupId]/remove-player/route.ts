/**
 * POST /api/buddy-up/games/[id]/rounds/[roundId]/groups/[groupId]/remove-player - Remove player from group (admin only)
 * Body: { fid: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roundId: string; groupId: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId, roundId, groupId } = await params;
    const body = await req.json().catch(() => ({}));
    const playerFid = typeof body.fid === "number" ? body.fid : parseInt(String(body.fid || ""), 10);

    if (isNaN(playerFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "fid is required" }, { status: 400 });
    }

    // Check group exists
    const groups = await pokerDb.fetch<{ id: string; round_id: string; fids: number[] }>("buddy_up_groups", {
      filters: { id: groupId },
      limit: 1,
    });

    if (!groups || groups.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group not found" }, { status: 404 });
    }

    const group = groups[0];
    if (group.round_id !== roundId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Group does not belong to this round" }, { status: 400 });
    }

    const groupFids = (group.fids || []).map((f) => Number(f));
    if (!groupFids.includes(playerFid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Player is not in this group" }, { status: 400 });
    }

    // Remove player from group
    const updatedFids = groupFids.filter((f) => f !== playerFid);
    const now = new Date().toISOString();
    await pokerDb.update("buddy_up_groups", { id: groupId }, { fids: updatedFids, updated_at: now });

    // Remove any votes from this player
    await pokerDb.delete("buddy_up_votes", { group_id: groupId, voter_fid: playerFid });

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Player removed from group",
      data: { groupId, removedFid: playerFid },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/rounds/[roundId]/groups/[groupId]/remove-player POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to remove player" }, { status: 500 });
  }
}
