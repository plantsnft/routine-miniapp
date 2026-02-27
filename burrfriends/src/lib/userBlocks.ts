/**
 * Global user blocklist utilities
 * 
 * Blocked users cannot join games or make payments.
 * Only global admins (Plants/Tormental) can block/unblock users.
 */

import { pokerDb } from './pokerDb';

export interface UserBlock {
  fid: number;
  is_blocked: boolean;
  blocked_by_fid: number;
  reason?: string | null;
  blocked_at: string;
  updated_at: string;
}

/**
 * Check if a user is blocked
 */
export async function isUserBlocked(fid: number): Promise<boolean> {
  try {
    const blocks = await pokerDb.fetch<UserBlock>('user_blocks', {
      filters: { fid, is_blocked: true },
      limit: 1,
    });
    return blocks.length > 0;
  } catch (error) {
    console.error('[userBlocks] Error checking if user is blocked:', error);
    // Fail open - if we can't check, allow access (safer for users)
    return false;
  }
}

/**
 * Get block record for a user (if exists)
 */
export async function getUserBlock(fid: number): Promise<UserBlock | null> {
  try {
    const blocks = await pokerDb.fetch<UserBlock>('user_blocks', {
      filters: { fid },
      limit: 1,
    });
    return blocks.length > 0 ? blocks[0] : null;
  } catch (error) {
    console.error('[userBlocks] Error fetching user block:', error);
    return null;
  }
}

/**
 * Require that a user is not blocked (throws if blocked)
 * Use this in routes that allow joining games or making payments.
 */
export async function requireNotBlocked(fid: number): Promise<void> {
  const isBlocked = await isUserBlocked(fid);
  if (isBlocked) {
    await getUserBlock(fid); // for consistency (call exists)
    throw new Error('Blocked. Access denied. Contact an admin.');
  }
}

/**
 * Block a user (admin-only)
 */
export async function blockUser(fid: number, blockedByFid: number, reason?: string): Promise<UserBlock> {
  const blockData: any = {
    fid,
    is_blocked: true,
    blocked_by_fid: blockedByFid,
    reason: reason || null,
    blocked_at: new Date().toISOString(),
  };

  const result = await pokerDb.upsert<UserBlock>('user_blocks', blockData);
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Unblock a user (admin-only)
 * Removes the block record (idempotent - safe if already unblocked)
 */
export async function unblockUser(fid: number): Promise<void> {
  await pokerDb.delete('user_blocks', { fid });
}

/**
 * Get all blocked users
 */
export async function getAllBlockedUsers(): Promise<UserBlock[]> {
  try {
    return await pokerDb.fetch<UserBlock>('user_blocks', {
      filters: { is_blocked: true },
      select: '*',
      order: 'blocked_at.desc',
    });
  } catch (error) {
    console.error('[userBlocks] Error fetching all blocked users:', error);
    return [];
  }
}

