/**
 * GET /api/weekend-game/rounds/[id]/submitters-before-cutoff
 * Admin only. Returns FIDs and scores for players who submitted (their current best score)
 * before this round's submissions_close_at (cutoff). Use this to get "who played and got
 * their scores in before I cut it off" for the 3D racer / WEEKEND GAME round.
 *
 * Query params:
 *   hydrate=1       - Resolve display_name, username via Neynar (slower).
 *   compare=betr    - Add in_betr_alive (true if FID is in betr_games_tournament_players status=alive).
 *   format=csv      - Return CSV for download (readable, comparable to BETR master list).
 *
 * Data: poker.weekend_game_scores has best_submitted_at (when that best was submitted).
 * We return all scores where best_submitted_at <= round.submissions_close_at, ordered by best_score DESC.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { getNeynarClient } from "~/lib/neynar";
import type { ApiResponse } from "~/lib/types";

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const { id: roundIdParam } = await params;
    const url = new URL(req.url);
    const hydrate = url.searchParams.get("hydrate") === "1";
    const compareBetr = url.searchParams.get("compare") === "betr";
    const formatCsv = url.searchParams.get("format") === "csv";

    let rounds: { id: string; submissions_close_at: string; round_label?: string | null }[];

    if (roundIdParam === "latest") {
      const closed = await pokerDb.fetch<{ id: string; submissions_close_at: string; round_label?: string | null }>(
        "weekend_game_rounds",
        { filters: { status: "closed" }, select: "id,submissions_close_at,round_label", order: "submissions_close_at.desc", limit: 1 }
      );
      const settled = await pokerDb.fetch<{ id: string; submissions_close_at: string; round_label?: string | null }>(
        "weekend_game_rounds",
        { filters: { status: "settled" }, select: "id,submissions_close_at,round_label", order: "submissions_close_at.desc", limit: 1 }
      );
      const candidates = [...(closed || []), ...(settled || [])].sort(
        (a, b) => new Date(b.submissions_close_at).getTime() - new Date(a.submissions_close_at).getTime()
      );
      rounds = candidates.length ? [candidates[0]] : [];
    } else {
      rounds = await pokerDb.fetch<{ id: string; submissions_close_at: string; round_label?: string | null }>(
        "weekend_game_rounds",
        { filters: { id: roundIdParam }, select: "id,submissions_close_at,round_label", limit: 1 }
      ) || [];
    }

    if (!rounds || rounds.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Round not found" }, { status: 404 });
    }
    const round = rounds[0];
    const cutoff = new Date(round.submissions_close_at).getTime();

    const [scoresRows, aliveRows] = await Promise.all([
      pokerDb.fetch<{
        fid: number;
        best_score: number;
        best_cast_url: string | null;
        best_submitted_at: string;
      }>("weekend_game_scores", {
        select: "fid,best_score,best_cast_url,best_submitted_at",
        order: "best_score.desc",
        limit: 2000,
      }),
      compareBetr
        ? pokerDb.fetch<{ fid: number }>("betr_games_tournament_players", {
            filters: { status: "alive" },
            select: "fid",
            limit: 10000,
          })
        : Promise.resolve(null),
    ]);

    const beforeCutoff = (scoresRows || []).filter((row) => {
      const submittedAt = new Date(row.best_submitted_at).getTime();
      return submittedAt <= cutoff;
    });

    const betrAliveSet = new Set<number>(
      (aliveRows || []).map((p) => Number(p.fid)).filter((n) => !isNaN(n))
    );

    type Entry = {
      rank: number;
      fid: number;
      display_name: string | null;
      username: string | null;
      best_score: number;
      in_betr_alive: boolean;
      best_cast_url: string | null;
      best_submitted_at: string;
    };

    let entries: Entry[] = beforeCutoff.map((e, i) => ({
      rank: i + 1,
      fid: e.fid,
      display_name: null as string | null,
      username: null as string | null,
      best_score: e.best_score,
      in_betr_alive: compareBetr ? betrAliveSet.has(e.fid) : false,
      best_cast_url: e.best_cast_url ?? null,
      best_submitted_at: e.best_submitted_at,
    }));

    if (hydrate && entries.length > 0) {
      const fids = entries.map((e) => e.fid);
      const client = getNeynarClient();
      const profiles: Record<number, { username: string | null; display_name: string | null }> = {};
      try {
        for (let i = 0; i < fids.length; i += 100) {
          const batch = fids.slice(i, i + 100);
          const res = await client.fetchBulkUsers({ fids: batch });
          for (const u of res.users || []) {
            const id = (u as { fid?: number }).fid;
            if (id != null) {
              profiles[id] = {
                username: (u as { username?: string }).username ?? null,
                display_name: (u as { display_name?: string }).display_name ?? (u as { username?: string }).username ?? null,
              };
            }
          }
        }
      } catch (e) {
        console.warn("[weekend-game/rounds/[id]/submitters-before-cutoff] fetchBulkUsers failed", e);
      }
      entries = entries.map((e) => ({
        ...e,
        display_name: profiles[e.fid]?.display_name ?? null,
        username: profiles[e.fid]?.username ?? null,
      }));
    }

    if (formatCsv) {
      const header = "Rank,FID,Name,Score,In BETR alive?,Cast,Submitted at (UTC)";
      const rows = entries.map((e) => {
        const name = (e.display_name || e.username || `FID ${e.fid}`).trim();
        return [
          e.rank,
          e.fid,
          escapeCsv(name),
          e.best_score,
          compareBetr ? (e.in_betr_alive ? "Yes" : "No") : "",
          e.best_cast_url || "",
          e.best_submitted_at.replace("+00", "Z").slice(0, 19),
        ].join(",");
      });
      const csv = [header, ...rows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="weekend-game-submitters-before-cutoff-${round.id.slice(0, 8)}.csv"`,
        },
      });
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        roundId: round.id,
        roundLabel: round.round_label ?? null,
        submissionsCloseAt: round.submissions_close_at,
        count: entries.length,
        betrAliveCount: compareBetr ? betrAliveSet.size : undefined,
        entries: entries.map((e) => ({
          rank: e.rank,
          fid: e.fid,
          display_name: e.display_name,
          username: e.username,
          best_score: e.best_score,
          in_betr_alive: compareBetr ? e.in_betr_alive : undefined,
          best_cast_url: e.best_cast_url,
          best_submitted_at: e.best_submitted_at,
        })),
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[weekend-game/rounds/[id]/submitters-before-cutoff]", e);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message || "Failed to get submitters before cutoff" },
      { status: 500 }
    );
  }
}
