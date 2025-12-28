/**
 * Shared TypeScript types and interfaces for the Poker app.
 */

/**
 * API response wrapper for successful operations.
 */
export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data?: T;
  [key: string]: unknown;
}

/**
 * API response wrapper for error cases.
 */
export interface ApiErrorResponse {
  ok: false;
  error: string;
  detail?: string;
  [key: string]: unknown;
}

/**
 * Union type for API responses.
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * @deprecated SIWN authentication response - replaced by Quick Auth
 * Kept for backward compatibility only
 */
export interface SiwnResponse {
  ok: boolean;
  fid?: number;
  username?: string;
  error?: string;
}

/**
 * User record from database.
 */
export interface User {
  id: string;
  fid: number;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  wallet_address?: string | null;
  inserted_at: string;
  updated_at: string;
}

/**
 * Club record from database.
 */
export interface Club {
  id: string;
  slug: string;
  owner_fid: number;
  name: string;
  description?: string | null;
  clubgg_club_id?: string | null;
  inserted_at: string;
  updated_at: string;
}

/**
 * Club member record.
 */
export interface ClubMember {
  id: string;
  club_id: string;
  member_fid: number;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'inactive';
  inserted_at: string;
  updated_at: string;
}

/**
 * Game gating types.
 */
export type GatingType = 'entry_fee' | 'stake_threshold' | 'open';

/**
 * Game status.
 * Matches poker.games schema: 'open', 'full', 'in_progress', 'completed', 'cancelled'
 * Also supports: 'scheduled', 'settled' for backward compatibility
 */
export type GameStatus = 'scheduled' | 'open' | 'active' | 'full' | 'in_progress' | 'completed' | 'settled' | 'cancelled';

/**
 * Game record from database.
 * Extended with API-computed fields for /api/games endpoint.
 */
export interface Game {
  id: string;
  club_id: string;
  creator_fid: number;
  // On-chain status fields (for paid games)
  onchain_status?: 'pending' | 'active' | 'failed';
  onchain_game_id?: string | null;
  onchain_tx_hash?: string | null;
  onchain_error?: string | null;
  title?: string | null;
  description?: string | null;
  clubgg_game_id?: string | null;
  clubgg_link?: string | null;
  farcaster_cast_url?: string | null;
  scheduled_time?: string | null;
  status: GameStatus;
  gating_type: GatingType;
  entry_fee_amount?: number | null;
  entry_fee_currency?: string | null;
  staking_pool_id?: string | null;
  staking_min_amount?: number | null;
  staking_token_contract?: string | null;
  game_password_encrypted?: string | null; // DEPRECATED: Use creds_ciphertext instead
  password_expires_at?: string | null;
  // Encrypted ClubGG credentials (AES-GCM)
  creds_ciphertext?: string | null; // base64 encoded ciphertext
  creds_iv?: string | null; // base64 encoded IV
  creds_version?: number | null; // encryption version (default 1)
  // Reward/payout configuration
  total_reward_amount?: number | null;
  reward_currency?: string | null;
  num_payouts?: number | null;
  is_prefunded?: boolean | null;
  prefunded_at?: string | null;
  // Game type and registration
  game_type?: 'standard' | 'large_event' | null;
  registration_close_minutes?: number | null;
  max_participants?: number | null;
  payout_bps?: number[] | null; // Basis points for payout distribution
  // Settlement tracking
  settled_at?: string | null;
  can_settle_at?: string | null;
  settle_tx_hash?: string | null; // Transaction hash for game settlement
  // Payment contract
  escrow_contract_address?: string | null;
  // API response fields (computed, only present in /api/games endpoint)
  participant_count?: number; // Count of participants with status='joined' (computed server-side)
  viewer_has_joined?: boolean; // Whether the current viewer (from auth JWT) has joined this game (computed server-side)
  registrationCloseAt?: string | null; // Computed server-side: when registration closes for large_event games
  registrationOpen?: boolean; // Computed server-side: whether registration is currently open
  hasStarted?: boolean; // Computed server-side: whether the game has started
  effectiveMaxParticipants?: number | null; // Computed server-side: effective max participants (99 for open-registration large_event)
  spotsOpen?: number | null; // Computed server-side: number of spots remaining
  inserted_at: string;
  updated_at: string;
}

/**
 * Payment status for game participants.
 */
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';

/**
 * Game participant record.
 * Matches poker.participants schema.
 */
export interface GameParticipant {
  id: string;
  game_id: string;
  player_fid: number; // Note: schema uses 'fid' but we map it to player_fid for clarity
  // Status in poker schema: 'joined', 'paid', 'refunded', 'settled'
  status: 'joined' | 'paid' | 'refunded' | 'settled';
  tx_hash?: string | null; // Transaction hash for payment
  paid_at?: string | null; // Timestamp when payment was confirmed
  refund_tx_hash?: string | null; // Transaction hash for refund when game is cancelled
  refunded_at?: string | null; // Timestamp when refund transaction was confirmed
  payout_tx_hash?: string | null; // Transaction hash for payout when game is settled (same as game.settle_tx_hash)
  payout_amount?: number | null; // Amount paid out to this participant (in human-readable format)
  paid_out_at?: string | null; // Timestamp when payout transaction was confirmed
  join_reason?: string | null;
  is_eligible?: boolean | null;
  inserted_at: string;
  updated_at: string;
  // Legacy fields (may exist but not in new schema)
  has_seen_password?: boolean | null;
  password_viewed_at?: string | null;
  payment_status?: PaymentStatus | null; // DEPRECATED: Use status instead
  payment_tx_hash?: string | null; // DEPRECATED: Use tx_hash instead
  payment_confirmed_at?: string | null; // DEPRECATED: Use paid_at instead
  join_tx_hash?: string | null; // DEPRECATED: Use tx_hash instead
  buy_in_amount?: number | null;
  payout_terms_signed?: boolean | null;
  payout_terms_tx_hash?: string | null;
}

/**
 * Eligibility check result.
 */
export interface EligibilityResult {
  eligible: boolean;
  reason: 'entry_fee' | 'stake_threshold' | 'open' | 'manual_override' | 'not_eligible';
  message?: string;
}

/**
 * Payout status types.
 */
export type PayoutStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

/**
 * Payout record.
 */
export interface Payout {
  id: string;
  game_id?: string | null;
  payer_fid?: number | null;
  recipient_fid: number;
  amount: number;
  currency: string;
  status: PayoutStatus;
  tx_hash?: string | null;
  recipient_wallet_address?: string | null;
  notes?: string | null;
  inserted_at: string;
  updated_at: string;
}

/**
 * Game result record.
 */
export interface GameResult {
  id: string;
  game_id: string;
  player_fid: number;
  position?: number | null;
  payout_amount?: number | null;
  payout_currency?: string | null;
  net_profit?: number | null;
  inserted_at: string;
  updated_at: string;
}

/**
 * Club announcement record.
 */
export interface ClubAnnouncement {
  id: string;
  club_id: string;
  creator_fid: number;
  title: string;
  body: string;
  related_game_id?: string | null;
  inserted_at: string;
}
