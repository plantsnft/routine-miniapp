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
    // Strategy: First lookup the channel, then fetch casts using proper channel identifier
    let casts: any[] = [];
    let lastError: any = null;
    const debugInfo: string[] = [];
    let channelInfo: any = null;

    // Step 1: Lookup the channel to get proper channel details
    try {
      const client = getNeynarClient();
      console.log("[Channel Feed] Step 1: Looking up channel");
      
      try {
        channelInfo = await client.lookupChannel({ id: CATWALK_CHANNEL_ID });
        debugInfo.push(`Channel lookup: Success - found channel`);
        console.log("[Channel Feed] Channel lookup successful:", channelInfo);
      } catch (lookupError: any) {
        debugInfo.push(`Channel lookup failed: ${lookupError?.message}`);
        console.log("[Channel Feed] Channel lookup failed, trying search:", lookupError?.message);
        
        // Fallback: Try channel search
        try {
          const searchResponse = await fetch(
            `https://api.neynar.com/v2/farcaster/channel/search?q=${CATWALK_CHANNEL_ID}`,
            {
              headers: {
                "x-api-key": apiKey,
              },
            }
          );
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.channels && Array.isArray(searchData.channels)) {
              channelInfo = searchData.channels.find((ch: any) => 
                ch.id === CATWALK_CHANNEL_ID || 
                ch.url?.includes(CATWALK_CHANNEL_ID) ||
                ch.name?.toLowerCase() === CATWALK_CHANNEL_ID.toLowerCase()
              );
              if (channelInfo) {
                debugInfo.push(`Channel search: Success - found channel`);
              }
            }
          }
        } catch (_searchError) {
          debugInfo.push(`Channel search also failed`);
        }
      }
    } catch (error: any) {
      debugInfo.push(`Channel lookup setup error: ${error?.message}`);
      console.log("[Channel Feed] Channel lookup setup error:", error?.message);
    }

    // Strategy 1: Try using the SDK's fetchFeedCasts method if available
    if (!casts.length) {
      try {
        const client = getNeynarClient();
        console.log("[Channel Feed] Strategy 1: Trying SDK fetchFeedCasts");
        
        // Try fetchFeedCasts method which might work for channels
        if (typeof (client as any).fetchFeedCasts === 'function') {
          try {
            const feedResponse = await (client as any).fetchFeedCasts({
              feedType: 'channel',
              parentUrl: CATWALK_CHANNEL_PARENT_URL,
              limit: 5,
            });
            
            casts = feedResponse?.casts || feedResponse?.result?.casts || [];
            if (casts.length > 0) {
              console.log(`[Channel Feed] ✅ Strategy 1 (fetchFeedCasts) succeeded: ${casts.length} casts`);
              debugInfo.push(`Strategy 1 (fetchFeedCasts): Success - ${casts.length} casts`);
            }
          } catch (sdkError: any) {
            debugInfo.push(`Strategy 1 (fetchFeedCasts): Error - ${sdkError?.message}`);
          }
        } else {
          debugInfo.push(`Strategy 1 (fetchFeedCasts): Method not available`);
        }
      } catch (error: any) {
        debugInfo.push(`Strategy 1: Exception - ${error?.message}`);
      }
    }

    // Strategy 2: Try using parent_url without requiring fid (maybe it works for public channels)
    if (casts.length === 0) {
      try {
        console.log("[Channel Feed] Strategy 2: Trying feed with parent_url (no fid)");
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=5`,
          {
            method: 'POST',
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              feed_type: 'channel',
              parent_url: CATWALK_CHANNEL_PARENT_URL,
              limit: 5,
            }),
          }
        );

        const responseText = await response.text();
        debugInfo.push(`Strategy 2 (POST parent_url): Status ${response.status}`);
        
        if (response.ok) {
          try {
            const data = JSON.parse(responseText);
            casts = data.casts || data.result?.casts || [];
            if (casts.length > 0) {
              console.log(`[Channel Feed] ✅ Strategy 2 (POST parent_url) succeeded: ${casts.length} casts`);
              debugInfo.push(`Strategy 2: Success - ${casts.length} casts`);
            } else {
              debugInfo.push(`Strategy 2: Response OK but no casts (response keys: ${Object.keys(data).join(', ')})`);
            }
          } catch (_parseError) {
            debugInfo.push(`Strategy 2: JSON parse error - ${responseText.substring(0, 200)}`);
          }
        } else {
          debugInfo.push(`Strategy 2: Failed - ${responseText.substring(0, 200)}`);
        }
      } catch (error: any) {
        debugInfo.push(`Strategy 2: Exception - ${error?.message}`);
      }
    }

    // Strategy 3: Try using a generic/public feed endpoint (if channel info found, use its ID)
    if (casts.length === 0 && channelInfo) {
      try {
        const channelId = channelInfo.id || channelInfo.channel_id || CATWALK_CHANNEL_ID;
        console.log("[Channel Feed] Strategy 3: Trying with resolved channel ID:", channelId);
        
        // Try different endpoint formats with the resolved channel ID
        const endpoints = [
          `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&channel_id=${channelId}&limit=5`,
          `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&parent_url=${encodeURIComponent(channelInfo.url || CATWALK_CHANNEL_PARENT_URL)}&limit=5`,
        ];
        
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, {
              headers: {
                "x-api-key": apiKey,
                "Content-Type": "application/json",
              },
            });

            const responseText = await response.text();
            debugInfo.push(`Strategy 3 (${endpoint.substring(0, 50)}...): Status ${response.status}`);
            
            if (response.ok) {
              try {
                const data = JSON.parse(responseText);
                casts = data.casts || data.result?.casts || [];
                if (casts.length > 0) {
                  console.log(`[Channel Feed] ✅ Strategy 3 succeeded: ${casts.length} casts`);
                  debugInfo.push(`Strategy 3: Success - ${casts.length} casts`);
                  break;
                }
              } catch (_parseError) {
                // Continue to next endpoint
              }
            }
          } catch (_error) {
            // Continue to next endpoint
          }
        }
      } catch (error: any) {
        debugInfo.push(`Strategy 3: Exception - ${error?.message}`);
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

