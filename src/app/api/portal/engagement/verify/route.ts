import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

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

    // Step 1: Get user's claimed engagements from database
    const claimedEngagements = new Map<string, Set<string>>(); // castHash -> Set<"like"|"comment"|"recast">
    
    try {
      const claimedRes = await fetch(
        `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&claimed_at=not.is.null`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (claimedRes.ok) {
        const claimedData = await claimedRes.json() as any;
        for (const claim of claimedData) {
          const castHash = claim.cast_hash;
          const engagementType = claim.engagement_type;
          if (castHash && engagementType) {
            if (!claimedEngagements.has(castHash)) {
              claimedEngagements.set(castHash, new Set());
            }
            claimedEngagements.get(castHash)!.add(engagementType);
          }
        }
      }
      console.log(`[Engagement Verify] User has claimed ${claimedEngagements.size} unique cast engagements`);
    } catch (dbErr) {
      console.error("[Engagement Verify] Error fetching claimed engagements:", dbErr);
    }

    // Step 2: Get user's existing engagements from Neynar (what they've done, even if not claimed)
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
        console.log(`[Engagement Verify] Found ${likes.length} likes from Neynar`);
        
        for (const like of likes) {
          const cast = like.cast || like;
          const castHash = cast.hash;
          const parentUrl = cast.parent_url || cast.parentUrl;
          const castTimestamp = cast.timestamp ? parseInt(cast.timestamp) : 0;
          
          // Only include likes from catwalk channel in last 30 days
          if (castHash && parentUrl === CATWALK_CHANNEL_PARENT_URL && castTimestamp >= thirtyDaysAgo) {
            if (!userEngagements.has(castHash)) {
              userEngagements.set(castHash, new Set());
            }
            userEngagements.get(castHash)!.add("like");
          }
        }
      } else {
        const errorText = await likesResponse.text();
        console.error(`[Engagement Verify] Likes API error: ${likesResponse.status}`, errorText);
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
        console.log(`[Engagement Verify] Found ${recasts.length} recasts from Neynar`);
        
        for (const recast of recasts) {
          const cast = recast.cast || recast;
          const castHash = cast.hash;
          const parentUrl = cast.parent_url || cast.parentUrl;
          const castTimestamp = cast.timestamp ? parseInt(cast.timestamp) : 0;
          
          // Only include recasts from catwalk channel in last 30 days
          if (castHash && parentUrl === CATWALK_CHANNEL_PARENT_URL && castTimestamp >= thirtyDaysAgo) {
            if (!userEngagements.has(castHash)) {
              userEngagements.set(castHash, new Set());
            }
            userEngagements.get(castHash)!.add("recast");
          }
        }
      } else {
        const errorText = await recastsResponse.text();
        console.error(`[Engagement Verify] Recasts API error: ${recastsResponse.status}`, errorText);
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
        console.log(`[Engagement Verify] Found ${userCasts.length} user casts from Neynar`);
        
        for (const cast of userCasts) {
          const parentUrl = cast.parent_url || cast.parentUrl;
          const parentHash = cast.parent_hash;
          const castTimestamp = cast.timestamp ? parseInt(cast.timestamp) : 0;
          
          // Only include comments from catwalk channel in last 30 days
          if (parentHash && parentUrl === CATWALK_CHANNEL_PARENT_URL && castTimestamp >= thirtyDaysAgo) {
            if (!userEngagements.has(parentHash)) {
              userEngagements.set(parentHash, new Set());
            }
            userEngagements.get(parentHash)!.add("comment");
          }
        }
      } else {
        const errorText = await userCastsResponse.text();
        console.error(`[Engagement Verify] User casts API error: ${userCastsResponse.status}`, errorText);
      }
    } catch (err) {
      console.error("[Engagement Verify] Error fetching user engagements:", err);
    }

    console.log(`[Engagement Verify] User has ${userEngagements.size} casts they've engaged with (from Neynar)`);

    // Step 3: Get all casts from /catwalk channel in last 30 days
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

    // Step 4: For each cast, determine what actions user can still do
    // Show opportunities for actions they haven't done OR haven't claimed yet
    for (const cast of channelCasts) {
      const castHash = cast.hash;
      if (!castHash) continue;

      const castTimestamp = cast.timestamp ? parseInt(cast.timestamp) : 0;
      
      // Skip if cast is older than 30 days
      if (castTimestamp < thirtyDaysAgo) continue;

      const userHasDone = userEngagements.get(castHash) || new Set<string>();
      const userHasClaimed = claimedEngagements.get(castHash) || new Set<string>();
      
      const availableActions: Array<{ type: "like" | "comment" | "recast"; rewardAmount: number }> = [];

      // Show like if: user hasn't done it yet (don't show if they've done it AND claimed it)
      if (!userHasDone.has("like") || (userHasDone.has("like") && !userHasClaimed.has("like"))) {
        availableActions.push({ type: "like", rewardAmount: ENGAGEMENT_REWARDS.like });
      }
      
      // Show recast if: user hasn't done it yet (don't show if they've done it AND claimed it)
      if (!userHasDone.has("recast") || (userHasDone.has("recast") && !userHasClaimed.has("recast"))) {
        availableActions.push({ type: "recast", rewardAmount: ENGAGEMENT_REWARDS.recast });
      }
      
      // Show comment if: user hasn't done it yet (don't show if they've done it AND claimed it)
      if (!userHasDone.has("comment") || (userHasDone.has("comment") && !userHasClaimed.has("comment"))) {
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
          timestamp: castTimestamp,
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
