import { NextResponse } from "next/server";

const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";

// Reward amounts per engagement type
const ENGAGEMENT_REWARDS = {
  like: 1000, // 1k CATWALK per like
  comment: 5000, // 5k CATWALK per comment
  recast: 2000, // 2k CATWALK per recast
};

/**
 * Get engagement opportunities - casts user hasn't engaged with yet
 * POST /api/portal/engagement/verify
 * Body: { fid: number }
 * 
 * Returns all casts from /catwalk channel in last 30 days that user hasn't liked/commented/recasted
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    const opportunities: Array<{
      castHash: string;
      castUrl: string;
      authorUsername?: string;
      authorDisplayName?: string;
      text?: string;
      timestamp: number;
      availableActions: Array<{
        type: "like" | "comment" | "recast";
        rewardAmount: number;
      }>;
    }> = [];

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const apiKey = process.env.NEYNAR_API_KEY || "";

    // Step 1: Get user's existing engagements to know what they've already done
    const userEngagements = new Map<string, Set<string>>(); // castHash -> Set<"like"|"comment"|"recast">

    try {
      // Get user's likes
      const likesResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/reaction/user?fid=${fid}&reaction_type=like&limit=100`,
        {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (likesResponse.ok) {
        const likesData = await likesResponse.json() as any;
        const likes = likesData.reactions || likesData.result?.reactions || likesData.result || [];
        
        for (const like of likes) {
          const cast = like.cast || like;
          const castHash = cast.hash;
          if (castHash && cast.parent_url === CATWALK_CHANNEL_PARENT_URL) {
            if (!userEngagements.has(castHash)) {
              userEngagements.set(castHash, new Set());
            }
            userEngagements.get(castHash)!.add("like");
          }
        }
      }

      // Get user's recasts
      const recastsResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/reaction/user?fid=${fid}&reaction_type=recast&limit=100`,
        {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (recastsResponse.ok) {
        const recastsData = await recastsResponse.json() as any;
        const recasts = recastsData.reactions || recastsData.result?.reactions || recastsData.result || [];
        
        for (const recast of recasts) {
          const cast = recast.cast || recast;
          const castHash = cast.hash;
          if (castHash && cast.parent_url === CATWALK_CHANNEL_PARENT_URL) {
            if (!userEngagements.has(castHash)) {
              userEngagements.set(castHash, new Set());
            }
            userEngagements.get(castHash)!.add("recast");
          }
        }
      }

      // Get user's comments
      const userCastsResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/cast/user?fid=${fid}&limit=100`,
        {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (userCastsResponse.ok) {
        const userCastsData = await userCastsResponse.json() as any;
        const userCasts = userCastsData.result?.casts || [];
        
        for (const cast of userCasts) {
          const parentUrl = cast.parent_url || cast.parentUrl;
          const parentHash = cast.parent_hash;
          if (parentHash && parentUrl === CATWALK_CHANNEL_PARENT_URL) {
            if (!userEngagements.has(parentHash)) {
              userEngagements.set(parentHash, new Set());
            }
            userEngagements.get(parentHash)!.add("comment");
          }
        }
      }
    } catch (err) {
      console.error("[Engagement Verify] Error fetching user engagements:", err);
    }

    console.log(`[Engagement Verify] User has ${userEngagements.size} casts they've engaged with`);

    // Step 2: Get all casts from /catwalk channel in last 30 days
    const channelCasts: any[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 20; // Get more casts to find opportunities

    while (hasMore && channelCasts.length < 2000 && pageCount < maxPages) {
      pageCount++;
      try {
        const url = cursor
          ? `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100&cursor=${cursor}`
          : `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100`;

        const feedResponse = await fetch(url, {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        });

        if (!feedResponse.ok) break;

        const feedData = await feedResponse.json() as any;
        const casts = feedData.casts || feedData.result?.casts || [];
        
        // Filter casts from last 30 days
        const recentCasts = casts.filter((c: any) => {
          const castTimestamp = c.timestamp ? parseInt(c.timestamp) : 0;
          return castTimestamp >= thirtyDaysAgo;
        });

        channelCasts.push(...recentCasts);
        cursor = feedData.next?.cursor || null;
        hasMore = !!cursor && recentCasts.length === 100;
        
        // Stop if we've gone past 30 days
        if (recentCasts.length < 100) break;
      } catch (err) {
        console.error("[Engagement Verify] Error fetching channel feed:", err);
        break;
      }
    }

    console.log(`[Engagement Verify] Found ${channelCasts.length} casts from last 30 days`);

    // Step 3: For each cast, determine what actions user can still do
    for (const cast of channelCasts) {
      const castHash = cast.hash;
      if (!castHash) continue;

      const userHasDone = userEngagements.get(castHash) || new Set<string>();
      const availableActions: Array<{ type: "like" | "comment" | "recast"; rewardAmount: number }> = [];

      if (!userHasDone.has("like")) {
        availableActions.push({ type: "like", rewardAmount: ENGAGEMENT_REWARDS.like });
      }
      if (!userHasDone.has("recast")) {
        availableActions.push({ type: "recast", rewardAmount: ENGAGEMENT_REWARDS.recast });
      }
      if (!userHasDone.has("comment")) {
        availableActions.push({ type: "comment", rewardAmount: ENGAGEMENT_REWARDS.comment });
      }

      // Only include casts where user can still do at least one action
      if (availableActions.length > 0) {
        const author = cast.author || {};
        const castUrl = `https://warpcast.com/${author.username || 'unknown'}/${castHash}`;
        
        opportunities.push({
          castHash,
          castUrl,
          authorUsername: author.username,
          authorDisplayName: author.display_name,
          text: cast.text?.substring(0, 100) || "", // Truncate for display
          timestamp: cast.timestamp ? parseInt(cast.timestamp) : 0,
          availableActions,
        });
      }
    }

    console.log(`[Engagement Verify] Found ${opportunities.length} engagement opportunities`);

    // Sort by timestamp (newest first)
    opportunities.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({
      eligibleCount: opportunities.length,
      opportunities: opportunities.slice(0, 100), // Limit to 100 for UI performance
      totalReward: opportunities.reduce((sum, opp) => {
        return sum + opp.availableActions.reduce((actionSum, action) => actionSum + action.rewardAmount, 0);
      }, 0),
    });
  } catch (error: any) {
    console.error("[Engagement Verify] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify engagement" },
      { status: 500 }
    );
  }
}
