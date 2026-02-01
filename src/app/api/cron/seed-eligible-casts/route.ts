import { NextRequest, NextResponse } from "next/server";
import { wrapNeynarFetch } from "~/lib/neynarResult";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";

const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";
const LOOKBACK_DAYS = 15;

/**
 * Safely parse a timestamp and return ISO string, or null if invalid
 */
function safeISO(timestamp: number | string | null | undefined): string | null {
  if (timestamp === null || timestamp === undefined) return null;
  try {
    // If it's a Unix timestamp (number), convert to milliseconds
    const ms = typeof timestamp === "number" 
      ? (timestamp > 1e12 ? timestamp : timestamp * 1000) // Already ms or needs conversion
      : new Date(timestamp).getTime();
    
    if (isNaN(ms) || ms <= 0) return null;
    
    const iso = new Date(ms).toISOString();
    // Sanity check - reject dates before 2020 or after 2030
    const year = new Date(ms).getFullYear();
    if (year < 2020 || year > 2030) return null;
    
    return iso;
  } catch {
    return null;
  }
}

/**
 * Cron endpoint to seed eligible_casts from AUTHOR_FID casts (one-time seeding)
 * POST /api/cron/seed-eligible-casts
 * 
 * Fetches AUTHOR_FID casts from Neynar for the last 15 days using cursor pagination.
 * Upserts into eligible_casts table.
 * 
 * Security: Requires x-cron-secret header matching CRON_SECRET env var.
 */
export async function POST(req: NextRequest) {
  // Check CRON_SECRET is configured
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, code: "CRON_SECRET_MISSING" },
      { status: 500 }
    );
  }

  // Determine authentication method
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

  console.log(`[Cron Seed Eligible Casts] Authenticated via: ${authUsed}`);

  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "NEYNAR_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const AUTHOR_FIDS = (process.env.CATWALK_AUTHOR_FIDS || "")
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => n > 0);
  
  if (AUTHOR_FIDS.length === 0) {
    return NextResponse.json(
      { ok: false, error: "CATWALK_AUTHOR_FIDS is not configured" },
      { status: 500 }
    );
  }
  
  console.log(`[Cron Seed Eligible Casts] Configured for ${AUTHOR_FIDS.length} author FIDs`);

  const fifteenDaysAgoUnix = Math.floor(Date.now() / 1000) - (LOOKBACK_DAYS * 24 * 60 * 60);
  const _fifteenDaysAgoISO = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  
  let cursor: string | null = null;
  let pageCount = 0;
  let fetched = 0;
  let upserted = 0;
  let skippedOld = 0;
  let hasMore = true;

  const supabase = getSupabaseAdmin();

  // Fetch casts with pagination
  while (hasMore) {
    pageCount++;
    try {
      // Use feed API filtered by parent_url (catwalk channel)
      // We'll filter by author_fid server-side
      const url: string = cursor
        ? `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100&cursor=${cursor}`
        : `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100`;

      const feedResult = await wrapNeynarFetch<any>(
        url,
        {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        },
        "cron/seed-eligible-casts"
      );

      if (!feedResult.ok) {
        console.error(`[Cron Seed Eligible Casts] Neynar API error: ${feedResult.status} ${feedResult.message}`);
        return NextResponse.json(
          {
            ok: false,
            authUsed,
            error: feedResult.message || "Neynar API error",
            code: feedResult.code || "NEYNAR_API_ERROR",
            fetched,
            upserted,
            skippedOld,
          },
          { status: 200 } // Return 200 with error details
        );
      }

      const feedData = feedResult.data;
      const casts = feedData.casts || feedData.result?.casts || feedData.result?.feed || [];
      
      if (casts.length === 0) {
        hasMore = false;
        break;
      }

      // Filter casts by AUTHOR_FIDS, top-level only, and within 15 days
      const eligibleCasts = casts.filter((cast: any) => {
        const authorFid = cast.author?.fid;
        const castTimestamp = cast.timestamp || (cast.created_at ? Math.floor(new Date(cast.created_at).getTime() / 1000) : null);
        
        // Must be from an approved creator
        if (!AUTHOR_FIDS.includes(authorFid)) {
          return false;
        }
        
        // Must be a top-level cast (not a reply)
        if (cast.parent_hash) {
          return false;
        }

        if (!castTimestamp) {
          return false;
        }

        // Check if cast is within 15 days
        if (castTimestamp < fifteenDaysAgoUnix) {
          skippedOld++;
          return false;
        }

        return true;
      });

      fetched += casts.length;

      // Upsert eligible casts
      for (const cast of eligibleCasts) {
        const castHash = cast.hash || cast.cast_hash;
        const castCreatedAt = safeISO(cast.timestamp) || safeISO(cast.created_at) || new Date().toISOString();

        if (!castHash) {
          continue;
        }

        const { error } = await supabase
          .from("eligible_casts")
          .upsert({
            cast_hash: castHash,
            author_fid: cast.author?.fid,
            author_username: cast.author?.username || null,
            created_at: castCreatedAt,
            parent_url: cast.parent_url || CATWALK_CHANNEL_PARENT_URL,
            text: cast.text || null,
            last_seen_at: new Date().toISOString(),
          } as any, {
            onConflict: "cast_hash",
          });

        if (!error) {
          upserted++;
        }
      }

      // Check if we should stop pagination (oldest cast in this page is too old)
      const oldestCastInPage = casts.reduce((oldest: any, cast: any) => {
        const castTimestamp = cast.timestamp || (cast.created_at ? Math.floor(new Date(cast.created_at).getTime() / 1000) : null);
        if (!castTimestamp) return oldest;
        if (!oldest || castTimestamp < oldest.timestamp) {
          return { ...cast, timestamp: castTimestamp };
        }
        return oldest;
      }, null);

      if (oldestCastInPage && oldestCastInPage.timestamp < fifteenDaysAgoUnix) {
        console.log(`[Cron Seed Eligible Casts] Stopping pagination - oldest cast in page is older than 15 days`);
        hasMore = false;
        break;
      }

      // Get next cursor
      cursor = feedData.next?.cursor || feedData.cursor || null;
      if (!cursor || cursor === cursor) {
        hasMore = false;
        break;
      }

      console.log(`[Cron Seed Eligible Casts] Page ${pageCount}: Fetched ${casts.length} casts, ${eligibleCasts.length} eligible, ${upserted} upserted so far`);
    } catch (err) {
      console.error(`[Cron Seed Eligible Casts] Error on page ${pageCount}:`, err);
      return NextResponse.json(
        {
          ok: false,
          authUsed,
          error: err instanceof Error ? err.message : "Unknown error",
          fetched,
          upserted,
          skippedOld,
        },
        { status: 200 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    authUsed,
    fetched,
    upserted,
    skippedOld,
    pagesFetched: pageCount,
  });
}

/**
 * GET handler for browser access - reuses POST logic
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
