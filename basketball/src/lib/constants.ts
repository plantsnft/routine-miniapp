/**
 * Basketball app constants
 */

// Accept SUPABASE_URL OR NEXT_PUBLIC_SUPABASE_URL (for seed scripts and Next.js compatibility)
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Accept SUPABASE_SERVICE_ROLE OR SUPABASE_SERVICE_ROLE_KEY (for seed scripts compatibility)
export const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Ensure APP_URL is always an absolute URL (https in production)
function normalizeAppUrl(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return 'http://localhost:3000';
  const s = raw.trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return `https://${s.replace(/^\/+|\/+$/g, '')}`;
}
const _appUrlRaw = process.env.NEXT_PUBLIC_BASE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  || 'http://localhost:3000';
export const APP_URL = normalizeAppUrl(_appUrlRaw);

// App configuration
export const APP_NAME = process.env.APP_NAME || "Basketball Sim";
export const APP_DESCRIPTION = process.env.APP_DESCRIPTION || "Daily basketball team simulation game";

// Neynar API
export const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

// Team names (in order of assignment)
export const TEAM_NAMES = ["Houston", "Atlanta", "Vegas", "NYC"] as const;

// UVA Player Names (1980-1986 era) - 25 unique names
export const UVA_PLAYER_NAMES_1980_1986 = [
  "Ralph Sampson",
  "Othell Wilson",
  "Jeff Lamp",
  "Lee Raker",
  "Craig Robinson",
  "Rick Carlisle",
  "Tim Mullen",
  "Kenton Edelin",
  "Jim Miller",
  "Dan Merrifield",
  "Jim Halpin",
  "Tom Sheehey",
  "Olden Polynice",
  "Andrew Kennedy",
  "Tom Calloway",
  "Kenny Johnson",
  "Anthony Teachey",
  "Tom Sweger",
  "Mark Mullen",
  "John Crotty",
  "Mel Kennedy",
  "Terry Gates",
  "Tommy Amaker",
  "Steve Kratzer",
  "John Johnson",
] as const;

// Initial team owners
export const FARCASTER_USERNAMES = ["catwalk", "farville", "plantsnft"] as const;
export const EMAIL_USER = "cpjets07@yahoo.com";
