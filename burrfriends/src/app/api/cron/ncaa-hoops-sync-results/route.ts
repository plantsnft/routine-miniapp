/**
 * Cron: GET /api/cron/ncaa-hoops-sync-results
 * Every 15 min. Find active NCAA HOOPS contest (status in open, picks_closed, in_progress); sync results from ESPN; refresh bracket cache.
 * Secured by x-vercel-cron or CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { syncContestResults } from "~/lib/ncaaHoopsEspnSync";

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const header = req.headers.get("x-vercel-cron");
  if (header === "true") return true;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const activeStatuses = ["open", "picks_closed", "in_progress"];
    const all = await pokerDb.fetch<{ id: string; status: string }>("ncaa_hoops_contests", {
      select: "id,status",
      limit: 20,
    });
    const activeIds = (all ?? []).filter((r) => activeStatuses.includes(r.status)).map((r) => r.id);

    let run = 0;
    for (const id of activeIds) {
      const result = await syncContestResults(id);
      run++;
      if (result.error) {
        console.error("[cron/ncaa-hoops-sync-results]", id, result.error);
      } else {
        console.log("[cron/ncaa-hoops-sync-results]", id, "resultsUpdated", result.resultsUpdated);
      }
    }

    return NextResponse.json({ ok: true, contestsProcessed: run });
  } catch (e) {
    console.error("[cron/ncaa-hoops-sync-results]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
