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
 * Verify user's engagement (likes/comments/recasts) on Catwalk channel posts
 * POST /api/portal/engagement/verify
 * Body: { fid: number }
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

    const verifiedEngagements: Array<{
      castHash: string;
      engagementType: "like" | "comment" | "recast";
      rewardAmount: number;
      castTimestamp?: number;
    }> = [];

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60); // 30 days in seconds
    const apiKey = process.env.NEYNAR_API_KEY || "";

    // Strategy 1: Get user's engagement history (more efficient)
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
        const likes = likesData.reactions || likesData.result?.reactions || [];
        
        for (const like of likes) {
          const castTimestamp = like.cast?.timestamp ? parseInt(like.cast.timestamp) : 0;
          if (
            like.cast?.parent_url === CATWALK_CHANNEL_PARENT_URL &&
            castTimestamp >= thirtyDaysAgo
          ) {
            verifiedEngagements.push({
              castHash: like.cast.hash,
              engagementType: "like",
              rewardAmount: ENGAGEMENT_REWARDS.like,
              castTimestamp,
            });
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
        const recasts = recastsData.reactions || recastsData.result?.reactions || [];
        
        for (const recast of recasts) {
          const castTimestamp = recast.cast?.timestamp ? parseInt(recast.cast.timestamp) : 0;
          if (
            recast.cast?.parent_url === CATWALK_CHANNEL_PARENT_URL &&
            castTimestamp >= thirtyDaysAgo
          ) {
            verifiedEngagements.push({
              castHash: recast.cast.hash,
              engagementType: "recast",
              rewardAmount: ENGAGEMENT_REWARDS.recast,
              castTimestamp,
            });
          }
        }
      }

      // Get user's casts (to find comments/replies)
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
          const castTimestamp = cast.timestamp ? parseInt(cast.timestamp) : 0;
          // Check if this is a comment/reply to a /catwalk channel cast
          if (
            cast.parent_url === CATWALK_CHANNEL_PARENT_URL &&
            castTimestamp >= thirtyDaysAgo &&
            cast.parent_hash // This indicates it's a reply/comment
          ) {
            verifiedEngagements.push({
              castHash: cast.parent_hash, // The original cast hash
              engagementType: "comment",
              rewardAmount: ENGAGEMENT_REWARDS.comment,
              castTimestamp,
            });
          }
        }
      }
    } catch (userEngagementErr) {
      console.error("[Engagement Verify] Error fetching user engagement history:", userEngagementErr);
    }

    // Strategy 2: Fallback - Fetch all channel casts with pagination (last 30 days)
    // This ensures we don't miss any engagements
    if (verifiedEngagements.length === 0) {
      const channelCasts: any[] = [];
      let cursor: string | null = null;
      let hasMore = true;
      let pageCount = 0;
      const maxPages = 10; // Limit to prevent excessive API calls

      while (hasMore && channelCasts.length < 1000 && pageCount < maxPages) {
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
        } catch (err) {
          console.error("[Engagement Verify] Error fetching channel feed:", err);
          break;
        }
      }

      // Check each cast for user's engagement
      for (const cast of channelCasts) {
        const castHash = cast.hash;
        if (!castHash) continue;

        try {
          // Fetch cast details including reactions
          const castResponse = await fetch(
            `https://api.neynar.com/v2/farcaster/cast?identifier=${castHash}&type=hash`,
            {
              headers: {
                "x-api-key": apiKey,
                "Content-Type": "application/json",
              },
            }
          );

          if (!castResponse.ok) continue;

          const castData = await castResponse.json() as any;
          const castDetails = castData.cast || castData.result?.cast || cast;
          const castTimestamp = castDetails.timestamp ? parseInt(castDetails.timestamp) : 0;

          // Check for likes
          const likes = castDetails.reactions?.likes || [];
          const hasLiked = likes.some((like: any) => like.fid === fid);
          if (hasLiked) {
            verifiedEngagements.push({
              castHash,
              engagementType: "like",
              rewardAmount: ENGAGEMENT_REWARDS.like,
              castTimestamp,
            });
          }

          // Check for recasts
          const recasts = castDetails.reactions?.recasts || [];
          const hasRecasted = recasts.some((recast: any) => recast.fid === fid);
          if (hasRecasted) {
            verifiedEngagements.push({
              castHash,
              engagementType: "recast",
              rewardAmount: ENGAGEMENT_REWARDS.recast,
              castTimestamp,
            });
          }

          // Check for comments/replies
          const replies = castDetails.replies?.casts || [];
          const hasCommented = replies.some((reply: any) => reply.author?.fid === fid);
          if (hasCommented) {
            verifiedEngagements.push({
              castHash,
              engagementType: "comment",
              rewardAmount: ENGAGEMENT_REWARDS.comment,
              castTimestamp,
            });
          }
        } catch (castErr) {
          console.error(`[Engagement Verify] Error processing cast ${castHash}:`, castErr);
          // Continue with next cast
        }
      }
    }

    // Remove duplicates (same castHash + engagementType)
    const uniqueEngagements = verifiedEngagements.reduce((acc, engagement) => {
      const key = `${engagement.castHash}-${engagement.engagementType}`;
      if (!acc.has(key)) {
        acc.set(key, engagement);
      }
      return acc;
    }, new Map<string, typeof verifiedEngagements[0]>());

    const finalEngagements = Array.from(uniqueEngagements.values());

    // Store verified engagements in database (upsert - don't duplicate)
    for (const engagement of finalEngagements) {
      try {
        const claimData = {
          fid: fid,
          cast_hash: engagement.castHash,
          engagement_type: engagement.engagementType,
          reward_amount: engagement.rewardAmount,
          verified_at: new Date().toISOString(),
        };

        await fetch(`${SUPABASE_URL}/rest/v1/engagement_claims`, {
          method: "POST",
          headers: {
            ...SUPABASE_HEADERS,
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify([claimData]),
        });
      } catch (dbErr) {
        console.error("[Engagement Verify] Error storing engagement claim:", dbErr);
        // Continue with next engagement
      }
    }

    // Fetch all claims (including previously verified ones)
    const allClaimsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    let allClaims: any[] = [];
    if (allClaimsRes.ok) {
      allClaims = await allClaimsRes.json() as any;
    }

    const claimed = allClaims.filter((c: any) => c.claimed_at);
    const unclaimed = allClaims.filter((c: any) => !c.claimed_at);

    return NextResponse.json({
      eligibleCount: unclaimed.length,
      claimedCount: claimed.length,
      totalReward: allClaims.reduce(
        (sum: number, c: any) => sum + parseFloat(c.reward_amount || "0"),
        0
      ),
      claims: allClaims.map((c: any) => ({
        castHash: c.cast_hash,
        engagementType: c.engagement_type,
        rewardAmount: parseFloat(c.reward_amount || "0"),
        claimed: !!c.claimed_at,
      })),
    });
  } catch (error: any) {
    console.error("[Engagement Verify] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify engagement" },
      { status: 500 }
    );
  }
}
