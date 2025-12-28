import { NextResponse } from 'next/server';
import { getNeynarClient } from '~/lib/neynar';

/**
 * API endpoint to fetch FIDs for creator usernames.
 * Uses the Farcaster names API first, then falls back to Neynar API.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const usernames = searchParams.get('usernames');
  
  if (!usernames) {
    return NextResponse.json(
      { error: 'usernames parameter is required (comma-separated)' },
      { status: 400 }
    );
  }

  const usernameList = usernames.split(',').map(u => u.trim()).filter(Boolean);
  
  try {
    const fids: number[] = [];
    const errors: string[] = [];
    const apiKey = process.env.NEYNAR_API_KEY;

    // Fetch FID for each username
    for (const username of usernameList) {
      let fid: number | null = null;
      
      // Try Farcaster names API first
      try {
        const response = await fetch(
          `https://fnames.farcaster.xyz/transfers/current?name=${encodeURIComponent(username)}`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json() as any;
          // Check different possible response structures
          // API returns { transfer: { to: 123 } } or { transfers: [{ to: 123 }] }
          const fidStr = data?.transfer?.to || data?.transfers?.[0]?.to || data?.to || data?.fid;
          if (fidStr) {
            fid = parseInt(fidStr, 10);
            if (!isNaN(fid)) {
              fids.push(fid);
              continue; // Success, move to next username
            }
          }
        }
      } catch (_error: any) {
        // Continue to Neynar fallback
      }

      // Fallback to Neynar API if available
      // Note: Neynar API lookupUserByUsername returns User directly, not wrapped in result
      if (!fid && apiKey) {
        try {
          const client = getNeynarClient();
          const userResponse = await client.lookupUserByUsername({ username });
          // Access user directly - the SDK returns User object, not wrapped
          const fid = (userResponse as any)?.user?.fid || (userResponse as any)?.fid;
          if (fid) {
            fids.push(parseInt(String(fid), 10));
            continue; // Success
          }
        } catch (_error: any) {
          // Continue to error
        }
      }

      // If we got here, both methods failed
      errors.push(`${username}: No FID found`);
    }

    return NextResponse.json({
      fids,
      errors: errors.length > 0 ? errors : undefined,
      count: fids.length,
    });
  } catch (error: any) {
    console.error('[Creator FIDs] Error fetching FIDs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch creator FIDs' },
      { status: 500 }
    );
  }
}

