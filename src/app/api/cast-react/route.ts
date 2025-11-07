import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { castHash, reactionType, fid: _fid, signerUuid } = await req.json();
    const apiKey = process.env.NEYNAR_API_KEY;

    if (!castHash || !reactionType) {
      return NextResponse.json(
        { error: "castHash and reactionType are required" },
        { status: 400 }
      );
    }

    if (!["like", "recast"].includes(reactionType)) {
      return NextResponse.json(
        { error: "reactionType must be 'like' or 'recast'" },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Neynar API key not configured" },
        { status: 500 }
      );
    }

    // Try to get the user's signer if not provided
    const finalSignerUuid = signerUuid;
    
    // Note: In a mini-app context, we don't have direct access to the user's signer UUID
    // The user is authenticated through the Farcaster client, but we need their signer UUID
    // to perform like/recast actions via the Neynar API.
    // 
    // Options:
    // 1. Get signer UUID from the client-side context (if available)
    // 2. Use a different approach that doesn't require signer UUID
    // 3. Have the user sign a message to get their signer UUID
    //
    // For now, we'll return an optimistic update if no signer is provided
    // The actual like/recast won't be performed on the real cast without a signer UUID

    // If we have a signer UUID, perform the actual like/recast
    if (finalSignerUuid) {
      try {
        // Use direct Neynar API call for reactions
        const reactionEndpoint = reactionType === "like" 
          ? "https://api.neynar.com/v2/farcaster/reaction"
          : "https://api.neynar.com/v2/farcaster/recast";
        
        const response = await fetch(reactionEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            signer_uuid: finalSignerUuid,
            target: castHash,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to ${reactionType} cast`);
        }

        console.log(`[Cast React] Successfully ${reactionType}d cast:`, castHash);
        return NextResponse.json({ success: true });
      } catch (apiError: any) {
        console.error("[Cast React] Neynar API error:", apiError);
        // Return error so client knows it failed
        return NextResponse.json(
          { 
            success: false, 
            error: apiError.message || "Failed to perform reaction",
            optimistic: true // Indicate this is an optimistic update
          },
          { status: 500 }
        );
      }
    }

    // If no signer UUID, return success for optimistic update
    // The client will update the UI optimistically, but the actual action won't be performed
    console.log("[Cast React] No signer UUID provided, returning optimistic update");
    return NextResponse.json({ 
      success: true,
      optimistic: true,
      message: "Reaction recorded (optimistic update - signer UUID needed for actual action)" 
    });
  } catch (error: any) {
    console.error("[Cast React] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to react to cast" },
      { status: 500 }
    );
  }
}

