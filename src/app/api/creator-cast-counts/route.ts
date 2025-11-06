import { NextResponse } from 'next/server';
import { getNeynarClient } from '~/lib/neynar';

const CATWALK_CHANNEL_URL = "https://warpcast.com/~/channel/catwalk";

/**
 * API endpoint to get cast counts for creators in the Catwalk channel.
 * Counts only top-level casts (posts), not replies/comments.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fids = searchParams.get('fids');
  
  if (!fids) {
    return NextResponse.json(
      { error: 'fids parameter is required (comma-separated)' },
      { status: 400 }
    );
  }

  const fidList = fids.split(',').map(f => parseInt(f.trim(), 10)).filter(f => !isNaN(f));
  
  if (fidList.length === 0) {
    return NextResponse.json(
      { error: 'No valid FIDs provided' },
      { status: 400 }
    );
  }

  try {
    const client = getNeynarClient();
    const castCounts: Record<number, number> = {};
    
    // Initialize all FIDs with 0 counts
    fidList.forEach(fid => {
      castCounts[fid] = 0;
    });

    // Fetch channel feed using the same strategy as channel-feed route
    // We'll fetch in batches and count casts per FID
    let cursor: string | undefined;
    let hasMore = true;
    let totalFetched = 0;
    const maxFetches = 10; // Limit to prevent excessive API calls
    let fetchCount = 0;

    while (hasMore && fetchCount < maxFetches) {
      fetchCount++;
      
      try {
        // Try Strategy 2: Direct API with feed_type=filter (most reliable for public channels)
        const queryParams = new URLSearchParams({
          feed_type: 'filter',
          filter_type: 'parent_url',
          parent_url: CATWALK_CHANNEL_URL,
          limit: '100',
        });
        
        if (cursor) {
          queryParams.append('cursor', cursor);
        }

        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/feed?${queryParams.toString()}`,
          {
            headers: {
              'x-api-key': process.env.NEYNAR_API_KEY || '',
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          console.error(`[Creator Cast Counts] API error: ${response.status} ${response.statusText}`);
          break;
        }

        const data = await response.json();
        const casts = data.casts || data.feed || [];
        
        if (casts.length === 0) {
          hasMore = false;
          break;
        }

        // Count casts per FID (only top-level casts, not replies)
        casts.forEach((cast: any) => {
          const authorFid = cast.author?.fid || cast.actor?.fid || cast.fid;
          // Only count if it's a top-level cast (no parent hash or parent_url or parent_author)
          // Check multiple possible fields for parent references
          const isTopLevel = !cast.parent_hash && 
                           !cast.parent_url && 
                           !cast.parent_author &&
                           !cast.parent?.hash &&
                           !cast.parent?.url &&
                           !cast.parent?.fid &&
                           cast.parent_hash === undefined &&
                           cast.parent_url === undefined;
          
          if (authorFid && isTopLevel && castCounts.hasOwnProperty(authorFid)) {
            castCounts[authorFid]++;
          }
        });

        totalFetched += casts.length;
        
        // Check if there's more data
        cursor = data.next?.cursor;
        hasMore = !!cursor && casts.length >= 100;
        
      } catch (error: any) {
        console.error(`[Creator Cast Counts] Error fetching batch ${fetchCount}:`, error);
        hasMore = false;
      }
    }

    console.log(`[Creator Cast Counts] Fetched ${totalFetched} casts total, counted for ${fidList.length} creators`);

    return NextResponse.json({
      castCounts,
      totalCastsFetched: totalFetched,
    });
  } catch (error: any) {
    console.error('[Creator Cast Counts] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch cast counts' },
      { status: 500 }
    );
  }
}

