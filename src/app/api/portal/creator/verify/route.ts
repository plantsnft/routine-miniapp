import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// Creator reward: 1,000,000 CATWALK per cast
const CREATOR_REWARD_PER_CAST = 1_000_000;

interface CreatorCast {
  castHash: string;
  castUrl: string;
  text?: string;
  timestamp: number;
  rewardAmount: number;
  hasClaimed: boolean;
  transactionHash?: string;
  verifiedAt?: string;
  claimedAt?: string;
}

/**
 * Verify creator casts in the /catwalk channel
 * POST /api/portal/creator/verify
 * Body: { fid: number }
 * 
 * Returns ALL casts from the user in /catwalk channel from last 15 days
 * Each cast can be claimed for 1,000,000 CATWALK tokens
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      const origin = request.headers.get("origin") || "";
      const allowed = new Set(["https://farcaster.xyz", "https://warpcast.com"]);
      const allowOrigin = allowed.has(origin) ? origin : "https://farcaster.xyz";
      const res = NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
      res.headers.set("Access-Control-Allow-Origin", allowOrigin);
      res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.headers.set("Access-Control-Allow-Headers", "content-type");
      res.headers.set("Access-Control-Max-Age", "86400");
      res.headers.set("Vary", "Origin");
      return res;
    }

    const apiKey = process.env.NEYNAR_API_KEY || "";
    const fifteenDaysAgo = Math.floor(Date.now() / 1000) - (15 * 24 * 60 * 60);
    
    // Step 1: Get existing claims from database
    const existingClaims = new Map<string, any>(); // castHash -> claim data
    
    try {
      const claimedRes = await fetch(
        `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (claimedRes.ok) {
        const claimedData = await claimedRes.json() as any;
        for (const claim of claimedData) {
          if (claim.cast_hash) {
            existingClaims.set(claim.cast_hash, claim);
          }
        }
      }
      console.log(`[Creator Verify] User FID ${fid} has ${existingClaims.size} existing claims in database`);
    } catch (dbErr) {
      console.error("[Creator Verify] Error fetching existing claims:", dbErr);
    }

    // Step 2: Fetch ALL user's casts from /catwalk channel from last 15 days
    const userCasts: any[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 10;

    while (hasMore && pageCount < maxPages) {
      pageCount++;
      try {
        // Fetch channel feed and filter by user's FID
        const url = cursor
          ? `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100&cursor=${cursor}`
          : `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=100`;

        const feedResponse = await fetch(url, {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        });

        if (!feedResponse.ok) {
          console.error(`[Creator Verify] Feed API error: ${feedResponse.status}`);
          break;
        }

        const feedData = await feedResponse.json() as any;
        const casts = feedData.casts || feedData.result?.casts || [];
        
        console.log(`[Creator Verify] Page ${pageCount}: Got ${casts.length} casts from feed`);
        
        if (casts.length === 0) break;

        // Filter for user's casts within 15 days
        let foundOldCast = false;
        for (const cast of casts) {
          // Parse timestamp
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

          // Check if too old
          if (castTimestamp < fifteenDaysAgo) {
            foundOldCast = true;
            continue;
          }

          // Check if this is user's cast
          const authorFid = cast.author?.fid;
          if (authorFid === fid) {
            userCasts.push({
              ...cast,
              parsedTimestamp: castTimestamp,
            });
          }
        }

        cursor = feedData.next?.cursor || null;
        hasMore = !!cursor && !foundOldCast;
        
        // If we found old casts, we've gone past the 15-day window
        if (foundOldCast) {
          console.log(`[Creator Verify] Reached end of 15-day window`);
        }
      } catch (err) {
        console.error("[Creator Verify] Error fetching feed:", err);
        break;
      }
    }

    console.log(`[Creator Verify] Found ${userCasts.length} casts from user FID ${fid} in last 15 days`);

    // Step 3: Build response with claimable status
    const creatorCasts: CreatorCast[] = [];
    
    for (const cast of userCasts) {
      const castHash = cast.hash;
      if (!castHash) continue;

      const existingClaim = existingClaims.get(castHash);
      const hasClaimed = existingClaim?.claimed_at != null;
      
      // Store in database if not already stored
      if (!existingClaim) {
        try {
          await fetch(
            `${SUPABASE_URL}/rest/v1/creator_claims`,
            {
              method: "POST",
              headers: {
                ...SUPABASE_HEADERS,
                Prefer: "resolution=ignore-duplicates",
              },
              body: JSON.stringify({
                fid,
                cast_hash: castHash,
                reward_amount: CREATOR_REWARD_PER_CAST,
                verified_at: new Date().toISOString(),
              }),
            }
          );
          console.log(`[Creator Verify] Stored new cast ${castHash.substring(0, 10)}...`);
        } catch (insertErr) {
          console.error(`[Creator Verify] Error storing cast ${castHash}:`, insertErr);
        }
      }

      const author = cast.author || {};
      creatorCasts.push({
        castHash,
        castUrl: `https://warpcast.com/${author.username || 'unknown'}/${castHash}`,
        text: cast.text?.substring(0, 150) || "",
        timestamp: cast.parsedTimestamp || 0,
        rewardAmount: CREATOR_REWARD_PER_CAST,
        hasClaimed,
        transactionHash: existingClaim?.transaction_hash || undefined,
        verifiedAt: existingClaim?.verified_at || new Date().toISOString(),
        claimedAt: existingClaim?.claimed_at || undefined,
      });
    }

    // Sort by timestamp (newest first)
    creatorCasts.sort((a, b) => b.timestamp - a.timestamp);

    // Calculate totals
    const claimableCasts = creatorCasts.filter(c => !c.hasClaimed);
    const claimedCasts = creatorCasts.filter(c => c.hasClaimed);
    const totalClaimableReward = claimableCasts.length * CREATOR_REWARD_PER_CAST;
    const totalClaimedReward = claimedCasts.length * CREATOR_REWARD_PER_CAST;

    console.log(`[Creator Verify] Summary:`, {
      totalCasts: creatorCasts.length,
      claimableCasts: claimableCasts.length,
      claimedCasts: claimedCasts.length,
      totalClaimableReward,
      totalClaimedReward,
    });

    const origin = request.headers.get("origin") || "";
    const allowed = new Set(["https://farcaster.xyz", "https://warpcast.com"]);
    const allowOrigin = allowed.has(origin) ? origin : "https://farcaster.xyz";
    const res = NextResponse.json({
      fid,
      creatorCasts,
      claimableCasts,
      claimedCasts,
      totalCasts: creatorCasts.length,
      claimableCount: claimableCasts.length,
      claimedCount: claimedCasts.length,
      totalClaimableReward,
      totalClaimedReward,
      rewardPerCast: CREATOR_REWARD_PER_CAST,
    });
    res.headers.set("Access-Control-Allow-Origin", allowOrigin);
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "content-type");
    res.headers.set("Access-Control-Max-Age", "86400");
    res.headers.set("Vary", "Origin");
    return res;
  } catch (error: any) {
    console.error("[Creator Verify] Error:", error);
    const origin = request.headers.get("origin") || "";
    const allowed = new Set(["https://farcaster.xyz", "https://warpcast.com"]);
    const allowOrigin = allowed.has(origin) ? origin : "https://farcaster.xyz";
    const res = NextResponse.json(
      { error: error.message || "Failed to verify creator casts" },
      { status: 500 }
    );
    res.headers.set("Access-Control-Allow-Origin", allowOrigin);
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "content-type");
    res.headers.set("Access-Control-Max-Age", "86400");
    res.headers.set("Vary", "Origin");
    return res;
  }
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = new Set(["https://farcaster.xyz", "https://warpcast.com"]);
  const allowOrigin = allowed.has(origin) ? origin : "https://farcaster.xyz"; // safe default to pass embed
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "X-Cors-Debug-Origin": origin,
      "X-Cors-Debug-Allow": allowOrigin,
    },
  });
}