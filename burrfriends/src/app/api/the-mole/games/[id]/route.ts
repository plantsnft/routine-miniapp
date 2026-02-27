/**
 * GET /api/the-mole/games/[id] - Get game details + user's signup status (if authed)
 * Includes settle_tx_url, tx_urls, payouts. Never exposes mole_fid to non-admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import { getBaseScanTxUrl, parseSettleTxHashes, getBaseScanTxUrls } from "~/lib/explorer";
import { checkAndAutoStartMoleGame } from "~/lib/betr-games-auto-start";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    let games = await pokerDb.fetch<Record<string, unknown>>("mole_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    if (games[0].status === "signup") {
      await checkAndAutoStartMoleGame(gameId);
      games = await pokerDb.fetch<Record<string, unknown>>("mole_games", {
        filters: { id: gameId },
        limit: 1,
      });
      if (!games || games.length === 0) {
        return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
      }
    }

    const game = games[0];
    const settleTxHash = (game.settle_tx_hash as string) || null;
    const txHashes = parseSettleTxHashes(settleTxHash);

    const settle_tx_url = getBaseScanTxUrl(txHashes[0] || settleTxHash);
    const tx_urls = getBaseScanTxUrls(txHashes).filter(Boolean);
    let payouts: Array<{ fid: number; amount: number; txHash: string; txUrl: string | null }> = [];
    if (settleTxHash) {
      try {
        const rows = await pokerDb.fetch<{ winner_fid: unknown; prize_amount: unknown; tx_hash: unknown }>("mole_settlements", {
          filters: { game_id: gameId },
          select: "winner_fid,prize_amount,tx_hash",
          limit: 100,
        });
        payouts = (rows || []).map((r) => ({
          fid: Number(r.winner_fid),
          amount: parseFloat(String(r.prize_amount || 0)),
          txHash: String(r.tx_hash || ""),
          txUrl: getBaseScanTxUrl(r.tx_hash as string),
        }));
      } catch {
        // non-blocking
      }
    }

    const SIGNUPS_CAP = 100;
    const signupRows = await pokerDb.fetch<{ id: string; fid: number; signed_up_at: string; username?: string | null; display_name?: string | null; pfp_url?: string | null }>("mole_signups", {
      filters: { game_id: gameId },
      order: "signed_up_at.asc",
      limit: SIGNUPS_CAP,
    });
    const signup_count = signupRows?.length ?? 0;

    let hasSignedUp = false;
    try {
      const { fid } = await requireAuth(req);
      if (signupRows?.some((r) => Number(r.fid) === fid)) hasSignedUp = true;
    } catch {
      // Not authed
    }

    // When game is in signup, always return signups array (10.3.5). Use cached profile columns; Neynar fallback only for missing.
    let signups: Array<{ fid: number; signed_up_at: string; username: string | null; display_name: string | null; pfp_url: string | null }> = [];
    if (game.status === "signup") {
      if (signupRows && signupRows.length > 0) {
        const needHydrate = signupRows.filter((s) => s.pfp_url == null && s.username == null);
        const userMap: Record<number, { username?: string; display_name?: string; pfp_url?: string }> = {};
        if (needHydrate.length > 0) {
          try {
            const client = getNeynarClient();
            const fids = needHydrate.map((s) => Number(s.fid)).filter(Boolean);
            const { users } = await client.fetchBulkUsers({ fids });
            for (const u of users || []) {
              const id = (u as { fid?: number }).fid;
              if (id != null) {
                userMap[id] = {
                  username: (u as { username?: string }).username,
                  display_name: (u as { display_name?: string }).display_name,
                  pfp_url: (u as { pfp_url?: string }).pfp_url ?? (u as { pfp?: { url?: string } }).pfp?.url,
                };
                await pokerDb.update("mole_signups", { game_id: gameId, fid: id }, {
                  username: (u as { username?: string }).username ?? null,
                  display_name: (u as { display_name?: string }).display_name ?? null,
                  pfp_url: ((u as { pfp_url?: string }).pfp_url ?? (u as { pfp?: { url?: string } }).pfp?.url) ?? null,
                  updated_at: new Date().toISOString(),
                }).catch(() => {});
              }
            }
          } catch (e) {
            console.warn("[the-mole/games/[id] GET] fetchBulkUsers for missing cache failed:", e);
          }
        }
        signups = signupRows.map((s) => {
          const fidNum = Number(s.fid);
          const cached = { username: s.username ?? null, display_name: s.display_name ?? null, pfp_url: s.pfp_url ?? null };
          const hydrated = userMap[fidNum];
          return {
            fid: fidNum,
            signed_up_at: s.signed_up_at,
            username: (hydrated?.username ?? cached.username) ?? null,
            display_name: (hydrated?.display_name ?? cached.display_name) ?? null,
            pfp_url: (hydrated?.pfp_url ?? cached.pfp_url) ?? null,
          };
        });
      }
    }

    // Do not include mole_fid, mole_winner_fid in response for in_progress (secret). For mole_won/settled, mole_winner_fid is ok.
    const { mole_winner_fid, ...rest } = game as { mole_winner_fid?: number };
    const safe: Record<string, unknown> = { ...rest };
    if (game.status === "mole_won" || game.status === "settled") {
      safe.mole_winner_fid = mole_winner_fid ?? undefined;
    }

    // 16.6: When tournament-alive only, return eligibleCount (alive players for game's community)
    let eligibleCount: number | undefined;
    if ((game as Record<string, unknown>).eligible_players_source === "tournament_alive") {
      const gameCommunity = (game as { community?: string }).community === "minted_merch" ? "minted_merch" : "betr";
      const aliveRows = await pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
        filters: { status: "alive", community: gameCommunity },
        select: "fid",
        limit: 10000,
      });
      eligibleCount = aliveRows?.length ?? 0;
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        ...safe,
        settle_tx_url: settle_tx_url ?? undefined,
        tx_hashes: txHashes.length ? txHashes : undefined,
        tx_urls: tx_urls.length ? tx_urls : undefined,
        payouts: payouts.length ? payouts : undefined,
        hasSignedUp,
        signup_count,
        ...(eligibleCount != null ? { eligibleCount } : {}),
        ...(game.status === "signup" ? { signups } : {}),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[the-mole/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message ?? "Failed to fetch game" }, { status: 500 });
  }
}
