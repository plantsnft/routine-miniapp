import { NextResponse } from "next/server";
import { CATWALK_CREATOR_FIDS } from "~/lib/constants";
import { storeCatProfile } from "~/lib/creatorStats";

/**
 * One-time endpoint to populate placeholder cat profiles for all creators.
 * Run this once to create fake cat profiles that can be replaced later.
 * 
 * GET /api/creator-stats/populate-placeholders
 */
export async function GET() {
  try {
    // Sample cat names including "river" as requested
    const sampleNames = [
      "River",
      "Luna",
      "Milo",
      "Bella",
      "Charlie",
      "Daisy",
      "Max",
      "Lily",
      "Oliver",
      "Zoe",
      "Leo",
      "Mia",
      "Jack",
      "Sophie",
      "Finn",
      "Chloe",
      "Tiger",
      "Emma",
      "Simba",
      "Grace",
      "Oscar",
      "Ruby",
      "Jasper",
      "Willow",
      "Rocky",
      "Penny",
      "Buddy",
      "Molly",
      "Smokey",
      "Coco",
      "Shadow",
    ];

    const results = [];

    for (let i = 0; i < CATWALK_CREATOR_FIDS.length; i++) {
      const fid = CATWALK_CREATOR_FIDS[i];
      const catName = sampleNames[i] || `Cat ${i + 1}`; // Fallback if we run out of names

      try {
        await storeCatProfile({
          fid,
          cat_name: catName,
          photos: undefined, // No photos for placeholders
          ai_writeup: `This is a placeholder profile for ${catName}. Please update with real information.`,
        });

        results.push({
          fid,
          catName,
          status: "created",
        });

        console.log(`[Populate Placeholders] Created profile for FID ${fid}, cat: ${catName}`);
      } catch (error: any) {
        // If it's a duplicate, that's fine
        if (error?.message?.includes("duplicate") || error?.message?.includes("23505")) {
          results.push({
            fid,
            catName,
            status: "already_exists",
          });
          console.log(`[Populate Placeholders] Profile for FID ${fid}, cat ${catName} already exists`);
        } else {
          results.push({
            fid,
            catName,
            status: "error",
            error: error?.message,
          });
          console.error(`[Populate Placeholders] Error creating profile for FID ${fid}:`, error?.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} creators`,
      results,
    });
  } catch (error: any) {
    console.error("[Populate Placeholders] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to populate placeholders" },
      { status: 500 }
    );
  }
}

