/**
 * Helper functions for processing creator stats data.
 * Extracted from sync route for reusability and maintainability.
 */

/**
 * Parse location from Neynar user API response.
 * Handles both string and object formats.
 */
export function parseLocationFromUser(user: any): string | null {
  const rawLocation = 
    user.profile?.bio?.location || 
    user.profile?.location || 
    user.location ||
    user.bio?.location ||
    null;
  
  // Convert location object to readable string
  if (rawLocation && typeof rawLocation === 'object') {
    const addr = rawLocation.address || {};
    const parts = [
      addr.city,
      addr.state || addr.state_code,
      addr.country
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  
  return rawLocation;
}

/**
 * Extract image URLs from cast embeds.
 * Supports multiple embed formats from Neynar API.
 */
export function parseImagesFromCast(cast: any): string[] {
  const images: string[] = [];
  
  if (!cast.embeds || !Array.isArray(cast.embeds)) {
    return images;
  }
  
  for (const embed of cast.embeds) {
    // Check for direct image URLs
    if (embed.url && (
      embed.url.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i) || 
      embed.url.includes('imagedelivery.net') ||
      embed.url.includes('image/')
    )) {
      images.push(embed.url);
    }
    
    // Check for images array in embed
    if (Array.isArray(embed.images)) {
      for (const img of embed.images) {
        if (typeof img === 'string') {
          images.push(img);
        } else if (img?.url) {
          images.push(img.url);
        }
      }
    }
  }
  
  return images;
}

/**
 * Extract engagement stats (likes, recasts, replies) from cast.
 * Handles multiple possible Neynar API response formats.
 */
export function extractEngagementStats(cast: any): {
  likes: number;
  recasts: number;
  replies: number;
} {
  let likes = 0;
  let recasts = 0;
  let replies = 0;
  
  // Primary: reactions object (Neynar API v2 structure)
  if (cast.reactions) {
    // Likes can be a number or array
    if (typeof cast.reactions.likes === 'number') {
      likes = cast.reactions.likes;
    } else if (Array.isArray(cast.reactions.likes)) {
      likes = cast.reactions.likes.length;
    }
    
    // Recasts can be a number or array
    if (typeof cast.reactions.recasts === 'number') {
      recasts = cast.reactions.recasts;
    } else if (Array.isArray(cast.reactions.recasts)) {
      recasts = cast.reactions.recasts.length;
    }
  }
  
  // Fallback: check alternate locations for likes
  if (likes === 0) {
    likes = cast.reactions_count?.likes || 
            cast.likes_count || 
            (Array.isArray(cast.reactions) 
              ? cast.reactions.filter((r: any) => r.type === 'like' || r.like).length 
              : 0);
  }
  
  // Fallback: check alternate locations for recasts
  if (recasts === 0) {
    recasts = cast.reactions_count?.recasts || 
              cast.recasts_count ||
              (Array.isArray(cast.reactions)
                ? cast.reactions.filter((r: any) => r.type === 'recast' || r.recast).length
                : 0);
  }
  
  // Replies: check primary location
  if (cast.replies) {
    if (typeof cast.replies.count === 'number') {
      replies = cast.replies.count;
    } else if (Array.isArray(cast.replies)) {
      replies = cast.replies.length;
    }
  }
  
  // Fallback: check alternate location for replies
  if (replies === 0) {
    replies = cast.replies_count || 0;
  }
  
  return { likes, recasts, replies };
}

/**
 * Extract next cursor from Neynar API response.
 * Handles multiple possible response structures.
 */
export function extractNextCursor(data: any): string | null {
  return data.next?.cursor || 
         data.cursor || 
         data.next_cursor ||
         data.result?.next?.cursor ||
         data.result?.cursor ||
         null;
}

/**
 * Build Neynar feed API URL with query parameters.
 */
export function buildNeynarFeedUrl(
  parentUrl: string,
  cursor: string | null,
  viewerFid: number,
  limit: number = 100
): URL {
  const url = new URL('https://api.neynar.com/v2/farcaster/feed');
  url.searchParams.set('feed_type', 'filter');
  url.searchParams.set('filter_type', 'parent_url');
  url.searchParams.set('parent_url', parentUrl);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('viewer_fid', String(viewerFid));
  
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }
  
  return url;
}

