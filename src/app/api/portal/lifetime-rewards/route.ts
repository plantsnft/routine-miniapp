import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// Reward amounts (must match claim routes)
const ENGAGEMENT_REWARDS: Record<string, number> = {
  like: 1_000,
  recast: 2_000,
  comment: 5_000,
};

const CREATOR_REWARD = 1_000_000; // 1M per cast

interface RewardBreakdown {
  posting: number;
  like: number;
  recast: number;
  comment: number;
  total: number;
}

function getDateFilter(period: string): string | null {
  const now = new Date();
  
  switch (period) {
    case "7d":
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    case "30d":
      now.setDate(now.getDate() - 30);
      return now.toISOString();
    case "1y":
      now.setFullYear(now.getFullYear() - 1);
      return now.toISOString();
    case "lifetime":
    default:
      return null; // No filter = all time
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get("fid");
    const period = searchParams.get("period") || "lifetime";

    if (!fid) {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    console.log(`[Lifetime Rewards] Fetching for FID ${fid}, period: ${period}`);

    const dateFilter = getDateFilter(period);
    const dateQuery = dateFilter ? `&claimed_at=gte.${dateFilter}` : "";

    // Fetch engagement claims (like, recast, comment)
    const engagementRes = await fetch(
      `${SUPABASE_URL}/rest/v1/engagement_claims?fid=eq.${fid}&claimed_at=not.is.null${dateQuery}&select=engagement_type,claimed_at`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    let engagementClaims: any[] = [];
    if (engagementRes.ok) {
      engagementClaims = await engagementRes.json();
    } else {
      console.log("[Lifetime Rewards] Failed to fetch engagement claims:", await engagementRes.text());
    }

    // Fetch creator claims (posting)
    const creatorRes = await fetch(
      `${SUPABASE_URL}/rest/v1/creator_claims?fid=eq.${fid}&claimed_at=not.is.null${dateQuery}&select=claimed_at,reward_amount`,
      {
        method: "GET",
        headers: SUPABASE_HEADERS,
      }
    );

    let creatorClaims: any[] = [];
    if (creatorRes.ok) {
      creatorClaims = await creatorRes.json();
    } else {
      console.log("[Lifetime Rewards] Failed to fetch creator claims:", await creatorRes.text());
    }

    // Calculate breakdown
    const breakdown: RewardBreakdown = {
      posting: 0,
      like: 0,
      recast: 0,
      comment: 0,
      total: 0,
    };

    // Sum engagement rewards
    for (const claim of engagementClaims) {
      const type = claim.engagement_type as string;
      const reward = ENGAGEMENT_REWARDS[type] || 0;
      
      if (type === "like") {
        breakdown.like += reward;
      } else if (type === "recast") {
        breakdown.recast += reward;
      } else if (type === "comment") {
        breakdown.comment += reward;
      }
    }

    // Sum creator rewards
    for (const claim of creatorClaims) {
      const reward = claim.reward_amount ? Number(claim.reward_amount) : CREATOR_REWARD;
      breakdown.posting += reward;
    }

    // Calculate total
    breakdown.total = breakdown.posting + breakdown.like + breakdown.recast + breakdown.comment;

    console.log(`[Lifetime Rewards] FID ${fid} (${period}):`, breakdown);

    return NextResponse.json({
      fid: Number(fid),
      period,
      breakdown,
      claimCounts: {
        posting: creatorClaims.length,
        like: engagementClaims.filter((c: any) => c.engagement_type === "like").length,
        recast: engagementClaims.filter((c: any) => c.engagement_type === "recast").length,
        comment: engagementClaims.filter((c: any) => c.engagement_type === "comment").length,
        total: creatorClaims.length + engagementClaims.length,
      },
    });
  } catch (error: any) {
    console.error("[Lifetime Rewards] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch lifetime rewards" },
      { status: 500 }
    );
  }
}

