/**
 * GET /api/superbowl-props/games/active - Get the active game
 */

import { NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { SUPERBOWL_PROPS } from "~/lib/superbowl-props-constants";
import type { ApiResponse } from "~/lib/types";

export async function GET() {
  try {
    // Find game that is open or closed (not settled)
    const games = await pokerDb.fetch<any>("superbowl_props_games", {
      limit: 10,
    });

    const activeGame = games?.find((g: any) => g.status === "open" || g.status === "closed");

    if (!activeGame) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        data: { game: null, props: SUPERBOWL_PROPS },
      });
    }

    // Get submission count
    const submissions = await pokerDb.fetch<{ id: string }>("superbowl_props_submissions", {
      filters: { game_id: activeGame.id },
      select: "id",
      limit: 1000,
    });

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        game: {
          ...activeGame,
          submissionCount: submissions?.length || 0,
        },
        props: SUPERBOWL_PROPS,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[superbowl-props/games/active GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get active game" }, { status: 500 });
  }
}
