import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";

const BATCH_SIZE = 10;

export async function GET(req: Request) {
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

  console.log(`[Cron Refresh Engagement Cache] Authenticated via: ${authUsed}`);

  try {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
      .from("portal_users")
      .select("fid, last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (error) {
      console.error("[Cron Refresh Engagement Cache] Supabase query error:", error);
      return NextResponse.json(
        {
          ok: false,
          authUsed,
          code: "SUPABASE_ERROR",
          message: error.message || "Unknown Supabase error",
        },
        { status: 200 }
      );
    }

    const fids: number[] = [];
    const lastSeenAt: Record<string, string> = {};

    if (data && Array.isArray(data)) {
      for (const row of data as any[]) {
        if (row.fid) {
          const fid = typeof row.fid === "number" ? row.fid : parseInt(String(row.fid));
          if (!isNaN(fid)) {
            fids.push(fid);
            if (row.last_seen_at) {
              lastSeenAt[fid.toString()] = String(row.last_seen_at);
            }
          }
        }
      }
    }

    const { data: feedCacheData, error: feedCacheError } = await supabase
      .from("channel_feed_cache")
      .select("as_of")
      .eq("channel_id", "catwalk")
      .single();

    if (feedCacheError || !feedCacheData) {
      return NextResponse.json(
        {
          ok: false,
          authUsed,
          code: "MISSING_CHANNEL_FEED_CACHE",
          message: "Run refresh-channel-feed first",
        },
        { status: 200 }
      );
    }

    let storedCount = 0;
    let failedCount = 0;
    const asOfTimestamp = new Date().toISOString();

    for (const fid of fids) {
      try {
        const placeholderPayload = {
          eligibleCount: 0,
          opportunities: [],
          totalReward: 0,
          claimableCount: 0,
          claimableRewards: [],
          totalClaimableReward: 0,
          cacheOnly: true,
          computed: false,
          reason: "NOT_COMPUTED_YET",
        };

        const { error: upsertError } = await supabase
          .from("engagement_cache")
          .upsert(
            {
              fid,
              channel_id: "catwalk",
              as_of: asOfTimestamp,
              payload: placeholderPayload,
              updated_at: asOfTimestamp,
            } as any,
            { onConflict: "fid,channel_id" }
          );

        if (upsertError) {
          console.error(`[Cron Refresh Engagement Cache] Failed to upsert cache for fid ${fid}:`, upsertError);
          failedCount++;
        } else {
          storedCount++;
        }
      } catch (err) {
        console.error(`[Cron Refresh Engagement Cache] Error upserting cache for fid ${fid}:`, err);
        failedCount++;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        authUsed,
        batchSize: fids.length,
        storedCount,
        failedCount,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[Cron Refresh Engagement Cache] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        authUsed,
        code: "SUPABASE_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 200 }
    );
  }
}
