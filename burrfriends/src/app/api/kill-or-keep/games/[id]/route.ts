/**
 * GET /api/kill-or-keep/games/[id] - Get game detail by ID
 * No is_preview filter so preview games are playable by direct URL.
 * When in_progress or settled: remainingWithProfiles, eliminatedWithProfiles, currentTurnFid, actionsWithProfiles, turnOrderWithProfiles, amountByFid.
 * Phase 38.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

async function getProfilesForFids(fids: number[]): Promise<Record<number, { username: string; display_name: string; pfp_url: string }>> {
  const profiles: Record<number, { username: string; display_name: string; pfp_url: string }> = {};
  if (fids.length === 0) return profiles;
  try {
    const client = getNeynarClient();
    for (let i = 0; i < fids.length; i += 100) {
      const batch = fids.slice(i, i + 100);
      const response = await client.fetchBulkUsers({ fids: batch });
      for (const user of response.users || []) {
        profiles[user.fid] = {
          username: user.username || `fid:${user.fid}`,
          display_name: user.display_name || user.username || `FID ${user.fid}`,
          pfp_url: user.pfp_url || "",
        };
      }
    }
  } catch {
    // fallbacks used below
  }
  return profiles;
}

function mapFidsToProfiles(
  fids: number[],
  profiles: Record<number, { username: string; display_name: string; pfp_url: string }>
): Array<{ fid: number; username: string; display_name: string; pfp_url: string }> {
  return fids.map((f) => {
    const p = profiles[f];
    return {
      fid: f,
      username: p?.username ?? `fid:${f}`,
      display_name: p?.display_name ?? `FID ${f}`,
      pfp_url: p?.pfp_url ?? "",
    };
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    const games = await pokerDb.fetch<any>("kill_or_keep_games", {
      filters: { id: gameId },
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];
    const turnOrderFids = (game.turn_order_fids || []).map((f: unknown) => Number(f)) as number[];
    const remainingFids = (game.remaining_fids || []).map((f: unknown) => Number(f)) as number[];
    const eliminatedFids = (game.eliminated_fids || []).map((f: unknown) => Number(f)) as number[];

    const allFids = [...new Set([...turnOrderFids, ...remainingFids, ...eliminatedFids])];
    const profiles = await getProfilesForFids(allFids);

    const turnOrderWithProfiles = turnOrderFids.map((fid, idx) => ({
      position: idx + 1,
      fid,
      username: profiles[fid]?.username ?? `fid:${fid}`,
      display_name: profiles[fid]?.display_name ?? `FID ${fid}`,
      pfp_url: profiles[fid]?.pfp_url ?? "",
    }));

    const remainingWithProfiles = mapFidsToProfiles(remainingFids, profiles);
    const eliminatedWithProfiles = mapFidsToProfiles(eliminatedFids, profiles);

    const actionsRaw = await pokerDb.fetch<any>("kill_or_keep_actions", {
      filters: { game_id: gameId },
      order: "sequence.asc",
      limit: 5000,
    });
    const actionsList = (actionsRaw || []).sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));
    // Filter out fid=0 (roulette/skip use actor_fid=0) before Neynar to prevent batch failure.
    // Also fetch any action FIDs not already in the main profiles map (e.g. actors who aren't in turn_order/remaining/eliminated).
    const extraActionFids = [...new Set(
      actionsList.flatMap((a: any) => [Number(a.actor_fid), Number(a.target_fid)])
    )].filter((f) => f > 0 && !profiles[f]);
    const extraProfiles = extraActionFids.length > 0 ? await getProfilesForFids(extraActionFids) : {};
    const allActionProfiles = { ...profiles, ...extraProfiles };
    const actionsWithProfiles = actionsList.map((a: any) => ({
      sequence: Number(a.sequence),
      actor_fid: Number(a.actor_fid),
      action: a.action || "keep",
      target_fid: Number(a.target_fid),
      created_at: a.created_at,
      actor_display_name: allActionProfiles[Number(a.actor_fid)]?.display_name ?? (Number(a.actor_fid) === 0 ? "" : `FID ${a.actor_fid}`),
      actor_username: allActionProfiles[Number(a.actor_fid)]?.username ?? `fid:${a.actor_fid}`,
      actor_pfp_url: allActionProfiles[Number(a.actor_fid)]?.pfp_url ?? "",
      target_display_name: allActionProfiles[Number(a.target_fid)]?.display_name ?? `FID ${a.target_fid}`,
      target_username: allActionProfiles[Number(a.target_fid)]?.username ?? `fid:${a.target_fid}`,
      target_pfp_url: allActionProfiles[Number(a.target_fid)]?.pfp_url ?? "",
    }));

    const safeFids = (game.safe_fids || []).map((f: unknown) => Number(f)) as number[];
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        ...game,
        turnOrderWithProfiles,
        remainingWithProfiles,
        eliminatedWithProfiles,
        actionsWithProfiles,
        amountByFid: game.amount_by_fid || null,
        currentTurnFid: game.current_turn_fid != null ? Number(game.current_turn_fid) : null,
        currentTurnEndsAt: game.current_turn_ends_at || null,
        safeFids,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[kill-or-keep/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
