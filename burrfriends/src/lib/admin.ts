/**
 * Admin utilities
 * 
 * Defines admin FIDs and helper functions for admin checks
 */

import { NOTIFICATIONS_BROADCAST_ADMIN_FIDS } from './constants';
import { isGlobalAdmin } from './permissions';

/**
 * Check if a FID is an admin
 * Global admins (from permissions.ts) are automatically admins.
 * Additional admins are defined by NOTIFICATIONS_BROADCAST_ADMIN_FIDS env var
 * 
 * @param fid - Farcaster user ID
 * @returns true if fid is an admin (global admin or in NOTIFICATIONS_BROADCAST_ADMIN_FIDS)
 */
export function isAdmin(fid: number): boolean {
  // Global admins are also admins
  if (isGlobalAdmin(fid)) return true;
  return NOTIFICATIONS_BROADCAST_ADMIN_FIDS.includes(fid);
}

/**
 * Require admin access - throws if user is not an admin
 * 
 * @param fid - Farcaster user ID
 * @throws Error if user is not an admin
 */
export function requireAdmin(fid: number): void {
  if (!isAdmin(fid)) {
    throw new Error('Admin access required');
  }
}

