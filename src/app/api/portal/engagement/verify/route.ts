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
        const casts = feedData.casts || feedData.result?.casts || feedData.result?.feed || [];
        
        console.log(`[Engagement Verify] Page ${pageCount}: Got ${casts.length} casts from feed API`);
        
        if (casts.length === 0) {
          console.log(`[Engagement Verify] No casts returned, stopping pagination`);
          break;
        }
        
        // Debug: Check first cast's timestamp format
        if (pageCount === 1 && casts.length > 0) {
          const firstCast = casts[0];
          console.log(`[Engagement Verify] Sample cast timestamp:`, {
            raw: firstCast.timestamp,
            type: typeof firstCast.timestamp,
            parsed: firstCast.timestamp ? parseInt(firstCast.timestamp) : null,
            thirtyDaysAgo,
            now: Math.floor(Date.now() / 1000),
          });
        }
        
        // Filter casts from last 30 days
        // Timestamps might be in seconds (Unix) or ISO string format
        const recentCasts = casts.filter((c: any) => {
          let castTimestamp = 0;
          
          if (c.timestamp) {
            // Try parsing as Unix timestamp (seconds)
            if (typeof c.timestamp === 'number') {
              castTimestamp = c.timestamp;
            } else if (typeof c.timestamp === 'string') {
              // Try parsing as Unix timestamp string
              const parsed = parseInt(c.timestamp);
              if (!isNaN(parsed) && parsed > 1000000000) { // Valid Unix timestamp
                castTimestamp = parsed;
              } else {
                // Try parsing as ISO date string
                const date = new Date(c.timestamp);
                if (!isNaN(date.getTime())) {
                  castTimestamp = Math.floor(date.getTime() / 1000);
                }
              }
            }
          }
          
          return castTimestamp >= thirtyDaysAgo;
        });

        console.log(`[Engagement Verify] Page ${pageCount}: ${recentCasts.length} casts within 30 days (out of ${casts.length} total)`);
        channelCasts.push(...recentCasts);
        cursor = feedData.next?.cursor || null;
        hasMore = !!cursor && recentCasts.length === 100;
        
        // Stop if we've gone past 30 days
        if (recentCasts.length < 100) {
          console.log(`[Engagement Verify] Reached end of 30-day window, stopping`);
          break;
        }
      } catch (err) {
        console.error("[Engagement Verify] Error fetching channel feed:", err);
        break;
      }
    }

    console.log(`[Engagement Verify] Found ${channelCasts.length} casts from last 30 days`);

    // Step 3: For each cast, check user's engagement by fetching cast details
    // This is more reliable than trying to get user's reaction history
    const userEngagements = new Map<string, Set<string>>(); // castHash -> Set<"like"|"comment"|"recast">
    
    // Process ALL casts to check reactions (need to check all to filter correctly)
    for (let i = 0; i < channelCasts.length; i++) {
      const cast = channelCasts[i];
      const castHash = cast.hash;
      if (!castHash) continue;

      // Parse timestamp (handle both Unix seconds and ISO strings)
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
      
      // Skip if cast is older than 30 days
      if (castTimestamp < thirtyDaysAgo) continue;

      try {
        // Fetch cast details which includes reactions
        const castResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/cast?identifier=${castHash}&type=hash`,
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        if (castResponse.ok) {
          const castData = await castResponse.json() as any;
          const castDetails = castData.cast || castData.result?.cast || cast;
          
          // Check for likes
          const likes = castDetails.reactions?.likes || [];
          const hasLiked = likes.some((like: any) => like.fid === fid);
          if (hasLiked) {
            if (!userEngagements.has(castHash)) {
              userEngagements.set(castHash, new Set());
            }
            userEngagements.get(castHash)!.add("like");
          }

          // Check for recasts
          const recasts = castDetails.reactions?.recasts || [];
          const hasRecasted = recasts.some((recast: any) => recast.fid === fid);
          if (hasRecasted) {
            if (!userEngagements.has(castHash)) {
              userEngagements.set(castHash, new Set());
            }
            userEngagements.get(castHash)!.add("recast");
          }

          // Check for comments/replies
          const replies = castDetails.replies?.casts || [];
          const hasCommented = replies.some((reply: any) => reply.author?.fid === fid);
          if (hasCommented) {
            if (!userEngagements.has(castHash)) {
              userEngagements.set(castHash, new Set());
            }
            userEngagements.get(castHash)!.add("comment");
          }
        }
      } catch (castErr) {
        console.error(`[Engagement Verify] Error checking cast ${castHash}:`, castErr);
        // Continue with next cast
      }
    }

    console.log(`[Engagement Verify] User has engaged with ${userEngagements.size} casts`);

    // Step 4: Build opportunities list
    for (const cast of channelCasts) {
      const castHash = cast.hash;
      if (!castHash) continue;

      // Parse timestamp (handle both Unix seconds and ISO strings)
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
      
      // Skip if cast is older than 30 days
      if (castTimestamp < thirtyDaysAgo) continue;

      const userHasDone = userEngagements.get(castHash) || new Set<string>();
      const userHasClaimed = claimedEngagements.get(castHash) || new Set<string>();
      
      // Check if user has done AND claimed all 3 actions - if so, skip this cast entirely
      const hasLiked = userHasDone.has("like");
      const hasLikedAndClaimed = hasLiked && userHasClaimed.has("like");
      
      const hasRecasted = userHasDone.has("recast");
      const hasRecastedAndClaimed = hasRecasted && userHasClaimed.has("recast");
      
      const hasCommented = userHasDone.has("comment");
      const hasCommentedAndClaimed = hasCommented && userHasClaimed.has("comment");

      // If user has done AND claimed all 3 actions, don't show this cast
      if (hasLikedAndClaimed && hasRecastedAndClaimed && hasCommentedAndClaimed) {
        continue; // Skip this cast - user has completed all actions
      }
      
      const availableActions: Array<{ type: "like" | "comment" | "recast"; rewardAmount: number }> = [];

      // Show like if: user hasn't done it yet OR user did it but hasn't claimed it
      if (!hasLiked || (hasLiked && !hasLikedAndClaimed)) {
        availableActions.push({ type: "like", rewardAmount: ENGAGEMENT_REWARDS.like });
      }
      
      // Show recast if: user hasn't done it yet OR user did it but hasn't claimed it
      if (!hasRecasted || (hasRecasted && !hasRecastedAndClaimed)) {
        availableActions.push({ type: "recast", rewardAmount: ENGAGEMENT_REWARDS.recast });
      }
      
      // Show comment if: user hasn't done it yet OR user did it but hasn't claimed it
      if (!hasCommented || (hasCommented && !hasCommentedAndClaimed)) {
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
