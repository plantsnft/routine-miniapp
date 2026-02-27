/**
 * POST /api/beta/verify - Verify beta password and set cookie
 * Phase 29.2: Beta Testing
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { BETA_PASSWORD } from "~/lib/beta";
import type { ApiResponse } from "~/lib/types";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const isProd = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password.trim() : "";

    if (password !== BETA_PASSWORD) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Invalid password" },
        { status: 400 }
      );
    }

    const cookieValue = `beta_access=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
    const secure = isProd ? "; Secure" : "";
    const setCookie = cookieValue + secure;

    const res = NextResponse.json<ApiResponse>({ ok: true });
    res.headers.set("Set-Cookie", setCookie);
    return res;
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[beta/verify POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to verify" }, { status: 500 });
  }
}
