import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const castHash = searchParams.get("castHash");
    const apiKey = process.env.NEYNAR_API_KEY;

    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Neynar API key not configured", comments: [] },
        { status: 500 }
      );
    }

    // Fetch cast with replies (comments) using direct API call
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/cast?identifier=${castHash}&type=hash`,
      {
        headers: {
          "x-api-key": apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.statusText}`);
    }

    const data = await response.json();
    const cast = data.cast;

    // Extract replies from the cast
    const replies = cast?.replies?.casts || [];
    
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

