/**
 * Admin utilities
 * 
 * Defines admin FIDs and helper functions for admin checks
 */

import { NOTIFICATIONS_BROADCAST_ADMIN_FIDS } from './constants';

/**
 * Check if a FID is an admin
 * Admins are defined by NOTIFICATIONS_BROADCAST_ADMIN_FIDS env var
 * 
 * @param fid - Farcaster user ID
 * @returns true if fid is an admin
 */
export function isAdmin(fid: number): boolean {
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

