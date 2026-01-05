import { NextResponse } from "next/server";
import { wrapNeynarFetch } from "~/lib/neynarResult";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";

const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";
const MAX_PAGES = 5;
const LOOKBACK_DAYS = 15;

/**
 * Cron endpoint to refresh channel feed cache in Supabase
 * GET /api/cron/refresh-channel-feed
 * 
 * Fetches /catwalk channel feed from Neynar (15-day lookback)
 * and stores it in channel_feed_cache table.
 */
export async function GET() {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "NEYNAR_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const fifteenDaysAgo = Math.floor(Date.now() / 1000) - (LOOKBACK_DAYS * 24 * 60 * 60);
  const recentCasts: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  let totalFetched = 0;
  let oldestTimestampSeen: number | null = null;
  let structuredError: any = null;

  // Fetch casts with pagination
  while (pageCount < MAX_PAGES) {
    pageCount++;
    try {
      const url: string = cursor
        ? `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100&cursor=${cursor}`
        : `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100`;

      const feedResult = await wrapNeynarFetch<any>(
        url,
        {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          } as any,
        } as any,
        "cron/refresh-channel-feed"
      );

      if (!feedResult.ok) {
        // Handle NEYNAR_CREDITS_EXCEEDED gracefully
        if (feedResult.code === "NEYNAR_CREDITS_EXCEEDED") {
          structuredError = {
            code: feedResult.code,
            status: feedResult.status,
            message: feedResult.message,
          };
          console.warn("[Cron Refresh Channel Feed] Neynar credits exceeded, storing empty cache");
          break;
        }
        // Other errors - log and break
        console.error(`[Cron Refresh Channel Feed] Neynar API error: ${feedResult.status} ${feedResult.message}`);
        structuredError = {
          code: feedResult.code || "NEYNAR_API_ERROR",
          status: feedResult.status || 500,
          message: feedResult.message || "Unknown error",
        };
        break;
      }

      const feedData = feedResult.data;
      const casts = feedData.casts || feedData.result?.casts || feedData.result?.feed || [];
      totalFetched += casts.length;

      console.log(`[Cron Refresh Channel Feed] Page ${pageCount}: Got ${casts.length} casts from feed API`);

      if (casts.length === 0) {
        console.log(`[Cron Refresh Channel Feed] No casts returned, stopping pagination`);
        break;
      }

      // Filter casts from last 15 days and track oldest timestamp
      let foundOldCast = false;
      for (const cast of casts) {
        let castTimestamp = 0;
        if (cast.timestamp) {
          if (typeof cast.timestamp === 'number') {
            castTimestamp = cast.timestamp;
          } else if (typeof cast.timestamp === 'string') {
            const parsed = parseInt(cast.timestamp);
            if (!isNaN(parsed) && parsed > 1000000000) {
              castTimestamp = parsed;
            } else {
              const date = new Date(cast.timestamp);
              if (!isNaN(date.getTime())) {
                castTimestamp = Math.floor(date.getTime() / 1000);
              }
            }
          }
        }

        // Track oldest timestamp seen
        if (castTimestamp > 0 && (oldestTimestampSeen === null || castTimestamp < oldestTimestampSeen)) {
          oldestTimestampSeen = castTimestamp;
        }

        // Only include casts within 15 days
        if (castTimestamp >= fifteenDaysAgo) {
          recentCasts.push(cast);
        } else {
          foundOldCast = true;
        }
      }

      const pageRecentCount = casts.filter((c: any) => {
        let ts = 0;
        if (c.timestamp) {
          if (typeof c.timestamp === 'number') ts = c.timestamp;
          else if (typeof c.timestamp === 'string') {
            const p = parseInt(c.timestamp);
            if (!isNaN(p) && p > 1000000000) ts = p;
            else {
              const d = new Date(c.timestamp);
              if (!isNaN(d.getTime())) ts = Math.floor(d.getTime() / 1000);
            }
          }
        }
        return ts >= fifteenDaysAgo;
      }).length;
      console.log(`[Cron Refresh Channel Feed] Page ${pageCount}: ${pageRecentCount} casts within 15 days (out of ${casts.length} total)`);

      // Stop if we found old casts (we've gone past the 15-day window)
      if (foundOldCast) {
        console.log(`[Cron Refresh Channel Feed] Reached end of 15-day window, stopping pagination`);
        break;
      }

      // Get next cursor
      cursor = feedData.next?.cursor || null;
      if (!cursor || casts.length < 100) {
        break;
      }
    } catch (err) {
      console.error("[Cron Refresh Channel Feed] Error fetching feed:", err);
      structuredError = {
        code: "FETCH_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      };
      break;
    }
  }

  // Prepare payload for Supabase
  const payload: any = {
    casts: recentCasts,
    debug: {
      pagesFetched: pageCount,
      totalFetched,
      oldestTimestampSeen,
    },
  };

  if (structuredError) {
    payload.error = structuredError;
  }

  // Store in Supabase (best-effort)
  let supabaseError: any = null;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("channel_feed_cache")
      .upsert(
        {
          channel_id: "catwalk",
          as_of: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          payload,
        } as any,
        { onConflict: "channel_id" }
      );

    if (error) {
      supabaseError = error;
      console.error("[Cron Refresh Channel Feed] Supabase upsert error:", error);
    } else {
      console.log(`[Cron Refresh Channel Feed] Successfully cached ${recentCasts.length} casts`);
    }
  } catch (err) {
    supabaseError = err;
    console.error("[Cron Refresh Channel Feed] Supabase error:", err);
  }

  // Build response
  const response: any = {
    ok: !structuredError && !supabaseError,
    castsCount: recentCasts.length,
    asOf: new Date().toISOString(),
  };

  if (structuredError) {
    response.error = structuredError;
  }
  if (supabaseError) {
    response.supabaseError = supabaseError instanceof Error ? supabaseError.message : supabaseError;
  }

  // Return HTTP 200 even on errors (as per requirements)
  return NextResponse.json(response, { status: 200 });
}
