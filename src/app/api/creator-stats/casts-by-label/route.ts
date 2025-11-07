import { NextResponse } from "next/server";
import { getCreatorCasts, extractLabels, type CreatorCast } from "~/lib/creatorStats";
import { parseCastImages, sortCastsByLikesAndDate, normalizeCast } from "~/lib/castUtils";
import { MAX_TOP_CASTS } from "~/lib/dbConstants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get("fid");
  const label = searchParams.get("label");

  if (!fid || !label) {
    return NextResponse.json(
      { error: "fid and label parameters are required" },
      { status: 400 }
    );
  }

  try {
    const fidNum = parseInt(fid, 10);
    if (isNaN(fidNum)) {
      return NextResponse.json({ error: "Invalid fid" }, { status: 400 });
    }

    // Get all casts for this creator (all-time from Catwalk channel)
    const allCreatorCasts = await getCreatorCasts(fidNum);
    console.log(`[Casts by Label] Found ${allCreatorCasts.length} total casts (all-time) for FID ${fidNum}`);

    // Filter casts that contain this label (case-insensitive, normalized)
    const labelLower = label.toLowerCase().trim();
    let matchingCasts: CreatorCast[] = [];
    
    /**
     * Label matching strategy:
     * 1. Exact match using extractLabels (normalized)
     * 2. Text matching if < 5 results (more lenient)
     * 3. Fill remaining slots with top casts by likes
     * 4. Fallback: show top 5 by likes if no matches
     */
    
    // Step 1: Exact label matching using extractLabels
    matchingCasts = allCreatorCasts.filter(cast => {
      if (!cast.text) return false;
      const castLabels = extractLabels(cast.text);
      const normalizedCastLabels = castLabels.map(l => l.toLowerCase().trim());
      return normalizedCastLabels.includes(labelLower);
    });
    
    console.log(`[Casts by Label] Step 1: Found ${matchingCasts.length} casts with exact label match "${label}" for FID ${fidNum}`);
    
    // Step 2: If we have fewer than 5 casts, try direct text matching (more lenient)
    if (matchingCasts.length < MAX_TOP_CASTS) {
      const labelWords = labelLower.split(/\s+/).filter(w => w.length > 2);
      const existingHashes = new Set(matchingCasts.map(c => c.cast_hash));
      
      const additionalCasts = allCreatorCasts.filter(cast => {
        if (existingHashes.has(cast.cast_hash) || !cast.text) return false;
        
        const textLower = cast.text.toLowerCase();
        const hasAllWords = labelWords.length > 0 && labelWords.every(word => textLower.includes(word));
        const hasPhrase = textLower.includes(labelLower);
        
        return hasAllWords || hasPhrase;
      });
      
      if (additionalCasts.length > 0) {
        console.log(`[Casts by Label] Step 2: Found ${additionalCasts.length} additional casts with text matching for FID ${fidNum}`);
        // Remove duplicates using Set
        const uniqueHashes = new Set([...matchingCasts, ...additionalCasts].map(c => c.cast_hash));
        matchingCasts = allCreatorCasts.filter(c => uniqueHashes.has(c.cast_hash));
      }
    }
    
    console.log(`[Casts by Label] After matching: Found ${matchingCasts.length} casts with label "${label}" for FID ${fidNum}`);
    
    // Step 3: If we have fewer than 5 casts, fill remaining slots with top casts by likes
    if (matchingCasts.length > 0 && matchingCasts.length < MAX_TOP_CASTS) {
      const existingHashes = new Set(matchingCasts.map(c => c.cast_hash));
      const sortedAllCasts = sortCastsByLikesAndDate(allCreatorCasts);
      const remainingCasts = sortedAllCasts
        .filter(cast => !existingHashes.has(cast.cast_hash))
        .slice(0, MAX_TOP_CASTS - matchingCasts.length);
      
      if (remainingCasts.length > 0) {
        console.log(`[Casts by Label] Step 3: Adding ${remainingCasts.length} top casts by likes to fill to ${MAX_TOP_CASTS} for FID ${fidNum}`);
        matchingCasts.push(...remainingCasts);
      }
    }
    
    // Final fallback: If no casts match the label, show top 5 by likes
    if (matchingCasts.length === 0) {
      console.warn(`[Casts by Label] WARNING: No casts found with label "${label}" for FID ${fidNum}, showing top ${MAX_TOP_CASTS} casts by likes instead`);
      const sortedCasts = sortCastsByLikesAndDate(allCreatorCasts);
      matchingCasts = sortedCasts.slice(0, MAX_TOP_CASTS);
    }
    
    console.log(`[Casts by Label] Final: Showing ${Math.min(matchingCasts.length, MAX_TOP_CASTS)} casts for label "${label}" for FID ${fidNum}`);

    // Sort and normalize final results
    const finalCasts = sortCastsByLikesAndDate(matchingCasts)
      .slice(0, MAX_TOP_CASTS)
      .map(normalizeCast);

    console.log(`[Casts by Label] Found ${finalCasts.length} casts matching label "${label}" for FID ${fidNum}`);
    finalCasts.forEach((cast, idx) => {
      console.log(`[Casts by Label] Cast ${idx + 1}: hash=${cast.cast_hash.substring(0, 10)}..., text_length=${cast.text?.length || 0}, images=${cast.images?.length || 0}, likes=${cast.likes_count}, timestamp=${cast.timestamp}`);
    });

    return NextResponse.json({ casts: finalCasts });
  } catch (error: any) {
    console.error("[Casts by Label] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch casts" },
      { status: 500 }
    );
  }
}

