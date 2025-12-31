import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

interface BulkEngageRequest {
  fid: number;
  signerUuid: string;
  castHashes: string[];
  actions: ("like" | "recast")[];
}

/**
 * Bulk Like & Recast endpoint
 * POST /api/portal/engage/bulk
 * 
 * Body: {
 *   fid: number,
 *   signerUuid: string,
 *   castHashes: string[],
 *   actions: ["like", "recast"]
 * }
 * 
 * Performs like/recast on multiple casts at once
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as BulkEngageRequest;
    const { fid, signerUuid, castHashes, actions } = body;

    console.log(`[Bulk Engage] Request: fid=${fid}, casts=${castHashes.length}, actions=${actions.join(',')}`);

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required. Please enable auto-engage first." },
        { status: 400 }
      );
    }

    if (!castHashes || castHashes.length === 0) {
      return NextResponse.json(
        { error: "castHashes array is required" },
        { status: 400 }
      );
    }

    if (!actions || actions.length === 0) {
      return NextResponse.json(
        { error: "actions array is required (like, recast)" },
        { status: 400 }
      );
    }

    const results: Array<{
      castHash: string;
      action: string;
      success: boolean;
      error?: string;
    }> = [];

    // Process each cast
    for (const castHash of castHashes) {
      for (const action of actions) {
        try {
          const endpoint = action === "like" 
            ? "https://api.neynar.com/v2/farcaster/reaction"
            : "https://api.neynar.com/v2/farcaster/recast";

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": NEYNAR_API_KEY,
            },
            body: JSON.stringify({
              signer_uuid: signerUuid,
              target: castHash,
              ...(action === "like" && { reaction_type: "like" }),
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({})) as any;
            throw new Error(errorData.message || `Failed to ${action}`);
          }

          results.push({ castHash, action, success: true });
          console.log(`[Bulk Engage] ✅ ${action} on ${castHash.substring(0, 10)}...`);

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err: any) {
          console.error(`[Bulk Engage] ❌ ${action} on ${castHash}:`, err.message);
          results.push({ castHash, action, success: false, error: err.message });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[Bulk Engage] Complete: ${successCount} success, ${failCount} failed`);

    // Update engagement_claims to mark these as completed
    // This will make them claimable in the Portal
    for (const result of results.filter(r => r.success)) {
      try {
        // Insert or update the engagement claim as verified
        await fetch(
          `${SUPABASE_URL}/rest/v1/engagement_claims`,
          {
            method: "POST",
            headers: {
              ...SUPABASE_HEADERS,
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify({
              fid,
              cast_hash: result.castHash,
              engagement_type: result.action,
              verified_at: new Date().toISOString(),
            }),
          }
        );
      } catch (dbErr) {
        console.error(`[Bulk Engage] DB error for ${result.castHash}:`, dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failCount,
      },
    });
  } catch (error: any) {
    console.error("[Bulk Engage] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to perform bulk engagement" },
      { status: 500 }
    );
  }
}
