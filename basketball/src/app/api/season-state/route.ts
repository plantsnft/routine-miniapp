import { NextRequest, NextResponse } from "next/server";
import { basketballDb } from "~/lib/basketballDb";

/**
 * GET /api/season-state
 * Get current season state
 */
export async function GET(req: NextRequest) {
  try {
    const state = await basketballDb.fetch("season_state", { limit: 1 });

    if (state.length === 0) {
      return NextResponse.json(
        { ok: false, error: "League not initialized" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      state: state[0],
    });
  } catch (error) {
    console.error("[Season State] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch season state",
      },
      { status: 500 }
    );
  }
}
