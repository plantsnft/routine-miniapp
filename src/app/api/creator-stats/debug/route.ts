import { NextResponse } from "next/server";
import { getCastCount, getCreatorCasts } from "~/lib/creatorStats";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";

/**
 * Debug endpoint to check what's actually in the database.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fidParam = searchParams.get("fid");
    
    if (fidParam) {
      const fid = parseInt(fidParam);
      if (isNaN(fid)) {
        return NextResponse.json({ error: "Invalid FID" }, { status: 400 });
      }
      
      const casts = await getCreatorCasts(fid);
      const count = await getCastCount(fid);
      
      return NextResponse.json({
        fid,
        castCount: count,
        castsInDatabase: casts.length,
        sampleCasts: casts.slice(0, 3).map(c => ({
          cast_hash: c.cast_hash,
          text: c.text?.substring(0, 50),
          timestamp: c.timestamp,
        })),
      });
    }
    
    // Test a few FIDs
    const testFids = CATWALK_CREATOR_FIDS.slice(0, 5);
    const results = await Promise.all(
      testFids.map(async (fid) => {
        const count = await getCastCount(fid);
        const casts = await getCreatorCasts(fid, 1);
        return {
          fid,
          castCount: count,
          hasCasts: casts.length > 0,
          sampleCastHash: casts[0]?.cast_hash,
        };
      })
    );
    
    return NextResponse.json({
      testResults: results,
      totalTested: testFids.length,
    });
  } catch (error: any) {
    console.error("[Creator Stats Debug] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to debug" },
      { status: 500 }
    );
  }
}

