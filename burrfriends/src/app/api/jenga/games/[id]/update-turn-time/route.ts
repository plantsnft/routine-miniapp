/**
 * POST /api/jenga/games/[id]/update-turn-time - Update turn time mid-game (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

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
    const body = await req.json().catch(() => ({}));
    const turnTimeSeconds = typeof body.turnTimeSeconds === "number" ? body.turnTimeSeconds : parseInt(String(body.turnTimeSeconds || ""), 10);

    if (isNaN(turnTimeSeconds) || turnTimeSeconds < 60 || turnTimeSeconds > 3600) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Turn time must be between 60 and 3600 seconds (1 minute to 1 hour)" },
        { status: 400 }
      );
    }

    // Fetch game
    const games = await pokerDb.fetch<{
      id: string;
      status: string;
      current_turn_fid: number | null;
      current_turn_started_at: string | null;
      turn_time_seconds: number;
    }>("jenga_games", {
      filters: { id: gameId },
      select: "id,status,current_turn_fid,current_turn_started_at,turn_time_seconds",
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    if (game.status !== "in_progress") {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game is not in progress" }, { status: 400 });
    }

    const now = new Date();
    const updateData: any = {
      turn_time_seconds: turnTimeSeconds,
      updated_at: now.toISOString(),
    };

    // If current turn is active, recalculate remaining time
    if (game.current_turn_fid && game.current_turn_started_at) {
      const turnStart = new Date(game.current_turn_started_at);
      const elapsed = (now.getTime() - turnStart.getTime()) / 1000;
      const remaining = turnTimeSeconds - elapsed;

      if (remaining <= 0) {
        // Time already expired - trigger timeout immediately
        // This will be handled by on-read check, but we can process it here
        safeLog("info", "[jenga/games/[id]/update-turn-time] Turn already expired", {
          gameId,
          elapsed,
          newTurnTime: turnTimeSeconds,
        });
        // Don't update current_turn_started_at - let timeout handler process it
      } else {
        // Preserve elapsed time by adjusting start time
        updateData.current_turn_started_at = new Date(now.getTime() - elapsed * 1000).toISOString();

        // Check if change is significant (>30s difference)
        const oldRemaining = game.turn_time_seconds - elapsed;
        const change = Math.abs(turnTimeSeconds - game.turn_time_seconds);
        if (change > 30) {
          // Send notification to current player about time change
          if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'true') {
            try {
              const { sendJengaNotificationAsync } = await import('~/lib/notifications');
              const { APP_URL } = await import('~/lib/constants');
              const timeChangeText = turnTimeSeconds > game.turn_time_seconds ? 'increased' : 'decreased';
              await sendJengaNotificationAsync(
                [game.current_turn_fid],
                'jenga_turn_time_updated',
                gameId,
                'JENGA: Turn time updated',
                `Your turn time has been ${timeChangeText} to ${Math.floor(turnTimeSeconds / 60)}m.`,
                new URL(`/jenga?gameId=${gameId}`, APP_URL).href
              );
            } catch (notifError: any) {
              safeLog('error', '[jenga/games/[id]/update-turn-time] Failed to send notification', {
                gameId,
                currentTurnFid: game.current_turn_fid,
                error: notifError?.message || String(notifError),
              });
            }
          }
          safeLog("info", "[jenga/games/[id]/update-turn-time] Significant time change", {
            gameId,
            currentTurnFid: game.current_turn_fid,
            oldTime: game.turn_time_seconds,
            newTime: turnTimeSeconds,
            change,
            oldRemaining,
            newRemaining: remaining,
          });
        }
      }
    }

    await pokerDb.update("jenga_games", { id: gameId }, updateData);

    return NextResponse.json<ApiResponse>({
      ok: true,
      message: "Turn time updated",
      data: { gameId, turnTimeSeconds },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id]/update-turn-time POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to update turn time" }, { status: 500 });
  }
}
