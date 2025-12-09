/**
 * Application constants
 */

// Super owner has admin access to all clubs
export const SUPER_OWNER_FID = 318447;

// Club configuration
export const HELLFIRE_CLUB_SLUG = "hellfire";
export const HELLFIRE_CLUB_NAME = "Hellfire Club";
export const HELLFIRE_CLUB_DESCRIPTION = "Tormental's poker club";

export const BURRFRIENDS_CLUB_SLUG = "burrfriends";
export const BURRFRIENDS_CLUB_NAME = "Burrfriends";
export const BURRFRIENDS_CLUB_DESCRIPTION = "Burr's poker club";

export const HELLFIRE_OWNER_FID = process.env.HELLFIRE_OWNER_FID 
  ? parseInt(process.env.HELLFIRE_OWNER_FID, 10) 
  : null;

export const BURRFRIENDS_OWNER_FID = process.env.BURRFRIENDS_OWNER_FID
  ? parseInt(process.env.BURRFRIENDS_OWNER_FID, 10)
  : null;

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

export const APP_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'http://localhost:3000';
