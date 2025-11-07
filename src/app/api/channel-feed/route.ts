import { NextResponse } from "next/server";
import { getNeynarClient } from "~/lib/neynar";

const CATWALK_CHANNEL_ID = "catwalk";
const CATWALK_CHANNEL_PARENT_URL = `https://warpcast.com/~/channel/${CATWALK_CHANNEL_ID}`;

export async function GET(request: Request) {
  try {
    const apiKey = process.env.NEYNAR_API_KEY;
    const { searchParams } = new URL(request.url);
    const viewerFid = searchParams.get('viewerFid'); // Optional: FID of the viewer checking their own following status
    
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
    const lastError: any = null;
    const debugInfo: string[] = [];
    let channelInfo: any = null;

    // Step 1: Lookup the channel to get proper channel details
    try {
      const client = getNeynarClient();
      console.log("[Channel Feed] Step 1: Looking up channel");
      
      try {
        channelInfo = await client.lookupChannel({ id: CATWALK_CHANNEL_ID });
        debugInfo.push(`Channel lookup: Success - found channel`);
        console.log("[Channel Feed] Channel lookup successful:", JSON.stringify(channelInfo, null, 2));
        // Log available properties
        if (channelInfo) {
          debugInfo.push(`Channel properties: ${Object.keys(channelInfo).join(', ')}`);
          // Check if channel object has nested channel property
          if ((channelInfo as any).channel) {
            const nestedChannel = (channelInfo as any).channel;
            debugInfo.push(`Nested channel properties: ${Object.keys(nestedChannel).join(', ')}`);
            // Check if there are casts directly in the channel
            if (nestedChannel.casts || nestedChannel.recent_casts) {
              casts = nestedChannel.casts || nestedChannel.recent_casts || [];
              debugInfo.push(`Found ${casts.length} casts in channel object`);
            }
          }
        }
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
              limit: 10,
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

    // Strategy 2: Use feed_type=filter with filter_type=parent_url (correct way per Neynar docs)
    if (casts.length === 0) {
      try {
        console.log("[Channel Feed] Strategy 2: Using feed_type=filter with filter_type=parent_url");
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=${encodeURIComponent(CATWALK_CHANNEL_PARENT_URL)}&limit=10`,
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        const responseText = await response.text();
        debugInfo.push(`Strategy 2 (filter/parent_url): Status ${response.status}`);
        
        if (response.ok) {
          try {
            const data = JSON.parse(responseText);
            casts = data.casts || data.result?.casts || data.result?.feed || [];
            if (casts.length > 0) {
              console.log(`[Channel Feed] ✅ Strategy 2 (filter/parent_url) succeeded: ${casts.length} casts`);
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

    // Strategy 3: Try using channel info properties and various endpoint formats
    if (casts.length === 0 && channelInfo) {
      try {
        // Extract all possible channel identifiers
        const channelId = (channelInfo as any).id || (channelInfo as any).channel_id || CATWALK_CHANNEL_ID;
        const channelUrl = (channelInfo as any).url || (channelInfo as any).parent_url || CATWALK_CHANNEL_PARENT_URL;
        const channelParentUrl = (channelInfo as any).parent_url || channelUrl;
        
        console.log("[Channel Feed] Strategy 3: Channel ID:", channelId, "URL:", channelUrl);
        debugInfo.push(`Strategy 3: Using channelId=${channelId}, url=${channelUrl}`);
        
        // Try using fetchFeed with a dummy fid (0 or -1 might work for public feeds)
        // Or try without fid parameter
        const testEndpoints = [
          // Try with parent_url and no fid (some APIs allow public channel access)
          `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&parent_url=${encodeURIComponent(channelParentUrl)}&limit=10`,
          // Try with channel_id (if it's numeric)
          typeof channelId === 'number' ? `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&channel_id=${channelId}&limit=10` : null,
          // Try with channel ID as string
          `https://api.neynar.com/v2/farcaster/feed?feed_type=channel&channel_id=${encodeURIComponent(channelId)}&limit=10`,
        ].filter(Boolean) as string[];
        
        for (const endpoint of testEndpoints) {
          try {
            const response = await fetch(endpoint, {
              headers: {
                "x-api-key": apiKey,
                "Content-Type": "application/json",
              },
            });

            const responseText = await response.text();
            const endpointKey = endpoint.substring(endpoint.indexOf('/v2/'));
            debugInfo.push(`Strategy 3 (${endpointKey}): Status ${response.status}`);
            
            if (response.ok) {
              try {
                const data = JSON.parse(responseText);
                casts = data.casts || data.result?.casts || data.result?.feed || [];
                if (casts.length > 0) {
                  console.log(`[Channel Feed] ✅ Strategy 3 succeeded: ${casts.length} casts`);
                  debugInfo.push(`Strategy 3: Success - ${casts.length} casts`);
                  break;
                } else {
                  debugInfo.push(`Strategy 3: Response OK but no casts (keys: ${Object.keys(data).join(', ')})`);
                }
              } catch (_parseError) {
                debugInfo.push(`Strategy 3: Parse error - ${responseText.substring(0, 100)}`);
              }
            } else {
              const errorText = responseText.substring(0, 150);
              debugInfo.push(`Strategy 3: Failed ${response.status} - ${errorText}`);
            }
          } catch (_error) {
            debugInfo.push(`Strategy 3: Exception for ${endpoint.substring(0, 50)}`);
          }
        }
      } catch (error: any) {
        debugInfo.push(`Strategy 3: Exception - ${error?.message}`);
      }
    }
    
    // Strategy 4: Try using recent casts endpoint and filter by channel
    // This is a fallback - fetch recent casts and filter by parent_url
    if (casts.length === 0 && channelInfo) {
      try {
        console.log("[Channel Feed] Strategy 4: Trying recent casts filtered by channel");
        // This might not work if recent casts endpoint also requires fid, but worth trying
        const channelUrl = (channelInfo as any).url || (channelInfo as any).parent_url || CATWALK_CHANNEL_PARENT_URL;
        
        // Try fetching recent casts (if this endpoint exists and doesn't require fid)
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/cast/recent?limit=100`,
          {
            headers: {
              "x-api-key": apiKey,
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const allCasts = data.casts || data.result?.casts || [];
          // Filter casts that belong to our channel
          casts = allCasts.filter((cast: any) => 
            cast.parent_url === channelUrl || 
            cast.parent_url?.includes(CATWALK_CHANNEL_ID) ||
            cast.channel?.id === CATWALK_CHANNEL_ID
          ).slice(0, 10);
          
          if (casts.length > 0) {
            debugInfo.push(`Strategy 4: Success - found ${casts.length} casts by filtering`);
          } else {
            debugInfo.push(`Strategy 4: Found ${allCasts.length} recent casts but none match channel`);
          }
        } else {
          debugInfo.push(`Strategy 4: Recent casts endpoint failed - ${response.status}`);
        }
      } catch (error: any) {
        debugInfo.push(`Strategy 4: Exception - ${error?.message}`);
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
    const formattedCasts = casts.map((cast: any, index: number) => {
        // Extract images/embeds from the cast - comprehensive extraction
        const images: string[] = [];
        
        // Log embeds for debugging
        if (cast.embeds && cast.embeds.length > 0) {
          console.log(`[Channel Feed] Cast ${index + 1} (${cast.hash?.substring(0, 10)}...) has ${cast.embeds.length} embed(s)`);
          cast.embeds.forEach((embed: any, embedIdx: number) => {
            const isVideo = embed.url && embed.url.includes('.m3u8');
            console.log(`[Channel Feed]   Embed ${embedIdx + 1}: type=${embed.type || 'none'}, url=${embed.url?.substring(0, 80) || 'none'}, hasMetadata=${!!embed.metadata}, hasOpenGraph=${!!embed.open_graph}, isVideo=${isVideo}`);
            // Log video metadata if it's a video
            if (isVideo && embed.metadata && embed.metadata.video) {
              console.log(`[Channel Feed]     Video metadata keys: ${Object.keys(embed.metadata.video).join(', ')}`);
              const video = embed.metadata.video;
              Object.keys(video).forEach((key: string) => {
                const val = video[key];
                if (typeof val === 'string' && val.startsWith('http')) {
                  console.log(`[Channel Feed]     Video.${key} = ${val.substring(0, 100)}`);
                }
              });
            }
          });
        }
        
        // Method 1: Check embeds array (most common for images in Neynar)
        if (cast.embeds && Array.isArray(cast.embeds)) {
          cast.embeds.forEach((embed: any) => {
            // Check embed type - images might be in different formats
            const embedType = embed.type || embed.kind || '';
            
            // Direct URL that's an image (with or without extension, check imagedelivery.net)
            if (embed.url) {
              if (embed.url.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i) || 
                  embed.url.includes('imagedelivery.net') ||
                  embed.url.includes('image/') ||
                  embed.url.includes('photos') ||
                  embedType === 'image') {
                images.push(embed.url);
              }
            }
            
            // Images array in embed
            if (embed.images && Array.isArray(embed.images)) {
              embed.images.forEach((img: any) => {
                if (typeof img === 'string') {
                  images.push(img);
                } else if (img && typeof img === 'object') {
                  if (img.url) images.push(img.url);
                  if (img.image_url) images.push(img.image_url);
                  if (img.src) images.push(img.src);
                  if (img.original_url) images.push(img.original_url);
                }
              });
            }
            
            // Single image property
            if (embed.image_url) images.push(embed.image_url);
            if (embed.image) images.push(embed.image);
            if (embed.original_url) images.push(embed.original_url);
            if (embed.thumbnail_url) images.push(embed.thumbnail_url);
            
            // OpenGraph metadata (common in Neynar)
            if (embed.open_graph) {
              const og = embed.open_graph;
              if (og.image) {
                if (typeof og.image === 'string') {
                  images.push(og.image);
                } else if (og.image && typeof og.image === 'object') {
                  if (og.image.url) images.push(og.image.url);
                  if (og.image.secure_url) images.push(og.image.secure_url);
                }
              }
              if (og.images && Array.isArray(og.images)) {
                og.images.forEach((img: any) => {
                  if (typeof img === 'string') images.push(img);
                  else if (img && typeof img === 'object') {
                    if (img.url) images.push(img.url);
                    if (img.secure_url) images.push(img.secure_url);
                  }
                });
              }
            }
            
            // Metadata object
            if (embed.metadata) {
              const meta = embed.metadata;
              if (meta.image) {
                if (typeof meta.image === 'string') images.push(meta.image);
                else if (meta.image && typeof meta.image === 'object' && meta.image.url) {
                  images.push(meta.image.url);
                }
              }
              if (meta.images && Array.isArray(meta.images)) {
                meta.images.forEach((img: any) => {
                  if (typeof img === 'string') images.push(img);
                  else if (img && typeof img === 'object' && img.url) images.push(img.url);
                });
              }
            }
            
            // Check for direct image objects (sometimes embeds are just image objects)
            if (embedType === 'image' || embedType === 'photo') {
              // If it's an image embed, the URL is likely the image
              if (embed.url && !images.includes(embed.url)) {
                images.push(embed.url);
              }
            }
            
            // Video metadata might have thumbnail - check thoroughly
            if (embed.metadata && embed.metadata.video) {
              const video = embed.metadata.video;
              if (video.thumbnail_url) images.push(video.thumbnail_url);
              if (video.poster_url) images.push(video.poster_url);
              if (video.poster) images.push(video.poster);
              if (video.cover_image) images.push(video.cover_image);
              if (video.cover) images.push(video.cover);
              if (video.thumbnail) images.push(video.thumbnail);
              // Check all properties in video object for image URLs
              Object.keys(video).forEach((key: string) => {
                const val = video[key];
                if (typeof val === 'string' && val.startsWith('http') && 
                    (val.includes('image') || val.includes('thumbnail') || val.includes('poster') ||
                     val.includes('imagedelivery.net') || val.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
                  if (!images.includes(val)) images.push(val);
                }
              });
            }
            
            // Don't add constructed thumbnail URLs for videos - they don't exist and cause 404s
            // Videos will be handled by the frontend with a video icon/placeholder
            
            // If embed has metadata but no type, check if URL looks like an image
            if (!embedType && embed.url) {
              // Check if URL is from known image hosting services
              if (embed.url.includes('imagedelivery.net') ||
                  embed.url.includes('i.imgur.com') ||
                  embed.url.includes('cdn') ||
                  embed.url.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i)) {
                if (!images.includes(embed.url)) {
                  images.push(embed.url);
                }
              }
            }
            
            // Check all string properties in embed for image URLs
            Object.keys(embed).forEach((key: string) => {
              const value = embed[key];
              if (typeof value === 'string' && value.startsWith('http')) {
                // Check if it looks like an image URL
                if (value.includes('imagedelivery.net') ||
                    value.includes('image') ||
                    value.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i)) {
                  if (!images.includes(value)) {
                    images.push(value);
                  }
                }
              }
            });
          });
        }
        
        // Method 2: Check attachments (common in Neynar API)
        if (cast.attachments && Array.isArray(cast.attachments)) {
          cast.attachments.forEach((attachment: any) => {
            if (attachment.url && attachment.url.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i)) {
              images.push(attachment.url);
            }
            if (attachment.image_url) images.push(attachment.image_url);
            if (attachment.media_url) images.push(attachment.media_url);
          });
        }
        
        // Method 3: Check media array (if present)
        if (cast.media && Array.isArray(cast.media)) {
          cast.media.forEach((media: any) => {
            if (media.url) images.push(media.url);
            if (media.image_url) images.push(media.image_url);
            if (media.thumbnail_url) images.push(media.thumbnail_url);
          });
        }
        
        // Method 4: Direct image properties on cast
        if (cast.image_url) images.push(cast.image_url);
        if (cast.image) images.push(cast.image);
        
        // Remove duplicates and filter valid image URLs
        const uniqueImages = Array.from(new Set(images.filter((url: string) => url && url.startsWith('http'))));
        
        // Check if this cast has video embeds - check multiple locations
        let videoUrl: string | null = null;
        let hasVideo = false;
        
        if (cast.embeds && Array.isArray(cast.embeds)) {
          for (const embed of cast.embeds) {
            // Check direct URL for .m3u8
            if (embed.url && embed.url.includes('.m3u8')) {
              videoUrl = embed.url;
              hasVideo = true;
              break;
            }
            
            // Check metadata.video for video URLs
            if (embed.metadata && embed.metadata.video) {
              const video = embed.metadata.video;
              // Check various video URL properties
              if (video.url && video.url.includes('.m3u8')) {
                videoUrl = video.url;
                hasVideo = true;
                break;
              }
              if (video.video_url && video.video_url.includes('.m3u8')) {
                videoUrl = video.video_url;
                hasVideo = true;
                break;
              }
              if (video.hls_url && video.hls_url.includes('.m3u8')) {
                videoUrl = video.hls_url;
                hasVideo = true;
                break;
              }
              if (video.stream_url && video.stream_url.includes('.m3u8')) {
                videoUrl = video.stream_url;
                hasVideo = true;
                break;
              }
            }
          }
        }
        
        console.log(`[Channel Feed] Cast ${cast.hash} has ${uniqueImages.length} images extracted, hasVideo=${hasVideo}, videoUrl=${videoUrl ? videoUrl.substring(0, 80) + '...' : 'null'}`);

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
          images: uniqueImages,
          hasVideo,
          videoUrl,
          likes: cast.reactions?.likes?.length || cast.reactions?.likes_count || 0,
          recasts: cast.reactions?.recasts?.length || cast.reactions?.recasts_count || 0,
          replies: cast.replies?.count || 0,
          url: `https://warpcast.com/${cast.author?.username || "unknown"}/${cast.hash || ""}`,
        };
      });

      // Check if viewer follows the channel (if viewerFid is provided)
      const isFollowingChannel = false; // TODO: Implement proper channel following check
      if (viewerFid) {
        try {
          const _client = getNeynarClient();
          // Try to check user's channel following status
          // Note: This might require a different API call - for now, we'll check if user has any interaction with channel
          // A more accurate check would be: _client.fetchUserChannels({ fid: parseInt(viewerFid) })
          // But that might not be available. For now, we'll default to false and refine later.
          // TODO: Implement proper channel following check
        } catch (_error) {
          // If check fails, default to false
        }
      }

      return NextResponse.json({
        casts: formattedCasts,
        count: formattedCasts.length,
        isFollowingChannel,
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

