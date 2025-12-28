import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

/**
 * Verify that a creator has posted to the Catwalk channel
 * POST /api/portal/creator/verify
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

    // Check if already verified/claimed
    try {
      const existingRes = await fetch(
        `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}&limit=1`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (existingRes.ok) {
        const existing = await existingRes.json();
        if (existing && existing.length > 0) {
          return NextResponse.json({
            isEligible: true,
            hasClaimed: !!existing[0].claimed_at,
            castHash: existing[0].cast_hash,
            rewardAmount: parseFloat(existing[0].reward_amount || "500000"),
            transactionHash: existing[0].transaction_hash || undefined,
            verifiedAt: existing[0].verified_at,
          });
        }
      }
    } catch (err) {
      console.error("[Creator Verify] Error checking existing claim:", err);
    }

    // Fetch casts from Catwalk channel and find user's cast
    let castFound = null;

    try {
      // Fetch casts from the catwalk channel feed
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
        const feedCasts = feedData.casts || feedData.result?.casts || [];

        // Find a cast by this user
        const userCast = feedCasts.find((c: any) => c.author?.fid === fid);
        if (userCast) {
          castFound = userCast;
        }
      }

      if (!castFound) {
        return NextResponse.json(
          {
            error: "No cast found in /catwalk channel for this creator",
            isEligible: false,
          },
          { status: 404 }
        );
      }

      // Verify the cast is actually in the channel
      if (castFound.parent_url !== CATWALK_CHANNEL_PARENT_URL) {
        return NextResponse.json(
          {
            error: "Cast is not in the /catwalk channel",
            isEligible: false,
          },
          { status: 400 }
        );
      }

      // Store verification in database
      const claimData = {
        fid: fid,
        cast_hash: castFound.hash,
        reward_amount: 500000, // 500k CATWALK
        verified_at: new Date().toISOString(),
      };

      const insertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/creator_claims`,
        {
          method: "POST",
          headers: {
            ...SUPABASE_HEADERS,
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify([claimData]),
        }
      );

      if (!insertRes.ok) {
        const errorText = await insertRes.text();
        console.error("[Creator Verify] Error inserting claim:", errorText);
        throw new Error("Failed to store verification");
      }

      const inserted = await insertRes.json();
      const claim = inserted && inserted.length > 0 ? inserted[0] : claimData;

      return NextResponse.json({
        isEligible: true,
        hasClaimed: false,
        castHash: claim.cast_hash,
        rewardAmount: parseFloat(claim.reward_amount || "500000"),
        verifiedAt: claim.verified_at,
      });
    } catch (apiError: any) {
      console.error("[Creator Verify] Neynar API error:", apiError);
      return NextResponse.json(
        {
          error: apiError.message || "Failed to verify creator cast",
          isEligible: false,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[Creator Verify] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify creator" },
      { status: 500 }
    );
  }
}
