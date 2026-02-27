/**
 * GET /api/jenga/health - Verify JENGA API setup (DB + env)
 * Use this to confirm: Supabase env is set, poker.jenga_games exists and is readable.
 */

import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { pokerDb } from "~/lib/pokerDb";

export async function GET(_req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return NextResponse.json(
        {
          ok: false,
          error: "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY) in Vercel.",
        },
        { status: 500 }
      );
    }

    const rows = await pokerDb.fetch<any>("jenga_games", { limit: 1 });
    const count = Array.isArray(rows) ? rows.length : 0;

    return NextResponse.json({
      ok: true,
      data: {
        database: "ok",
        table: "jenga_games",
        canRead: true,
        sampleCount: count,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[jenga/health] ERROR:", e);

    let safe = "Database error. Check server logs.";
    if (msg.includes("SUPABASE") || msg.includes("not configured")) {
      safe = "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE in Vercel.";
    } else if (msg.includes("Failed to fetch") || msg.includes("404") || msg.includes("406")) {
      safe = "poker.jenga_games may not exist. Run supabase_migration_jenga.sql in the poker schema (Supabase SQL Editor).";
    }

    return NextResponse.json({ ok: false, error: safe }, { status: 500 });
  }
}
