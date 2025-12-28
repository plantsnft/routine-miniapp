/**
 * Explorer URL utilities for blockchain transaction links
 */

const BASESCAN_BASE_URL = 'https://basescan.org';

/**
 * Get BaseScan transaction URL for a transaction hash
 * @param txHash Transaction hash (with or without 0x prefix)
 * @returns Full URL to view transaction on BaseScan
 */
export function getBaseScanTxUrl(txHash: string | null | undefined): string | null {
  if (!txHash || !txHash.trim()) {
    return null;
  }

  // Normalize hash (ensure it starts with 0x if present)
  const normalizedHash = txHash.trim();
  
  return `${BASESCAN_BASE_URL}/tx/${normalizedHash}`;
}

/**
 * Get BaseScan address URL for an address
 * @param address Ethereum address
 * @returns Full URL to view address on BaseScan
 */
export function getBaseScanAddressUrl(address: string | null | undefined): string | null {
  if (!address || !address.trim()) {
    return null;
  }

  // Validate it looks like an address (basic check)
  const normalizedAddress = address.trim();
  if (!normalizedAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    return null;
  }

  return `${BASESCAN_BASE_URL}/address/${normalizedAddress}`;
}

