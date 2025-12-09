/**
 * Permission checking utilities for club ownership and admin access.
 */

import { SUPER_OWNER_FID } from './constants';
import type { Club } from './types';

/**
 * Check if a viewer FID has owner/admin access to a club.
 * Super owner (318447) has access to all clubs.
 * 
 * @param viewerFid - The FID of the user checking permissions
 * @param club - The club object (must have owner_fid)
 * @returns true if the viewer is the super owner, the club owner, or an admin member
 */
export function isClubOwnerOrAdmin(viewerFid: number | null | undefined, club: { owner_fid: number }): boolean {
  if (!viewerFid) return false;
  
  // Super owner has access to all clubs
  if (viewerFid === SUPER_OWNER_FID) return true;
  
  // Club owner has access
  if (viewerFid === club.owner_fid) return true;
  
  // Future: could check club_members table for 'owner' or 'admin' roles
  // For now, only owner_fid and super owner grant access
  
  return false;
}

/**
 * Check if a viewer FID is the super owner.
 * 
 * @param viewerFid - The FID of the user
 * @returns true if the viewer is the super owner
 */
export function isSuperOwner(viewerFid: number | null | undefined): boolean {
  if (!viewerFid) return false;
  return viewerFid === SUPER_OWNER_FID;
}
