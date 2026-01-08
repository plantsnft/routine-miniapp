import { NextResponse } from "next/server";
import { isOpsAuthorized } from "@/lib/opsAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isOpsAuthorized(req)) {
    // 404 (not 401) to avoid endpoint discovery
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
