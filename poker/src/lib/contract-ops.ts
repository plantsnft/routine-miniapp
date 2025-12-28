/**
 * Smart contract operations for game management
 * Handles on-chain game registration and provides recovery utilities
 * 
 * CRITICAL SECURITY: All contract writes use MASTER_WALLET_PRIVATE_KEY
 * and assert the derived signer address matches MASTER_WALLET_ADDRESS
 */

import { ethers } from 'ethers';
import { 
  GAME_ESCROW_CONTRACT, 
  BASE_USDC_ADDRESS, 
  BASE_RPC_URL,
  MASTER_WALLET_ADDRESS 
} from './constants';
import { GAME_ESCROW_ABI } from './contracts';
import { amountToUnits } from './amounts';
import { safeLog } from './redaction';
import { generateCorrelationId } from './correlation-id';

/**
 * Get master wallet signer and assert it matches expected address
 * 
 * CRITICAL SECURITY: This function only runs server-side (API routes only).
 * Private key is NEVER exposed to client-side code.
 * 
 * Private key format: ethers.js accepts private keys with or without '0x' prefix.
 * Both formats are valid: "0xabc123..." or "abc123..."
 * 
 * @throws Error if private key is missing or address mismatch
 */
function getMasterSigner(): ethers.Wallet {
  // Server-only: process.env.MASTER_WALLET_PRIVATE_KEY is not accessible from client-side code
  const masterWalletPrivateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
  if (!masterWalletPrivateKey) {
    throw new Error('MASTER_WALLET_PRIVATE_KEY not configured');
  }

  // ethers.Wallet accepts private keys with or without '0x' prefix
  // The Wallet constructor handles both formats automatically

  if (!GAME_ESCROW_CONTRACT) {
    throw new Error('GAME_ESCROW_CONTRACT not configured');
  }

  if (!BASE_RPC_URL) {
    throw new Error('BASE_RPC_URL not configured');
  }

  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const wallet = new ethers.Wallet(masterWalletPrivateKey, provider);

  // CRITICAL: Assert signer address matches expected master wallet
  if (wallet.address.toLowerCase() !== MASTER_WALLET_ADDRESS.toLowerCase()) {
    throw new Error(
      `Master wallet address mismatch: expected ${MASTER_WALLET_ADDRESS}, got ${wallet.address}. ` +
      `MASTER_WALLET_PRIVATE_KEY does not correspond to MASTER_WALLET_ADDRESS.`
    );
  }

  return wallet;
}

/**
 * Map currency string to contract address
 * ETH/BASE_ETH → zero address (native token)
 * USDC → BASE_USDC_ADDRESS
 */
function mapCurrencyToAddress(currency: string): string {
  const upperCurrency = currency.toUpperCase();
  if (upperCurrency === 'ETH' || upperCurrency === 'BASE_ETH') {
    return ethers.ZeroAddress; // address(0) for native ETH
  }
  if (upperCurrency === 'USDC') {
    return BASE_USDC_ADDRESS;
  }
  throw new Error(`Unsupported currency: ${currency}. Supported: ETH, BASE_ETH, USDC`);
}

/**
 * Create game on-chain via contract createGame()
 * @param gameId Database game ID (UUID string) - used as on-chain gameId
 * @param entryFeeAmount Entry fee amount (human-readable, e.g., "0.021")
 * @param entryFeeCurrency Currency string ('ETH', 'BASE_ETH', or 'USDC')
 * @param correlationId Optional correlation ID for request tracing
 * @returns Transaction hash
 * @throws Error if contract call fails
 */
export async function createGameOnContract(
  gameId: string,
  entryFeeAmount: number | string,
  entryFeeCurrency: string,
  correlationId?: string
): Promise<string> {
  const corrId = correlationId || generateCorrelationId();
  if (!gameId || typeof gameId !== 'string') {
    throw new Error('Invalid gameId: must be non-empty string');
  }

  const amount = typeof entryFeeAmount === 'string' 
    ? parseFloat(entryFeeAmount) 
    : entryFeeAmount;

  if (isNaN(amount) || amount <= 0) {
    throw new Error(`Invalid entry fee amount: ${entryFeeAmount}`);
  }

  // Map currency to contract address
  const currencyAddress = mapCurrencyToAddress(entryFeeCurrency);

  // Convert amount to contract units (wei for ETH, 6 decimals for USDC)
  const entryFeeUnits = amountToUnits(amount.toString(), entryFeeCurrency as 'ETH' | 'USDC' | 'BASE_ETH');

  safeLog('info', '[contract-ops] Creating game on contract', {
    correlationId: corrId,
    gameId,
    currency: entryFeeCurrency,
    currencyAddress,
    entryFeeAmount: amount,
    entryFeeUnits,
  });

  const wallet = getMasterSigner();
  const contract = new ethers.Contract(
    GAME_ESCROW_CONTRACT,
    GAME_ESCROW_ABI,
    wallet
  );

  try {
    // Call createGame(string gameId, address currency, uint256 entryFee)
    // Note: Contract will reject if game already exists (idempotency check)
    const tx = await contract.createGame(gameId, currencyAddress, entryFeeUnits);
    
    safeLog('info', '[contract-ops] createGame transaction sent', {
      correlationId: corrId,
      gameId,
      txHash: tx.hash,
    });

    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed: ${tx.hash}`);
    }

    safeLog('info', '[contract-ops] createGame transaction confirmed', {
      correlationId: corrId,
      gameId,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });

    return tx.hash;
  } catch (error: any) {
    // Check if error is due to game already existing (idempotency)
    if (error.message?.includes('Game already exists') || 
        error.message?.includes('already exists') ||
        error.reason?.includes('already exists')) {
      // Check if game is actually active on contract
      const isActive = await isGameActiveOnContract(gameId);
      if (isActive) {
        // Treat as success - game is already active
        safeLog('info', '[contract-ops] Game already exists and is active on contract (idempotent)', {
          correlationId: corrId,
          gameId,
        });
        // Return a placeholder to indicate idempotent success
        // Caller should check contract state to get actual tx hash if needed
        return 'IDEMPOTENT_SUCCESS';
      } else {
        // Game exists but is not active - this is unexpected
        throw new Error('Game exists on contract but is not active');
      }
    }

    // Re-throw other errors
    safeLog('error', '[contract-ops] createGame failed', {
      correlationId: corrId,
      gameId,
      error: error.message || String(error),
    });
    throw error;
  }
}

/**
 * Get contract payload for manual Remix recovery
 * Returns the exact arguments to paste into Remix createGame() call
 */
export function getCreateGamePayload(
  gameId: string,
  entryFeeAmount: number | string,
  entryFeeCurrency: string
): {
  gameId: string;
  currency: string;
  currencyAddress: string;
  entryFee: string;
  entryFeeUnits: string;
} {
  const amount = typeof entryFeeAmount === 'string' 
    ? parseFloat(entryFeeAmount) 
    : entryFeeAmount;

  if (isNaN(amount) || amount <= 0) {
    throw new Error(`Invalid entry fee amount: ${entryFeeAmount}`);
  }

  const currencyAddress = mapCurrencyToAddress(entryFeeCurrency);
  const entryFeeUnits = amountToUnits(amount.toString(), entryFeeCurrency as 'ETH' | 'USDC' | 'BASE_ETH');

  return {
    gameId,
    currency: entryFeeCurrency,
    currencyAddress,
    entryFee: amount.toString(),
    entryFeeUnits,
  };
}

/**
 * Verify transaction matches expected createGame call
 * Used for manual recovery path to verify Remix transaction
 */
export async function verifyCreateGameTransaction(
  txHash: string,
  expectedGameId: string,
  expectedCurrency: string,
  expectedEntryFee: string
): Promise<boolean> {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const tx = await provider.getTransaction(txHash);
    
    if (!tx) {
      return false;
    }

    // Verify transaction went to escrow contract
    if (tx.to?.toLowerCase() !== GAME_ESCROW_CONTRACT.toLowerCase()) {
      return false;
    }

    // Decode transaction input
    const contractInterface = new ethers.Interface(GAME_ESCROW_ABI);
    let decodedData;
    try {
      decodedData = contractInterface.parseTransaction({ data: tx.data, value: tx.value });
    } catch {
      return false;
    }

    // Verify decoding succeeded
    if (!decodedData) {
      return false;
    }

    // Verify it's a createGame call
    if (decodedData.name !== 'createGame') {
      return false;
    }

    // Verify parameters match
    const [actualGameId, actualCurrency, actualEntryFee] = decodedData.args;
    
    if (actualGameId !== expectedGameId) {
      return false;
    }

    const expectedCurrencyAddress = mapCurrencyToAddress(expectedCurrency);
    if (actualCurrency.toLowerCase() !== expectedCurrencyAddress.toLowerCase()) {
      return false;
    }

    const expectedEntryFeeUnits = amountToUnits(expectedEntryFee, expectedCurrency as 'ETH' | 'USDC' | 'BASE_ETH');
    if (actualEntryFee.toString() !== expectedEntryFeeUnits) {
      return false;
    }

    // Verify transaction was successful
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      return false;
    }

    return true;
  } catch (error: any) {
    safeLog('error', '[contract-ops] Error verifying createGame transaction', {
      txHash,
      error: error.message || String(error),
    });
    return false;
  }
}

/**
 * Check if game exists and is active on contract
 */
export async function isGameActiveOnContract(gameId: string): Promise<boolean> {
  try {
    if (!GAME_ESCROW_CONTRACT || !BASE_RPC_URL) {
      return false;
    }

    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const contract = new ethers.Contract(GAME_ESCROW_CONTRACT, GAME_ESCROW_ABI, provider);
    const game = await contract.getGame(gameId);
    
    return game && game.isActive === true;
  } catch {
    return false;
  }
}

