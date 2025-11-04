/**
 * Pacific timezone utilities for check-in day calculations.
 * 
 * Check-in windows run from 9 AM Pacific to 8:59:59.999 AM Pacific the next day.
 * Example: Window for "Jan 2" runs from 9 AM Jan 2 to 8:59:59 AM Jan 3.
 */

const PACIFIC_TIMEZONE = "America/Los_Angeles";
const CHECK_IN_RESET_HOUR = 9; // 9 AM Pacific

/**
 * Get the check-in day ID for a given date in Pacific timezone.
 * A check-in day runs from 9 AM to 8:59:59 AM the next day.
 * 
 * @param date - The date to get the check-in day for
 * @returns A string in format "YYYY-MM-DD" representing the check-in day
 */
export function getCheckInDayId(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0");
  
  // If before 9 AM, it belongs to the previous day's check-in window
  const checkInDate = new Date(parseInt(year!), parseInt(month!) - 1, parseInt(day!));
  if (hour < CHECK_IN_RESET_HOUR) {
    checkInDate.setDate(checkInDate.getDate() - 1);
  }
  
  // Return as YYYY-MM-DD string
  const checkInYear = checkInDate.getFullYear();
  const checkInMonth = String(checkInDate.getMonth() + 1).padStart(2, "0");
  const checkInDay = String(checkInDate.getDate()).padStart(2, "0");
  return `${checkInYear}-${checkInMonth}-${checkInDay}`;
}

/**
 * Check if two dates fall within the same check-in window.
 * 
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if both dates are in the same check-in window
 */
export function isInSameCheckInWindow(date1: Date, date2: Date): boolean {
  return getCheckInDayId(date1) === getCheckInDayId(date2);
}

/**
 * Check if a user can check in based on their last check-in date.
 * 
 * @param lastCheckinDate - The user's last check-in date (null if never checked in)
 * @param nowDate - The current date
 * @returns True if the user can check in (different check-in window)
 */
export function canCheckIn(lastCheckinDate: Date | null, nowDate: Date): boolean {
  if (!lastCheckinDate) return true;
  return !isInSameCheckInWindow(lastCheckinDate, nowDate);
}

/**
 * Calculate the difference in Pacific check-in days between two dates.
 * 
 * @param date1 - Earlier date
 * @param date2 - Later date
 * @returns Number of check-in days difference
 */
export function getPacificDaysDiff(date1: Date, date2: Date): number {
  const dayId1 = getCheckInDayId(date1);
  const dayId2 = getCheckInDayId(date2);
  
  // Parse dates to calculate difference
  const [year1, month1, day1] = dayId1.split("-").map(Number);
  const [year2, month2, day2] = dayId2.split("-").map(Number);
  
  const d1 = new Date(year1, month1 - 1, day1);
  const d2 = new Date(year2, month2 - 1, day2);
  
  const msDiff = d2.getTime() - d1.getTime();
  return Math.floor(msDiff / (24 * 60 * 60 * 1000));
}

/**
 * Calculate time until next check-in window opens (9 AM Pacific).
 * 
 * @returns Formatted string like "2h 30m" or "45m"
 */
export function calculateTimeUntilNextCheckIn(): string {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  
  const pacificParts = formatter.formatToParts(now);
  const pacificHour = parseInt(pacificParts.find(p => p.type === "hour")?.value || "0");
  const pacificMinute = parseInt(pacificParts.find(p => p.type === "minute")?.value || "0");
  
  // Calculate hours and minutes until next 9 AM Pacific
  let hoursUntil = 0;
  let minutesUntil = 0;
  
  if (pacificHour >= CHECK_IN_RESET_HOUR) {
    // Next check-in is tomorrow at 9 AM
    hoursUntil = (24 - pacificHour) + CHECK_IN_RESET_HOUR - 1;
    minutesUntil = 60 - pacificMinute;
  } else {
    // Next check-in is today at 9 AM
    hoursUntil = CHECK_IN_RESET_HOUR - pacificHour - 1;
    minutesUntil = 60 - pacificMinute;
  }
  
  // Adjust for minutes overflow
  if (minutesUntil >= 60) {
    hoursUntil += 1;
    minutesUntil -= 60;
  }
  
  // Format the result
  if (hoursUntil > 0) {
    return `${hoursUntil}h ${minutesUntil}m`;
  }
  return `${minutesUntil}m`;
}

