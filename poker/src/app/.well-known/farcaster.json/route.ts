import { NextRequest, NextResponse } from 'next/server';
import { getFarcasterDomainManifest } from '~/lib/utils';

/**
 * GET /.well-known/farcaster.json
 * 
 * Serves the Farcaster Mini App manifest directly.
 * The manifest includes webhookUrl which must be an absolute URL.
 */
export async function GET(request: NextRequest) {
  try {
    // Get base URL from request to ensure absolute URLs
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
      (request.nextUrl.protocol === 'https' ? 'https://' : 'http://') + request.nextUrl.host;
    
    const config = await getFarcasterDomainManifest(baseUrl);
    return NextResponse.json(config);
  } catch (error) {
    console.error('[farcaster.json] Error generating manifest:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
