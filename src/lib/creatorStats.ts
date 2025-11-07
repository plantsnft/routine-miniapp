/**
 * Creator stats database functions and data extraction utilities.
 * Handles storage and retrieval of creator cast data, metadata, and cat profiles.
 */

import { DUPLICATE_KEY_ERROR_CODE } from "./dbConstants";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
} as const;

export interface CreatorCast {
  id?: string;
  cast_hash: string;
  fid: number;
  text?: string | null;
  images?: string[];
  timestamp: string;
  parent_url?: string | null;
  author_username?: string | null;
  author_display_name?: string | null;
  likes_count?: number;
  recasts_count?: number;
  replies_count?: number;
  inserted_at?: string;
  updated_at?: string;
}

export interface CreatorMetadata {
  fid: number;
  cast_count: number;
  last_cast_date?: string | null;
  cat_names?: string[];
  location?: string | null;
  labels?: string[];
  location_manual_override?: boolean;
  cat_names_manual_override?: boolean;
  last_synced_at?: string;
  inserted_at?: string;
  updated_at?: string;
}

export interface CatProfile {
  id?: string;
  fid: number;
  cat_name: string;
  photos?: string[];
  ai_writeup?: string | null;
  photos_manual_override?: boolean;
  writeup_manual_override?: boolean;
  inserted_at?: string;
  updated_at?: string;
}

/**
 * Store or update a cast in the database.
 */
export async function storeCreatorCast(cast: CreatorCast): Promise<CreatorCast> {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL not configured");
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/creator_casts`, {
    method: "POST",
    headers: {
      ...SUPABASE_HEADERS,
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([cast]),
  });

  const text = await res.text();

  if (!res.ok) {
    // Handle duplicate key error gracefully (cast already exists)
    try {
      const errorData = JSON.parse(text);
      if (errorData.code === DUPLICATE_KEY_ERROR_CODE) {
        // Duplicate key - cast already exists, this is fine
        console.log(`[Creator Stats] Cast ${cast.cast_hash} already exists, skipping`);
        return cast;
      }
    } catch (_e) {
      // Not JSON, throw original error
    }
    throw new Error(`Failed to store cast: ${text}`);
  }

  // Check if response has content
  if (!text || text.trim() === '') {
    // Empty response means success but no data returned, return the cast we sent
    return cast;
  }

  try {
    const data = JSON.parse(text);
    return Array.isArray(data) && data.length > 0 ? data[0] : cast;
  } catch (_e) {
    // If JSON parse fails, return the cast we sent
    return cast;
  }
}

/**
 * Get all casts for a specific creator FID.
 * 
 * @param fid - Creator FID
 * @param limit - Optional limit on number of casts to return
 * @param sortByLikes - If true, sort by likes_count descending; otherwise by timestamp descending
 * @returns Array of casts for the creator
 */
export async function getCreatorCasts(fid: number, limit?: number, sortByLikes?: boolean): Promise<CreatorCast[]> {
  if (!SUPABASE_URL) {
    console.error(`[getCreatorCasts] SUPABASE_URL not configured for FID ${fid}`);
    return [];
  }

  // Build query URL with proper parameters
  // Sort by likes_count descending if requested, otherwise by timestamp descending
  // nullslast ensures casts with null likes_count appear at the end
  const sortOrder = sortByLikes 
    ? "likes_count.desc.nullslast,timestamp.desc" 
    : "timestamp.desc";
  
  const url = new URL(`${SUPABASE_URL}/rest/v1/creator_casts`);
  url.searchParams.set('fid', `eq.${fid}`);
  url.searchParams.set('order', sortOrder);
  if (limit) {
    url.searchParams.set('limit', String(limit));
  }
  
  console.log(`[getCreatorCasts] Querying FID ${fid} from: ${url.toString()}`);
  
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: SUPABASE_HEADERS,
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[getCreatorCasts] Failed to fetch casts for FID ${fid}: ${res.status} - ${errorText}`);
    return [];
  }

  const text = await res.text();
  if (!text || text.trim() === '') {
    console.log(`[getCreatorCasts] FID ${fid} returned empty response`);
    return [];
  }

  try {
    const data = JSON.parse(text);
    console.log(`[getCreatorCasts] FID ${fid} returned ${data.length} casts${sortByLikes ? " (sorted by likes)" : ""}`);
    return data;
  } catch (e) {
    console.error(`[getCreatorCasts] Failed to parse response for FID ${fid}:`, e);
    return [];
  }
}

/**
 * Update creator metadata (upsert - creates if doesn't exist, updates if it does).
 */
export async function updateCreatorMetadata(metadata: Partial<CreatorMetadata> & { fid: number }): Promise<CreatorMetadata> {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL not configured");
  }

  // Ensure cast_count is always a number (default to 0)
  const metadataWithDefaults: CreatorMetadata = {
    fid: metadata.fid,
    cast_count: metadata.cast_count ?? 0,
    last_cast_date: metadata.last_cast_date ?? null,
    cat_names: metadata.cat_names ?? [],
    location: metadata.location ?? null,
    labels: metadata.labels ?? [],
    location_manual_override: metadata.location_manual_override ?? false,
    cat_names_manual_override: metadata.cat_names_manual_override ?? false,
    last_synced_at: metadata.last_synced_at ?? new Date().toISOString(),
  };

  // Use UPSERT: POST with Prefer: resolution=merge-duplicates
  // This will insert if fid doesn't exist, or update if it does (based on primary key conflict)
  // Note: Supabase REST API expects an array for POST operations
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/creator_metadata`,
    {
      method: "POST",
      headers: {
        ...SUPABASE_HEADERS,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([metadataWithDefaults]),
    }
  );

  const text = await res.text();

  if (!res.ok) {
    console.error(`[updateCreatorMetadata] Failed to upsert metadata for FID ${metadata.fid}: ${res.status} - ${text}`);
    throw new Error(`Failed to update metadata: ${text}`);
  }

  // Parse response
  try {
    const data = JSON.parse(text);
    const result = data && data.length > 0 ? data[0] : metadataWithDefaults;
    console.log(`[updateCreatorMetadata] Successfully upserted metadata for FID ${metadata.fid}: cast_count=${result.cast_count}`);
    return result;
  } catch (_e) {
    // If JSON parse fails but response was OK, the upsert likely succeeded
    console.log(`[updateCreatorMetadata] JSON parse failed for FID ${metadata.fid}, but response was OK. Using provided metadata.`);
    return metadataWithDefaults;
  }
}

/**
 * Get creator metadata by FID.
 */
export async function getCreatorMetadata(fid: number): Promise<CreatorMetadata | null> {
  if (!SUPABASE_URL) {
    return null;
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/creator_metadata?fid=eq.${fid}&limit=1`,
    {
      method: "GET",
      headers: SUPABASE_HEADERS,
    }
  );

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  const result = data && data.length > 0 ? data[0] : null;
  if (result) {
    console.log(`[getCreatorMetadata] Found metadata for FID ${fid} with cast_count: ${result.cast_count}`);
  } else {
    console.log(`[getCreatorMetadata] No metadata found for FID ${fid}`);
  }
  return result;
}

/**
 * Get all creator metadata, sorted by last_cast_date (most recent first).
 */
export async function getAllCreatorMetadata(): Promise<CreatorMetadata[]> {
  if (!SUPABASE_URL) {
    console.error("[getAllCreatorMetadata] SUPABASE_URL not configured");
    return [];
  }

  const url = `${SUPABASE_URL}/rest/v1/creator_metadata?order=last_cast_date.desc.nullslast`;
  console.log(`[getAllCreatorMetadata] Querying: ${url}`);
  
  const res = await fetch(url, {
    method: "GET",
    headers: SUPABASE_HEADERS,
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[getAllCreatorMetadata] Failed to fetch metadata: ${res.status} - ${errorText}`);
    return [];
  }

  const data = await res.json();
  console.log(`[getAllCreatorMetadata] Retrieved ${data.length} metadata records`);
  if (data.length > 0) {
    console.log(`[getAllCreatorMetadata] Sample: FID ${data[0].fid} has cast_count: ${data[0].cast_count}`);
  } else {
    console.warn(`[getAllCreatorMetadata] WARNING: No metadata records found in database!`);
  }
  return data;
}

/**
 * Store or update a cat profile.
 */
export async function storeCatProfile(profile: CatProfile): Promise<CatProfile> {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL not configured");
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/cat_profiles`, {
    method: "POST",
    headers: {
      ...SUPABASE_HEADERS,
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([profile]),
  });

  const text = await res.text();

  if (!res.ok) {
    // Handle duplicate key error gracefully (cat profile already exists)
    try {
      const errorData = JSON.parse(text);
      if (errorData.code === DUPLICATE_KEY_ERROR_CODE) {
        // Duplicate key - cat profile already exists, this is fine
        console.log(`[Creator Stats] Cat profile for FID ${profile.fid}, cat ${profile.cat_name} already exists, skipping`);
        return profile;
      }
    } catch (_e) {
      // Not JSON, throw original error
    }
    throw new Error(`Failed to store cat profile: ${text}`);
  }

  // Check if response has content
  if (!text || text.trim() === '') {
    // Empty response means success but no data returned, return the profile we sent
    return profile;
  }

  try {
    const data = JSON.parse(text);
    return Array.isArray(data) && data.length > 0 ? data[0] : profile;
  } catch (_e) {
    // If JSON parse fails, return the profile we sent
    return profile;
  }
}

/**
 * Get all cat profiles for a creator FID.
 */
export async function getCatProfiles(fid: number): Promise<CatProfile[]> {
  if (!SUPABASE_URL) {
    return [];
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cat_profiles?fid=eq.${fid}`,
    {
      method: "GET",
      headers: SUPABASE_HEADERS,
    }
  );

  if (!res.ok) {
    return [];
  }

  return await res.json();
}

/**
 * Extract cat names from cast text.
 * Looks for patterns like "my cat [name]", "[name] the cat", etc.
 */
export function extractCatNames(castText: string): string[] {
  const names: string[] = [];
  if (!castText) return names;

  const text = castText.toLowerCase();
  
  // Patterns to match
  const patterns = [
    /(?:my|our) (?:cat|cats|kitten|kittens) (?:named|called|is|are|:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /(?:cat|cats|kitten|kittens) (?:named|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:the|is|was|my|our) (?:cat|kitten)/gi,
    /#([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, // Hashtags
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const name = match[1].trim();
        // Filter out common false positives
        if (name.length > 1 && name.length < 30 && !names.includes(name)) {
          // Check if it's not a common word
          const commonWords = ['the', 'and', 'with', 'from', 'that', 'this', 'cat', 'cats', 'kitten', 'kittens'];
          if (!commonWords.includes(name.toLowerCase())) {
            names.push(name);
          }
        }
      }
    }
  }

  return names;
}

/**
 * Extract labels/categories from cast text.
 * 
 * Detects types like "off leash", "on leash", "backpack", "stroller", etc.
 * Labels are normalized (e.g., "off-leash", "offleash" -> "off leash").
 * 
 * See labelKeywords object for full list of supported labels.
 * 
 * @param castText - The cast text to search for labels
 * @returns Array of normalized labels found in the text
 */
export function extractLabels(castText: string): string[] {
  const labels: string[] = [];
  if (!castText) return labels;

  const text = castText.toLowerCase();
  
  // Label keywords
  const labelKeywords: Record<string, string> = {
    'off leash': 'off leash',
    'off-leash': 'off leash',
    'offleash': 'off leash',
    'on leash': 'on leash',
    'on-leash': 'on leash',
    'onleash': 'on leash',
    'leashed': 'on leash',
    'backpack': 'backpack',
    'back pack': 'backpack',
    'stroller': 'stroller',
    'car ride': 'car ride',
    'car rides': 'car ride',
    'traveling': 'traveling',
    'travel': 'traveling',
    'adventure': 'adventure',
    'hiking': 'hiking',
    'outdoor': 'outdoor',
    'indoor': 'indoor',
    'park': 'park',
    'city': 'city',
    'urban': 'urban',
  };

  for (const [keyword, label] of Object.entries(labelKeywords)) {
    if (text.includes(keyword) && !labels.includes(label)) {
      labels.push(label);
    }
  }

  return labels;
}

/**
 * Get cast count for a creator from stored casts.
 */
export async function getCastCount(fid: number): Promise<number> {
  const casts = await getCreatorCasts(fid);
  const count = casts.length;
  console.log(`[getCastCount] FID ${fid} has ${count} casts in database`);
  return count;
}

/**
 * Get the most recent cast date for a creator.
 */
export async function getLastCastDate(fid: number): Promise<string | null> {
  const casts = await getCreatorCasts(fid, 1);
  return casts.length > 0 ? casts[0].timestamp : null;
}

