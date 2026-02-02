import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GIVEAWAY_GAMES_CLUB_SLUG } from './lib/constants';

/**
 * Middleware to redirect old "hellfire" URLs to new "giveaway-games" URLs
 * This ensures backward compatibility for bookmarks and shared links
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old slug to new slug
  if (pathname.startsWith('/clubs/hellfire')) {
    const newPath = pathname.replace('/clubs/hellfire', `/clubs/${GIVEAWAY_GAMES_CLUB_SLUG}`);
    return NextResponse.redirect(new URL(newPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/clubs/hellfire/:path*',
};
