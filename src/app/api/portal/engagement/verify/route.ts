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
    }> = [];

    // Fetch recent casts from Catwalk channel
    let channelCasts: any[] = [];
    try {
      const feedResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100`,
        {
          headers: {
            "x-api-key": process.env.NEYNAR_API_KEY || "",
            "Content-Type": "application/json",
          },
        }
      );

      if (feedResponse.ok) {
        const feedData = await feedResponse.json();
        channelCasts = feedData.casts || feedData.result?.casts || [];
      }
    } catch (err) {
      console.error("[Engagement Verify] Error fetching channel feed:", err);
      return NextResponse.json(
        { error: "Failed to fetch channel feed" },
        { status: 500 }
      );
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
              "x-api-key": process.env.NEYNAR_API_KEY || "",
              "Content-Type": "application/json",
            },
          }
        );

        if (!castResponse.ok) continue;

        const castData = await castResponse.json();
        const castDetails = castData.cast || castData.result?.cast || cast;

        // Check for likes
        const likes = castDetails.reactions?.likes || [];
        const hasLiked = likes.some((like: any) => like.fid === fid);
        if (hasLiked) {
          verifiedEngagements.push({
            castHash,
            engagementType: "like",
            rewardAmount: ENGAGEMENT_REWARDS.like,
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
          });
        }

        // Check for comments/replies
        // Replies are included in the cast details response
        const replies = castDetails.replies?.casts || [];
        const hasCommented = replies.some((reply: any) => reply.author?.fid === fid);

        if (hasCommented) {
          verifiedEngagements.push({
            castHash,
            engagementType: "comment",
            rewardAmount: ENGAGEMENT_REWARDS.comment,
          });
        }
      } catch (castErr) {
        console.error(`[Engagement Verify] Error processing cast ${castHash}:`, castErr);
        // Continue with next cast
      }
    }

    // Store verified engagements in database (upsert - don't duplicate)
    for (const engagement of verifiedEngagements) {
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
      allClaims = await allClaimsRes.json();
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
