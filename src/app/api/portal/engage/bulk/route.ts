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

export async function POST(request: Request) {
  try {
    const body = await request.json() as BulkEngageRequest;
    const { fid, signerUuid, castHashes, actions } = body;

    console.log(`[Bulk Engage] Request: fid=${fid}, casts=${castHashes.length}, actions=${actions.join(",")}`);

    if (!fid || typeof fid !== "number") {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }
    if (!signerUuid) {
      return NextResponse.json({ error: "signerUuid is required" }, { status: 400 });
    }
    if (!castHashes || castHashes.length === 0) {
      return NextResponse.json({ error: "castHashes required" }, { status: 400 });
    }
    if (!actions || actions.length === 0) {
      return NextResponse.json({ error: "actions required" }, { status: 400 });
    }

    const results: Array<{ castHash: string; action: string; success: boolean; error?: string }> = [];

    for (const castHash of castHashes) {
      for (const action of actions) {
        try {
          // Both like and recast use same endpoint with reaction_type
          const response = await fetch("https://api.neynar.com/v2/farcaster/reaction", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": NEYNAR_API_KEY,
            },
            body: JSON.stringify({
              signer_uuid: signerUuid,
              reaction_type: action,
              target: castHash,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Failed to ${action}`;
            try {
              const errorData = JSON.parse(errorText) as any;
              errorMessage = errorData.message || errorMessage;
            } catch { errorMessage = errorText || errorMessage; }
            throw new Error(errorMessage);
          }

          results.push({ castHash, action, success: true });
          console.log(`[Bulk Engage] OK ${action} on ${castHash.substring(0, 10)}`);
          await new Promise(r => setTimeout(r, 100));
        } catch (err: any) {
          console.error(`[Bulk Engage] ERR ${action} on ${castHash}:`, err.message);
          results.push({ castHash, action, success: false, error: err.message });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`[Bulk Engage] Done: ${successCount} ok, ${failCount} fail`);

    return NextResponse.json({
      success: true,
      results,
      summary: { total: results.length, successful: successCount, failed: failCount },
    });
  } catch (error: any) {
    console.error("[Bulk Engage] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}