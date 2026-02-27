import { NextResponse } from "next/server";
import { BURRFRIENDS_CHANNEL_ID } from "~/lib/constants";
import { pokerDb } from "~/lib/pokerDb";

const CACHE_TTL_HOURS = 4; // Consider stale after 4 hours (cron runs every 4 hours)
const MAX_STALE_HOURS = 48; // Accept cache up to 48 hours old (grace period)

interface ChannelFeedCache {
  channel_id: string;
  as_of: string;
  payload: {
    casts: any[];
    channelStats: {
      member_count?: number;
      follower_count?: number;
    };
    fetched_at: string;
  };
  updated_at: string;
}

/**
 * GET /api/burrfriends-feed
 * Returns the last 10 posts from the Burrfriends Farcaster channel.
 * 
 * CREDIT-EFFICIENT DESIGN: This endpoint is read-only from cache.
 * Only the cron job (/api/cron/refresh-burrfriends-feed) calls Neynar API.
 * This ensures maximum 12 Neynar API calls per day (6 cron runs × 2 calls) regardless of traffic.
 *
 * Cache: Refreshed every 4 hours by cron; API serves cache up to 48h old as fallback.
 */
export async function GET() {
  try {
    // Check database cache
    let cache: ChannelFeedCache[] = [];
    try {
      cache = await pokerDb.fetch<ChannelFeedCache>('burrfriends_channel_feed_cache', {
        filters: { channel_id: BURRFRIENDS_CHANNEL_ID },
        limit: 1,
      });
    } catch (cacheError) {
      console.error("[Burrfriends Feed] Cache fetch error:", cacheError);
      return NextResponse.json(
        { 
          error: "Failed to fetch feed cache",
          casts: [],
          channelStats: {},
        },
        { status: 500 }
      );
    }

    const cachedEntry = cache[0];
    const now = new Date();
    let cacheAgeHours = Infinity;

    if (cachedEntry && cachedEntry.as_of) {
      const cacheTime = new Date(cachedEntry.as_of);
      cacheAgeHours = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);
    }

    // Return cached data if available (even if stale, up to MAX_STALE_HOURS)
    if (cachedEntry && cachedEntry.payload && cacheAgeHours < MAX_STALE_HOURS) {
      const isStale = cacheAgeHours >= CACHE_TTL_HOURS;
      console.log(`[Burrfriends Feed] Returning cached data (age: ${cacheAgeHours.toFixed(2)} hours, stale: ${isStale})`);
      return NextResponse.json({
        casts: cachedEntry.payload.casts || [],
        channelStats: cachedEntry.payload.channelStats || {},
        cached: true,
        stale: isStale,
        asOf: cachedEntry.as_of,
      });
    }

    // No cache available or cache is too old (> 48 hours)
    if (!cachedEntry) {
      console.warn("[Burrfriends Feed] No cache available - feed has not been initialized yet");
      return NextResponse.json({
        casts: [],
        channelStats: {},
        cached: false,
        error: "Feed not yet initialized. Please wait for cron job to run.",
      });
    }

    // Cache is too old (> 48 hours)
    console.warn(`[Burrfriends Feed] Cache is too old (${cacheAgeHours.toFixed(2)} hours) - returning empty data`);
    return NextResponse.json({
      casts: [],
      channelStats: {},
      cached: false,
      stale: true,
      error: "Feed cache is too old. Please wait for cron job to refresh.",
    });
  } catch (error: any) {
    console.error("[Burrfriends Feed] Unexpected error:", error);
    return NextResponse.json(
      { 
        error: error?.message || "Failed to fetch feed",
        casts: [],
        channelStats: {},
      },
      { status: 500 }
    );
  }
}
