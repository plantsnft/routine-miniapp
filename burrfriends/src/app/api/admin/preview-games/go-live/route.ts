/**
 * POST /api/admin/preview-games/go-live - Make a preview game live
 * Sets is_preview = false for the specified game.
 * Admin-only endpoint.
 *
 * Body: { table: string, id: string }
 *
 * Phase 29: Preview Games (Admin Testing)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

// Allowed tables that support is_preview (excludes superbowl tables)
const ALLOWED_TABLES = new Set([
  "burrfriends_games",
  "betr_guesser_games",
  "buddy_up_games",
  "jenga_games",
  "mole_games",
  "steal_no_steal_games",
  "remix_betr_rounds",
  "weekend_game_rounds",
  "bullied_games",
  "in_or_out_games",
  "take_from_the_pile_games",
  "kill_or_keep_games",
  "art_contest",
  "sunday_high_stakes",
  "nl_holdem_games",
  "ncaa_hoops_contests",
]);

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);

    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { table, id } = body;

    if (!table || !id) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing required fields: table, id" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Invalid table: ${table}` },
        { status: 400 }
      );
    }

    // Verify the game exists and is currently a preview game
    const existing = await pokerDb.fetch<any>(table, {
      filters: { id, is_preview: true },
      select: "id, is_preview",
      limit: 1,
    });

    if (!existing || existing.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Game not found or is already live" },
        { status: 404 }
      );
    }

    // Flip is_preview to false
    const updated = await pokerDb.update(table, { id }, { is_preview: false });

    console.log(`[admin/preview-games/go-live] Game ${id} in ${table} set to live by fid ${fid}`);

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: updated?.[0] || { id, table, is_preview: false },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[admin/preview-games/go-live POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to make game live" }, { status: 500 });
  }
}
