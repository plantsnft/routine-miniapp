import { NextResponse } from 'next/server';
import { getNeynarClient } from '~/lib/neynar';

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
    const client = getNeynarClient();
    
    // Use SDK for best friends lookup - more reliable than direct API calls
    const response = await client.fetchUserBestFriends({
      fid: parseInt(fid),
      limit: 3,
    });

    return NextResponse.json({ bestFriends: response.users || [] });
  } catch (error: any) {
    console.error('Failed to fetch best friends:', error);
    
    // Check if it's an API key configuration error
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