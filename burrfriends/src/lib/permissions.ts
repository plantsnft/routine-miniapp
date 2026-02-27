/**
 * Permission checking utilities for club ownership and admin access.
 */

import type { NextRequest } from "next/server";
import { HELLFIRE_CLUB_SLUG } from './constants';
import type { Club } from './types';

import { TORMENTAL_FID } from './constants';
import { hasBetaAccess } from './beta';

// SIAs Poker Room co-owners (all have owner access)
const SIAS_POKER_ROOM_OWNER_FIDS = [318447, 273708, 311933]; // Tormental, siadude, and burr

/**
 * Global admin FIDs (hardcoded allowlist)
 * All FIDs in this array get full admin access across the entire app.
 * This is the single source of truth for admin access.
 * To add a new admin: add their FID here, deploy, done.
 */
export const GLOBAL_ADMIN_FIDS = [
  318447, // Plants (plantsnft)
  273708, // siadude
  311933, // burr
  624048, // admin (added 2026-02-12)
  871872, // admin (added 2026-02-12)
  497229, // dflory3 (added 2026-02-12)
  206967, // netnose (Mirko) (added 2026-02-17)
  ...(TORMENTAL_FID && Number.isFinite(TORMENTAL_FID) ? [TORMENTAL_FID] : []), // Tormental
].filter(Number.isFinite) as readonly number[];

/**
 * Check if a viewer FID has owner/admin access to a club.
 * Global admins (GLOBAL_ADMIN_FIDS) have access to all clubs.
 * For SIAs Poker Room, co-owners also have access.
 * 
 * @param viewerFid - The FID of the user checking permissions
 * @param club - The club object (must have owner_fid and optionally slug)
 * @returns true if the viewer is a global admin, the club owner, or a co-owner
 */
export function isClubOwnerOrAdmin(viewerFid: number | null | undefined, club: { owner_fid: number; slug?: string }): boolean {
  if (!viewerFid) return false;
  
  // Global admins have access to all clubs
  if (isGlobalAdmin(viewerFid)) return true;
  
  // For SIAs Poker Room, both co-owners have access
  if (club.slug === HELLFIRE_CLUB_SLUG && SIAS_POKER_ROOM_OWNER_FIDS.includes(viewerFid)) {
    return true;
  }
  
  // Club owner has access
  if (viewerFid === club.owner_fid) return true;
  
  // Future: could check club_members table for 'owner' or 'admin' roles
  // For now, only owner_fid and super owner grant access
  
  return false;
}

/**
 * Check if a viewer FID is a super owner.
 * Super owners (all global admins) have access to all clubs.
 * 
 * @param viewerFid - The FID of the user
 * @returns true if the viewer is a super owner (global admin)
 */
export function isSuperOwner(viewerFid: number | null | undefined): boolean {
  if (!viewerFid) return false;
  return GLOBAL_ADMIN_FIDS.includes(viewerFid as any);
}

/**
 * Check if a viewer FID is a global admin (hardcoded allowlist).
 * Global admins can manage all clubs.
 * 
 * @param viewerFid - The FID of the user
 * @returns true if the viewer is a global admin
 */
export function isGlobalAdmin(viewerFid: number | null | undefined): boolean {
  if (!viewerFid) return false;
  return GLOBAL_ADMIN_FIDS.includes(viewerFid as any);
}

/**
 * Phase 29.1: Check if an admin should bypass BETR GAMES registration/staking
 * for a preview game. Returns true ONLY when the user is a global admin AND
 * the game has is_preview = true.
 *
 * Used by submit/signup routes to allow admins to play preview games without
 * being registered for BETR GAMES or meeting staking requirements.
 *
 * @param fid - The FID of the user
 * @param isPreview - The is_preview flag from the game record
 * @returns true if admin preview bypass applies
 */
export function isAdminPreviewBypass(fid: number | null | undefined, isPreview: boolean | null | undefined): boolean {
  if (!fid || !isPreview) return false;
  return isGlobalAdmin(fid);
}

/**
 * Phase 29.2: Check if user can play a preview game.
 * True when isAdminPreviewBypass(fid, isPreview) OR (hasBetaAccess(req) && isPreview).
 *
 * @param fid - The FID of the user
 * @param isPreview - The is_preview flag from the game record
 * @param req - The request (for beta cookie)
 */
export function canPlayPreviewGame(
  fid: number | null | undefined,
  isPreview: boolean | null | undefined,
  req: NextRequest
): boolean {
  return isAdminPreviewBypass(fid, isPreview) || (hasBetaAccess(req) && isPreview === true);
}
