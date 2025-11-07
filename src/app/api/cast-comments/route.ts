import { NextRequest, NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const castHash = searchParams.get("castHash");

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    const client = getNeynarClient();
    
    // Fetch cast with replies (comments)
    const cast = await client.lookUpCastByHash({
      hash: castHash,
      type: "hash",
    });

    // Extract replies from the cast
    const replies = cast.cast?.replies?.casts || [];
    
    // Format comments for the frontend
    const comments = replies.map((reply: any) => ({
      hash: reply.hash,
      text: reply.text,
      timestamp: reply.timestamp,
      author: {
        fid: reply.author.fid,
        username: reply.author.username,
        display_name: reply.author.display_name,
        pfp: reply.author.pfp?.url,
      },
    }));

    return NextResponse.json({ comments });
  } catch (error: any) {
    console.error("[Cast Comments] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch comments", comments: [] },
      { status: 500 }
    );
  }
}

