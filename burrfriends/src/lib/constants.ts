/**
 * Application constants
 */

// Super owner has admin access to all clubs
// Note: siadude (273708) and burr (311933) also have super owner permissions via isClubOwnerOrAdmin and isGlobalAdmin
export const SUPER_OWNER_FID = 318447;

// Club configuration
export const BURRFRIENDS_CLUB_SLUG = "burrfriends";
export const BURRFRIENDS_CLUB_NAME = "BETR WITH BURR";
export const BURRFRIENDS_CLUB_DESCRIPTION = "play poker with burr and friends";

// BETR WITH BURR club
// Owner FIDs: 318447 (Tormental), 273708 (siadude), and 311933 (burr)
export const BURRFRIENDS_OWNER_FID = process.env.BURRFRIENDS_OWNER_FID 
  ? parseInt(process.env.BURRFRIENDS_OWNER_FID, 10) 
  : 318447; // Default to Tormental's FID

// Legacy compatibility (for backward compatibility during migration)
export const HELLFIRE_CLUB_SLUG = BURRFRIENDS_CLUB_SLUG;
export const HELLFIRE_CLUB_NAME = BURRFRIENDS_CLUB_NAME;
export const HELLFIRE_CLUB_DESCRIPTION = BURRFRIENDS_CLUB_DESCRIPTION;
export const HELLFIRE_OWNER_FID = BURRFRIENDS_OWNER_FID;

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

// Base network configuration
export const BASE_CHAIN_ID = 8453;

// Base RPC URL - server-only env var (BASE_RPC_URL) with fallback to public (NEXT_PUBLIC_BASE_RPC_URL)
// Server-side code should use BASE_RPC_URL env var, but client-side code can use NEXT_PUBLIC_ version
export const BASE_RPC_URL = process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';

// Base USDC address
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// BETR token address (Base network)
export const BETR_TOKEN_ADDRESS = '0x051024B653E8ec69E72693F776c41C2A9401FB07';

// BETR token maximum amount (100 million BETR)
export const BETR_MAX_AMOUNT = 100_000_000;

// BETR staking contract address (Base network)
// Contract: BETRStaking at 0x808a12766632b456a74834f2fa8ae06dfc7482f1
// Function: stakedAmount(address _user) external view returns (uint256)
export const BETR_STAKING_CONTRACT_ADDRESS = '0x808a12766632b456a74834f2fa8ae06dfc7482f1';

// Minted Merch token address (Base network)
// Token: mintedmerch ERC-20
export const MINTED_MERCH_TOKEN_ADDRESS = '0x774EAeFE73Df7959496Ac92a77279A8D7d690b07';

// Minted Merch staking contract (Base network)
// Same bytecode as BETRStaking. Read function: balanceOf(address) — NOT stakedAmount.
export const MINTED_MERCH_STAKING_CONTRACT_ADDRESS = '0x38AE5d952FA83eD57c5b5dE59b6e36Ce975a9150';

// Community config — single source of truth for token + staking per community (Phase 36)
export const COMMUNITY_CONFIG = {
  betr: {
    tokenAddress: BETR_TOKEN_ADDRESS,
    stakingAddress: BETR_STAKING_CONTRACT_ADDRESS,
    stakingFn: 'stakedAmount' as const,
  },
  minted_merch: {
    tokenAddress: MINTED_MERCH_TOKEN_ADDRESS,
    stakingAddress: MINTED_MERCH_STAKING_CONTRACT_ADDRESS,
    stakingFn: 'balanceOf' as const,
  },
} as const;

export type Community = keyof typeof COMMUNITY_CONFIG;

// Valid staking threshold amounts for game gating (in BETR)
// These are the only allowed values for staking_min_amount
export const VALID_STAKING_THRESHOLDS = [
  1_000_000,      // 1M BETR
  5_000_000,      // 5M BETR
  25_000_000,     // 25M BETR
  50_000_000,     // 50M BETR
  200_000_000,    // 200M BETR
] as const;

// BETR GAMES registration deadline — DEPRECATED: Registration now closes when admin clicks
// "Close Registration for BETR GAMES" (Phase 22.9: tournament_players table check).
// Kept commented out for historical reference only.
// export const BETR_GAMES_SIGNUP_DEADLINE = new Date('2026-02-09T05:01:00Z');

// Pre-approved FIDs for BETR GAMES (auto-approved on registration)
// These 50 users get instant approval when they register
export const BETR_GAMES_PRE_APPROVED_FIDS: number[] = [
  266299, // tbullet.eth
  205937, // cellar
  214447, // yes2crypto.eth
  939842, // snoova
  14369, // madyak
  2441, // grunt
  311933, // burr.eth
  477126, // catfacts.eth
  471160, // pramadan.eth
  440747, // arob1000
  223778, // jerry-d
  417851, // tracyit
  311845, // reisub.eth
  18975, // taliskye
  238814, // sardius
  291686, // tatiansa.eth
  254680, // blueflame
  1047052, // jabo5779
  312016, // mikos32.eth
  621261, // pixahead.eth
  318447, // plantsnft
  479174, // pelicia
  215589, // listen2mm.eth
  203666, // leovido.eth
  3652, // aqueous
  491626, // habitforming
  497229, // dflory3
  1066546, // nycaakash
  526510, // mariabazooka
  351897, // ramsey
  1168896, // gorikfr
  325710, // hazardzista
  20384, // itsbasil
  230238, // mvr
  499579, // chronist
  18570, // qt
  214570, // cav4lier
  514448, // 6bazinga
  5431, // esdotge
  214569, // lazyfrank
  1109570, // based-eth-ryan
  265909, // cryptomantis
  938023, // warpc0st
  511063, // mangkarones
  226524, // 3olo
  238466, // poet.base.eth
  2211, // commstark
  485, // bind
  4715, // logonaut.eth
  455965, // nhp
];

// Legacy: Minimum BETR staked required to register for BETR GAMES 
// NOTE: This is no longer used for registration gating (Phase 22 removes staking requirement)
export const BETR_GAMES_REGISTRATION_MIN_STAKE = 50_000_000;

// Type for valid staking threshold
export type ValidStakingThreshold = typeof VALID_STAKING_THRESHOLDS[number];

// Helper function to check if a value is a valid staking threshold
export function isValidStakingThreshold(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return true; // null/undefined is valid (no staking requirement)
  return VALID_STAKING_THRESHOLDS.includes(value as ValidStakingThreshold);
}

// Master wallet that controls escrow contract
export const MASTER_WALLET_ADDRESS = '0xd942a322Fa7d360F22C525a652F51cA0FC4aF012';

// Game Escrow contract address
// Server-only env var (GAME_ESCROW_CONTRACT) with fallback to public (NEXT_PUBLIC_GAME_ESCROW_CONTRACT)
// Server-side code should use GAME_ESCROW_CONTRACT env var, but client-side code can use NEXT_PUBLIC_ version
export const GAME_ESCROW_CONTRACT = process.env.GAME_ESCROW_CONTRACT || process.env.NEXT_PUBLIC_GAME_ESCROW_CONTRACT || '';

// Neynar API key
export const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '768ACB76-E4C1-488E-9BD7-3BAA76EC0F04';

// BETR WITH BURR Farcaster channel configuration (feed source: BETR channel at https://farcaster.xyz/~/channel/betr)
export const BURRFRIENDS_CHANNEL_ID = "betr";
export const BURRFRIENDS_CHANNEL_PARENT_URL = "https://farcaster.xyz/~/channel/betr";
export const BURRFRIENDS_CHANNEL_URL = "https://farcaster.xyz/~/channel/betr";

// FRAMEDL BETR – Play (miniapp first, then web fallback)
// Phase 12.1: Rebranded from REMIX_BETR_PLAY_URL
// Farcaster miniapp launch URL — opens Framedl as miniapp inside Warpcast (12.16)
export const FRAMEDL_MINIAPP_LAUNCH_URL = "https://farcaster.xyz/miniapps/KdCXV0aKWcm6/framedl";
// Web app URL — fallback when openMiniApp unavailable or outside miniapp
export const FRAMEDL_BETR_PLAY_URL = "https://framedl.com/app/v2?id=0938f0cf-6a86-4254-9c14-0fafbf1fd5d2&app=1";

// WEEKEND GAME - REMIX 3D Tunnel Racer (Phase 30)
export const WEEKEND_GAME_PLAY_URL = "https://play.remix.gg/games/1ecca8f5-107c-4e0d-9b99-d75b3371fd2b";
export const WEEKEND_GAME_CREATOR = "@spaceman-ngu.eth";

// TO SPINFINITY AND BEYOND ART CONTEST (Phase 39) – example cast URL shown on game page
export const ART_CONTEST_EXAMPLE_CAST_URL = "https://farcaster.xyz/toadyhawk.eth/0xab48ca95";

// SUNDAY HIGH STAKES ARE BETR (Phase 42) – default Club GG link shown after successful submit
export const SUNDAY_HIGH_STAKES_CLUBGG_URL = "https://www.clubgg.com/?_branch_match_id=1517344166374105430";
// FIDs who can submit without BETR GAMES registration (allowlist); add/remove FIDs here and deploy
export const SUNDAY_HIGH_STAKES_ALLOWLIST_FIDS: number[] = [2182791];

// ClubGG configuration
export const CLUBGG_LINK = "https://clubgg.app.link/SseuNLDb3Zb";
export const CLUBGG_CLUB_ID = "87774";

// Club information for About page
export const CLUB_DESCRIPTION = "A private Farcaster poker club that runs games via the ClubGG app (Club ID: 87774). Rules emphasize community > extraction.";
export const CLUB_RULES = [
  "Match your Warpcast handle to your screenname",
  "Don't sit out",
  "Support sponsors",
  "Be kind"
];
export const CLUB_GAME_TYPES = "Regular SNG/OS/tourneys with staking/passcode entry mechanics and $BETR-linked prize tiers";

// Burr information for About page
export const BURR_FID = 311933;
export const BURR_NAME = "Melissa Burr";
export const BURR_USERNAME = "burr.eth";
export const BURR_BIO = "Community organizer/runner of /burrfrens, host of poker tourneys, involved in betrmint/$BETR events and Farcaster pods; frequent announcer of tourneys, stakes, and rules.";
export const BURR_X_URL = "https://x.com/burrrrrberry";
export const BURR_FARCASTER_PROFILE_URL = "https://warpcast.com/burr.eth";

// Poker credentials encryption key (32 bytes, base64 encoded)
// Required for encrypting/decrypting ClubGG credentials
// Note: Shared with poker app for compatibility
export const POKER_CREDS_ENCRYPTION_KEY = process.env.POKER_CREDS_ENCRYPTION_KEY || '';

// Tournament default prize amounts (1st, 2nd, 3rd place)
export const TOURNAMENT_DEFAULT_PRIZE_1ST = 2_000_000; // 2M BETR
export const TOURNAMENT_DEFAULT_PRIZE_2ND = 1_000_000; // 1M BETR
export const TOURNAMENT_DEFAULT_PRIZE_3RD = 420_000;   // 420k BETR

// Tournament staking tier thresholds (in BETR, 18 decimals in contract)
export const TOURNAMENT_STAKING_TIER_1 = 10_000_000;   // 10M - 2x multiplier
export const TOURNAMENT_STAKING_TIER_2 = 50_000_000;   // 50M - 3x multiplier
export const TOURNAMENT_STAKING_TIER_3 = 100_000_000;  // 100M - 4x multiplier
export const TOURNAMENT_STAKING_TIER_4 = 200_000_000;  // 200M - 5x multiplier

// App gate: BETR WITH BURR access control
export const BETR_APP_GATE_MIN_STAKE = 50_000_000;
export const NEYNAR_SCORE_GATE_MIN = 0.6;

// Super Bowl Weekend Mode - set to true to show only Super Bowl games
// Set to false after Super Bowl to restore full app
export const SUPERBOWL_WEEKEND_MODE = true;

