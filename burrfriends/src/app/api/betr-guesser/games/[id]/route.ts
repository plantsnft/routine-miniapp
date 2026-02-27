/**
 * GET /api/betr-guesser/games/[id] - Get game details + user's guess (if authed)
 * When settled, includes settle_tx_url, payouts with Basescan URLs, winner_display_name, winner_pfp_url.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getBaseScanTxUrl } from "~/lib/explorer";
import { maybeCloseBetrGuesserGame } from "~/lib/betr-guesser-auto-close";
import { getNeynarClient } from "~/lib/neynar";
import { getProfilesFromCache, setProfilesInCache, type CachedProfileData } from "~/lib/cache";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    // Auto-close if needed (time or N guesses per start_condition)
    await maybeCloseBetrGuesserGame(gameId);

    const games = await pokerDb.fetch<any>("betr_guesser_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    const settleTxHash = game.settle_tx_hash || null;
    const settle_tx_url = getBaseScanTxUrl(settleTxHash) ?? undefined;
    let payouts: Array<{ fid: number; amount: number; txHash: string; txUrl: string | null }> = [];
    if (settleTxHash) {
      try {
        const rows = await pokerDb.fetch<any>("betr_guesser_settlements", {
          filters: { game_id: gameId },
          select: "winner_fid,prize_amount,tx_hash",
          limit: 100,
        });
        payouts = (rows || []).map((r: any) => ({
          fid: Number(r.winner_fid),
          amount: parseFloat(String(r.prize_amount || 0)),
          txHash: String(r.tx_hash || ''),
          txUrl: getBaseScanTxUrl(r.tx_hash),
        }));
      } catch {
        // non-blocking
      }
    }

    const guessRows = await pokerDb.fetch<{ id: string }>("betr_guesser_guesses", {
      filters: { game_id: gameId },
      limit: 100,
    });
    const guess_count = guessRows?.length ?? 0;

    // Try to get user's guess if authed
    let userGuess: { guess: number; submitted_at: string } | null = null;
    try {
      const { fid } = await requireAuth(req);
      const guesses = await pokerDb.fetch<{ guess: number; submitted_at: string }>(
        "betr_guesser_guesses",
        {
          filters: { game_id: gameId, fid },
          limit: 1,
        }
      );
      if (guesses && guesses.length > 0) {
        userGuess = guesses[0];
      }
    } catch {
      // Not authed, skip user guess
    }

    // When settled, hydrate winner profile for display_name and pfp_url
    let winner_display_name: string | undefined;
    let winner_pfp_url: string | undefined;
    const winnerFid = game.status === "settled" && game.winner_fid != null ? Number(game.winner_fid) : null;
    if (winnerFid != null) {
      const { cached, needFetch } = getProfilesFromCache([winnerFid]);
      const profile = cached[winnerFid];
      if (profile) {
        winner_display_name = profile.display_name ?? undefined;
        winner_pfp_url = profile.pfp_url ?? undefined;
      } else if (needFetch.length > 0) {
        try {
          const client = getNeynarClient();
          const { users } = await client.fetchBulkUsers({ fids: needFetch });
          const u = users?.[0] as any;
          if (u?.fid != null) {
            const p: CachedProfileData = {
              display_name: u.display_name,
              pfp_url: u.pfp_url || u.pfp?.url,
              username: u.username,
            };
            setProfilesInCache({ [winnerFid]: p });
            winner_display_name = p.display_name ?? undefined;
            winner_pfp_url = p.pfp_url ?? undefined;
          }
        } catch (e) {
          console.warn("[betr-guesser/games/[id] winner profile fetch failed:", e);
        }
      }
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        ...game,
        settle_tx_url,
        payouts: payouts.length ? payouts : undefined,
        userGuess: userGuess?.guess || null,
        userSubmittedAt: userGuess?.submitted_at || null,
        guess_count,
        ...(winner_display_name != null && { winner_display_name }),
        ...(winner_pfp_url != null && { winner_pfp_url }),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[betr-guesser/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
