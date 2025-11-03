import { NextRequest, NextResponse } from 'next/server';
import { getFarcasterDomainManifest } from '~/lib/utils';

export async function GET(request: NextRequest) {
  try {
    // Get base URL from request if NEXT_PUBLIC_URL is not set
    const baseUrl = process.env.NEXT_PUBLIC_URL || 
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    
    const config = await getFarcasterDomainManifest(baseUrl);
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error generating metadata:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
