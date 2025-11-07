import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

export async function POST(req: NextRequest) {
  try {
    const { castHash, reactionType, fid } = await req.json();

    if (!castHash || !reactionType || !fid) {
      return NextResponse.json(
        { error: "castHash, reactionType, and fid are required" },
        { status: 400 }
      );
    }

    if (!["like", "recast"].includes(reactionType)) {
      return NextResponse.json(
        { error: "reactionType must be 'like' or 'recast'" },
        { status: 400 }
      );
    }

    // Note: To actually like/recast, we need the user's signer UUID
    // For now, we'll return success but the actual action needs to be done client-side
    // or with proper signer authentication
    
    // The best approach in a mini-app is to use actions.openUrl to open the cast
    // and let the user like/recast in Farcaster, or use the Neynar API with signer
    
    return NextResponse.json({ 
      success: true,
      message: "Please use the Farcaster interface to like/recast" 
    });
  } catch (error: any) {
    console.error("[Cast React] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to react to cast" },
      { status: 500 }
    );
  }
}

