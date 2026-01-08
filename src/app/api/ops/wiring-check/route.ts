import { NextResponse } from "next/server";
import { isOpsAuthorized } from "@/lib/opsAuth";

export const dynamic = "force-dynamic";

function parseFids(raw: string | undefined): number[] {
  if (!raw) return [];
  // split by commas and/or whitespace
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function GET(req: Request) {
  if (!isOpsAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawFids = process.env.CATWALK_AUTHOR_FIDS;
  const hasNewlinesInEnv = !!rawFids && /[\r\n]/.test(rawFids);
  const fids = parseFids(rawFids);

  const webhookSecretsRaw =
    process.env.NEYNAR_WEBHOOK_SECRETS ??
    process.env.NEYNAR_WEBHOOK_SECRET ??
    "";

  let webhookSecretsCount: number | null = null;
  if (webhookSecretsRaw) {
    try {
      const parsed = JSON.parse(webhookSecretsRaw);
      webhookSecretsCount = Array.isArray(parsed) ? parsed.length : 1;
    } catch {
      webhookSecretsCount = webhookSecretsRaw.split(",").map(s => s.trim()).filter(Boolean).length;
    }
  }

  return NextResponse.json({
    ok: true,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    authorFids: {
      envVarPresent: !!rawFids,
      hasNewlinesInEnv,
      count: fids.length,
      sample: fids.slice(0, 10),
    },
    webhookSecrets: {
      configured: !!webhookSecretsRaw,
      count: webhookSecretsCount,
    },
  });
}
