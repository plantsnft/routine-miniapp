import { NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get('fid');

  if (!fid) {
    return NextResponse.json(
      { error: 'FID parameter is required' },
      { status: 400 }
    );
  }

  if (!NEYNAR_API_KEY) {
    return NextResponse.json(
      { error: 'Neynar API key is not configured.' },
      { status: 500 }
    );
  }

  try {
    // Use direct API call - SDK doesn't have fetchUserBestFriends method
    const url = "https://api.neynar.com/v2/farcaster/user/best_friends?fid=" + fid + "&limit=3";
    const response = await fetch(url, {
      headers: {
        'x-api-key': NEYNAR_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Neynar API error:', errorText);
      throw new Error("Neynar API error: " + response.status);
    }

    const data = await response.json() as { users?: any[] };

    return NextResponse.json({ bestFriends: data.users || [] });
  } catch (error: any) {
    console.error('Failed to fetch best friends:', error);
    return NextResponse.json(
      { error: 'Failed to fetch best friends. Please try again.' },
      { status: 500 }
    );
  }
}
