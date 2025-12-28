import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

/**
 * Get claim status for a user (creator and engagement claims)
 * GET /api/portal/status?fid={fid}
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fidParam = searchParams.get("fid");

    if (!fidParam) {
      return NextResponse.json(
        { error: "fid parameter is required" },
        { status: 400 }
      );
    }

    const fid = parseInt(fidParam);
    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid fid" },
        { status: 400 }
      );
    }

    // Fetch creator claim status
    let creatorClaim = null;
    try {
      const creatorRes = await fetch(
        `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}&limit=1`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (creatorRes.ok) {
        const creatorData = await creatorRes.json() as any;
        if (creatorData && creatorData.length > 0) {
          creatorClaim = {
            isEligible: true,
            hasClaimed: !!creatorData[0].claimed_at,
            castHash: creatorData[0].cast_hash,
            rewardAmount: parseFloat(creatorData[0].reward_amount || "500000"),
            transactionHash: creatorData[0].transaction_hash || undefined,
            verifiedAt: creatorData[0].verified_at,
          };
        }
      }
    } catch (err) {
      console.error("[Portal Status] Error fetching creator claim:", err);
    }

    // Fetch engagement claim status
    let engagementData = null;
    try {
      const engagementRes = await fetch(
        `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}`,
        {
          method: "GET",
          headers: SUPABASE_HEADERS,
        }
      );

      if (engagementRes.ok) {
        const engagementClaims = await engagementRes.json() as any;
        const claimed = engagementClaims.filter((c: any) => c.claimed_at);
        const unclaimed = engagementClaims.filter((c: any) => !c.claimed_at);

        engagementData = {
          eligibleCount: unclaimed.length,
          claimedCount: claimed.length,
          totalReward: engagementClaims.reduce(
            (sum: number, c: any) => sum + parseFloat(c.reward_amount || "0"),
            0
          ),
          claims: engagementClaims.map((c: any) => ({
            castHash: c.cast_hash,
            engagementType: c.engagement_type,
            rewardAmount: parseFloat(c.reward_amount || "0"),
            claimed: !!c.claimed_at,
          })),
        };
      }
    } catch (err) {
      console.error("[Portal Status] Error fetching engagement claims:", err);
    }

    return NextResponse.json({
      creator: creatorClaim,
      engagement: engagementData,
    });
  } catch (error: any) {
    console.error("[Portal Status] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch claim status" },
      { status: 500 }
    );
  }
}
