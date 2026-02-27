/**
 * GET /api/superbowl-props/games/[id] - Get game details with leaderboard
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import { SUPERBOWL_PROPS } from "~/lib/superbowl-props-constants";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    // Phase 26.14: Optional auth — get user FID if authenticated
    let userFid: number | null = null;
    try { userFid = (await requireAuth(req)).fid; } catch { /* not authenticated */ }

    if (!gameId) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game ID required" }, { status: 400 });
    }

    // Fetch game
    const games = await pokerDb.fetch<any>("superbowl_props_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // Fetch submissions
    const submissions = await pokerDb.fetch<any>("superbowl_props_submissions", {
      filters: { game_id: gameId },
      limit: 1000,
    });

    // Phase 26.15: Lazy-hydrate missing profiles from Neynar (one-time backfill)
    const missingProfileSubs = (submissions || []).filter(
      (s: any) => s.fid && !s.display_name
    );
    if (missingProfileSubs.length > 0) {
      try {
        const client = getNeynarClient();
        const fidsToHydrate = missingProfileSubs.map((s: any) => s.fid as number);
        const { users } = await client.fetchBulkUsers({ fids: fidsToHydrate });
        const userMap = new Map(users.map((u: any) => [u.fid, u]));

        for (const sub of missingProfileSubs) {
          const u = userMap.get(sub.fid);
          if (!u) continue;
          const username = u.username ?? null;
          const display_name = u.display_name ?? null;
          const pfp_url = u.pfp_url ?? u.pfp?.url ?? null;

          // Update DB row (fire-and-forget, don't block response)
          pokerDb.update("superbowl_props_submissions", { id: sub.id }, {
            username, display_name, pfp_url,
          }).catch((err: any) => console.error("[superbowl-props] Profile backfill DB update failed:", err));

          // Update in-memory for this response
          sub.username = username;
          sub.display_name = display_name;
          sub.pfp_url = pfp_url;
        }
      } catch (err) {
        console.error("[superbowl-props] Profile hydration failed (non-fatal):", err);
      }
    }

    // Phase 26.14: Extract user's picks (no extra DB query)
    const userSub = userFid ? submissions?.find((s: any) => s.fid === userFid) : null;
    const userPicks = userSub ? { picks: userSub.picks_json, totalScoreGuess: userSub.total_score_guess } : null;

    // Build leaderboard if game is closed or settled
    let leaderboard: any[] = [];
    if (game.status !== "open" && submissions && submissions.length > 0) {
      // Sort by score DESC, then by tiebreaker (closest to actual)
      leaderboard = submissions
        .filter((s: any) => s.score !== null)
        .sort((a: any, b: any) => {
          if (b.score !== a.score) return b.score - a.score;
          if (game.actual_total_score !== null) {
            const aDiff = Math.abs(a.total_score_guess - game.actual_total_score);
            const bDiff = Math.abs(b.total_score_guess - game.actual_total_score);
            return aDiff - bDiff;
          }
          return 0;
        })
        .map((s: any, i: number) => ({
          rank: i + 1,
          fid: s.fid,
          username: s.username,
          displayName: s.display_name,
          pfpUrl: s.pfp_url,
          score: s.score,
          totalScoreGuess: s.total_score_guess,
          diff: game.actual_total_score !== null ? Math.abs(s.total_score_guess - game.actual_total_score) : null,
        }));
    }

    // Phase 26.14: Calculate group pick percentages (only when game not open)
    let pickPercentages: { a: number; b: number }[] | null = null;
    if (game.status !== "open" && submissions && submissions.length > 0) {
      pickPercentages = Array.from({ length: 25 }, (_, i) => {
        const aCount = submissions.filter((s: any) => s.picks_json?.[i] === 0).length;
        return {
          a: Math.round((aCount / submissions.length) * 100),
          b: Math.round(((submissions.length - aCount) / submissions.length) * 100),
        };
      });
    }

    // Fetch settlements if settled
    let settlements: any[] = [];
    if (game.status === "settled") {
      settlements = await pokerDb.fetch<any>("superbowl_props_settlements", {
        filters: { game_id: gameId },
        limit: 10,
      }) || [];
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        game,
        props: SUPERBOWL_PROPS,
        submissionCount: submissions?.length || 0,
        leaderboard,
        settlements,
        userPicks,
        pickPercentages,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[superbowl-props/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to get game" }, { status: 500 });
  }
}
