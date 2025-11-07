/**
 * Shared utilities for cast processing and formatting.
 * Used across multiple components and API routes.
 */

import type { CreatorCast } from "./creatorStats";

/**
 * Parse and normalize images array from database or API response.
 * Handles both string (JSON) and array formats from Supabase.
 * 
 * @param images - Images data (string, array, or null/undefined)
 * @returns Array of image URLs
 */
export function parseCastImages(images: any): string[] {
  if (!images) return [];
  
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[Cast Utils] Failed to parse images string:', e);
      return [];
    }
  }
  
  return Array.isArray(images) ? images : [];
}

/**
 * Format cast timestamp for display.
 * 
 * @param timestamp - ISO timestamp string
 * @param format - 'short' for compact format, 'long' for full format
 * @returns Formatted date string
 */
export function formatCastDate(timestamp: string, format: 'short' | 'long' = 'long'): string {
  try {
    const date = new Date(timestamp);
    if (format === 'short') {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    }
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (e) {
    console.error('[Cast Utils] Failed to parse date:', e);
    return format === 'short' ? 'Unknown' : 'Unknown date';
  }
}

/**
 * Sort casts by likes (descending), then by timestamp (descending).
 * Used for consistent sorting across the app.
 * 
 * @param casts - Array of casts to sort
 * @returns Sorted array of casts
 */
export function sortCastsByLikesAndDate(casts: CreatorCast[]): CreatorCast[] {
  return casts.sort((a, b) => {
    // Primary sort: likes_count descending (higher likes first)
    const aLikes = a.likes_count || 0;
    const bLikes = b.likes_count || 0;
    if (aLikes !== bLikes) {
      return bLikes - aLikes;
    }
    // Secondary sort: timestamp descending (newer first if likes are equal)
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

/**
 * Normalize cast object with default values for engagement stats.
 * Ensures all fields have proper defaults.
 * 
 * @param cast - Cast object to normalize
 * @returns Normalized cast object
 */
export function normalizeCast(cast: CreatorCast): CreatorCast {
  return {
    ...cast,
    images: parseCastImages(cast.images),
    text: cast.text || null,
    likes_count: cast.likes_count || 0,
    recasts_count: cast.recasts_count || 0,
    replies_count: cast.replies_count || 0,
  };
}

