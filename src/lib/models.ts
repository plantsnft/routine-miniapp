/**
 * Data models for claims and future features.
 * Prepared for claim functionality and leaderboard.
 */

import type { CheckinRecord } from "./supabase";

/**
 * Claim record interface for future token claiming functionality.
 */
export interface ClaimRecord {
  id?: string;
  fid: number;
  amount: string; // Amount of tokens to claim (as string for precision)
  claimed_at: string | null;
  transaction_hash: string | null;
  status: "pending" | "claimed" | "failed";
  inserted_at?: string;
  updated_at?: string;
}

/**
 * Leaderboard entry combining check-in data with user info.
 */
export interface LeaderboardEntry {
  fid: number;
  streak: number;
  last_checkin: string | null;
  total_checkins?: number; // All-time total check-in count
  username?: string;
  displayName?: string;
  rank: number;
  tokenBalance?: number; // $CATWALK token holdings
}

/**
 * User stats combining check-in and claim data.
 */
export interface UserStats {
  fid: number;
  checkin: CheckinRecord;
  claim?: ClaimRecord;
  totalClaimable?: string;
}

