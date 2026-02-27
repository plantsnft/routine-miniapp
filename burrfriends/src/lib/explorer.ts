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
 * Get BaseScan transaction URLs for an array of hashes (1:1, empty string when invalid)
 * @param txHashes Array of transaction hashes
 * @returns Array of URLs in same order; empty string for invalid hashes
 */
export function getBaseScanTxUrls(txHashes: string[]): string[] {
  if (!Array.isArray(txHashes)) return [];
  return txHashes.map((h) => getBaseScanTxUrl(h) ?? '');
}

/**
 * Parse settle_tx_hash into an array (handles comma-separated or single)
 * @param v settle_tx_hash from DB (string or null/undefined)
 * @returns Array of non-empty trimmed hashes
 */
export function parseSettleTxHashes(v: string | null | undefined): string[] {
  if (v == null || typeof v !== 'string' || !v.trim()) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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

