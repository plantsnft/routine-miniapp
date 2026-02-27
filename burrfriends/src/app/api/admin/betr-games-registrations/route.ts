/**
 * GET /api/admin/betr-games-registrations
 * List or export BETR GAMES registrations (admin only). For payouts and whitelist.
 *
 * SAFETY: requireAuth + isAdmin.
 * Query: format=json | csv (default json); limit (default 10000, max 50000). v1: no offset.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

const DEFAULT_LIMIT = 10_000;
const MAX_LIMIT = 50_000;

type Row = { fid: number; registered_at: string; source?: string | null };

function clampLimit(v: string | null): number {
  if (v == null) return DEFAULT_LIMIT;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function toCsv(rows: Row[]): string {
  const header = "fid,registered_at,source";
  const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = rows.map(
    (r) => `${r.fid},${escape(r.registered_at || "")},${escape(r.source ?? "")}`
  );
  return [header, ...lines].join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Unauthorized: Admin access required" },
        { status: 403 }
      );
    }

    const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();
    const limit = clampLimit(req.nextUrl.searchParams.get("limit"));

    const rows = await pokerDb.fetch<Row>("betr_games_registrations", {
      order: "registered_at.desc",
      limit,
    });

    if (format === "csv") {
      return new NextResponse(toCsv(rows), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="betr-games-registrations.csv"',
        },
      });
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: rows });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (
      typeof err?.message === "string" &&
      (err.message.includes("authentication") || err.message.includes("token"))
    ) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json<ApiResponse>(
      { ok: false, error: err?.message ?? "Failed to fetch registrations" },
      { status: 500 }
    );
  }
}
