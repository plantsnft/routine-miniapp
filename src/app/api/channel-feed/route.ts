import { NextResponse } from "next/server";

const CATWALK_CHANNEL_ID = "catwalk";

export async function GET() {
  try {
    const apiKey = process.env.NEYNAR_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "Neynar API key not configured" },
        { status: 500 }
      );
    }

    // Fetch casts from the Catwalk channel using Neynar API
    // Using direct API call since the SDK doesn't have fetchCasts method
    try {
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/channel/casts?channel_id=${CATWALK_CHANNEL_ID}&limit=5`,
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
      const casts = data.result?.casts || data.casts || [];
      
      // Format the casts for the feed
      const formattedCasts = casts.map((cast: any) => {
        // Extract images/embeds from the cast
        const images: string[] = [];
        if (cast.embeds) {
          cast.embeds.forEach((embed: any) => {
            if (embed.url && embed.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
              images.push(embed.url);
            } else if (embed.images && Array.isArray(embed.images)) {
              embed.images.forEach((img: any) => {
                if (typeof img === 'string') {
                  images.push(img);
                } else if (img.url) {
                  images.push(img.url);
                }
              });
            }
          });
        }

        return {
          hash: cast.hash,
          text: cast.text || "",
          author: {
            fid: cast.author?.fid || 0,
            username: cast.author?.username || "unknown",
            displayName: cast.author?.display_name || cast.author?.username || "Unknown",
            pfp: cast.author?.pfp?.url || cast.author?.pfp_url || null,
          },
          timestamp: cast.timestamp || new Date().toISOString(),
          images,
          likes: cast.reactions?.likes?.length || cast.reactions?.likes_count || 0,
          recasts: cast.reactions?.recasts?.length || cast.reactions?.recasts_count || 0,
          replies: cast.replies?.count || 0,
          url: `https://warpcast.com/${cast.author?.username || "unknown"}/${cast.hash || ""}`,
        };
      });

      return NextResponse.json({
        casts: formattedCasts,
        count: formattedCasts.length,
      });
    } catch (error: any) {
      console.error("[Channel Feed] Error fetching casts:", error);
      
      return NextResponse.json(
        { error: "Unable to fetch channel feed", casts: [] },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[Channel Feed] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch channel feed", casts: [] },
      { status: 500 }
    );
  }
}

