import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "~/lib/supabaseAdmin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";
const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// Channel feed cache TTL: 5 minutes
const CHANNEL_FEED_CACHE_TTL_MS = 5 * 60 * 1000;

// Reward amounts per engagement type (must match other routes)
const ENGAGEMENT_REWARDS: Record<string, number> = {
  like: 1_000,    // 1k CATWALK per like
  recast: 2_000,  // 2k CATWALK per recast
};

/**
 * Cron job for auto-engagement
 * GET /api/cron/auto-engage
 * 
 * This runs hourly (Vercel free tier limitation) and:
 * 1. Finds new casts in /catwalk from the last 70 minutes
 * 2. For users with auto_engage_enabled = true
 * 3. Performs like + recast on those casts
 * 
 * Schedule this in vercel.json as a cron job
 */
export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log("[Auto-Engage Cron] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Auto-Engage Cron] Starting auto-engagement job...");

  try {
    // Step 1: Get all users with auto-engage enabled
    const usersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_engage_preferences?auto_engage_enabled=eq.true&signer_uuid=not.is.null`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    if (!usersRes.ok) {
      throw new Error("Failed to fetch auto-engage users");
    }

    const autoEngageUsers = await usersRes.json() as any[];
    console.log(`[Auto-Engage Cron] Found ${autoEngageUsers.length} users with auto-engage enabled`);

    if (autoEngageUsers.length === 0) {
      return NextResponse.json({ message: "No users with auto-engage enabled", processed: 0 });
    }

    // ===== PHASE 2.2: USE CHANNEL FEED CACHE =====
    // Step 2: Get recent casts from /catwalk using cached feed (5-minute TTL)
    // 70 minutes = 60 min for hourly cron + 10 min buffer for execution variance
    const seventyMinutesAgo = Math.floor(Date.now() / 1000) - (70 * 60);
    let allCasts: any[] = [];
    let usedCache = false;

    try {
      const supabase = getSupabaseAdmin();
      const { data: cacheData, error: cacheError } = await supabase
        .from("channel_feed_cache")
        .select("as_of, payload")
        .eq("channel_id", "catwalk")
        .single() as { data: { as_of: string; payload: any } | null; error: any };

      if (!cacheError && cacheData) {
        const cacheAge = Date.now() - new Date(cacheData.as_of).getTime();
        if (cacheAge < CHANNEL_FEED_CACHE_TTL_MS) {
          // Cache is valid - use cached feed
          const cachedPayload = cacheData.payload as any;
          allCasts = cachedPayload.casts || [];
          usedCache = true;
          console.log(`[Auto-Engage Cron] ✅ Using cached channel feed (age: ${Math.round(cacheAge / 1000)}s, ${allCasts.length} casts)`);
        } else {
          console.log(`[Auto-Engage Cron] ⏰ Cache STALE (age: ${Math.round(cacheAge / 1000)}s), fetching fresh...`);
        }
      }
    } catch (cacheErr) {
      console.warn("[Auto-Engage Cron] Cache check failed (non-fatal), fetching fresh:", cacheErr);
    }

    // If cache miss or stale, fetch fresh feed
    if (!usedCache) {
      try {
        const castsRes = await fetch(
          `https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=catwalk&limit=25&with_recasts=false`,
          {
            headers: {
              "x-api-key": NEYNAR_API_KEY,
            },
          }
        );

        if (!castsRes.ok) {
          throw new Error("Failed to fetch channel feed");
        }

        const castsData = await castsRes.json() as any;
        allCasts = castsData.casts || [];
        console.log(`[Auto-Engage Cron] 📡 Fetched ${allCasts.length} casts from API`);

        // Store in cache for future use
        try {
          const supabase = getSupabaseAdmin();
          const { error: storeError } = await supabase
            .from("channel_feed_cache")
            .upsert({
              channel_id: "catwalk",
              as_of: new Date().toISOString(),
              payload: { casts: allCasts },
              updated_at: new Date().toISOString(),
            } as any, {
              onConflict: "channel_id",
            });

          if (storeError) {
            console.warn("[Auto-Engage Cron] Failed to store cache (non-fatal):", storeError.message);
          } else {
            console.log(`[Auto-Engage Cron] ✅ Stored ${allCasts.length} casts in cache`);
          }
        } catch (storeErr) {
          console.warn("[Auto-Engage Cron] Cache storage error (non-fatal):", storeErr);
        }
      } catch (apiErr) {
        console.error("[Auto-Engage Cron] Failed to fetch channel feed:", apiErr);
        throw apiErr;
      }
    }
    // ===== END CHANNEL FEED CACHE =====

    // Filter to casts from last 70 minutes and in /catwalk channel
    const recentCasts = allCasts.filter((cast: any) => {
      const timestamp = new Date(cast.timestamp).getTime() / 1000;
      const isRecent = timestamp >= seventyMinutesAgo;
      const isInChannel = cast.parent_url === CATWALK_CHANNEL_PARENT_URL;
      return isRecent && isInChannel;
    });

    console.log(`[Auto-Engage Cron] Found ${recentCasts.length} recent casts to potentially engage with`);

    if (recentCasts.length === 0) {
      return NextResponse.json({ message: "No recent casts to engage with", processed: 0 });
    }

    let totalEngagements = 0;
    let successfulEngagements = 0;
    const errors: string[] = [];

    // Step 3: For each user, engage with casts they haven't engaged with yet
    for (const user of autoEngageUsers) {
      const fid = user.fid;
      const signerUuid = user.signer_uuid;

      if (!signerUuid) continue;

      // Verify signer is still approved before using it
      try {
        const signerCheck = await fetch(
          `https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signerUuid}`,
          {
            headers: {
              "x-api-key": NEYNAR_API_KEY,
            },
          }
        );

        if (signerCheck.ok) {
          const signerData = await signerCheck.json() as any;
          if (signerData.status !== "approved") {
            console.log(`[Auto-Engage Cron] ⚠️ FID ${fid} signer not approved (status: ${signerData.status}), skipping`);
            continue;
          }
        } else {
          console.warn(`[Auto-Engage Cron] ⚠️ Could not verify signer for FID ${fid}, proceeding anyway`);
          // Non-fatal: proceed with engagement attempt
        }
      } catch (signerErr) {
        console.warn(`[Auto-Engage Cron] Signer check failed for FID ${fid} (non-fatal):`, signerErr);
        // Non-fatal: proceed with engagement attempt
      }

      for (const cast of recentCasts) {
        // Don't engage with your own casts
        if (cast.author?.fid === fid) continue;

        const castHash = cast.hash;

        // ===== PHASE 3: SMART ENGAGEMENT TRACKING =====
        // Check if user already engaged with this cast (from webhook-populated engagements table)
        // This avoids duplicate API calls if webhook already recorded the engagement
        try {
          const engagementCheck = await fetch(
            `${SUPABASE_URL}/rest/v1/engagements?user_fid=eq.${fid}&cast_hash=eq.${castHash}&engagement_type=in.(like,recast)&limit=1`,
            {
              method: "GET",
              headers: SUPABASE_HEADERS,
            }
          );

          if (engagementCheck.ok) {
            const engagementData = await engagementCheck.json() as any[];
            if (engagementData && engagementData.length > 0) {
              // User already engaged (webhook recorded it) - skip
              console.log(`[Auto-Engage Cron] ⏭️ FID ${fid} already engaged with cast ${castHash.substring(0, 10)} (from webhook data)`);
              continue;
            }
          }
        } catch (engagementErr) {
          // Non-fatal: if check fails, continue with engagement attempt
          console.warn(`[Auto-Engage Cron] Engagement check failed (non-fatal):`, engagementErr);
        }

        // Check if we already processed this cast for this user (queue check)
        const queueCheck = await fetch(
          `${SUPABASE_URL}/rest/v1/auto_engage_queue?fid=eq.${fid}&cast_hash=eq.${castHash}&limit=1`,
          {
            method: "GET",
            headers: SUPABASE_HEADERS,
          }
        );

        const queueData = await queueCheck.json() as any[];
        if (queueData && queueData.length > 0) {
          // Already processed
          continue;
        }
        // ===== END SMART TRACKING =====

        // Perform like
        try {
          totalEngagements++;
          
          const likeRes = await fetch("https://api.neynar.com/v2/farcaster/reaction", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": NEYNAR_API_KEY,
            },
            body: JSON.stringify({
              signer_uuid: signerUuid,
              reaction_type: "like",
              target: castHash,
            }),
          });

          const likeSuccess = likeRes.ok;
          if (likeSuccess) {
            successfulEngagements++;
            console.log(`[Auto-Engage Cron] ✅ FID ${fid} liked ${castHash.substring(0, 10)}...`);
          } else {
            const errorText = await likeRes.text().catch(() => "Unknown error");
            console.error(`[Auto-Engage Cron] ❌ Failed to like for FID ${fid}, cast ${castHash.substring(0, 10)}: ${likeRes.status} ${errorText}`);
            errors.push(`FID ${fid} like failed: ${likeRes.status}`);
          }

          // Small delay
          await new Promise(r => setTimeout(r, 100));

          // Perform recast (using reaction endpoint with recast type)
          totalEngagements++;
          
          const recastRes = await fetch("https://api.neynar.com/v2/farcaster/reaction", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": NEYNAR_API_KEY,
            },
            body: JSON.stringify({
              signer_uuid: signerUuid,
              reaction_type: "recast",
              target: castHash,
            }),
          });

          const recastSuccess = recastRes.ok;
          if (recastSuccess) {
            successfulEngagements++;
            console.log(`[Auto-Engage Cron] ✅ FID ${fid} recasted ${castHash.substring(0, 10)}...`);
          } else {
            const errorText = await recastRes.text().catch(() => "Unknown error");
            console.error(`[Auto-Engage Cron] ❌ Failed to recast for FID ${fid}, cast ${castHash.substring(0, 10)}: ${recastRes.status} ${errorText}`);
            errors.push(`FID ${fid} recast failed: ${recastRes.status}`);
          }

          // Record in queue so we don't repeat
          await fetch(
            `${SUPABASE_URL}/rest/v1/auto_engage_queue`,
            {
              method: "POST",
              headers: {
                ...SUPABASE_HEADERS,
                Prefer: "resolution=ignore-duplicates",
              },
              body: JSON.stringify({
                fid,
                cast_hash: castHash,
                action_type: "like_recast",
                scheduled_for: new Date().toISOString(),
                executed_at: new Date().toISOString(),
                success: true,
              }),
            }
          );

          // Create engagement claims ONLY for successful API calls
          // Create engagement claim for like (if succeeded)
          if (likeSuccess) {
            try {
              const likeClaimRes = await fetch(
                `${SUPABASE_URL}/rest/v1/engagement_claims`,
                {
                  method: "POST",
                  headers: {
                    ...SUPABASE_HEADERS,
                    Prefer: "resolution=ignore-duplicates",
                  },
                  body: JSON.stringify({
                    fid,
                    cast_hash: castHash,
                    engagement_type: "like",
                    reward_amount: ENGAGEMENT_REWARDS.like,
                    verified_at: new Date().toISOString(),
                  }),
                }
              );

              if (!likeClaimRes.ok) {
                const errorText = await likeClaimRes.text();
                console.error(`[Auto-Engage Cron] Failed to create like engagement_claim for FID ${fid}, cast ${castHash.substring(0, 10)}:`, errorText);
              } else {
                console.log(`[Auto-Engage Cron] ✅ Created like engagement_claim (${ENGAGEMENT_REWARDS.like} CATWALK)`);
              }
            } catch (claimErr) {
              console.error(`[Auto-Engage Cron] Error creating like engagement_claim:`, claimErr);
              // Non-fatal: log but don't fail the job
            }
          }

          // Create engagement claim for recast (if succeeded)
          if (recastSuccess) {
            try {
              const recastClaimRes = await fetch(
                `${SUPABASE_URL}/rest/v1/engagement_claims`,
                {
                  method: "POST",
                  headers: {
                    ...SUPABASE_HEADERS,
                    Prefer: "resolution=ignore-duplicates",
                  },
                  body: JSON.stringify({
                    fid,
                    cast_hash: castHash,
                    engagement_type: "recast",
                    reward_amount: ENGAGEMENT_REWARDS.recast,
                    verified_at: new Date().toISOString(),
                  }),
                }
              );

              if (!recastClaimRes.ok) {
                const errorText = await recastClaimRes.text();
                console.error(`[Auto-Engage Cron] Failed to create recast engagement_claim for FID ${fid}, cast ${castHash.substring(0, 10)}:`, errorText);
              } else {
                console.log(`[Auto-Engage Cron] ✅ Created recast engagement_claim (${ENGAGEMENT_REWARDS.recast} CATWALK)`);
              }
            } catch (claimErr) {
              console.error(`[Auto-Engage Cron] Error creating recast engagement_claim:`, claimErr);
              // Non-fatal: log but don't fail the job
            }
          }

        } catch (err: any) {
          console.error(`[Auto-Engage Cron] Error for FID ${fid}:`, err.message);
          errors.push(`FID ${fid}: ${err.message}`);
        }

        // Rate limiting delay between users
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`[Auto-Engage Cron] Complete! ${successfulEngagements}/${totalEngagements} successful`);

    return NextResponse.json({
      success: true,
      message: `Auto-engagement complete`,
      stats: {
        usersProcessed: autoEngageUsers.length,
        castsFound: recentCasts.length,
        totalAttempts: totalEngagements,
        successful: successfulEngagements,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[Auto-Engage Cron] Error:", error);
    return NextResponse.json(
      { error: error.message || "Auto-engage cron failed" },
      { status: 500 }
    );
  }
}

