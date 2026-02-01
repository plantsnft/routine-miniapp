import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// Cache TTL: 1 hour in milliseconds
const CACHE_TTL_MS = 60 * 60 * 1000;

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
 * Returns all casts from /catwalk channel in last 15 days that user hasn't liked/commented/recasted
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid } = body;
    const forceRefresh = new URL(request.url).searchParams.get("force") === "true";

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    // ===== PHASE 2.1: CACHE CHECK =====
    // Check engagement_cache table first (1-hour TTL)
    if (!forceRefresh) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: cacheData, error: cacheError } = await supabase
          .from("engagement_cache")
          .select("as_of, payload")
          .eq("fid", fid)
          .eq("channel_id", "catwalk")
          .single() as { data: { as_of: string; payload: any } | null; error: any };

        if (!cacheError && cacheData) {
          const cacheAge = Date.now() - new Date(cacheData.as_of).getTime();
          if (cacheAge < CACHE_TTL_MS) {
            // Check if new engagements exist since cache was created (smart invalidation)
            // This ensures cache doesn't show stale opportunities if user engaged via webhook
            try {
              const { data: newEngagements, error: newEngError } = await supabase
                .from("engagements")
                .select("id")
                .eq("user_fid", fid)
                .gt("engaged_at", cacheData.as_of)
                .limit(1);

              if (!newEngError && newEngagements && newEngagements.length > 0) {
                // New engagements exist since cache - invalidate and recompute
                console.log(`[Engagement Verify] ⚠️ New engagements since cache (${cacheData.as_of}), invalidating cache...`);
                await supabase
                  .from("engagement_cache")
                  .delete()
                  .eq("fid", fid)
                  .eq("channel_id", "catwalk");
                // Continue with fresh computation below
              } else {
                // No new engagements - cache is still valid
                console.log(`[Engagement Verify] ✅ Cache HIT for FID ${fid} (age: ${Math.round(cacheAge / 1000)}s, no new engagements)`);
                const cachedPayload = cacheData.payload as any;
                return NextResponse.json({
                  ...cachedPayload,
                  cached: true,
                  as_of: cacheData.as_of,
                });
              }
            } catch (invCheckErr) {
              // Non-fatal: if invalidation check fails, use cache anyway
              console.warn("[Engagement Verify] Invalidation check failed (non-fatal), using cache:", invCheckErr);
              const cachedPayload = cacheData.payload as any;
              return NextResponse.json({
                ...cachedPayload,
                cached: true,
                as_of: cacheData.as_of,
              });
            }
          } else {
            console.log(`[Engagement Verify] ⏰ Cache STALE for FID ${fid} (age: ${Math.round(cacheAge / 1000)}s, TTL: ${CACHE_TTL_MS / 1000}s)`);
          }
        } else if (cacheError && cacheError.code !== 'PGRST116') {
          // PGRST116 = no rows returned (expected if no cache exists)
          console.warn(`[Engagement Verify] Cache query error (non-fatal):`, cacheError.message);
        }
      } catch (cacheErr) {
        // Non-fatal: if cache check fails, continue with fresh computation
        console.warn("[Engagement Verify] Cache check failed (non-fatal), computing fresh:", cacheErr);
      }
    } else {
      console.log(`[Engagement Verify] 🔄 Force refresh requested for FID ${fid}`);
    }
    // ===== END CACHE CHECK =====

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

    // 15 days for BOTH opportunities and claimable rewards
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
      if (claimedEngagements.size > 0) {
        console.log(`[Engagement Verify] Claimed cast hashes (first 10):`, Array.from(claimedEngagements.keys()).slice(0, 10));
      }
    } catch (dbErr) {
      console.error("[Engagement Verify] Error fetching claimed engagements:", dbErr);
    }

    // Step 1.5: Get user's verified but unclaimed engagements from database
    // This ensures we include engagements that were verified in previous runs
    const verifiedUnclaimedEngagements = new Map<string, Set<string>>(); // castHash -> Set<"like"|"comment"|"recast">
    
    try {
      const verifiedRes = await fetch(
        `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&claimed_at=is.null&verified_at=not.is.null`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (verifiedRes.ok) {
        const verifiedData = await verifiedRes.json() as any;
        for (const claim of verifiedData) {
          const castHash = claim.cast_hash;
          const engagementType = claim.engagement_type;
          if (castHash && engagementType) {
            if (!verifiedUnclaimedEngagements.has(castHash)) {
              verifiedUnclaimedEngagements.set(castHash, new Set());
            }
            verifiedUnclaimedEngagements.get(castHash)!.add(engagementType);
          }
        }
      }
      console.log(`[Engagement Verify] User has ${verifiedUnclaimedEngagements.size} casts with verified but unclaimed engagements`);
      if (verifiedUnclaimedEngagements.size > 0) {
        console.log(`[Engagement Verify] Verified unclaimed cast hashes (first 10):`, Array.from(verifiedUnclaimedEngagements.keys()).slice(0, 10));
      }
    } catch (dbErr) {
      console.error("[Engagement Verify] Error fetching verified unclaimed engagements:", dbErr);
    }

    // ===== PHASE 2.1: USE WEBHOOK DATA FIRST =====
    // Step 2: Get user's engagements from webhook-populated engagements table (FREE, no API calls)
    const userEngagementsFromWebhook = new Map<string, Set<string>>(); // castHash -> Set<"like"|"comment"|"recast">
    
    try {
      const fifteenDaysAgoISO = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const engagementsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/engagements?user_fid=eq.${fid}&engaged_at=gte.${fifteenDaysAgoISO}`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (engagementsRes.ok) {
        const engagementsData = await engagementsRes.json() as any[];
        for (const engagement of engagementsData) {
          const castHash = engagement.cast_hash;
          const engagementType = engagement.engagement_type;
          if (castHash && engagementType) {
            if (!userEngagementsFromWebhook.has(castHash)) {
              userEngagementsFromWebhook.set(castHash, new Set());
            }
            // Map 'reply' to 'comment' for consistency
            const mappedType = engagementType === 'reply' ? 'comment' : engagementType;
            userEngagementsFromWebhook.get(castHash)!.add(mappedType);
          }
        }
        console.log(`[Engagement Verify] ✅ Found ${userEngagementsFromWebhook.size} casts with webhook-populated engagements (FREE)`);
      }
    } catch (webhookErr) {
      console.warn("[Engagement Verify] Error fetching webhook engagements (non-fatal):", webhookErr);
    }

    // Step 2.5: Get eligible casts from database (FREE, no API calls)
    // This gives us all casts from last 15 days without making API calls
    const eligibleCastsFromDB: any[] = [];
    try {
      const fifteenDaysAgoISO = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const eligibleRes = await fetch(
        `${SUPABASE_URL}/rest/v1/eligible_casts?parent_url=eq.${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&created_at=gte.${fifteenDaysAgoISO}&order=created_at.desc&limit=30`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (eligibleRes.ok) {
        const eligibleData = await eligibleRes.json() as any[];
        for (const cast of eligibleData) {
          // Convert database format to API-like format for compatibility
          eligibleCastsFromDB.push({
            hash: cast.cast_hash,
            author: { fid: cast.author_fid },
            text: cast.text,
            timestamp: Math.floor(new Date(cast.created_at).getTime() / 1000),
            parent_url: cast.parent_url,
          });
        }
        console.log(`[Engagement Verify] ✅ Found ${eligibleCastsFromDB.length} eligible casts from database (FREE)`);
      }
    } catch (dbErr) {
      console.warn("[Engagement Verify] Error fetching eligible casts from DB (non-fatal):", dbErr);
    }

    // Step 2.6: Fallback to API if database doesn't have enough casts
    // Only fetch from API if we have fewer than 30 casts in DB (to ensure we have enough to check)
    let channelCasts: any[] = eligibleCastsFromDB;
    if (eligibleCastsFromDB.length < 30) {
      console.log(`[Engagement Verify] ⚠️ Only ${eligibleCastsFromDB.length} casts in DB, fetching from API to get at least 30...`);
      // Fetch minimal amount from API (just 1 page = 100 casts, then limit to 30)
      try {
        const url = `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100`;
        const feedResponse = await fetch(url, {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        });

        if (feedResponse.ok) {
          const feedData = await feedResponse.json() as any;
          const apiCasts = feedData.casts || feedData.result?.casts || feedData.result?.feed || [];
          
          // Filter to last 15 days and merge with DB casts (avoid duplicates)
          const dbCastHashes = new Set(eligibleCastsFromDB.map(c => c.hash));
          const recentApiCasts = apiCasts
            .filter((c: any) => {
              let castTimestamp = 0;
              if (c.timestamp) {
                if (typeof c.timestamp === 'number') {
                  castTimestamp = c.timestamp;
                } else if (typeof c.timestamp === 'string') {
                  const parsed = parseInt(c.timestamp);
                  if (!isNaN(parsed) && parsed > 1000000000) {
                    castTimestamp = parsed;
                  } else {
                    const date = new Date(c.timestamp);
                    if (!isNaN(date.getTime())) {
                      castTimestamp = Math.floor(date.getTime() / 1000);
                    }
                  }
                }
              }
              return castTimestamp >= fifteenDaysAgo && !dbCastHashes.has(c.hash);
            })
            .slice(0, 30); // Limit to 30 max
          
          channelCasts = [...eligibleCastsFromDB, ...recentApiCasts];
          console.log(`[Engagement Verify] 📡 Fetched ${recentApiCasts.length} additional casts from API (total: ${channelCasts.length})`);
        }
      } catch (apiErr) {
        console.warn("[Engagement Verify] API fallback failed (using DB casts only):", apiErr);
        // Continue with DB casts only
      }
    } else {
      // Limit to 30 casts max from DB (newest first, so we get recent ones)
      channelCasts = eligibleCastsFromDB.slice(0, 30);
      console.log(`[Engagement Verify] ✅ Using ${channelCasts.length} casts from database (no API calls needed)`);
    }
    // ===== END WEBHOOK DATA OPTIMIZATION =====

    console.log(`[Engagement Verify] Processing ${channelCasts.length} casts from last 15 days`);

    // ===== PHASE 2.1: USE WEBHOOK DATA FIRST, THEN API FOR MISSING =====
    // Step 3: Start with webhook data, then only check API for casts not in engagements table
    const userEngagements = new Map<string, Set<string>>(userEngagementsFromWebhook); // Start with webhook data
    const processedCastHashes = new Set<string>();
    const castsNeedingApiCheck: string[] = []; // Casts not in webhook data that need API verification
    
    console.log(`[Engagement Verify] Starting with ${userEngagements.size} engagements from webhook data`);
    
    // Identify casts that need API verification (not in webhook data)
    for (const cast of channelCasts) {
      const castHash = cast.hash;
      if (!castHash || processedCastHashes.has(castHash)) continue;
      processedCastHashes.add(castHash);
      
      // If we don't have webhook data for this cast, we need to check via API
      if (!userEngagements.has(castHash)) {
        castsNeedingApiCheck.push(castHash);
      }
    }
    
    console.log(`[Engagement Verify] ${castsNeedingApiCheck.length} casts need API verification (${userEngagements.size} already have webhook data)`);
    
    // Step 3.1: Only make API calls for casts NOT in webhook data, limit to 30 max
    const maxApiCalls = 30;
    const castsToCheckViaApi = castsNeedingApiCheck.slice(0, maxApiCalls);
    
    for (let i = 0; i < castsToCheckViaApi.length; i++) {
      const castHash = castsToCheckViaApi[i];
      const cast = channelCasts.find(c => c.hash === castHash);
      if (!cast) continue;

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
      
      // Skip if cast is older than 15 days
      if (castTimestamp < fifteenDaysAgo) continue;

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
        
        // Log raw viewer_context to debug field names
        if (i < 3) {
          console.log(`[Engagement Verify] Cast ${i} RAW viewer_context:`, JSON.stringify(viewerContext));
        }
        
        const hasLiked = viewerContext.liked === true;
        // Neynar may use 'recast' or 'recasted' - check both
        const hasRecasted = viewerContext.recasted === true || viewerContext.recast === true;
        
        // Check comments/replies - Neynar may use 'replied' or 'reply'
        // First check viewer_context.replied if available, otherwise check replies array
        let hasCommented = viewerContext.replied === true || viewerContext.reply === true;
        
        // FALLBACK: If viewer_context doesn't have recast info, check reactions.recasts array
        // This is a backup in case viewer_context is incomplete
        let hasRecastedFallback = hasRecasted;
        if (!hasRecastedFallback) {
          const recasts = castDetails.reactions?.recasts || [];
          if (Array.isArray(recasts) && recasts.length > 0) {
            hasRecastedFallback = recasts.some((r: any) => {
              const recastFid = r.fid || r.user?.fid || r.reactor?.fid;
              return recastFid === fid;
            });
            if (hasRecastedFallback && !hasRecasted) {
              console.log(`[Engagement Verify] Cast ${castHash.substring(0, 10)}: Found recast via reactions array fallback`);
            }
          }
        }
        
        // If viewer_context doesn't have replied, check replies array
        // Note: replies.casts might not include all replies, so we might need to fetch them separately
        if (!hasCommented) {
          const replies = castDetails.replies?.casts || castDetails.direct_replies || [];
          if (Array.isArray(replies) && replies.length > 0) {
            hasCommented = replies.some((reply: any) => {
              const replyFid = reply.author?.fid || reply.fid;
              return replyFid === fid;
            });
          }
        }
        
        // Use fallback value for recasted
        const finalHasRecasted = hasRecasted || hasRecastedFallback;
        
        // If still no comment detected and cast has replies, fetch replies separately
        // This is needed because the main cast endpoint might not include all replies
        if (!hasCommented && (castDetails.replies?.count > 0 || castDetails.reply_count > 0)) {
          try {
            // Fetch replies to this cast using the thread endpoint
            const repliesResponse = await fetch(
              `https://api.neynar.com/v2/farcaster/cast/conversation?identifier=${castHash}&type=hash&reply_depth=1&include_chronological_parent_casts=false&viewer_fid=${fid}&limit=50`,
              {
                headers: {
                  "x-api-key": apiKey,
                  "Content-Type": "application/json",
                },
              }
            );
            
            if (repliesResponse.ok) {
              const repliesData = await repliesResponse.json() as any;
              const conversation = repliesData.conversation || {};
              const directReplies = conversation.cast?.direct_replies || [];
              
              if (Array.isArray(directReplies)) {
                hasCommented = directReplies.some((reply: any) => {
                  const replyFid = reply.author?.fid || reply.fid;
                  return replyFid === fid;
                });
              }
              
              if (i < 3) {
                console.log(`[Engagement Verify] Cast ${i} conversation check:`, {
                  directRepliesCount: directReplies.length,
                  hasCommented,
                  repliesFids: directReplies.slice(0, 5).map((r: any) => r.author?.fid || r.fid),
                });
              }
            }
          } catch (convErr) {
            // Ignore conversation fetch errors, continue with what we have
            console.error(`[Engagement Verify] Conversation fetch error for ${castHash}:`, convErr);
          }
        }
        
        // Log for first 5 casts to debug - ALWAYS log to diagnose issues
        if (i < 5) {
          console.log(`[Engagement Verify] Cast ${i} (${castHash.substring(0, 12)}):`, JSON.stringify({
            viewerContext,
            hasLiked,
            hasRecasted: finalHasRecasted,
            hasCommented,
            repliesCount: castDetails.replies?.count || castDetails.reply_count || 0,
            likesCount: castDetails.reactions?.likes_count || castDetails.reactions?.likes?.length || 0,
            recastsCount: castDetails.reactions?.recasts_count || castDetails.reactions?.recasts?.length || 0,
          }));
        }
        
        // Also log any cast where user has engaged
        if (hasLiked || finalHasRecasted || hasCommented) {
          console.log(`[Engagement Verify] ðŸŽ¯ FOUND ENGAGEMENT on cast ${castHash.substring(0, 12)}:`, { hasLiked, hasRecasted: finalHasRecasted, hasCommented });
        }

        // Store detected engagements (merge with database-verified engagements)
        if (hasLiked || finalHasRecasted || hasCommented) {
          if (!userEngagements.has(castHash)) {
            userEngagements.set(castHash, new Set());
          }
          // Also merge any verified unclaimed engagements from database
          const dbVerified = verifiedUnclaimedEngagements.get(castHash);
          if (dbVerified) {
            for (const engagementType of dbVerified) {
              userEngagements.get(castHash)!.add(engagementType);
            }
          }
          if (hasLiked) {
            userEngagements.get(castHash)!.add("like");
            console.log(`[Engagement Verify] âœ“ User ${fid} has liked cast ${castHash.substring(0, 10)}...`);
          }
          if (finalHasRecasted) {
            userEngagements.get(castHash)!.add("recast");
            console.log(`[Engagement Verify] âœ“ User ${fid} has recasted cast ${castHash.substring(0, 10)}...`);
          }
          if (hasCommented) {
            userEngagements.get(castHash)!.add("comment");
            console.log(`[Engagement Verify] âœ“ User ${fid} has commented on cast ${castHash.substring(0, 10)}...`);
          }
          
          // Store in Supabase if not already stored (for history tracking)
          // This helps us track what users have done even if they haven't claimed yet
          for (const engagementType of ["like", "recast", "comment"] as const) {
            const hasEngagement = engagementType === "like" ? hasLiked : 
                                 engagementType === "recast" ? finalHasRecasted : hasCommented;
            
            if (hasEngagement) {
              // Check if already stored
              const existingCheck = await fetch(
                `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&cast_hash=eq.${castHash}&engagement_type=eq.${engagementType}&claimed_at=is.null`,
                {
                  method: "GET",
                  headers: SUPABASE_HEADERS,
                }
              );
              
              if (existingCheck.ok) {
                const existing = await existingCheck.json() as any;
                if (existing.length === 0) {
                  // Store as verified but not claimed
                  const storeRes = await fetch(
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
                  
                  if (storeRes.ok) {
                    const storedData = await storeRes.json().catch(() => null);
                    console.log(`[Engagement Verify] âœ… Stored ${engagementType} for cast ${castHash.substring(0, 10)}...`, storedData ? `ID: ${storedData[0]?.id}` : '');
                  } else {
                    const errorText = await storeRes.text();
                    console.error(`[Engagement Verify] âŒ Failed to store ${engagementType} for cast ${castHash.substring(0, 10)}...:`, {
                      status: storeRes.status,
                      statusText: storeRes.statusText,
                      error: errorText,
                      fid,
                      castHash: castHash.substring(0, 12),
                      engagementType,
                    });
                  }
                } else {
                  console.log(`[Engagement Verify] ${engagementType} for cast ${castHash.substring(0, 10)} already exists in database`);
                }
              } else {
                const errorText = await existingCheck.text();
                console.error(`[Engagement Verify] âŒ Failed to check existing ${engagementType} for cast ${castHash.substring(0, 10)}:`, errorText);
              }
            }
          }
        } else {
          // Even if not detected in this run, check if we have verified unclaimed engagements from database
          const dbVerified = verifiedUnclaimedEngagements.get(castHash);
          if (dbVerified && dbVerified.size > 0) {
            if (!userEngagements.has(castHash)) {
              userEngagements.set(castHash, new Set());
            }
            for (const engagementType of dbVerified) {
              userEngagements.get(castHash)!.add(engagementType);
              console.log(`[Engagement Verify] âœ“ Using database-verified ${engagementType} for cast ${castHash.substring(0, 10)}...`);
            }
          }
        }
      } catch (castErr) {
        console.error(`[Engagement Verify] Error checking cast ${castHash}:`, castErr);
        // Continue with next cast
      }
    }

    console.log(`[Engagement Verify] *** ENGAGEMENT DETECTION COMPLETE ***`);
    console.log(`[Engagement Verify] User FID: ${fid}`);
    console.log(`[Engagement Verify] Total casts checked: ${channelCasts.length}`);
    console.log(`[Engagement Verify] User has engaged with ${userEngagements.size} casts`);
    if (userEngagements.size > 0) {
      console.log(`[Engagement Verify] ENGAGED CASTS:`, Array.from(userEngagements.entries()).map(([hash, actions]) => ({ hash: hash.substring(0, 12), actions: Array.from(actions) })));
    } else {
      console.log(`[Engagement Verify] âš ï¸ NO ENGAGEMENTS DETECTED - this may indicate viewer_context is not working`);
    }

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
            
            // Only include if it's from catwalk channel and within 15 days
            if (parentUrl === CATWALK_CHANNEL_PARENT_URL && castTimestamp >= fifteenDaysAgo) {
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
    type ClaimableRewardItem = {
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
      allDoneActions?: Array<"like" | "comment" | "recast">;
    };
    const claimableRewards: ClaimableRewardItem[] = [];

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
      
      // Skip if cast is older than 15 days
      if (castTimestamp < fifteenDaysAgo) continue;

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

        // Log why cast is NOT claimable (for debugging)
        if (claimableActions.length === 0 && userHasDone.size > 0) {
          console.log(`[Engagement Verify] Cast ${castHash.substring(0, 12)} has engagements but NONE claimable:`, {
            done: Array.from(userHasDone),
            claimed: Array.from(userHasClaimed),
            hasLiked, hasLikedAndClaimed,
            hasRecasted, hasRecastedAndClaimed,
            hasCommented, hasCommentedAndClaimed,
          });
        }

        if (claimableActions.length > 0) {
          const author = cast.author || {};
          // Use ~/conversations/ format - only needs cast hash, works regardless of author data
          const castUrl = `https://warpcast.com/~/conversations/${castHash}`;
          
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
          
          // CRITICAL: Ensure all claimable actions are stored in database BEFORE returning
          console.log(`[Engagement Verify] ðŸ”„ Starting storage for ${claimableActions.length} claimable actions for cast ${castHash.substring(0, 10)}...`);
          for (const action of claimableActions) {
            console.log(`[Engagement Verify] ðŸ” Checking if ${action.type} already exists for cast ${castHash.substring(0, 10)}... (fid=${fid})`);
            // Check if an unclaimed record already exists
            const existingCheck = await fetch(
              `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&cast_hash=eq.${castHash}&engagement_type=eq.${action.type}&claimed_at=is.null`,
              {
                method: "GET",
                headers: SUPABASE_HEADERS,
              }
            );
            
            if (existingCheck.ok) {
              const existing = await existingCheck.json() as any;
              console.log(`[Engagement Verify] ðŸ“Š Existing check for ${action.type}: found ${existing.length} unclaimed records`);
              if (existing.length === 0) {
                // Check if a claimed record exists (user might have claimed before)
                const claimedCheck = await fetch(
                  `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&cast_hash=eq.${castHash}&engagement_type=eq.${action.type}&claimed_at=not.is.null`,
                  {
                    method: "GET",
                    headers: SUPABASE_HEADERS,
                  }
                );
                
                if (claimedCheck.ok) {
                  const claimed = await claimedCheck.json() as any;
                  if (claimed.length > 0) {
                    console.log(`[Engagement Verify] âš ï¸ ${action.type} for cast ${castHash.substring(0, 10)}... was already claimed, skipping storage`);
                    continue; // Don't create a new record if it was already claimed
                  }
                }
                
                // Store as verified but not claimed
                const storePayload = {
                  fid,
                  cast_hash: castHash,
                  engagement_type: action.type,
                  reward_amount: action.rewardAmount,
                  verified_at: new Date().toISOString(),
                };
                console.log(`[Engagement Verify] ðŸ’¾ Storing claimable ${action.type} for cast ${castHash.substring(0, 10)}... (fid=${fid})`, storePayload);
                const storeRes = await fetch(
                  `${SUPABASE_URL}/rest/v1/engagement_claims`,
                  {
                    method: "POST",
                    headers: SUPABASE_HEADERS,
                    body: JSON.stringify(storePayload),
                  }
                );
                
                if (storeRes.ok) {
                  const storedData = await storeRes.json().catch(() => null);
                  const recordId = storedData?.[0]?.id || storedData?.id || storedData || 'unknown';
                  console.log(`[Engagement Verify] âœ… SUCCESS: Stored claimable ${action.type} for cast ${castHash.substring(0, 10)}... ID: ${recordId}`, storedData);
                } else {
                  const errorText = await storeRes.text();
                  console.error(`[Engagement Verify] âŒ FAILED to store claimable ${action.type} for cast ${castHash.substring(0, 10)}...:`, {
                    status: storeRes.status,
                    statusText: storeRes.statusText,
                    error: errorText,
                    fid,
                    castHash: castHash.substring(0, 12),
                    engagementType: action.type,
                    payload: storePayload,
                  });
                }
              } else {
                console.log(`[Engagement Verify] Claimable ${action.type} for cast ${castHash.substring(0, 10)}... already exists in database (unclaimed)`);
              }
            } else {
              const errorText = await existingCheck.text();
              console.error(`[Engagement Verify] Failed to check existing claimable ${action.type} for cast ${castHash.substring(0, 10)}...:`, errorText);
            }
          }
          
          claimableRewards.push({
            castHash,
            castUrl,
            authorUsername: author.username,
            authorDisplayName: author.display_name,
            text: cast.text?.substring(0, 100) || "",
            timestamp: castTimestamp,
            claimableActions,
            allDoneActions: Array.from(userHasDone) as Array<"like" | "comment" | "recast">, // All actions user has done (including already claimed)
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
        // Use ~/conversations/ format - only needs cast hash, works regardless of author data
        const castUrl = `https://warpcast.com/~/conversations/${castHash}`;
        
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

    // Build response
    const response = {
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
      cached: false,
      as_of: new Date().toISOString(),
    };

    // ===== PHASE 2.1: STORE RESULTS IN CACHE =====
    // Store computed results in engagement_cache for future use
    try {
      const supabase = getSupabaseAdmin();
      const { error: cacheError } = await supabase
        .from("engagement_cache")
        .upsert({
          fid,
          channel_id: "catwalk",
          as_of: response.as_of,
          payload: response,
          updated_at: response.as_of,
        } as any, {
          onConflict: "fid,channel_id",
        });

      if (cacheError) {
        console.warn("[Engagement Verify] Failed to store cache (non-fatal):", cacheError.message);
      } else {
        console.log(`[Engagement Verify] ✅ Stored results in cache for FID ${fid}`);
      }
    } catch (cacheErr) {
      // Non-fatal: if cache storage fails, still return results
      console.warn("[Engagement Verify] Cache storage error (non-fatal):", cacheErr);
    }
    // ===== END CACHE STORAGE =====

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Engagement Verify] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify engagement" },
      { status: 500 }
    );
  }
}
