/**
 * POST /api/kill-or-keep/games/[id]/order/randomize - Admin: shuffle turn order (typically after first round)
 * Only when status = 'in_progress'. Shuffle remaining_fids (Fisher–Yates); set turn_order_fids, current_turn_fid = first.
 * If !is_preview: push "your turn" to new current. Phase 38.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { APP_URL } from "~/lib/constants";
import { sendNotificationToFid } from "~/lib/notifications";
import type { ApiResponse } from "~/lib/types";

function shuffleFisherYates<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(_req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      is_preview?: boolean;
      remaining_fids: number[];
    }>("kill_or_keep_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    const remainingFids = (game.remaining_fids || []).map((f: unknown) => Number(f)) as number[];
    if (remainingFids.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "No remaining players" }, { status: 400 });
    }

    const shuffled = shuffleFisherYates(remainingFids);
    const currentTurnFid = shuffled[0];
    const now = new Date().toISOString();

    await pokerDb.update("kill_or_keep_games", { id: gameId }, {
      turn_order_fids: shuffled,
      current_turn_fid: currentTurnFid,
      safe_fids: [],
      current_turn_ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      updated_at: now,
    });

    if (game.is_preview !== true) {
      const notificationId = `kill_or_keep_turn:${gameId}:${currentTurnFid}`.slice(0, 128);
      sendNotificationToFid(
        currentTurnFid,
        {
          title: "KILL OR KEEP",
          body: "It's your turn — Keep or Kill one player.",
          targetUrl: `${APP_URL}/kill-or-keep?gameId=${gameId}`,
        },
        notificationId
      ).catch((err) => console.error("[kill-or-keep/order/randomize] push failed:", err));
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { turnOrderFids: shuffled, currentTurnFid },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[kill-or-keep/games/[id]/order/randomize POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to randomize order" }, { status: 500 });
  }
}
