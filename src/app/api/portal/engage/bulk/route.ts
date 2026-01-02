import { NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

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
      return NextResponse.json({ error: "signerUuid is required. Please enable auto-engage first." }, { status: 400 });
    }
    if (!castHashes || castHashes.length === 0) {
      return NextResponse.json({ error: "castHashes required" }, { status: 400 });
    }
    if (!actions || actions.length === 0) {
      return NextResponse.json({ error: "actions required" }, { status: 400 });
    }

    // First, check if the signer is approved
    console.log(`[Bulk Engage] Checking signer status...`);
    const signerCheck = await fetch(`https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signerUuid}`, {
      headers: { "x-api-key": NEYNAR_API_KEY },
    });
    
    if (!signerCheck.ok) {
      console.error(`[Bulk Engage] Signer check failed:`, await signerCheck.text());
      return NextResponse.json({ 
        error: "Invalid signer. Please re-enable auto-engage.",
        needsReauth: true 
      }, { status: 400 });
    }

    const signerData = await signerCheck.json() as any;
    console.log(`[Bulk Engage] Signer status:`, signerData.status);

    if (signerData.status !== "approved") {
      // Return the approval URL if available
      const approvalUrl = signerData.signer_approval_url;
      console.log(`[Bulk Engage] Signer not approved. Status: ${signerData.status}, approvalUrl: ${approvalUrl ? "present" : "missing"}`);
      return NextResponse.json({ 
        error: `Signer not approved (status: ${signerData.status}). Please authorize in Warpcast first.`,
        needsApproval: true,
        approvalUrl: approvalUrl || null,
        status: signerData.status
      }, { status: 400 });
    }

    const results: Array<{ castHash: string; action: string; success: boolean; error?: string }> = [];

    for (const castHash of castHashes) {
      for (const action of actions) {
        try {
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