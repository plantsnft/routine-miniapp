import { NextResponse } from 'next/server';
import { getNeynarClient } from '~/lib/neynar';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fids = searchParams.get('fids');

  if (!fids) {
    return NextResponse.json(
      { error: 'FIDs parameter is required' },
      { status: 400 }
    );
  }

  try {
    const neynar = getNeynarClient();
    const fidsArray = fids.split(',').map(fid => parseInt(fid.trim()));
    
    const { users } = await neynar.fetchBulkUsers({
      fids: fidsArray,
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error('Failed to fetch users:', error);
    if (error?.message?.includes('NEYNAR_API_KEY')) {
      return NextResponse.json(
        { error: 'Neynar API key is not configured. Please add NEYNAR_API_KEY to your environment variables.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch users. Please check your Neynar API key and try again.' },
      { status: 500 }
    );
  }
}
