/**
 * POST /api/buddy-up/games/[id]/rounds/[roundId]/groups/[groupId]/remove - Remove entire group (admin only)
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

    // Check group exists
    const groups = await pokerDb.fetch<{ id: string; round_id: string }>("buddy_up_groups", {
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

    // Mark group as eliminated
    const now = new Date().toISOString();
    await pokerDb.update("buddy_up_groups", { id: groupId }, { status: "eliminated", updated_at: now });

    // Delete all votes for this group (optional - we could also keep them for audit)
    // For now, we'll keep votes but mark group as eliminated

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Group removed",
      data: { groupId },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[buddy-up/games/[id]/rounds/[roundId]/groups/[groupId]/remove POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to remove group" }, { status: 500 });
  }
}
