import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";

export const runtime = "nodejs";

const HEALTH_THRESHOLD_HOURS = 2;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, code: "CRON_SECRET_MISSING" },
      { status: 500 }
    );
  }

  let authUsed: string | null = null;
  const providedSecret = req.headers.get("x-cron-secret");
  const vercelCronHeader = req.headers.get("x-vercel-cron");
  const userAgent = req.headers.get("user-agent") || "";

  if (providedSecret && providedSecret === cronSecret) {
    authUsed = "secret";
  } else if (vercelCronHeader === "1" || userAgent.includes("vercel-cron")) {
    authUsed = "vercel";
  }

  if (!authUsed) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: appState, error } = await supabase
      .from("app_state")
      .select("value, updated_at")
      .eq("key", "last_webhook_at")
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json(
        { ok: false, authUsed, error: error.message || "Failed to read webhook health" },
        { status: 200 }
      );
    }

    const now = new Date();
    let lastWebhookAt: Date | null = null;
    let ageHours: number | null = null;
    let healthStatus: "ok" | "stale" | "never" = "never";

    if (appState) {
      const state = appState as any;
      const timestamp = (state.value as any)?.timestamp || state.updated_at;
      if (timestamp) {
        lastWebhookAt = new Date(timestamp);
        ageHours = (now.getTime() - lastWebhookAt.getTime()) / (1000 * 60 * 60);
        healthStatus = ageHours <= HEALTH_THRESHOLD_HOURS ? "ok" : "stale";
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log("[Cron Webhook Health] Status:", {
        lastWebhookAt: lastWebhookAt?.toISOString() || "never",
        ageHours: ageHours?.toFixed(2) || "N/A",
        healthStatus,
      });
    }

    if (healthStatus === "stale" && ageHours !== null) {
      console.warn(`[Cron Webhook Health] WARNING: Last webhook was ${ageHours.toFixed(2)} hours ago`);
      const enableBackfill = process.env.ENABLE_BACKFILL === "true";
      if (enableBackfill) {
        try {
          const baseUrl = req.url.split('/api')[0];
          const backfillUrl = `${baseUrl}/api/cron/backfill-engagements`;
          const backfillResponse = await fetch(backfillUrl, {
            method: "POST",
            headers: { "x-cron-secret": cronSecret },
          });
          if (backfillResponse.ok) {
            const backfillData = await backfillResponse.json();
            return NextResponse.json({
              ok: true,
              authUsed,
              healthStatus: "stale",
              ageHours: ageHours.toFixed(2),
              lastWebhookAt: lastWebhookAt?.toISOString(),
              backfillTriggered: true,
              backfillResult: backfillData,
            });
          }
        } catch (backfillErr) {
          console.error("[Cron Webhook Health] Error triggering backfill:", backfillErr);
        }
      }
      return NextResponse.json({
        ok: true,
        authUsed,
        healthStatus: "stale",
        ageHours: ageHours.toFixed(2),
        lastWebhookAt: lastWebhookAt?.toISOString(),
        warning: `Last webhook was ${ageHours.toFixed(2)} hours ago`,
        backfillTriggered: enableBackfill,
      });
    }

    return NextResponse.json({
      ok: true,
      authUsed,
      healthStatus,
      ageHours: ageHours?.toFixed(2) || null,
      lastWebhookAt: lastWebhookAt?.toISOString() || null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, authUsed, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 200 }
    );
  }
}