import { NextResponse } from 'next/server';

/**
 * GET /.well-known/farcaster.json
 * Redirects to Farcaster Hosted Manifest
 * 
 * This is required for Farcaster Mini App registration.
 * The redirect must be a 307 (Temporary Redirect) as per Farcaster requirements.
 */
export async function GET() {
  // Farcaster Hosted Manifest URL (from Farcaster Dashboard)
  const hostedManifestUrl = 'https://api.farcaster.xyz/miniapps/hosted-manifest/019bfe38-2418-754c-e284-767d848ced1a';
  
  // Return 307 Temporary Redirect to hosted manifest
  return NextResponse.redirect(hostedManifestUrl, { status: 307 });
}
