import { NextResponse } from "next/server";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";
import {
  storeCreatorCast,
  updateCreatorMetadata,
  storeCatProfile,
  extractCatNames,
  extractLabels,
  getCastCount,
  getLastCastDate,
  getCreatorCasts,
  type CreatorCast,
} from "~/lib/creatorStats";
import {
  parseLocationFromUser,
  parseImagesFromCast,
  extractEngagementStats,
  extractNextCursor,
  buildNeynarFeedUrl,
} from "~/lib/creatorStatsHelpers";
import {
  RATE_LIMIT_DELAY_MS,
  MAX_PAGES,
  CASTS_PER_PAGE,
  CATWALK_VIEWER_FID,
  DB_COMMIT_DELAY_MS,
  MAX_CAT_PROFILE_PHOTOS,
} from "~/lib/dbConstants";

// Constants
const CATWALK_CHANNEL_PARENT_URL = "https://warpcast.com/~/channel/catwalk";
const API_KEY = process.env.NEYNAR_API_KEY;

/**
 * Fetch user location from Neynar API.
 * 
 * @param fid - Creator FID
 * @param apiKey - Neynar API key
 * @returns Location string or null
 */
async function fetchUserLocation(fid: number, apiKey: string): Promise<string | null> {
  try {
    const userResponse = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          "x-api-key": apiKey,
        },
      }
    );
    if (!userResponse.ok) {
      return null;
    }
    
    const userData = await userResponse.json();
    const user = userData.users?.[0]?.user || userData.users?.[0];
    return user ? parseLocationFromUser(user) : null;
  } catch (error: any) {
    console.error(`[Creator Stats Sync] Error fetching user data for FID ${fid}:`, error?.message);
    return null;
  }
}

/**
 * Sync creator stats from Catwalk channel.
 * This should be called hourly to update creator data.
 * 
 * GET /api/creator-stats/sync
 */
export async function GET() {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { error: "NEYNAR_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Check if we have creator FIDs
    if (!CATWALK_CREATOR_FIDS || CATWALK_CREATOR_FIDS.length === 0) {
      return NextResponse.json(
        { error: "No creator FIDs configured", fids: CATWALK_CREATOR_FIDS },
        { status: 500 }
      );
    }

    console.log(`[Creator Stats Sync] Starting sync for ${CATWALK_CREATOR_FIDS.length} creators`);
    console.log(`[Creator Stats Sync] Fetching ALL Catwalk channel casts (all-time history)...`);
    
    // Fetch all casts from channel with pagination (no date limit - all time)
    // Strategy: Paginate through all historical casts, then filter by creator FID
    let fetchedCasts: any[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;
    
    while (hasMore && pageCount < MAX_PAGES) {
      pageCount++;
      
      // Build API URL with query parameters
      const url = buildNeynarFeedUrl(
        CATWALK_CHANNEL_PARENT_URL,
        cursor,
        CATWALK_VIEWER_FID,
        CASTS_PER_PAGE
      );
      
      console.log(`[Creator Stats Sync] Fetching page ${pageCount}${cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''}...`);
      
      const response = await fetch(url.toString(), {
        headers: {
          "x-api-key": API_KEY!,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Creator Stats Sync] Failed to fetch channel feed page ${pageCount}: ${response.status} - ${errorText}`);
        // Don't fail completely, just stop pagination
        break;
      }

      const data = await response.json();
      const currentPageCasts = data.casts || data.result?.casts || data.result?.feed || [];
      const nextCursor = extractNextCursor(data);
      
      if (!Array.isArray(currentPageCasts) || currentPageCasts.length === 0) {
        console.log(`[Creator Stats Sync] No more casts found on page ${pageCount}, stopping pagination`);
        hasMore = false;
        break;
      }

      // Use push with spread for better performance than concat
      fetchedCasts.push(...currentPageCasts);
      console.log(`[Creator Stats Sync] Page ${pageCount}: Found ${currentPageCasts.length} casts, total so far: ${fetchedCasts.length}`);
      
      // If we got fewer casts than requested, we're likely at the end
      if (currentPageCasts.length < CASTS_PER_PAGE) {
        console.log(`[Creator Stats Sync] Got fewer than ${CASTS_PER_PAGE} casts on page ${pageCount}, likely reached the end`);
        // Still check for cursor in case there's more
        if (!nextCursor || nextCursor === cursor) {
          hasMore = false;
          break;
        }
      }
      
      // Continue pagination if we have a valid new cursor
      if (nextCursor && nextCursor !== cursor) {
        cursor = nextCursor;
      } else {
        console.log(`[Creator Stats Sync] No valid cursor found on page ${pageCount}, stopping pagination`);
        hasMore = false;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
    
    console.log(`[Creator Stats Sync] Completed pagination: ${fetchedCasts.length} total casts from ${pageCount} pages (ALL-TIME HISTORY)`);
    
    // Response summary for debugging
    const responseSummary = {
      totalPages: pageCount,
      totalCastsFetched: fetchedCasts.length,
      dateRange: "all-time",
    };

    if (!Array.isArray(fetchedCasts)) {
      return NextResponse.json(
        { error: "Invalid response format from Neynar API" },
        { status: 500 }
      );
    }

    // Filter to only top-level casts (not replies)
    // Top-level casts have parent_url matching the channel and no parent_hash (or parent_hash equals hash)
    const topLevelCasts = fetchedCasts.filter((cast: any) => {
      const isTopLevel = cast.parent_url === CATWALK_CHANNEL_PARENT_URL && 
                        (!cast.parent_hash || cast.parent_hash === cast.hash);
      return isTopLevel;
    });
    console.log(`[Creator Stats Sync] Found ${topLevelCasts.length} top-level casts (filtered from ${fetchedCasts.length} total)`);

    const results = [];

    // Process each creator FID
    for (const fid of CATWALK_CREATOR_FIDS) {
      try {
        console.log(`[Creator Stats Sync] Processing FID ${fid}...`);

        // Filter casts by this creator's FID
        const creatorCasts = topLevelCasts.filter((cast: any) => {
          return cast.author?.fid === fid;
        });

        console.log(`[Creator Stats Sync] Found ${creatorCasts.length} Catwalk casts for FID ${fid}`);
        
        if (creatorCasts.length === 0) {
          console.log(`[Creator Stats Sync] No casts found for FID ${fid}, creating empty metadata record`);
          // Still create metadata record even if no casts (for consistency)
          try {
            // Fetch user profile to get location
            const location = await fetchUserLocation(fid, API_KEY!);

            await updateCreatorMetadata({
              fid,
              cast_count: 0,
              last_cast_date: null,
              cat_names: [],
              location: location,
              labels: [],
              last_synced_at: new Date().toISOString(),
            });
            results.push({
              fid,
              storedCasts: 0,
              totalCasts: 0,
              catNames: [],
              labels: [],
              location: location,
            });
            console.log(`[Creator Stats Sync] Created empty metadata for FID ${fid}`);
          } catch (emptyError: any) {
            console.error(`[Creator Stats Sync] Error creating empty metadata for FID ${fid}:`, emptyError?.message);
            results.push({
              fid,
              error: emptyError?.message || "Failed to create metadata",
            });
          }
          continue;
        }

        // Store each cast and collect metadata
        let castsStoredThisSync = 0;
        const uniqueCatNames = new Set<string>();
        const collectedImages: string[] = [];

        for (const cast of creatorCasts) {
          try {
            // Extract images from cast embeds
            const images = parseImagesFromCast(cast);

            // Extract engagement stats (likes, recasts, replies)
            const { likes, recasts, replies } = extractEngagementStats(cast);
            
            // Log first cast's engagement stats for debugging (only for first creator)
            if (castsStoredThisSync === 0 && creatorCasts.length > 0 && fid === CATWALK_CREATOR_FIDS[0]) {
              console.log(`[Creator Stats Sync] Sample cast engagement stats for FID ${fid}:`, {
                cast_hash: cast.hash?.substring(0, 10),
                reactions: cast.reactions,
                reactions_count: cast.reactions_count,
                extracted_likes: likes,
                extracted_recasts: recasts,
                extracted_replies: replies,
              });
            }

            const creatorCast: CreatorCast = {
              cast_hash: cast.hash,
              fid: cast.author?.fid || fid,
              text: cast.text || null,
              images: images.length > 0 ? images : undefined,
              timestamp: cast.timestamp || new Date().toISOString(),
              parent_url: cast.parent_url || null,
              author_username: cast.author?.username || null,
              author_display_name: cast.author?.display_name || null,
              likes_count: likes,
              recasts_count: recasts,
              replies_count: replies,
            };

            try {
              await storeCreatorCast(creatorCast);
              castsStoredThisSync++;
            } catch (castStoreError: any) {
              // Duplicate casts are expected and fine - the cast already exists
              // Only throw if it's a different error
              if (!castStoreError.message.includes("already exists")) {
                throw castStoreError;
              }
            }

            // Extract cat names from cast text (labels will be calculated from all DB casts)
            if (cast.text) {
              const catNames = extractCatNames(cast.text);
              catNames.forEach(name => uniqueCatNames.add(name));
            }

            // Collect images for cat profiles
            if (images.length > 0) {
              collectedImages.push(...images);
            }
          } catch (castError: any) {
            console.error(`[Creator Stats Sync] Error storing cast ${cast.hash}:`, castError.message);
          }
        }
        
        // Calculate labels from ALL casts in database (not just current sync)
        // This ensures we get the top 5 labels based on all-time likes
        const labelPopularity = new Map<string, number>(); // Map of label -> total likes
        const allDbCasts = await getCreatorCasts(fid);
        
        console.log(`[Creator Stats Sync] Calculating labels from ${allDbCasts.length} total casts in database for FID ${fid}`);
        
        for (const dbCast of allDbCasts) {
          if (dbCast.text) {
            const labels = extractLabels(dbCast.text);
            const likes = dbCast.likes_count || 0;
            // Sum likes for each label found in this cast
            labels.forEach(label => {
              const currentLikes = labelPopularity.get(label) || 0;
              labelPopularity.set(label, currentLikes + likes);
            });
          }
        }
        
        // Get top 5 labels by total likes across all casts
        const sortedLabels = Array.from(labelPopularity.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by total likes descending
          .slice(0, 5) // Keep only top 5
          .map(([label]) => label); // Extract just the label names
        
        console.log(`[Creator Stats Sync] Top 5 labels for FID ${fid}:`, sortedLabels.map(label => {
          const likes = labelPopularity.get(label) || 0;
          return `${label} (${likes} likes)`;
        }).join(', '));
        
        const allLabels = new Set(sortedLabels);

        // Fetch user profile to get location
        const location = await fetchUserLocation(fid, API_KEY!);

        // Create cat profiles for each unique cat name (only if we have names)
        const catNamesArray = Array.from(uniqueCatNames);
        if (catNamesArray.length > 0) {
          for (const catName of catNamesArray) {
            try {
              // Store cat profile with collected images (limited to MAX_CAT_PROFILE_PHOTOS)
              // TODO: In the future, match images to specific cat names from cast text
              await storeCatProfile({
                fid,
                cat_name: catName,
                photos: collectedImages.length > 0 
                  ? collectedImages.slice(0, MAX_CAT_PROFILE_PHOTOS) 
                  : undefined,
                ai_writeup: null, // Will be populated later with AI
              });
              console.log(`[Creator Stats Sync] Stored cat profile for FID ${fid}, cat: ${catName}`);
            } catch (catError: any) {
              // Don't fail the whole sync if cat profile creation fails
              // Handle duplicate gracefully (PostgreSQL error code 23505 = unique violation)
              if (catError?.message?.includes("duplicate") || catError?.message?.includes("23505")) {
                console.log(`[Creator Stats Sync] Cat profile for FID ${fid}, cat ${catName} already exists, skipping`);
              } else {
                console.error(`[Creator Stats Sync] Error storing cat profile for FID ${fid}, cat ${catName}:`, catError?.message);
              }
            }
          }
        } else {
          console.log(`[Creator Stats Sync] No cat names found for FID ${fid}, skipping cat profile creation`);
        }

        // Update creator metadata
        // Always get the actual count from database (this is the source of truth)
        // Wait a moment to ensure all casts are committed to the database
        await new Promise(resolve => setTimeout(resolve, DB_COMMIT_DELAY_MS));
        const totalCastCount = await getCastCount(fid);
        const lastCastDate = await getLastCastDate(fid);
        
        console.log(`[Creator Stats Sync] FID ${fid}: Database has ${totalCastCount} casts, found ${creatorCasts.length} in current feed`);

        try {
          await updateCreatorMetadata({
            fid,
            cast_count: totalCastCount, // Always use database count as source of truth
            last_cast_date: lastCastDate,
            cat_names: catNamesArray,
            location: location,
            labels: Array.from(allLabels),
            last_synced_at: new Date().toISOString(),
          });
          console.log(`[Creator Stats Sync] Updated metadata for FID ${fid} with cast_count: ${totalCastCount}`);
        } catch (metadataError: any) {
          console.error(`[Creator Stats Sync] Error updating metadata for FID ${fid}:`, metadataError?.message);
          throw metadataError;
        }

        results.push({
          fid,
          storedCasts: castsStoredThisSync,
          totalCasts: totalCastCount,
          catNames: Array.from(uniqueCatNames),
          labels: Array.from(allLabels),
          location,
        });

        console.log(`[Creator Stats Sync] Completed FID ${fid}: ${castsStoredThisSync} casts stored this sync, ${totalCastCount} total in DB`);
      } catch (error: any) {
        console.error(`[Creator Stats Sync] Error processing FID ${fid}:`, error.message);
        results.push({
          fid,
          error: error.message,
        });
      }
    }

    console.log(`[Creator Stats Sync] Sync complete. Processed ${results.length} creators.`);

    return NextResponse.json({
      success: true,
      processed: results.length,
      totalCastsInFeed: fetchedCasts.length,
      topLevelCasts: topLevelCasts.length,
      pagination: responseSummary,
      results,
    });
  } catch (error: any) {
    console.error("[Creator Stats Sync] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync creator stats" },
      { status: 500 }
    );
  }
}

