/**
 * Shared helpers for Sunday High Stakes (Phase 42).
 * When contest has starts_at set, submissions allowed only from starts_at until 30 minutes after.
 */

const SIGNUP_WINDOW_MINUTES = 30;

export interface ContestWithStartsAt {
  starts_at?: string | null;
}

/**
 * Returns true when now is within the signup window: now >= starts_at and now <= starts_at + 30 minutes.
 * Uses UTC. Returns false when starts_at is null/undefined (caller should treat "no starts_at" as always open).
 */
export function isWithinSignupWindow(contest: ContestWithStartsAt): boolean {
  const startsAt = contest.starts_at;
  if (!startsAt) return true;
  const startMs = new Date(startsAt).getTime();
  const endMs = startMs + SIGNUP_WINDOW_MINUTES * 60 * 1000;
  const now = Date.now();
  return now >= startMs && now <= endMs;
}

/**
 * Returns true when starts_at is in the future (before start).
 */
export function isBeforeStart(contest: ContestWithStartsAt): boolean {
  const startsAt = contest.starts_at;
  if (!startsAt) return false;
  return Date.now() < new Date(startsAt).getTime();
}

/**
 * Returns true when we are past the signup window (more than 30 min after starts_at).
 */
export function isPastSignupWindow(contest: ContestWithStartsAt): boolean {
  const startsAt = contest.starts_at;
  if (!startsAt) return false;
  const endMs = new Date(startsAt).getTime() + SIGNUP_WINDOW_MINUTES * 60 * 1000;
  return Date.now() > endMs;
}
