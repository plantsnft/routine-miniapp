/**
 * Date utility functions
 */

/**
 * Check if current time is after midnight Eastern Time
 * Used for cutoff validation for offday actions and gameplan submissions
 * 
 * @returns true if current hour in Eastern Time is 0 (midnight hour: 00:00-00:59)
 */
export function isAfterMidnightET(): boolean {
  const now = new Date();
  // Get current time in Eastern Time using Intl.DateTimeFormat
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hourET = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  // If hour is 0 (midnight hour: 00:00-00:59), it's after midnight
  return hourET === 0;
}
