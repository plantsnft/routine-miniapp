/**
 * Amount conversion and validation utilities
 * Handles decimal precision for ETH (18 decimals) and USDC (6 decimals)
 */

export const ETH_DECIMALS = 18;
export const USDC_DECIMALS = 6;

/**
 * Convert human-readable ETH amount to wei
 * @param eth Human-readable amount (e.g., "0.1", "1.5")
 * @returns Amount in wei as string
 */
export function ethToWei(eth: string | number): string {
  const amount = typeof eth === 'string' ? parseFloat(eth) : eth;
  if (isNaN(amount) || amount < 0) {
    throw new Error(`Invalid ETH amount: ${eth}`);
  }
  // Multiply by 10^18 and ensure no decimal places
  const wei = BigInt(Math.floor(amount * 10 ** ETH_DECIMALS));
  return wei.toString();
}

/**
 * Convert wei to human-readable ETH
 * @param wei Amount in wei
 * @returns Human-readable amount with up to 18 decimal places
 */
export function weiToEth(wei: string | bigint): string {
  const weiBigInt = typeof wei === 'string' ? BigInt(wei) : wei;
  const eth = Number(weiBigInt) / 10 ** ETH_DECIMALS;
  return eth.toFixed(ETH_DECIMALS).replace(/\.?0+$/, '');
}

/**
 * Convert human-readable USDC amount to token units (6 decimals)
 * @param usdc Human-readable amount (e.g., "20", "1.5")
 * @returns Amount in token units as string
 */
export function usdcToUnits(usdc: string | number): string {
  const amount = typeof usdc === 'string' ? parseFloat(usdc) : usdc;
  if (isNaN(amount) || amount < 0) {
    throw new Error(`Invalid USDC amount: ${usdc}`);
  }
  // Multiply by 10^6 and ensure no decimal places
  const units = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS));
  return units.toString();
}

/**
 * Convert USDC token units to human-readable amount
 * @param units Amount in token units
 * @returns Human-readable amount with up to 6 decimal places
 */
export function unitsToUsdc(units: string | bigint): string {
  const unitsBigInt = typeof units === 'string' ? BigInt(units) : units;
  const usdc = Number(unitsBigInt) / 10 ** USDC_DECIMALS;
  return usdc.toFixed(USDC_DECIMALS).replace(/\.?0+$/, '');
}

/**
 * Convert amount based on currency type
 */
export function amountToUnits(
  amount: string | number,
  currency: 'ETH' | 'USDC' | 'BASE_ETH'
): string {
  if (currency === 'USDC') {
    return usdcToUnits(amount);
  } else {
    return ethToWei(amount);
  }
}

/**
 * Convert units back to human-readable amount
 */
export function unitsToAmount(
  units: string | bigint,
  currency: 'ETH' | 'USDC' | 'BASE_ETH'
): string {
  if (currency === 'USDC') {
    return unitsToUsdc(units);
  } else {
    return weiToEth(units);
  }
}

/**
 * Validate amount format and range
 */
export function validateAmount(
  amount: string | number,
  currency: 'ETH' | 'USDC' | 'BASE_ETH',
  min?: number,
  max?: number
): { valid: boolean; error?: string } {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return { valid: false, error: 'Invalid amount format' };
  }

  if (numAmount < 0) {
    return { valid: false, error: 'Amount cannot be negative' };
  }

  if (min !== undefined && numAmount < min) {
    return { valid: false, error: `Amount must be at least ${min} ${currency}` };
  }

  if (max !== undefined && numAmount > max) {
    return { valid: false, error: `Amount cannot exceed ${max} ${currency}` };
  }

  return { valid: true };
}

