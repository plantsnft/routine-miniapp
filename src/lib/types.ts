/**
 * Shared TypeScript types and interfaces for the application.
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
  details?: string;`n  details?: string;
}

/**
 * Check-in API response.
 */
export interface CheckinResponse {
  ok: boolean;
  streak?: number;
  last_checkin?: string | null;
  total_checkins?: number;
  hasCheckedIn?: boolean;
  hasCheckedInToday?: boolean;
  error?: string;
  details?: string;`n  details?: string;
  mode?: "insert" | "update" | "already_checked_in";
}

/**
 * Check-in status for UI state.
 */
export interface CheckinStatus {
  checkedIn: boolean;
  streak: number | null;
  totalCheckins: number | null;
  lastCheckIn: string | null;
  timeUntilNext: string | null;
}

