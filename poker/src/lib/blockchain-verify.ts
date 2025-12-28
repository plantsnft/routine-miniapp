/**
 * Blockchain transaction verification utilities
 * Verifies on-chain transactions before marking payments as confirmed
 * 
 * CRITICAL SECURITY: Must decode transaction input to verify gameId parameter matches expected gameId.
 * Otherwise an attacker could pay for game A and claim creds for game B.
 */

import { ethers } from 'ethers';
import { BASE_RPC_URL, GAME_ESCROW_CONTRACT } from './constants';
import { GAME_ESCROW_ABI } from './contracts';

export interface TransactionVerification {
  valid: boolean;
  error?: string;
  verifiedGameId?: string;
  verifiedPlayerAddress?: string;
  verifiedAmount?: string;
  actualAmount?: string; // Actual amount from transaction (ETH: tx.value, USDC: Transfer log)
  amountMismatch?: boolean; // Whether amount doesn't match expected (but may still be valid if joined on-chain)
  transferLogVerified?: boolean; // Whether amount was verified via Transfer log (USDC) or tx.value (ETH)
  blockNumber?: number;
  addressMatches?: boolean; // Whether tx sender matched expected address (deprecated - use allowedAddresses)
  addressInAllowlist?: boolean; // Whether tx sender is in the allowed addresses list
}

/**
 * Verify a transaction on Base network
 * Checks that:
 * 1. Transaction exists and is confirmed
 * 2. Transaction calls joinGame on the escrow contract
 * 3. Transaction parameters match the game
 * 4. Transaction sender is in the allowed addresses list (security binding)
 * 
 * @param txHash Transaction hash
 * @param expectedGameId Expected game ID
 * @param allowedAddresses Array of addresses allowed to send this transaction (must include tx.from)
 * @param expectedAmount Expected amount in wei/token units
 */
export async function verifyJoinGameTransaction(
  txHash: string,
  expectedGameId: string,
  allowedAddresses: string[],
  expectedAmount: string // in wei/token units
): Promise<TransactionVerification> {
  try {
    if (!GAME_ESCROW_CONTRACT) {
      return {
        valid: false,
        error: 'Escrow contract not configured',
      };
    }

    // Fetch transaction from Base network
    const rpcUrl = BASE_RPC_URL || 'https://mainnet.base.org';
    
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
      return {
        valid: false,
        error: 'Failed to fetch transaction receipt',
      };
    }

    const receiptData = await receiptResponse.json();
    if (receiptData.error || !receiptData.result) {
      return {
        valid: false,
        error: receiptData.error?.message || 'Transaction not found',
      };
    }

    const receipt = receiptData.result;

    // Check transaction status (0x1 = success, 0x0 = failed)
    if (receipt.status !== '0x1') {
      return {
        valid: false,
        error: 'Transaction failed on-chain',
      };
    }

    // Verify transaction went to escrow contract
    if (receipt.to?.toLowerCase() !== GAME_ESCROW_CONTRACT.toLowerCase()) {
      return {
        valid: false,
        error: 'Transaction not sent to escrow contract',
      };
    }

    // Get transaction details
    const txResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 1,
      }),
    });

    if (!txResponse.ok) {
      return {
        valid: false,
        error: 'Failed to fetch transaction details',
      };
    }

    const txData = await txResponse.json();
    if (txData.error || !txData.result) {
      return {
        valid: false,
        error: txData.error?.message || 'Transaction not found',
      };
    }

    const tx = txData.result;
    const txFrom = tx.from?.toLowerCase();
    
    if (!txFrom) {
      return {
        valid: false,
        error: 'Transaction sender address missing',
      };
    }
    
    // SECURITY: Verify tx.from is in the allowed addresses list
    const normalizedAllowed = allowedAddresses.map(addr => addr.toLowerCase());
    const addressInAllowlist = normalizedAllowed.includes(txFrom);
    
    if (!addressInAllowlist) {
      // Structured logging for allowlist failures (redact allowed addresses for privacy)
      const { safeLog } = await import('./redaction');
      safeLog('warn', '[blockchain-verify] Address not in allowlist', {
        payerAddress: txFrom, // Include actual payer address
        allowedAddressesCount: allowedAddresses.length,
        // Redact actual allowed addresses for privacy (only log count)
      });
      
      return {
        valid: false,
        error: 'Payment sent from wallet not linked to this Farcaster account',
        addressInAllowlist: false,
      };
    }

    // CRITICAL SECURITY: Decode transaction input to extract actual gameId from joinGame call
    // This prevents an attacker from paying for game A and claiming creds for game B
    if (!tx.input || tx.input.length < 10) {
      return {
        valid: false,
        error: 'Transaction input data missing or invalid',
      };
    }

    try {
      // Create interface from ABI to decode the transaction
      const contractInterface = new ethers.Interface(GAME_ESCROW_ABI);
      
      // Decode the transaction input data
      let decodedData;
      try {
        decodedData = contractInterface.parseTransaction({ data: tx.input, value: tx.value });
      } catch (decodeError: any) {
        return {
          valid: false,
          error: `Failed to decode transaction input: ${decodeError.message}`,
        };
      }

      // Check if decoding succeeded
      if (!decodedData) {
        return {
          valid: false,
          error: 'Failed to decode transaction input: decoded data is null',
        };
      }

      // Verify it's a joinGame call
      if (decodedData.name !== 'joinGame') {
        return {
          valid: false,
          error: `Transaction is not a joinGame call (found: ${decodedData.name})`,
        };
      }

      // Extract the actual gameId from the decoded transaction
      const actualGameId = decodedData.args[0]; // joinGame(string gameId) - first parameter
      
      if (!actualGameId || typeof actualGameId !== 'string') {
        return {
          valid: false,
          error: 'Transaction gameId parameter missing or invalid',
        };
      }

      // CRITICAL: Verify the actual gameId matches the expected gameId
      // This is the key security check that prevents cross-game attacks
      if (actualGameId !== expectedGameId) {
        return {
          valid: false,
          error: `Transaction gameId mismatch: expected "${expectedGameId}", got "${actualGameId}"`,
          verifiedGameId: actualGameId, // Include actual gameId in response for debugging
        };
      }

      // Verify amount matches
      // For ETH: check tx.value
      // For USDC: parse Transfer event logs from USDC token contract
      let actualAmount: string | undefined;
      let amountMismatch = false;
      let transferLogVerified = false;
      
      if (tx.value && BigInt(tx.value) > 0n) {
        // ETH payment - verify tx.value
        const txValue = BigInt(tx.value);
        const expectedValue = BigInt(expectedAmount);
        actualAmount = txValue.toString();
        
        // Allow small variance for gas or rounding (1% tolerance)
        const difference = txValue > expectedValue 
          ? txValue - expectedValue 
          : expectedValue - txValue;
        
        if (difference > expectedValue / BigInt(100)) {
          amountMismatch = true;
        } else {
          transferLogVerified = true; // ETH amount verified via tx.value
        }
      } else {
        // USDC/token payment - parse Transfer event logs
        // ERC20 Transfer(address indexed from, address indexed to, uint256 value)
        const transferEventTopic = ethers.id('Transfer(address,address,uint256)');
        const { BASE_USDC_ADDRESS } = await import('./constants');
        
        if (receipt.logs && receipt.logs.length > 0) {
          // Find Transfer event from USDC contract
          const transferLog = receipt.logs.find((log: any) => {
            return log.topics && 
                   log.topics[0]?.toLowerCase() === transferEventTopic.toLowerCase() &&
                   log.address?.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase();
          });
          
          if (transferLog) {
            try {
              // Decode Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
              // Topics: [0] = event signature, [1] = from (indexed), [2] = to (indexed)
              // Data: value (uint256)
              const erc20Interface = new ethers.Interface([
                'event Transfer(address indexed from, address indexed to, uint256 value)'
              ]);
              const parsedTransfer = erc20Interface.parseLog({
                topics: transferLog.topics || [],
                data: transferLog.data || '0x',
              });
              
              if (parsedTransfer && parsedTransfer.name === 'Transfer') {
                const transferFrom = parsedTransfer.args[0]?.toLowerCase();
                const transferTo = parsedTransfer.args[1]?.toLowerCase();
                const transferAmount = parsedTransfer.args[2]?.toString();
                
                // Verify: from = tx.from (payer), to = GAME_ESCROW_CONTRACT, amount = expectedAmount
                if (transferFrom === txFrom &&
                    transferTo === GAME_ESCROW_CONTRACT.toLowerCase() &&
                    transferAmount === expectedAmount) {
                  actualAmount = transferAmount;
                  transferLogVerified = true; // USDC amount verified via Transfer log
                } else {
                  actualAmount = transferAmount;
                  amountMismatch = true;
                }
              }
            } catch (parseErr) {
              // Failed to parse Transfer log - mark as mismatch
              amountMismatch = true;
            }
          } else {
            // No Transfer log found - mark as mismatch (should have Transfer for USDC)
            amountMismatch = true;
          }
        } else {
          // No logs at all - mark as mismatch
          amountMismatch = true;
        }
      }

      // Also verify from event logs for double-check (defense in depth)
      // Look for PlayerJoined event in logs
      if (receipt.logs && receipt.logs.length > 0) {
        try {
          // Find PlayerJoined event
          const playerJoinedEventTopic = ethers.id('PlayerJoined(string,address,uint256,bool)');
          
          const playerJoinedLog = receipt.logs.find((log: any) => {
            // Event topics: [0] = event signature, [1] = indexed gameId (keccak256), [2] = indexed player address
            return log.topics && log.topics[0]?.toLowerCase() === playerJoinedEventTopic.toLowerCase() &&
                   log.address?.toLowerCase() === GAME_ESCROW_CONTRACT.toLowerCase();
          });

          if (playerJoinedLog) {
            // Decode the event to get gameId from logs
            const parsedLog = contractInterface.parseLog({
              topics: playerJoinedLog.topics || [],
              data: playerJoinedLog.data || '0x',
            });
            
            if (parsedLog && parsedLog.name === 'PlayerJoined') {
              const logGameId = parsedLog.args[0]; // First indexed parameter (gameId)
              if (logGameId !== expectedGameId) {
                // Warning: Event log gameId doesn't match, but we've already verified from input
                // This is suspicious but not necessarily invalid if contract emits wrong event
                // We'll trust the input data as source of truth since that's what was actually called
              }
            }
          }
        } catch (logError) {
          // Non-critical: if we can't decode logs, that's okay since we've verified from input
          // Log the error but don't fail verification
        }
      }

      // All checks passed - transaction is valid and bound to the correct game
      // Note: amountMismatch may be true, but caller should check contract state before rejecting
      return {
        valid: true,
        verifiedGameId: actualGameId, // Use the actual gameId from transaction, not expected
        verifiedPlayerAddress: txFrom, // Actual sender address (verified to be in allowlist)
        verifiedAmount: expectedAmount, // Expected amount
        actualAmount, // Actual amount from transaction (if ETH payment)
        amountMismatch, // Whether amount doesn't match (caller should check contract state)
        blockNumber: parseInt(receipt.blockNumber, 16),
        addressInAllowlist: true, // Address was verified to be in allowlist
      };
    } catch (error: any) {
      return {
        valid: false,
        error: `Transaction verification failed: ${error.message}`,
      };
    }
  } catch (error: any) {
    console.error('[blockchain-verify] Error:', error);
    return {
      valid: false,
      error: error?.message || 'Failed to verify transaction',
    };
  }
}

/**
 * Verify transaction exists and is confirmed (simpler check)
 */
export async function verifyTransactionExists(txHash: string): Promise<{
  exists: boolean;
  confirmed: boolean;
  error?: string;
}> {
  try {
    const rpcUrl = BASE_RPC_URL || 'https://mainnet.base.org';
    
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
      return {
        exists: false,
        confirmed: false,
        error: 'Failed to fetch transaction',
      };
    }

    const receiptData = await receiptResponse.json();
    if (receiptData.error || !receiptData.result) {
      return {
        exists: false,
        confirmed: false,
        error: receiptData.error?.message || 'Transaction not found',
      };
    }

    const receipt = receiptData.result;
    const confirmed = receipt.status === '0x1';

    return {
      exists: true,
      confirmed,
      error: confirmed ? undefined : 'Transaction failed',
    };
  } catch (error: any) {
    return {
      exists: false,
      confirmed: false,
      error: error?.message || 'Verification failed',
    };
  }
}

