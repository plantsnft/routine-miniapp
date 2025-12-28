/**
 * Poker-specific permission checking utilities
 * 
 * These helpers enforce permission checks for poker operations:
 * - Global admins can do everything
 * - Club owners can manage their clubs
 * - Club members can participate in their clubs' games
 */

import { pokerDb } from './pokerDb';
import { isGlobalAdmin } from './permissions';
import { HELLFIRE_CLUB_SLUG } from './constants';

// Re-export for convenience
export { isGlobalAdmin } from './permissions';

/**
 * Validate that a club is Hellfire (MVP-only restriction)
 * Throws error if club is not Hellfire
 */
export async function requireHellfireClub(clubIdOrSlug: string): Promise<void> {
  try {
    // UUIDs have format: 8-4-4-4-12 hex digits with dashes
    // Slugs are short strings like "hellfire"
    // Check if it's a slug by seeing if it matches HELLFIRE_CLUB_SLUG or doesn't look like a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdOrSlug);
    
    const club = await pokerDb.fetch('clubs', {
      filters: isUUID ? { id: clubIdOrSlug } : { slug: clubIdOrSlug },
      limit: 1,
    });
    
    if (club.length === 0 || (club[0] as any).slug !== HELLFIRE_CLUB_SLUG) {
      throw new Error('Only Hellfire club is supported in MVP');
    }
  } catch (error: any) {
    if (error.message?.includes('Hellfire')) {
      throw error;
    }
    throw new Error('Club not found');
  }
}

/**
 * Check if a user is a member of a club
 */
export async function isClubMember(fid: number, clubId: string): Promise<boolean> {
  try {
    const members = await pokerDb.fetch('club_members', {
      filters: { club_id: clubId, fid: fid },
      limit: 1,
    });
    return members.length > 0;
  } catch (error) {
    console.error('[pokerPermissions] Error checking club membership:', error);
    return false;
  }
}

/**
 * Get club by ID
 */
export async function getClub(clubId: string) {
  try {
    const clubs = await pokerDb.fetch('clubs', {
      filters: { id: clubId },
      limit: 1,
    });
    return clubs.length > 0 ? clubs[0] : null;
  } catch (error) {
    console.error('[pokerPermissions] Error fetching club:', error);
    return null;
  }
}

/**
 * Get club ID for a game
 */
export async function getClubForGame(gameId: string): Promise<string | null> {
  try {
    const games = await pokerDb.fetch('games', {
      select: 'club_id',
      filters: { id: gameId },
      limit: 1,
    });
    return games.length > 0 ? (games[0] as any).club_id : null;
  } catch (error) {
    console.error('[pokerPermissions] Error fetching club for game:', error);
    return null;
  }
}

/**
 * Check if a user is the owner of a club
 */
export async function isClubOwner(fid: number, clubId: string): Promise<boolean> {
  // Global admins can act as club owners
  if (isGlobalAdmin(fid)) {
    return true;
  }
  
  try {
    const club = await getClub(clubId);
    if (!club) return false;
    return (club as any).owner_fid === fid;
  } catch (error) {
    console.error('[pokerPermissions] Error checking club ownership:', error);
    return false;
  }
}

/**
 * Require that the user is a club owner (throws if not)
 * Use this in API routes that need club owner permissions.
 */
export async function requireClubOwner(fid: number, clubId: string): Promise<void> {
  const isOwner = await isClubOwner(fid, clubId);
  if (!isOwner) {
    throw new Error(`User ${fid} is not the owner of club ${clubId}`);
  }
}

/**
 * Require that the user is a club member (throws if not)
 * Use this in API routes that need club membership.
 */
export async function requireClubMember(fid: number, clubId: string): Promise<void> {
  // Global admins can access any club
  if (isGlobalAdmin(fid)) {
    return;
  }
  
  const isMember = await isClubMember(fid, clubId);
  if (!isMember) {
    throw new Error(`User ${fid} is not a member of club ${clubId}`);
  }
}

/**
 * Require that the user can access a game (open signup - no membership required)
 * MVP: Any authed user can access games (unless blocked)
 */
export async function requireGameAccess(fid: number, gameId: string): Promise<string> {
  const clubId = await getClubForGame(gameId);
  if (!clubId) {
    throw new Error(`Game ${gameId} not found`);
  }
  
  // MVP: Open signup - no membership check needed
  // Block check is handled separately by requireNotBlocked()
  return clubId;
}

/**
 * Create a 403 Forbidden response for permission errors
 */
export function createForbiddenResponse(message: string) {
  return {
    ok: false,
    error: message,
  };
}
