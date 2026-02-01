import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";

/**
 * Diagnostic endpoint to check Creator Portal health
 * GET /api/ops/portal-health
 * 
 * Checks all critical requirements for the reward system to work
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; value?: any; error?: string }> = {};

  // 1. Check CATWALK_AUTHOR_FIDS
  const authorFids = (process.env.CATWALK_AUTHOR_FIDS || "")
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => n > 0);
  checks.CATWALK_AUTHOR_FIDS = {
    ok: authorFids.length > 0,
    value: authorFids.length > 0 ? `${authorFids.length} FIDs configured` : "NOT SET",
    error: authorFids.length === 0 ? "CRITICAL: Webhook won't save any casts without this" : undefined,
  };

  // 2. Check NEYNAR_API_KEY
  const neynarKey = process.env.NEYNAR_API_KEY;
  checks.NEYNAR_API_KEY = {
    ok: !!neynarKey && neynarKey.length > 10,
    value: neynarKey ? `${neynarKey.substring(0, 8)}...` : "NOT SET",
  };

  // 3. Check REWARD_SIGNER_PRIVATE_KEY
  const signerKey = process.env.REWARD_SIGNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  checks.REWARD_SIGNER_PRIVATE_KEY = {
    ok: !!signerKey && signerKey.startsWith("0x"),
    value: signerKey ? "SET (hidden)" : "NOT SET",
    error: !signerKey ? "CRITICAL: Cannot send token rewards without this" : undefined,
  };

  // 4. Check Supabase connection
  const supabase = getSupabaseAdmin();
  
  // 5. Check eligible_casts table (has data?)
  try {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const { data: eligibleCasts, error: eligibleError } = await supabase
      .from("eligible_casts")
      .select("cast_hash, author_fid, created_at")
      .gte("created_at", fifteenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10) as { data: any[] | null; error: any };

    if (eligibleError) {
      checks.eligible_casts = {
        ok: false,
        error: eligibleError.message,
      };
    } else {
      const casts = eligibleCasts || [];
      checks.eligible_casts = {
        ok: casts.length > 0,
        value: {
          count: casts.length,
          sample: casts.slice(0, 3).map((c: any) => ({
            hash: c.cast_hash?.substring(0, 12),
            author: c.author_fid,
            created: c.created_at,
          })),
        },
        error: casts.length === 0 
          ? "CRITICAL: No eligible casts! Run /api/cron/seed-eligible-casts" 
          : undefined,
      };
    }
  } catch (err: any) {
    checks.eligible_casts = { ok: false, error: err.message };
  }

  // 6. Check engagements table (recent webhook activity?)
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentEngagements, error: engError, count } = await supabase
      .from("engagements")
      .select("*", { count: "exact" })
      .gte("engaged_at", oneHourAgo)
      .limit(5) as { data: any[] | null; error: any; count: number | null };

    if (engError) {
      checks.engagements_recent = {
        ok: false,
        error: engError.message,
      };
    } else {
      const engs = recentEngagements || [];
      checks.engagements_recent = {
        ok: true,
        value: {
          lastHourCount: count || 0,
          sample: engs.slice(0, 3).map((e: any) => ({
            fid: e.user_fid,
            type: e.engagement_type,
            source: e.source,
          })),
        },
      };
    }
  } catch (err: any) {
    checks.engagements_recent = { ok: false, error: err.message };
  }

  // 7. Check engagement_claims table (pending claims?)
  try {
    const { data: pendingClaims, error: claimsError, count } = await supabase
      .from("engagement_claims")
      .select("*", { count: "exact" })
      .is("claimed_at", null)
      .limit(10) as { data: any[] | null; error: any; count: number | null };

    if (claimsError) {
      checks.pending_claims = {
        ok: false,
        error: claimsError.message,
      };
    } else {
      const claims = pendingClaims || [];
      checks.pending_claims = {
        ok: true,
        value: {
          count: count || 0,
          sample: claims.slice(0, 5).map((c: any) => ({
            fid: c.fid,
            type: c.engagement_type,
            amount: c.reward_amount,
            verified: c.verified_at,
          })),
        },
      };
    }
  } catch (err: any) {
    checks.pending_claims = { ok: false, error: err.message };
  }

  // 8. Check webhook health (last webhook received?)
  try {
    const { data: webhookState, error: webhookError } = await supabase
      .from("app_state")
      .select("value, updated_at")
      .eq("key", "last_webhook_at")
      .single() as { data: { value: any; updated_at: string } | null; error: any };

    if (webhookError && webhookError.code !== "PGRST116") {
      checks.webhook_health = {
        ok: false,
        error: webhookError.message,
      };
    } else if (webhookState) {
      const lastWebhook = new Date(webhookState.value?.timestamp || webhookState.updated_at);
      const ageMinutes = Math.round((Date.now() - lastWebhook.getTime()) / 60000);
      checks.webhook_health = {
        ok: ageMinutes < 60, // Warning if no webhook in last hour
        value: {
          lastReceived: lastWebhook.toISOString(),
          ageMinutes,
        },
        error: ageMinutes > 60 ? "WARNING: No webhook events in last hour" : undefined,
      };
    } else {
      checks.webhook_health = {
        ok: false,
        value: "No webhook data recorded",
        error: "Webhook may not be configured in Neynar",
      };
    }
  } catch (err: any) {
    checks.webhook_health = { ok: false, error: err.message };
  }

  // 9. Check auto-engage users
  try {
    const { data: autoEngageUsers, error: autoError, count } = await supabase
      .from("user_engage_preferences")
      .select("fid, signer_uuid", { count: "exact" })
      .eq("auto_engage_enabled", true) as { data: any[] | null; error: any; count: number | null };

    if (autoError) {
      checks.auto_engage_users = {
        ok: false,
        error: autoError.message,
      };
    } else {
      const users = autoEngageUsers || [];
      checks.auto_engage_users = {
        ok: true,
        value: {
          count: count || 0,
          withSigner: users.filter((u: any) => u.signer_uuid).length,
        },
      };
    }
  } catch (err: any) {
    checks.auto_engage_users = { ok: false, error: err.message };
  }

  // Summary
  const allChecks = Object.entries(checks);
  const failedChecks = allChecks.filter(([_, v]) => !v.ok);
  const criticalFailures = allChecks.filter(([_, v]) => v.error?.includes("CRITICAL"));

  return NextResponse.json({
    healthy: failedChecks.length === 0,
    criticalIssues: criticalFailures.length,
    summary: {
      total: allChecks.length,
      passed: allChecks.length - failedChecks.length,
      failed: failedChecks.length,
    },
    checks,
    recommendations: criticalFailures.map(([name, v]) => `Fix ${name}: ${v.error}`),
    timestamp: new Date().toISOString(),
  });
}
