import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

const CATWALK_CHANNEL_ID = "catwalk";

export async function GET() {
  try {
    const apiKey = process.env.NEYNAR_API_KEY;
    
    if (!apiKey) {
      console.error("[Channel Feed] NEYNAR_API_KEY not configured");
      return NextResponse.json(
        { error: "Neynar API key not configured" },
        { status: 500 }
      );
    }

    // Fetch casts from the Catwalk channel using Neynar API
    // Try multiple endpoint formats to find the correct one
    let casts: any[] = [];
    let lastError: any = null;

    // Strategy 1: Try using parent_url parameter (channels are often accessed via parent_url)
    try {
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&parent_url=https://warpcast.com/~/channel/${CATWALK_CHANNEL_ID}&limit=5`,
        {
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        casts = data.casts || data.result?.casts || [];
        if (casts.length > 0) {
          console.log(`[Channel Feed] Successfully fetched ${casts.length} casts using parent_url strategy`);
        }
      } else {
        const errorText = await response.text().catch(() => response.statusText);
        console.log(`[Channel Feed] Strategy 1 (parent_url) failed: ${response.status} ${errorText}`);
        lastError = new Error(`Strategy 1 failed: ${response.status} ${errorText}`);
      }
    } catch (error: any) {
      console.log(`[Channel Feed] Strategy 1 (parent_url) error:`, error?.message);
      lastError = error;
    }

    // Strategy 2: Try channel_id parameter with v2 endpoint
    if (casts.length === 0) {
      try {
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/channel/casts?channel_id=${CATWALK_CHANNEL_ID}&limit=5`,
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          casts = data.casts || data.result?.casts || [];
          if (casts.length > 0) {
            console.log(`[Channel Feed] Successfully fetched ${casts.length} casts using channel_id strategy`);
          }
        } else {
          const errorText = await response.text().catch(() => response.statusText);
          console.log(`[Channel Feed] Strategy 2 (channel_id) failed: ${response.status} ${errorText}`);
          lastError = new Error(`Strategy 2 failed: ${response.status} ${errorText}`);
        }
      } catch (error: any) {
        console.log(`[Channel Feed] Strategy 2 (channel_id) error:`, error?.message);
        lastError = error;
      }
    }

    // Strategy 3: Try using the Neynar SDK client's feed method
    if (casts.length === 0) {
      try {
        const client = getNeynarClient();
        // Try using fetchFeed method if available
        const feedResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&channel_id=${CATWALK_CHANNEL_ID}&limit=5`,
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        if (feedResponse.ok) {
          const data = await feedResponse.json();
          casts = data.casts || data.result?.casts || [];
          if (casts.length > 0) {
            console.log(`[Channel Feed] Successfully fetched ${casts.length} casts using feed endpoint`);
          }
        } else {
          const errorText = await feedResponse.text().catch(() => feedResponse.statusText);
          console.log(`[Channel Feed] Strategy 3 (feed endpoint) failed: ${feedResponse.status} ${errorText}`);
          lastError = new Error(`Strategy 3 failed: ${feedResponse.status} ${errorText}`);
        }
      } catch (error: any) {
        console.log(`[Channel Feed] Strategy 3 (feed endpoint) error:`, error?.message);
        lastError = error;
      }
    }

    if (casts.length === 0) {
      console.error("[Channel Feed] All strategies failed. Last error:", lastError);
      return NextResponse.json(
        { 
          error: "Unable to fetch channel feed. Please check the channel ID and API key.",
          casts: [],
          debug: lastError?.message || "No casts found via any strategy"
        },
        { status: 500 }
      );
    }

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
    console.error("[Channel Feed] Unexpected error:", error);
    return NextResponse.json(
      { 
        error: error?.message || "Failed to fetch channel feed", 
        casts: [],
        debug: error?.stack || "Unknown error"
      },
      { status: 500 }
    );
  }
}

