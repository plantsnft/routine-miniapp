/**
 * Game request payload validation and sanitization
 * 
 * Ensures requesters cannot control sensitive fields and only allowed fields are present
 */

/**
 * Allowed fields in game request payload (whitelist)
 * These match the fields accepted by create-game API
 */
const ALLOWED_PAYLOAD_FIELDS = new Set([
  // Game metadata (user-provided)
  'title',
  'description',
  'clubgg_link',
  'scheduled_time',
  'game_password',
  'game_username',
  
  // Entry fee configuration (user-provided)
  'entry_fee_amount',
  'entry_fee_currency',
  
  // Game configuration (user-provided)
  'max_participants',
  'payout_bps',
  'game_type', // Allowed but validated (only admins can use 'large_event')
  
  // Gating (required for validation, but value is user-provided)
  'gating_type',
  
  // Legacy/compatibility fields (may appear in payload)
  'password',
  'clubggPassword',
  'clubgg_password',
  'clubgg_username',
  'clubggUsername',
  'creds',
  'credentials',
  'total_reward_amount',
  'reward_currency',
  'staking_pool_id',
  'staking_token_contract',
  'staking_min_amount',
  'farcaster_cast_url',
  'is_prefunded',
  'prefunded_at',
  'can_settle_at',
] as const);

/**
 * Fields that are NEVER allowed in payload (server-controlled)
 * These must be set by the server, not the requester
 */
const FORBIDDEN_PAYLOAD_FIELDS = new Set([
  'club_id',        // Set by server from club context
  'created_by_fid', // Set by server (admin's FID on approval)
  'owner_fid',      // Server-controlled
  'status',         // Server-controlled
  'onchain_status', // Server-controlled
  'onchain_game_id', // Server-controlled
  'onchain_tx_hash', // Server-controlled
  'creds_ciphertext', // Server-controlled (encrypted)
  'creds_iv',        // Server-controlled
  'creds_version',   // Server-controlled
  'settle_tx_hash',  // Server-controlled
  'id',              // Server-controlled
  'inserted_at',     // Server-controlled
  'updated_at',      // Server-controlled
]);

/**
 * Validates and sanitizes game request payload
 * 
 * @param payload - Raw payload from request
 * @returns Sanitized payload with only allowed fields
 * @throws Error if forbidden fields are present or validation fails
 */
export function validateAndSanitizeGameRequestPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }

  // Check for forbidden fields
  for (const field of FORBIDDEN_PAYLOAD_FIELDS) {
    if (field in payload) {
      throw new Error(`Field "${field}" is not allowed in request payload (server-controlled)`);
    }
  }

  // Build sanitized payload with only allowed fields
  const sanitized: any = {};
  for (const [key, value] of Object.entries(payload)) {
    if (ALLOWED_PAYLOAD_FIELDS.has(key as any)) {
      sanitized[key] = value;
    }
    // Silently strip unknown fields (defensive approach - log in development if needed)
    // In production, we want to be permissive to avoid breaking future additions
  }

  // Basic validation of required fields
  if (!sanitized.gating_type) {
    throw new Error('payload.gating_type is required');
  }

  return sanitized;
}

/**
 * Validates transaction hash format
 * 
 * @param txHash - Transaction hash string
 * @returns true if valid format
 */
export function validateTxHashFormat(txHash: string): boolean {
  if (typeof txHash !== 'string') {
    return false;
  }
  
  // Must start with 0x and be exactly 66 characters (0x + 64 hex chars)
  if (!txHash.startsWith('0x') || txHash.length !== 66) {
    return false;
  }
  
  // Must be hexadecimal only (after 0x prefix)
  const hexPart = txHash.substring(2);
  if (!/^[0-9a-fA-F]+$/.test(hexPart)) {
    return false;
  }
  
  return true;
}

/**
 * Optionally verify transaction exists on-chain and is valid (if flag is enabled)
 * 
 * When VERIFY_PREFUND_TX=true:
 * - Validates receipt.status == 1 (success)
 * - Validates receipt.blockNumber exists
 * - Validates receipt.to matches EXPECTED_PREFUND_TO (if set)
 * - Validates chain is Base (via RPC)
 * 
 * @param txHash - Transaction hash to verify
 * @returns true if transaction is valid (or verification disabled), false if invalid/not found
 */
export async function verifyTxHashOnChain(txHash: string): Promise<boolean> {
  // Only verify if flag is enabled
  if (process.env.VERIFY_PREFUND_TX !== 'true') {
    return true; // Skip verification if flag not enabled
  }

  try {
    const { BASE_RPC_URL } = await import('./constants');
    const rpcUrl = BASE_RPC_URL || 'https://mainnet.base.org';
    const expectedPrefundTo = process.env.EXPECTED_PREFUND_TO;
    
    // Log warning if EXPECTED_PREFUND_TO not set
    if (!expectedPrefundTo) {
      console.warn('[game-request-validation] VERIFY_PREFUND_TX enabled but EXPECTED_PREFUND_TO not set. Only checking transaction existence.');
    }
    
    // Use JSON-RPC to get transaction receipt
    const receiptResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 1,
      }),
    });

    if (!receiptResponse.ok) {
      return false; // Network error - consider transaction not found
    }

    const receiptData = await receiptResponse.json();
    if (receiptData.error || !receiptData.result) {
      return false; // Transaction not found
    }

    const receipt = receiptData.result;

    // Validate receipt.status == 1 (success)
    // status is '0x1' for success, '0x0' for failure
    if (receipt.status !== '0x1') {
      console.error('[game-request-validation] Transaction receipt status indicates failure:', receipt.status);
      return false;
    }

    // Validate receipt.blockNumber exists (transaction is confirmed)
    if (!receipt.blockNumber) {
      console.error('[game-request-validation] Transaction receipt missing blockNumber');
      return false;
    }

    // Validate receipt.to matches EXPECTED_PREFUND_TO (if set)
    if (expectedPrefundTo) {
      const receiptTo = receipt.to?.toLowerCase();
      const expectedTo = expectedPrefundTo.toLowerCase();
      if (receiptTo !== expectedTo) {
        console.error('[game-request-validation] Transaction receipt.to does not match EXPECTED_PREFUND_TO', {
          receiptTo,
          expectedTo: expectedTo.substring(0, 10) + '...', // Truncate for logging
        });
        return false;
      }
    }

    // Validate chain is Base by checking chain ID via eth_chainId
    // (Base mainnet chain ID is 8453, Base Sepolia is 84532)
    try {
      const chainIdResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 2,
        }),
      });

      if (chainIdResponse.ok) {
        const chainIdData = await chainIdResponse.json();
        const chainId = parseInt(chainIdData.result, 16); // Convert hex to decimal
        const BASE_CHAIN_ID = 8453; // Base mainnet
        
        if (chainId !== BASE_CHAIN_ID) {
          console.error('[game-request-validation] RPC chain ID does not match Base mainnet', {
            chainId,
            expected: BASE_CHAIN_ID,
          });
          return false;
        }
      }
    } catch (chainIdError) {
      // Log but don't fail - chain ID check is best-effort
      console.warn('[game-request-validation] Failed to verify chain ID:', chainIdError);
    }

    // Transaction is valid
    return true;
  } catch (error) {
    // On error, fail closed (assume transaction is invalid)
    // Log error but don't expose details
    console.error('[game-request-validation] Failed to verify tx hash on-chain:', error);
    return false;
  }
}

