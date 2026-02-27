import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";
import { BURRFRIENDS_CHANNEL_ID } from "~/lib/constants";
import { pokerDb } from "~/lib/pokerDb";

const FEED_LIMIT = 10;

/**
 * Cron endpoint to refresh Burrfriends channel feed cache in Supabase
 * GET /api/cron/refresh-burrfriends-feed
 *
 * Fetches betr channel feed from Neynar (last 10 casts) via channel feed API
 * and stores it in burrfriends_channel_feed_cache table.
 *
 * Security: Verifies x-vercel-cron header or CRON_SECRET
 */
export async function GET(_req: Request) {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "NEYNAR_API_KEY is not configured" },
      { status: 500 }
    );
  }

  // Security: Verify this is a legitimate cron request
  const cronHeader = _req.headers.get('x-vercel-cron');
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = _req.headers.get('authorization')?.replace('Bearer ', '');
  
  // Allow if Vercel cron header is present OR if CRON_SECRET matches
  if (!cronHeader && (!cronSecret || providedSecret !== cronSecret)) {
    console.warn("[Cron Refresh Burrfriends Feed] Unauthorized cron request");
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let casts: any[] = [];
  let channelStats: { member_count?: number; follower_count?: number } = {};
  let structuredError: any = null;

  try {
    const client = getNeynarClient();

    // Fetch channel feed using Neynar channel feed API (channel_ids=betr)
    const feedUrl = `https://api.neynar.com/v2/farcaster/feed/channels/?channel_ids=${encodeURIComponent(BURRFRIENDS_CHANNEL_ID)}&limit=${FEED_LIMIT}`;
    const feedResponse = await fetch(feedUrl, {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!feedResponse.ok) {
      const errorText = await feedResponse.text();
      console.error(`[Cron Refresh Burrfriends Feed] Feed API error: ${feedResponse.status} ${errorText}`);
      structuredError = {
        code: "FEED_API_ERROR",
        status: feedResponse.status,
        message: errorText.substring(0, 200),
      };
    } else {
      const feedData = await feedResponse.json() as any;
      casts = feedData.casts || feedData.result?.casts || feedData.result?.feed || [];
      
      // Format casts
      casts = casts.slice(0, FEED_LIMIT).map((cast: any) => ({
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

      console.log(`[Cron Refresh Burrfriends Feed] Fetched ${casts.length} casts from feed API`);
    }

    // Fetch channel stats
    try {
      const channel = await client.lookupChannel({ id: BURRFRIENDS_CHANNEL_ID });
      if (channel) {
        channelStats = {
          member_count: (channel as any).member_count || (channel as any).channel?.member_count,
          follower_count: (channel as any).follower_count || (channel as any).channel?.follower_count || (channel as any).followers,
        };
        console.log(`[Cron Refresh Burrfriends Feed] Channel stats: ${JSON.stringify(channelStats)}`);
      }
    } catch (lookupError: any) {
      console.warn("[Cron Refresh Burrfriends Feed] Channel lookup failed, trying search:", lookupError?.message);
      
      // Fallback: Try channel search
      try {
        const searchResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/channel/search?q=${BURRFRIENDS_CHANNEL_ID}`,
          {
            headers: {
              "x-api-key": apiKey,
            },
          }
        );
        
        if (searchResponse.ok) {
          const searchData = await searchResponse.json() as any;
          if (searchData.channels && Array.isArray(searchData.channels)) {
            const foundChannel = searchData.channels.find((ch: any) => 
              ch.id === BURRFRIENDS_CHANNEL_ID || 
              ch.url?.includes(BURRFRIENDS_CHANNEL_ID) ||
              ch.name?.toLowerCase() === BURRFRIENDS_CHANNEL_ID.toLowerCase()
            );
            if (foundChannel) {
              channelStats = {
                member_count: foundChannel.member_count,
                follower_count: foundChannel.follower_count || foundChannel.followers,
              };
              console.log(`[Cron Refresh Burrfriends Feed] Channel stats from search: ${JSON.stringify(channelStats)}`);
            }
          }
        }
      } catch (searchError) {
        console.warn("[Cron Refresh Burrfriends Feed] Channel search also failed:", searchError);
      }
    }
  } catch (err) {
    console.error("[Cron Refresh Burrfriends Feed] Error fetching feed:", err);
    structuredError = {
      code: "FETCH_ERROR",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // Prepare payload for Supabase
  const payload: any = {
    casts,
    channelStats,
    fetched_at: new Date().toISOString(),
  };

  if (structuredError) {
    payload.error = structuredError;
  }

  // Store in Supabase (best-effort)
  let supabaseError: any = null;
  try {
    await pokerDb.upsert('burrfriends_channel_feed_cache', {
      channel_id: BURRFRIENDS_CHANNEL_ID,
      as_of: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      payload,
    });
    console.log(`[Cron Refresh Burrfriends Feed] Successfully cached ${casts.length} casts`);
  } catch (err) {
    supabaseError = err;
    console.error("[Cron Refresh Burrfriends Feed] Supabase error:", err);
  }

  // Build response
  const response: any = {
    ok: !structuredError && !supabaseError,
    castsCount: casts.length,
    channelStats,
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
