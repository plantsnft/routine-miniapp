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
    const fifteenDaysAgo = Math.floor(Date.now() / 1000) - (15 * 24 * 60 * 60);
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

    // Step 3: For each cast, check user's engagement using Neynar's reactions API
    // Use the proper Neynar API endpoint: /v2/farcaster/reactions/cast
    const userEngagements = new Map<string, Set<string>>(); // castHash -> Set<"like"|"comment"|"recast">
    const processedCastHashes = new Set<string>(); // Track which casts we've already processed
    
    console.log(`[Engagement Verify] Checking engagement for ${channelCasts.length} casts, user FID: ${fid}`);
    
    // Process ALL casts to check reactions (need to check all to filter correctly)
    for (let i = 0; i < channelCasts.length; i++) {
      const cast = channelCasts[i];
      const castHash = cast.hash;
      if (!castHash || processedCastHashes.has(castHash)) continue;
      processedCastHashes.add(castHash);

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
        // Fetch cast details with viewer_fid to get viewer_context
        // viewer_context tells us directly if this user has liked/recasted the cast
        const castResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/cast?identifier=${castHash}&type=hash&viewer_fid=${fid}`,
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        if (!castResponse.ok) {
          console.error(`[Engagement Verify] Failed to fetch cast ${castHash}: ${castResponse.status}`);
          continue;
        }

        const castData = await castResponse.json() as any;
        const castDetails = castData.cast || castData.result?.cast;
        
        if (!castDetails) {
          console.error(`[Engagement Verify] No cast details found for ${castHash}`);
          continue;
        }

        // Use viewer_context which tells us directly if the user has liked/recasted
        // This is the most reliable method - Neynar returns this when viewer_fid is provided
        const viewerContext = castDetails.viewer_context || {};
        const hasLiked = viewerContext.liked === true;
        const hasRecasted = viewerContext.recasted === true;
        
        // Check comments/replies - need to check replies array for user's FID
        let hasCommented = false;
        const replies = castDetails.replies?.casts || [];
        if (Array.isArray(replies)) {
          hasCommented = replies.some((reply: any) => {
            const replyFid = reply.author?.fid || reply.fid;
            return replyFid === fid;
          });
        }
        
        // Log for first few casts to debug
        if (i < 3) {
          console.log(`[Engagement Verify] Cast ${i} (${castHash.substring(0, 10)}...):`, {
            castHash: castHash.substring(0, 10),
            viewerContext,
            hasLiked,
            hasRecasted,
            hasCommented,
            repliesCount: replies.length,
            likesCount: castDetails.reactions?.likes_count || castDetails.reactions?.likes?.length || 0,
            recastsCount: castDetails.reactions?.recasts_count || castDetails.reactions?.recasts?.length || 0,
          });
        }

        // Store detected engagements
        if (hasLiked || hasRecasted || hasCommented) {
          if (!userEngagements.has(castHash)) {
            userEngagements.set(castHash, new Set());
          }
          if (hasLiked) {
            userEngagements.get(castHash)!.add("like");
            console.log(`[Engagement Verify] ✓ User ${fid} has liked cast ${castHash.substring(0, 10)}...`);
          }
          if (hasRecasted) {
            userEngagements.get(castHash)!.add("recast");
            console.log(`[Engagement Verify] ✓ User ${fid} has recasted cast ${castHash.substring(0, 10)}...`);
          }
          if (hasCommented) {
            userEngagements.get(castHash)!.add("comment");
            console.log(`[Engagement Verify] ✓ User ${fid} has commented on cast ${castHash.substring(0, 10)}...`);
          }
          
          // Store in Supabase if not already stored (for history tracking)
          // This helps us track what users have done even if they haven't claimed yet
          for (const engagementType of ["like", "recast", "comment"] as const) {
            const hasEngagement = engagementType === "like" ? hasLiked : 
                                 engagementType === "recast" ? hasRecasted : hasCommented;
            
            if (hasEngagement) {
              // Check if already stored
              const existingCheck = await fetch(
                `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&cast_hash=eq.${castHash}&engagement_type=eq.${engagementType}`,
                {
                  method: "GET",
                  headers: SUPABASE_HEADERS,
                }
              );
              
              if (existingCheck.ok) {
                const existing = await existingCheck.json() as any;
                if (existing.length === 0) {
                  // Store as verified but not claimed
                  await fetch(
                    `${SUPABASE_URL}/rest/v1/engagement_claims`,
                    {
                      method: "POST",
                      headers: SUPABASE_HEADERS,
                      body: JSON.stringify({
                        fid,
                        cast_hash: castHash,
                        engagement_type: engagementType,
                        reward_amount: ENGAGEMENT_REWARDS[engagementType],
                        verified_at: new Date().toISOString(),
                      }),
                    }
                  );
                  console.log(`[Engagement Verify] Stored ${engagementType} for cast ${castHash.substring(0, 10)}...`);
                }
              }
            }
          }
        }
      } catch (castErr) {
        console.error(`[Engagement Verify] Error checking cast ${castHash}:`, castErr);
        // Continue with next cast
      }
    }

    console.log(`[Engagement Verify] User has engaged with ${userEngagements.size} casts`);
    console.log(`[Engagement Verify] Sample engaged casts:`, Array.from(userEngagements.entries()).slice(0, 5).map(([hash, actions]) => ({ hash, actions: Array.from(actions) })));

    // Step 3.5: Check for any engaged casts that might not be in the channel feed
    // This handles cases where user engaged with casts that aren't in the current feed
    const engagedCastHashes = Array.from(userEngagements.keys());
    const feedCastHashes = new Set(channelCasts.map(c => c.hash).filter(Boolean));
    
    // Find engaged casts that aren't in the feed
    const missingCasts = engagedCastHashes.filter(hash => !feedCastHashes.has(hash) && !processedCastHashes.has(hash));
    console.log(`[Engagement Verify] Found ${missingCasts.length} engaged casts not in feed, checking them...`);
    
    // Fetch details for missing casts to check if they're from catwalk channel and within time window
    for (const castHash of missingCasts.slice(0, 20)) { // Limit to 20 to avoid too many API calls
      try {
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
          const castDetails = castData.cast || castData.result?.cast;
          
          if (castDetails) {
            const parentUrl = castDetails.parent_url || castDetails.parentUrl;
            let castTimestamp = 0;
            if (castDetails.timestamp) {
              if (typeof castDetails.timestamp === 'number') {
                castTimestamp = castDetails.timestamp;
              } else if (typeof castDetails.timestamp === 'string') {
                const parsed = parseInt(castDetails.timestamp);
                if (!isNaN(parsed) && parsed > 1000000000) {
                  castTimestamp = parsed;
                } else {
                  const date = new Date(castDetails.timestamp);
                  if (!isNaN(date.getTime())) {
                    castTimestamp = Math.floor(date.getTime() / 1000);
                  }
                }
              }
            }
            
            // Only include if it's from catwalk channel and within 30 days
            if (parentUrl === CATWALK_CHANNEL_PARENT_URL && castTimestamp >= thirtyDaysAgo) {
              // Add to channelCasts so it gets processed in the opportunities/claimable logic
              channelCasts.push(castDetails);
              processedCastHashes.add(castHash);
              console.log(`[Engagement Verify] Added missing cast ${castHash} to processing list (timestamp: ${castTimestamp}, 15 days ago: ${fifteenDaysAgo})`);
            }
          }
        }
      } catch (err) {
        console.error(`[Engagement Verify] Error fetching missing cast ${castHash}:`, err);
      }
    }

    // Step 4: Build claimable rewards list (actions done but not claimed, from last 15 days)
    const claimableRewards: Array<{
      castHash: string;
      castUrl: string;
      authorUsername?: string;
      authorDisplayName?: string;
      text?: string;
      timestamp: number;
      claimableActions: Array<{
        type: "like" | "comment" | "recast";
        rewardAmount: number;
      }>;
    }> = [];

    // Step 5: Build opportunities and claimable rewards lists
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

      // Check for claimable rewards (actions done but not claimed, from last 15 days ONLY)
      // Only include casts from last 15 days for claimable rewards
      if (castTimestamp >= fifteenDaysAgo) {
        const claimableActions: Array<{ type: "like" | "comment" | "recast"; rewardAmount: number }> = [];
        
        // Only add to claimable if user has DONE the action but NOT claimed it
        if (hasLiked && !hasLikedAndClaimed) {
          claimableActions.push({ type: "like", rewardAmount: ENGAGEMENT_REWARDS.like });
        }
        if (hasRecasted && !hasRecastedAndClaimed) {
          claimableActions.push({ type: "recast", rewardAmount: ENGAGEMENT_REWARDS.recast });
        }
        if (hasCommented && !hasCommentedAndClaimed) {
          claimableActions.push({ type: "comment", rewardAmount: ENGAGEMENT_REWARDS.comment });
        }

        if (claimableActions.length > 0) {
          const author = cast.author || {};
          const castUrl = `https://warpcast.com/${author.username || 'unknown'}/${castHash}`;
          
          console.log(`[Engagement Verify] Found claimable reward for cast ${castHash}:`, {
            castHash,
            author: author.username,
            claimableActions: claimableActions.map(a => a.type),
            hasLiked,
            hasLikedAndClaimed,
            hasRecasted,
            hasRecastedAndClaimed,
            hasCommented,
            hasCommentedAndClaimed,
            castTimestamp,
            fifteenDaysAgo,
            isWithin15Days: castTimestamp >= fifteenDaysAgo,
          });
          
          claimableRewards.push({
            castHash,
            castUrl,
            authorUsername: author.username,
            authorDisplayName: author.display_name,
            text: cast.text?.substring(0, 100) || "",
            timestamp: castTimestamp,
            claimableActions,
          });
        }
      }

      // If user has done AND claimed all 3 actions, don't show this cast in opportunities
      if (hasLikedAndClaimed && hasRecastedAndClaimed && hasCommentedAndClaimed) {
        continue; // Skip this cast - user has completed all actions
      }
      
      const availableActions: Array<{ type: "like" | "comment" | "recast"; rewardAmount: number }> = [];

      // Show like if: user hasn't done it yet (don't show if they've done it - that goes to claimable rewards)
      if (!hasLiked) {
        availableActions.push({ type: "like", rewardAmount: ENGAGEMENT_REWARDS.like });
      }
      
      // Show recast if: user hasn't done it yet (don't show if they've done it - that goes to claimable rewards)
      if (!hasRecasted) {
        availableActions.push({ type: "recast", rewardAmount: ENGAGEMENT_REWARDS.recast });
      }
      
      // Show comment if: user hasn't done it yet (don't show if they've done it - that goes to claimable rewards)
      if (!hasCommented) {
        availableActions.push({ type: "comment", rewardAmount: ENGAGEMENT_REWARDS.comment });
      }

      // Only include casts where user can still do at least one action (haven't done it yet)
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
    claimableRewards.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[Engagement Verify] Summary:`, {
      opportunities: opportunities.length,
      claimableRewards: claimableRewards.length,
      totalClaimableReward: claimableRewards.reduce((sum, reward) => {
        return sum + reward.claimableActions.reduce((actionSum, action) => actionSum + action.rewardAmount, 0);
      }, 0),
    });

    return NextResponse.json({
      eligibleCount: opportunities.length,
      opportunities: opportunities.slice(0, 100), // Limit to 100 for UI performance
      totalReward: opportunities.reduce((sum, opp) => {
        return sum + opp.availableActions.reduce((actionSum, action) => actionSum + action.rewardAmount, 0);
      }, 0),
      claimableCount: claimableRewards.length,
      claimableRewards: claimableRewards.slice(0, 100), // Limit to 100 for UI performance
      totalClaimableReward: claimableRewards.reduce((sum, reward) => {
        return sum + reward.claimableActions.reduce((actionSum, action) => actionSum + action.rewardAmount, 0);
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
