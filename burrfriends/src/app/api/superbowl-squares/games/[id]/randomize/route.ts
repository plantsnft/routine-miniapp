/**
 * POST /api/superbowl-squares/games/[id]/randomize - Randomize row/column numbers
 * Must be called after grid is locked
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: gameId } = await params;

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game ID required" }, { status: 400 });
    }

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_squares_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "locked") {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: `Cannot randomize game in ${game.status} status. Must be in 'locked' status.` 
      }, { status: 400 });
    }

    if (game.row_numbers && game.col_numbers) {
      return NextResponse.json<ApiResponse>({ 
        ok: false, 
        error: "Numbers already randomized. Cannot re-randomize." 
      }, { status: 400 });
    }

    // Generate shuffled 0-9 for rows and columns
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const rowNumbers = shuffleArray(digits);
    const colNumbers = shuffleArray(digits);

    // Update game with randomized numbers
    const updated = await pokerDb.update(
      "superbowl_squares_games",
      { id: gameId },
      {
        row_numbers: rowNumbers,
        col_numbers: colNumbers,
        numbers_randomized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        message: "Numbers randomized successfully",
        rowNumbers,
        colNumbers,
        game: updated[0] || { id: gameId, row_numbers: rowNumbers, col_numbers: colNumbers },
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[superbowl-squares/games/[id]/randomize POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to randomize" }, { status: 500 });
  }
}
