/**
 * Application constants
 */

// Super owner has admin access to all clubs
export const SUPER_OWNER_FID = 318447;

// Club configuration
export const HELLFIRE_CLUB_SLUG = "hellfire";
export const HELLFIRE_CLUB_NAME = "Hellfire Club";
export const HELLFIRE_CLUB_DESCRIPTION = "Tormental's poker club";

// Hellfire Club (MVP-only club)
export const HELLFIRE_OWNER_FID = process.env.HELLFIRE_OWNER_FID 
  ? parseInt(process.env.HELLFIRE_OWNER_FID, 10) 
  : null;

// Tormental's FID (global admin) - set via TORMENTAL_FID env var
export const TORMENTAL_FID = process.env.TORMENTAL_FID 
  ? parseInt(process.env.TORMENTAL_FID, 10) 
  : null;

// Notification broadcast admin FIDs (comma-separated list)
// Example: "318447,123456"
export const NOTIFICATIONS_BROADCAST_ADMIN_FIDS = process.env.NOTIFICATIONS_BROADCAST_ADMIN_FIDS
  ? process.env.NOTIFICATIONS_BROADCAST_ADMIN_FIDS
    .split(',')
    .map(fidStr => fidStr.trim())
    .filter(fidStr => fidStr.length > 0)
    .map(fidStr => parseInt(fidStr, 10))
    .filter(fid => !isNaN(fid) && fid > 0)
  : [];

// Accept SUPABASE_URL OR NEXT_PUBLIC_SUPABASE_URL (for seed scripts and Next.js compatibility)
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Accept SUPABASE_SERVICE_ROLE OR SUPABASE_SERVICE_ROLE_KEY (for seed scripts compatibility)
export const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Ensure APP_URL is always an absolute URL
export const APP_URL = process.env.NEXT_PUBLIC_BASE_URL 
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  || 'http://localhost:3000';

// Base network configuration
export const BASE_CHAIN_ID = 8453;

// Base RPC URL - server-only env var (BASE_RPC_URL) with fallback to public (NEXT_PUBLIC_BASE_RPC_URL)
// Server-side code should use BASE_RPC_URL env var, but client-side code can use NEXT_PUBLIC_ version
export const BASE_RPC_URL = process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';

// Base USDC address
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Master wallet that controls escrow contract
export const MASTER_WALLET_ADDRESS = '0xd942a322Fa7d360F22C525a652F51cA0FC4aF012';

// Game Escrow contract address
// Server-only env var (GAME_ESCROW_CONTRACT) with fallback to public (NEXT_PUBLIC_GAME_ESCROW_CONTRACT)
// Server-side code should use GAME_ESCROW_CONTRACT env var, but client-side code can use NEXT_PUBLIC_ version
export const GAME_ESCROW_CONTRACT = process.env.GAME_ESCROW_CONTRACT || process.env.NEXT_PUBLIC_GAME_ESCROW_CONTRACT || '';

// Neynar API key
export const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '768ACB76-E4C1-488E-9BD7-3BAA76EC0F04';

// Poker credentials encryption key (32 bytes, base64 encoded)
// Required for encrypting/decrypting ClubGG credentials
export const POKER_CREDS_ENCRYPTION_KEY = process.env.POKER_CREDS_ENCRYPTION_KEY || '';
