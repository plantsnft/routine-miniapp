import { NextResponse } from "next/server";
import { BURR_FID } from "~/lib/constants";
import { cacheGet, cacheSet, CACHE_NS, CACHE_TTL } from "~/lib/cache";

const CASTS_LIMIT = 3; // Show only last 3 top-level casts
const CACHE_KEY = 'latest';

interface CachedCastsResponse {
  ok: boolean;
  casts: any[];
}

/**
 * GET /api/burr-casts
 * Returns the last 3 top-level casts from Burr (FID: 311933)
 * Filters out replies (only shows top-level casts)
 * 
 * OPTIMIZATION (NEYNAR_CREDITS_AND_WEBHOOKS_REVIEW §3.9):
 * Caches response for 10 minutes to reduce Neynar feed API calls.
 * About page doesn't need real-time casts.
 */
export async function GET() {
  try {
    // Check cache first
    const cached = cacheGet<CachedCastsResponse>(CACHE_NS.BURR_CASTS, CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { 
          ok: false,
          error: "NEYNAR_API_KEY is not configured",
          casts: [],
        },
        { status: 500 }
      );
    }

    // Fetch casts from Neynar API
    // Fetch more than needed since we'll filter out replies
    // Request 20 to ensure we get at least 3 top-level casts
    const castsUrl = `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${BURR_FID}&limit=20`;
    const response = await fetch(castsUrl, {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Burr Casts API] Error: ${response.status} ${errorText}`);
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch casts: ${response.status}`,
          casts: [],
        },
        { status: response.status }
      );
    }

    const data = await response.json() as any;
    const rawCasts = data.casts || data.result?.casts || [];

    // Filter to only top-level casts (not replies)
    // Top-level casts have no parent_hash
    const topLevelCasts = rawCasts.filter((cast: any) => {
      // A cast is top-level if it has no parent_hash
      return !cast.parent_hash;
    });

    // Format casts to match channel feed structure, limit to 3
    const casts = topLevelCasts.slice(0, CASTS_LIMIT).map((cast: any) => ({
      hash: cast.hash,
      text: cast.text,
      timestamp: cast.timestamp || cast.created_at,
      author: {
        fid: cast.author?.fid || cast.author_fid,
        username: cast.author?.username,
        display_name: cast.author?.display_name,
        pfp_url: cast.author?.pfp?.url || cast.author?.pfp_url,
      },
      images: cast.embeds?.filter((e: any) => e.url && /\.(jpg|jpeg|png|gif|webp)/i.test(e.url)).map((e: any) => e.url) || [],
      embeds: cast.embeds || [],
      replies_count: cast.replies?.count || cast.replies_count || 0,
      likes_count: cast.reactions?.count || cast.likes_count || 0,
      recasts_count: cast.recasts?.count || cast.recasts_count || 0,
    }));

    console.log(`[Burr Casts API] Fetched ${casts.length} casts (caching for 10 min)`);

    const result: CachedCastsResponse = { ok: true, casts };
    
    // Cache the successful response
    cacheSet(CACHE_NS.BURR_CASTS, CACHE_KEY, result, CACHE_TTL.BURR_CASTS);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Burr Casts API] Unexpected error:", error);
    return NextResponse.json(
      { 
        ok: false,
        error: error?.message || "Failed to fetch casts",
        casts: [],
      },
      { status: 500 }
    );
  }
}
