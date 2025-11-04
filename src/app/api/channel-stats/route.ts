import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

// TODO: Replace with actual channel ID when available
// For /catwalk channel, we'll need the channel ID from Farcaster
const CATWALK_CHANNEL_ID = "catwalk"; // This might need to be a channel ID number

export async function GET() {
  try {
    const apiKey = process.env.NEYNAR_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "Neynar API key not configured" },
        { status: 500 }
      );
    }

    // Try to fetch channel info from Neynar
    try {
      const client = getNeynarClient();
      
      // Try to lookup channel by ID
      try {
        const channel = await client.lookupChannel({ id: CATWALK_CHANNEL_ID });
        
        // Access follower_count from the channel response (may be in different property)
        const followerCount = (channel as any).follower_count || 
                             (channel as any).followers || 
                             (channel as any).channel?.follower_count;
        
        if (channel && followerCount !== undefined) {
          return NextResponse.json({
            followers: followerCount,
            channelId: CATWALK_CHANNEL_ID,
          });
        }
      } catch (lookupError: any) {
        console.log("[Channel Stats] lookupChannel failed, trying direct API call:", lookupError?.message);
        
        // Fallback: Try direct API call to Neynar
        try {
          const response = await fetch(
            `https://api.neynar.com/v2/farcaster/channel/search?q=${CATWALK_CHANNEL_ID}`,
            {
              headers: {
                "x-api-key": apiKey,
              },
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            // Try to find the catwalk channel in the results
            if (data.channels && Array.isArray(data.channels)) {
              const catwalkChannel = data.channels.find((ch: any) => 
                ch.id === CATWALK_CHANNEL_ID || 
                ch.url?.includes(CATWALK_CHANNEL_ID) ||
                ch.name?.toLowerCase() === CATWALK_CHANNEL_ID.toLowerCase()
              );
              
              if (catwalkChannel && catwalkChannel.follower_count !== undefined) {
                return NextResponse.json({
                  followers: catwalkChannel.follower_count,
                  channelId: CATWALK_CHANNEL_ID,
                });
              }
            }
          }
        } catch (apiError: any) {
          console.log("[Channel Stats] Direct API call failed:", apiError?.message);
        }
      }
      
      // If all methods fail, return null
      return NextResponse.json({
        followers: null,
        channelId: CATWALK_CHANNEL_ID,
        error: "Unable to fetch channel stats",
      });
    } catch (error: any) {
      console.error("[Channel Stats] Error fetching from Neynar:", error);
      return NextResponse.json({
        followers: null,
        channelId: CATWALK_CHANNEL_ID,
        error: "Unable to fetch channel stats",
      });
    }
  } catch (error: any) {
    console.error("[Channel Stats] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch channel stats" },
      { status: 500 }
    );
  }
}

