import { NextResponse } from "next/server";
import { getCreatorCasts } from "~/lib/creatorStats";
import { parseCastImages, sortCastsByLikesAndDate, normalizeCast } from "~/lib/castUtils";
import { MAX_TOP_CASTS } from "~/lib/dbConstants";

/**
 * GET /api/creator-stats/top-casts
 * 
 * Returns the top 5 casts for a creator, sorted by all-time likes.
 * 
 * @param fid - Creator FID (required)
 * @returns Top 5 casts with engagement stats
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fidParam = searchParams.get("fid");

  if (!fidParam) {
    return NextResponse.json(
      { error: "fid parameter is required" },
      { status: 400 }
    );
  }

  try {
    const creatorFid = parseInt(fidParam, 10);
    if (isNaN(creatorFid)) {
      return NextResponse.json({ error: "Invalid fid" }, { status: 400 });
    }

    // Get all casts for this creator (all-time from Catwalk channel)
    // Sort by likes_count at database level for better performance
    const allCreatorCasts = await getCreatorCasts(creatorFid, undefined, true);
    console.log(`[Top Casts] Found ${allCreatorCasts.length} total casts (all-time) for FID ${creatorFid}`);

    // Sort casts by likes (descending), then by timestamp (descending)
    // Database sorts by likes, but we ensure consistent ordering with timestamp fallback
    const sortedCasts = sortCastsByLikesAndDate(allCreatorCasts);
    
    // Limit to top 5 and normalize all casts
    const topCasts = sortedCasts
      .slice(0, MAX_TOP_CASTS)
      .map(normalizeCast);

    console.log(`[Top Casts] Returning top ${topCasts.length} casts for FID ${creatorFid} (sorted by all-time likes)`);
    topCasts.forEach((cast, idx) => {
      console.log(`[Top Casts] Cast ${idx + 1}: hash=${cast.cast_hash.substring(0, 10)}..., likes=${cast.likes_count}, images=${cast.images?.length || 0}, timestamp=${cast.timestamp}`);
    });
    
    // Verify we have expected number of casts (warn if unexpected)
    if (allCreatorCasts.length > 0 && topCasts.length === 0) {
      console.warn(`[Top Casts] WARNING: FID ${creatorFid} has ${allCreatorCasts.length} casts but topCasts is empty!`);
    }

    return NextResponse.json({ casts: topCasts });
  } catch (error: any) {
    console.error("[Top Casts] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch top casts" },
      { status: 500 }
    );
  }
}

