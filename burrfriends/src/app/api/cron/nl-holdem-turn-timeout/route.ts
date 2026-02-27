/**
 * Cron: NL HOLDEM turn timeout — apply fold for current actor when actor_ends_at < now.
 * GET /api/cron/nl-holdem-turn-timeout
 * Secured by x-vercel-cron or CRON_SECRET. Phase 40.
 */

import { NextResponse } from "next/server";
import { pokerDb } from "~/lib/pokerDb";
import { applyTimeoutFold } from "~/lib/nlHoldemPlay";
import { safeLog } from "~/lib/redaction";

export async function GET(req: Request) {
  const cronHeader = req.headers.get("x-vercel-cron");
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!cronHeader && (!cronSecret || providedSecret !== cronSecret)) {
    safeLog("warn", "[cron/nl-holdem-turn-timeout] Unauthorized cron request");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  try {
    const hands = await pokerDb.fetch<{ id: string; status: string; actor_ends_at?: string | null }>(
      "nl_holdem_hands",
      {
        filters: { status_in: ["active", "showdown"] as unknown as string },
        limit: 50,
      }
    );

    const expired = (hands || []).filter(
      (h) =>
        h.actor_ends_at != null &&
        typeof h.actor_ends_at === "string" &&
        new Date(h.actor_ends_at) < now
    );

    let processed = 0;
    for (const hand of expired) {
      const applied = await applyTimeoutFold(hand.id);
      if (applied) processed++;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    safeLog("error", "[cron/nl-holdem-turn-timeout]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
