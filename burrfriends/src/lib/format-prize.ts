/**
 * Utility functions for formatting prize amounts
 */

/**
 * Format a number as abbreviated string (e.g., 500000 -> "500K", 3000000 -> "3M")
 * @param amount - The amount to format
 * @returns Formatted string (e.g., "500K", "3M", "1.5M")
 */
export function formatPrizeAmount(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    // If it's a whole number, don't show decimals
    if (millions % 1 === 0) {
      return `${millions}M`;
    }
    // Otherwise, show one decimal place
    return `${millions.toFixed(1)}M`;
  } else if (amount >= 1_000) {
    const thousands = amount / 1_000;
    // If it's a whole number, don't show decimals
    if (thousands % 1 === 0) {
      return `${thousands}K`;
    }
    // Otherwise, show one decimal place
    return `${thousands.toFixed(1)}K`;
  }
  // For amounts less than 1000, return as-is
  return amount.toString();
}

/**
 * Format prize amount with currency
 * @param amount - The amount to format
 * @param currency - The currency (default: "BETR")
 * @returns Formatted string (e.g., "500K BETR", "3M BETR")
 */
export function formatPrizeWithCurrency(amount: number, currency: string = 'BETR'): string {
  return `${formatPrizeAmount(amount)} ${currency}`;
}

/**
 * Get position label (1st, 2nd, 3rd, 4th, etc.)
 * @param position - The position (1-based)
 * @returns Position label string
 */
export function getPositionLabel(position: number): string {
  const lastDigit = position % 10;
  const lastTwoDigits = position % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${position}th`;
  }
  
  switch (lastDigit) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}

/**
 * Format staking requirement for display
 * @param staking_min_amount - The minimum staking amount (in BETR) or null/undefined
 * @returns Formatted string (e.g., "25M BETR staking required" or "No staking requirement")
 */
export function formatStakingRequirement(staking_min_amount: number | null | undefined): string {
  if (!staking_min_amount || staking_min_amount === 0) {
    return "No staking requirement";
  }
  return `${formatPrizeAmount(staking_min_amount)} BETR staking required`;
}
