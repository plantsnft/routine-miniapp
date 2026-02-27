/**
 * POST /api/in-or-out/games/[id]/choice - Submit or update choice (quit | stay)
 * Layer 3: if isAdminPreviewBypass(fid, game.is_preview) skip registration/alive check.
 * Reject if game is settled.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { canPlayPreviewGame } from "~/lib/permissions";
import type { ApiResponse } from "~/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    const { id: gameId } = await params;

    const body = await req.json().catch(() => ({}));
    const choice = body.choice === "quit" ? "quit" : body.choice === "stay" ? "stay" : null;
    if (!choice) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "choice must be 'quit' or 'stay'" }, { status: 400 });
    }

    const games = await pokerDb.fetch<{ id: string; status: string; is_preview?: boolean }>("in_or_out_games", {
      filters: { id: gameId },
      limit: 1,
    });
    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    if (game.status === "settled" || game.status === "cancelled") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is already ended" }, { status: 400 });
    }
    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Choices are only allowed when game is in progress" }, { status: 400 });
    }

    const adminBypass = canPlayPreviewGame(fid, game.is_preview, req);
    if (!adminBypass) {
      const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
        filters: { fid },
        limit: 1,
      });
      if (!registered || registered.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Register for BETR GAMES first." }, { status: 403 });
      }
      const alive = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        filters: { fid, status: "alive" },
        limit: 1,
      });
      if (!alive || alive.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "You are not an eligible (alive) player for this game." }, { status: 403 });
      }
    }

    const now = new Date().toISOString();
    await pokerDb.upsert("in_or_out_choices", {
      game_id: gameId,
      fid: Number(fid),
      choice,
      updated_at: now,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: { choice },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    if (typeof err?.message === "string" && err.message.includes("Register for BETR GAMES")) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("[in-or-out/games/[id]/choice POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to submit choice" }, { status: 500 });
  }
}
