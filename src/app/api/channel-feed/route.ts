import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

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

    try {
      const client = getNeynarClient();
      
      // Fetch casts from the Catwalk channel
      // Using the Neynar SDK's fetchCasts method with channel filter
      const result = await client.fetchCasts({
        channelId: CATWALK_CHANNEL_ID,
        limit: 5,
      });

      // Extract casts from the response
      const casts = result.casts || [];
      
      // Format the casts for the feed
      const formattedCasts = casts.map((cast: any) => {
        // Extract images/embeds from the cast
        const images: string[] = [];
        if (cast.embeds) {
          cast.embeds.forEach((embed: any) => {
            if (embed.url && (embed.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || embed.images)) {
              images.push(embed.url);
            } else if (embed.images && embed.images.length > 0) {
              images.push(...embed.images.map((img: any) => img.url || img));
            }
          });
        }

        return {
          hash: cast.hash,
          text: cast.text,
          author: {
            fid: cast.author.fid,
            username: cast.author.username,
            displayName: cast.author.display_name || cast.author.username,
            pfp: cast.author.pfp?.url || cast.author.pfp_url,
          },
          timestamp: cast.timestamp,
          images,
          likes: cast.reactions?.likes?.length || 0,
          recasts: cast.reactions?.recasts?.length || 0,
          replies: cast.replies?.count || 0,
          url: `https://warpcast.com/${cast.author.username}/${cast.hash}`,
        };
      });

      return NextResponse.json({
        casts: formattedCasts,
        count: formattedCasts.length,
      });
    } catch (error: any) {
      console.error("[Channel Feed] Error fetching casts:", error);
      
      // Fallback: Try direct API call
      try {
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/cast?channel_id=${CATWALK_CHANNEL_ID}&limit=5`,
          {
            headers: {
              "x-api-key": apiKey,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const casts = data.result?.casts || data.casts || [];
          
          const formattedCasts = casts.map((cast: any) => {
            const images: string[] = [];
            if (cast.embeds) {
              cast.embeds.forEach((embed: any) => {
                if (embed.url && embed.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                  images.push(embed.url);
                }
              });
            }

            return {
              hash: cast.hash,
              text: cast.text,
              author: {
                fid: cast.author?.fid,
                username: cast.author?.username,
                displayName: cast.author?.display_name || cast.author?.username,
                pfp: cast.author?.pfp?.url || cast.author?.pfp_url,
              },
              timestamp: cast.timestamp,
              images,
              likes: cast.reactions?.likes?.length || 0,
              recasts: cast.reactions?.recasts?.length || 0,
              replies: cast.replies?.count || 0,
              url: `https://warpcast.com/${cast.author?.username}/${cast.hash}`,
            };
          });

          return NextResponse.json({
            casts: formattedCasts,
            count: formattedCasts.length,
          });
        }
      } catch (apiError: any) {
        console.error("[Channel Feed] Direct API call also failed:", apiError);
      }
      
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

