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
 * SIWN authentication response.
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
 */
export type GameStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

/**
 * Game record from database.
 */
export interface Game {
  id: string;
  club_id: string;
  creator_fid: number;
  title?: string | null;
  description?: string | null;
  clubgg_game_id?: string | null;
  clubgg_link?: string | null;
  scheduled_time?: string | null;
  status: GameStatus;
  gating_type: GatingType;
  entry_fee_amount?: number | null;
  entry_fee_currency?: string | null;
  staking_pool_id?: string | null;
  staking_min_amount?: number | null;
  game_password_encrypted?: string | null;
  password_expires_at?: string | null;
  inserted_at: string;
  updated_at: string;
}

/**
 * Game participant record.
 */
export interface GameParticipant {
  id: string;
  game_id: string;
  player_fid: number;
  join_reason?: string | null;
  has_seen_password: boolean;
  password_viewed_at?: string | null;
  is_eligible: boolean;
  inserted_at: string;
  updated_at: string;
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
