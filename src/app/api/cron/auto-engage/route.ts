import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";
const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

/**
 * Cron job for auto-engagement
 * GET /api/cron/auto-engage
 * 
 * This runs every minute and:
 * 1. Finds new casts in /catwalk from the last 6 minutes
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

    // Step 2: Get recent casts from /catwalk (last 10 minutes, to catch any we might have missed)
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - (10 * 60);
    
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
    const allCasts = castsData.casts || [];

    // Filter to casts from last 10 minutes and in /catwalk channel
    const recentCasts = allCasts.filter((cast: any) => {
      const timestamp = new Date(cast.timestamp).getTime() / 1000;
      const isRecent = timestamp >= tenMinutesAgo;
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

      for (const cast of recentCasts) {
        // Don't engage with your own casts
        if (cast.author?.fid === fid) continue;

        const castHash = cast.hash;

        // Check if we already processed this cast for this user
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

          if (likeRes.ok) {
            successfulEngagements++;
            console.log(`[Auto-Engage Cron] ✅ FID ${fid} liked ${castHash.substring(0, 10)}...`);
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

          if (recastRes.ok) {
            successfulEngagements++;
            console.log(`[Auto-Engage Cron] ✅ FID ${fid} recasted ${castHash.substring(0, 10)}...`);
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

          // Also create engagement claims for rewards
          for (const action of ["like", "recast"]) {
            await fetch(
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
                  engagement_type: action,
                  verified_at: new Date().toISOString(),
                }),
              }
            );
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

