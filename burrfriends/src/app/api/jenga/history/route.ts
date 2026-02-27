/**
 * GET /api/jenga/history - Past settled games with winners
 * Used in BETR POKER section history display
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

// Helper to check betr_games_registrations (for spectator mode)
async function requireBetrGamesRegistration(fid: number): Promise<void> {
  const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
    filters: { fid },
    limit: 1,
  });

  if (!registered || registered.length === 0) {
    throw new Error("Register for BETR GAMES first to view this game.");
  }
}

export async function GET(req: NextRequest) {
  try {
    // Check registration for spectator mode (optional auth)
    let fid: number | null = null;
    try {
      const authResult = await requireAuth(req);
      fid = authResult.fid;
      await requireBetrGamesRegistration(fid);
    } catch (authError: any) {
      if (authError?.message?.includes("Register for BETR GAMES")) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Register for BETR GAMES first to view this game." },
          { status: 403 }
        );
      }
      return NextResponse.json<ApiResponse>(
        { ok: false, error: authError?.message || "Authentication required" },
        { status: 401 }
      );
    }

    // Fetch settled games
    const games = await pokerDb.fetch<any>("jenga_games", {
      filters: { status: "settled" },
      order: "settled_at.desc",
      limit: 20,
    });

    // Fetch settlements with winner info
    const settlements = await pokerDb.fetch<{
      game_id: string;
      winner_fid: number;
      prize_amount: number;
      settled_at: string;
    }>("jenga_settlements", {
      order: "settled_at.desc",
      limit: 100,
    });

    // Fetch signups with cached profiles for winners
    // Note: PostgREST filters don't support arrays, so we fetch all and filter in memory
    const allSignups = await pokerDb.fetch<{
      game_id: string;
      fid: number;
      username: string | null;
      display_name: string | null;
      pfp_url: string | null;
    }>("jenga_signups", {
      select: "game_id,fid,username,display_name,pfp_url",
      limit: 1000,
    });
    
    const gameIds = new Set((games || []).map((g) => g.id));
    const signups = (allSignups || []).filter((s) => gameIds.has(s.game_id));

    // Build history with winner profiles
    const history = (games || [])
      .map((game) => {
        const settlement = (settlements || []).find((s) => s.game_id === game.id);
        if (!settlement) return null;

        const winnerSignup = (signups || []).find(
          (s) => s.game_id === game.id && Number(s.fid) === settlement.winner_fid
        );

        return {
          id: game.id,
          prize_amount: game.prize_amount,
          settled_at: settlement.settled_at,
          winner: {
            fid: settlement.winner_fid,
            username: winnerSignup?.username || null,
            display_name: winnerSignup?.display_name || null,
            pfp_url: winnerSignup?.pfp_url || null,
          },
        };
      })
      .filter((h) => h !== null);

    return NextResponse.json<ApiResponse>({ ok: true, data: history });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/history GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch history" }, { status: 500 });
  }
}
