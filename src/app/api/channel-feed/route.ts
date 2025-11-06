import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

const CATWALK_CHANNEL_ID = "catwalk";
const CATWALK_CHANNEL_PARENT_URL = `https://warpcast.com/~/channel/${CATWALK_CHANNEL_ID}`;

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
    const debugInfo: string[] = [];

    // Strategy 1: Try using fetchFeed with parent_url (most common for channels)
    try {
      const client = getNeynarClient();
      console.log("[Channel Feed] Strategy 1: Trying fetchFeed with parent_url");
      
      // Check if fetchFeed method exists on the client
      if (typeof (client as any).fetchFeed === 'function') {
        try {
          const feedResponse = await (client as any).fetchFeed({
            feedType: 'channel',
            parentUrl: CATWALK_CHANNEL_PARENT_URL,
            limit: 5,
          });
          
          casts = feedResponse?.casts || feedResponse?.result?.casts || [];
          if (casts.length > 0) {
            console.log(`[Channel Feed] ✅ Strategy 1 (SDK fetchFeed) succeeded: ${casts.length} casts`);
            debugInfo.push(`Strategy 1 (SDK fetchFeed): Success - ${casts.length} casts`);
          } else {
            debugInfo.push(`Strategy 1 (SDK fetchFeed): No casts returned`);
          }
        } catch (sdkError: any) {
          debugInfo.push(`Strategy 1 (SDK fetchFeed): Error - ${sdkError?.message}`);
          console.log(`[Channel Feed] Strategy 1 (SDK fetchFeed) error:`, sdkError?.message);
          lastError = sdkError;
        }
      } else {
        debugInfo.push(`Strategy 1 (SDK fetchFeed): Method not available`);
      }
    } catch (error: any) {
      debugInfo.push(`Strategy 1 (SDK fetchFeed): Setup error - ${error?.message}`);
      console.log(`[Channel Feed] Strategy 1 setup error:`, error?.message);
      lastError = error;
    }

    // Strategy 2: Try direct API call with parent_url
    if (casts.length === 0) {
      try {
        console.log("[Channel Feed] Strategy 2: Trying direct API with parent_url");
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=5`,
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        const responseText = await response.text();
        debugInfo.push(`Strategy 2 (parent_url API): Status ${response.status}`);
        
        if (response.ok) {
          try {
            const data = JSON.parse(responseText);
            casts = data.casts || data.result?.casts || [];
            if (casts.length > 0) {
              console.log(`[Channel Feed] ✅ Strategy 2 (parent_url API) succeeded: ${casts.length} casts`);
              debugInfo.push(`Strategy 2: Success - ${casts.length} casts`);
            } else {
              debugInfo.push(`Strategy 2: Response OK but no casts (response keys: ${Object.keys(data).join(', ')})`);
            }
          } catch (_parseError) {
            debugInfo.push(`Strategy 2: JSON parse error - ${responseText.substring(0, 200)}`);
          }
        } else {
          debugInfo.push(`Strategy 2: Failed - ${responseText.substring(0, 200)}`);
          lastError = new Error(`Strategy 2 failed: ${response.status} ${responseText.substring(0, 100)}`);
        }
      } catch (error: any) {
        debugInfo.push(`Strategy 2: Exception - ${error?.message}`);
        console.log(`[Channel Feed] Strategy 2 error:`, error?.message);
        lastError = error;
      }
    }

    // Strategy 3: Try channel_id parameter with v2 endpoint
    if (casts.length === 0) {
      try {
        console.log("[Channel Feed] Strategy 3: Trying channel_id API");
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/channel/casts?channel_id=${CATWALK_CHANNEL_ID}&limit=5`,
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        const responseText = await response.text();
        debugInfo.push(`Strategy 3 (channel_id API): Status ${response.status}`);
        
        if (response.ok) {
          try {
            const data = JSON.parse(responseText);
            casts = data.casts || data.result?.casts || [];
            if (casts.length > 0) {
              console.log(`[Channel Feed] ✅ Strategy 3 (channel_id API) succeeded: ${casts.length} casts`);
              debugInfo.push(`Strategy 3: Success - ${casts.length} casts`);
            } else {
              debugInfo.push(`Strategy 3: Response OK but no casts (response keys: ${Object.keys(data).join(', ')})`);
            }
          } catch (_parseError) {
            debugInfo.push(`Strategy 3: JSON parse error - ${responseText.substring(0, 200)}`);
          }
        } else {
          debugInfo.push(`Strategy 3: Failed - ${responseText.substring(0, 200)}`);
          lastError = new Error(`Strategy 3 failed: ${response.status} ${responseText.substring(0, 100)}`);
        }
      } catch (error: any) {
        debugInfo.push(`Strategy 3: Exception - ${error?.message}`);
        console.log(`[Channel Feed] Strategy 3 error:`, error?.message);
        lastError = error;
      }
    }

    // Strategy 4: Try feed endpoint with channel_id
    if (casts.length === 0) {
      try {
        console.log("[Channel Feed] Strategy 4: Trying feed endpoint with channel_id");
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&channel_id=${CATWALK_CHANNEL_ID}&limit=5`,
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        const responseText = await response.text();
        debugInfo.push(`Strategy 4 (feed+channel_id API): Status ${response.status}`);
        
        if (response.ok) {
          try {
            const data = JSON.parse(responseText);
            casts = data.casts || data.result?.casts || [];
            if (casts.length > 0) {
              console.log(`[Channel Feed] ✅ Strategy 4 (feed+channel_id API) succeeded: ${casts.length} casts`);
              debugInfo.push(`Strategy 4: Success - ${casts.length} casts`);
            } else {
              debugInfo.push(`Strategy 4: Response OK but no casts (response keys: ${Object.keys(data).join(', ')})`);
            }
          } catch (_parseError) {
            debugInfo.push(`Strategy 4: JSON parse error - ${responseText.substring(0, 200)}`);
          }
        } else {
          debugInfo.push(`Strategy 4: Failed - ${responseText.substring(0, 200)}`);
          lastError = new Error(`Strategy 4 failed: ${response.status} ${responseText.substring(0, 100)}`);
        }
      } catch (error: any) {
        debugInfo.push(`Strategy 4: Exception - ${error?.message}`);
        console.log(`[Channel Feed] Strategy 4 error:`, error?.message);
        lastError = error;
      }
    }

    if (casts.length === 0) {
      console.error("[Channel Feed] All strategies failed. Debug info:", debugInfo);
      console.error("[Channel Feed] Last error:", lastError);
      return NextResponse.json(
        { 
          error: "Unable to fetch channel feed. Please check the channel ID and API key.",
          casts: [],
          debug: {
            message: lastError?.message || "No casts found via any strategy",
            strategies: debugInfo,
            channelId: CATWALK_CHANNEL_ID,
            parentUrl: CATWALK_CHANNEL_PARENT_URL,
          }
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

