import { NextResponse } from "next/server";
import { getAllCreatorMetadata, getCreatorMetadata, getCatProfiles, getCastCount } from "~/lib/creatorStats";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";

/**
 * Get creator stats.
 * 
 * GET /api/creator-stats - Get all creators with stats
 * GET /api/creator-stats?fid=123 - Get stats for specific creator
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fidParam = searchParams.get("fid");

    if (fidParam) {
      // Get stats for specific creator
      const fid = parseInt(fidParam);
      if (isNaN(fid)) {
        return NextResponse.json(
          { error: "Invalid FID" },
          { status: 400 }
        );
      }

      const metadata = await getCreatorMetadata(fid);
      const catProfiles = await getCatProfiles(fid);

      if (!metadata) {
        return NextResponse.json(
          { error: "Creator not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        metadata,
        catProfiles,
      });
    } else {
      // Get all creators with stats
      let allMetadata = await getAllCreatorMetadata();
      
      console.log(`[Creator Stats API] Retrieved ${allMetadata.length} creator metadata records`);
      if (allMetadata.length > 0) {
        console.log(`[Creator Stats API] Sample metadata:`, allMetadata[0]);
      }

      // Always recalculate cast_count from database to ensure accuracy
      // The database is the source of truth, not the metadata cache
      allMetadata = await Promise.all(
        allMetadata.map(async (creator) => {
          const actualCount = await getCastCount(creator.fid);
          console.log(`[Creator Stats API] FID ${creator.fid}: metadata says ${creator.cast_count}, database says ${actualCount}`);
          if (actualCount !== creator.cast_count) {
            return { ...creator, cast_count: actualCount };
          }
          return creator;
        })
      );

      // Separate active and inactive creators
      // Active = casted within last 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days

      const activeCreators = allMetadata.filter(creator => {
        if (!creator.last_cast_date) return false;
        const lastCastDate = new Date(creator.last_cast_date);
        // Consider active if casted in last 30 days
        return lastCastDate > thirtyDaysAgo;
      });

      const inactiveCreators = allMetadata.filter(creator => {
        if (!creator.last_cast_date) return true;
        const lastCastDate = new Date(creator.last_cast_date);
        // Inactive if last cast was more than 30 days ago
        return lastCastDate <= thirtyDaysAgo;
      });

      // Include all creator FIDs, even if they don't have metadata yet
      const allFidsSet = new Set([...CATWALK_CREATOR_FIDS, ...allMetadata.map(m => m.fid)]);
      const missingFids = CATWALK_CREATOR_FIDS.filter(fid => 
        !allMetadata.find(m => m.fid === fid)
      );

      console.log(`[Creator Stats API] Active: ${activeCreators.length}, Inactive: ${inactiveCreators.length}, Missing: ${missingFids.length}`);

      return NextResponse.json({
        active: activeCreators,
        inactive: inactiveCreators,
        missing: missingFids.map(fid => ({ fid, cast_count: 0 })),
        total: allFidsSet.size,
      });
    }
  } catch (error: any) {
    console.error("[Creator Stats] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch creator stats" },
      { status: 500 }
    );
  }
}

