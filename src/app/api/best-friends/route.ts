import { NextResponse } from 'next/server';
import { getNeynarApiKey } from '~/lib/neynar';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get('fid');

  if (!fid) {
    return NextResponse.json(
      { error: 'FID parameter is required' },
      { status: 400 }
    );
  }

  try {
    const apiKey = getNeynarApiKey();
    
    // Use direct API call - SDK doesn't have fetchUserBestFriends method
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/best_friends?fid=${fid}&limit=3`,
      {
        headers: {
          'x-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.statusText}`);
    }

    const data = await response.json() as { users?: any[] };

    return NextResponse.json({ bestFriends: data.users || [] });
  } catch (error: any) {
    console.error('Failed to fetch best friends:', error);
    
    // Check if it's an API key error
    if (error?.message?.includes('NEYNAR_API_KEY')) {
      return NextResponse.json(
        { error: 'Neynar API key is not configured. Please add NEYNAR_API_KEY to your environment variables.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch best friends. Please try again.' },
      { status: 500 }
    );
  }
} 