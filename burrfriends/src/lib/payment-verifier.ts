/**
 * On-chain payment verification helper
 * 
 * Verifies USDC payments by parsing Transfer event logs from the payment transaction.
 * This ensures we identify the actual payer wallet (from Transfer.from) rather than
 * relying on tx.from which could be a paymaster/bundler in account-abstraction flows.
 */

import { ethers } from "ethers";
import { BASE_RPC_URL, GAME_ESCROW_CONTRACT } from "./constants";
import { mapCurrencyToAddress, getCurrencyDecimals } from "./contract-ops";

export interface PaymentVerificationInput {
  paymentTxHash: string;
  expectedEscrowAddress: string;
  expectedTokenAddress: string; // Token contract address (or currency string for backward compatibility)
  expectedAmount: number; // Decimal amount (e.g., 5.0 for $5 USDC or 1.0 for 1 BETR)
  expectedDecimals?: number; // Token decimals (6 for USDC, 18 for BETR/ETH). If not provided, inferred from token address
  chainId?: number;
  // Backward compatibility: if expectedUsdcAddress is provided, use it
  expectedUsdcAddress?: string; // DEPRECATED: Use expectedTokenAddress instead
}

export interface PaymentVerificationSuccess {
  success: true;
  payerAddress: string; // From Transfer.from - the actual wallet that transferred tokens
  escrowAddress: string; // From Transfer.to
  valueRaw: string; // Raw value in token units (depends on token decimals)
  receiptStatus: number; // 1 = success, 0 = failure
  blockNumber: number;
  txFrom: string; // Transaction from address (for diagnostics)
  txTo: string | null; // Transaction to address (for diagnostics)
  matchingTransfersCount?: number; // Number of matching transfers (if > 1, multiple matches found)
}

export interface PaymentVerificationFailure {
  success: false;
  code: 'PAYMENT_VERIFICATION_FAILED';
  error: string;
  diagnostics: {
    txFrom: string | null;
    txTo: string | null;
    receiptStatus: number | null;
    foundTransfersSummary: Array<{
      from: string;
      to: string;
      value: string;
      logAddress: string;
    }>;
    parsedTransferCount?: number; // Total number of USDC Transfer logs parsed
    matchingTransfersCount?: number; // Number of transfers that matched escrow+amount
          expectedAmountRaw: string;
          expectedEscrowAddress: string;
          expectedUsdcAddress: string; // Token address (kept for backward compatibility)
  };
}

export type PaymentVerificationResult = PaymentVerificationSuccess | PaymentVerificationFailure;

/**
 * USDC Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
 * Event signature hash: keccak256("Transfer(address,address,uint256)")
 */
const USDC_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

/**
 * Verify payment by parsing USDC Transfer logs from the payment transaction.
 * 
 * Returns the actual payer address (from Transfer.from) which is authoritative
 * for refunds, even in account-abstraction flows where tx.from might be a paymaster.
 */
export async function verifyPaymentOnChain(
  input: PaymentVerificationInput
): Promise<PaymentVerificationResult> {
  const {
    paymentTxHash,
    expectedEscrowAddress,
    expectedTokenAddress,
    expectedUsdcAddress, // Backward compatibility
    expectedAmount,
    expectedDecimals,
  } = input;

  // Determine token address and decimals
  // Support backward compatibility: if expectedUsdcAddress is provided, use it
  const tokenAddress = expectedTokenAddress || expectedUsdcAddress || '';
  if (!tokenAddress) {
    return {
      success: false,
      code: 'PAYMENT_VERIFICATION_FAILED',
      error: 'Token address not provided',
      diagnostics: {
        txFrom: null,
        txTo: null,
        receiptStatus: null,
        foundTransfersSummary: [],
        expectedAmountRaw: '0',
        expectedEscrowAddress,
        expectedUsdcAddress: tokenAddress,
      },
    };
  }

  // Determine decimals: use provided value, or try to infer from token address
  let tokenDecimals = expectedDecimals;
  if (!tokenDecimals) {
    // Try to infer from known token addresses
    const { BASE_USDC_ADDRESS, BETR_TOKEN_ADDRESS } = await import('./constants');
    if (tokenAddress.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()) {
      tokenDecimals = 6;
    } else if (tokenAddress.toLowerCase() === BETR_TOKEN_ADDRESS.toLowerCase()) {
      tokenDecimals = 18;
    } else {
      // Default to 18 for unknown tokens (most ERC20 tokens use 18 decimals)
      tokenDecimals = 18;
    }
  }

  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    
    // Fetch transaction and receipt
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(paymentTxHash),
      provider.getTransactionReceipt(paymentTxHash),
    ]);

    // Helper function to convert amount to raw units
    const convertAmountToRaw = (amount: number, decimals: number): string => {
      const amountStr = amount.toString();
      const decimalParts = amountStr.split('.');
      const wholePart = decimalParts[0] || '0';
      const decimalPart = (decimalParts[1] || '').padEnd(decimals, '0').slice(0, decimals);
      return (BigInt(wholePart) * BigInt(10 ** decimals) + BigInt(decimalPart)).toString();
    };

    if (!tx) {
      return {
        success: false,
        code: 'PAYMENT_VERIFICATION_FAILED',
        error: 'Payment transaction not found',
        diagnostics: {
          txFrom: null,
          txTo: null,
          receiptStatus: null,
          foundTransfersSummary: [],
          expectedAmountRaw: convertAmountToRaw(expectedAmount, tokenDecimals),
          expectedEscrowAddress,
          expectedUsdcAddress: tokenAddress,
        },
      };
    }

    if (!receipt) {
      return {
        success: false,
        code: 'PAYMENT_VERIFICATION_FAILED',
        error: 'Payment transaction receipt not found (transaction may be pending)',
        diagnostics: {
          txFrom: tx.from || null,
          txTo: tx.to || null,
          receiptStatus: null,
          foundTransfersSummary: [],
          expectedAmountRaw: convertAmountToRaw(expectedAmount, tokenDecimals),
          expectedEscrowAddress,
          expectedUsdcAddress: tokenAddress,
        },
      };
    }

    // Require receipt.status === 1 (success)
    if (receipt.status !== 1) {
      return {
        success: false,
        code: 'PAYMENT_VERIFICATION_FAILED',
        error: `Payment transaction receipt shows failure (status=${receipt.status})`,
        diagnostics: {
          txFrom: tx.from || null,
          txTo: tx.to || null,
          receiptStatus: receipt.status,
          foundTransfersSummary: [],
          expectedAmountRaw: convertAmountToRaw(expectedAmount, tokenDecimals),
          expectedEscrowAddress,
          expectedUsdcAddress: tokenAddress,
        },
      };
    }

    // DECIMAL-SAFE: Convert expectedAmount to raw value using string math to avoid JS float precision issues
    // Use token-specific decimals
    const expectedAmountStr = expectedAmount.toString();
    const decimalParts = expectedAmountStr.split('.');
    const wholePart = decimalParts[0] || '0';
    const decimalPart = (decimalParts[1] || '').padEnd(tokenDecimals, '0').slice(0, tokenDecimals);
    const expectedAmountRaw = BigInt(wholePart) * BigInt(10 ** tokenDecimals) + BigInt(decimalPart);
    
    const expectedEscrowLower = expectedEscrowAddress.toLowerCase();
    const expectedTokenLower = tokenAddress.toLowerCase();

    // Parse ALL Transfer logs from token contract
    const foundTransfers: Array<{
      from: string;
      to: string;
      value: string;
      logAddress: string;
    }> = [];

    const matchingTransfers: Array<{
      from: string;
      to: string;
      value: string;
    }> = [];

    // Parse all logs looking for ERC20 Transfer events
    for (const log of receipt.logs) {
      // Check if this log is from the token contract
      if (log.address.toLowerCase() !== expectedTokenLower) {
        continue;
      }

      // Check if this is a Transfer event (topic[0] should be Transfer signature)
      if (!log.topics || log.topics.length < 3 || log.topics[0] !== USDC_TRANSFER_TOPIC) {
        continue;
      }

      // Parse Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
      // topics[0] = Transfer signature
      // topics[1] = from (indexed, 32 bytes padded)
      // topics[2] = to (indexed, 32 bytes padded)
      // data = value (uint256, 32 bytes)
      const fromAddress = '0x' + log.topics[1].slice(-40); // Last 20 bytes (40 hex chars)
      const toAddress = '0x' + log.topics[2].slice(-40);
      const valueBigInt = BigInt(log.data);

      foundTransfers.push({
        from: fromAddress,
        to: toAddress,
        value: valueBigInt.toString(),
        logAddress: log.address,
      });

      // Check if this Transfer matches our expected escrow and amount
      if (
        toAddress.toLowerCase() === expectedEscrowLower &&
        valueBigInt === expectedAmountRaw
      ) {
        matchingTransfers.push({
          from: fromAddress,
          to: toAddress,
          value: valueBigInt.toString(),
        });
      }
    }

    // Select matching transfer (if multiple, choose first but include count in diagnostics)
    const matchingTransfer = matchingTransfers.length > 0 ? matchingTransfers[0] : null;

    if (!matchingTransfer) {
      return {
        success: false,
        code: 'PAYMENT_VERIFICATION_FAILED',
        error: `No matching token Transfer found. Expected: ${expectedAmountRaw.toString()} to ${expectedEscrowAddress}, but found ${foundTransfers.length} Transfer(s) from token contract ${tokenAddress} (${matchingTransfers.length} matched escrow+amount).`,
        diagnostics: {
          txFrom: tx.from || null,
          txTo: tx.to || null,
          receiptStatus: receipt.status,
          foundTransfersSummary: foundTransfers.slice(0, 10), // First 10 for diagnostics
          parsedTransferCount: foundTransfers.length,
          matchingTransfersCount: matchingTransfers.length,
          expectedAmountRaw: expectedAmountRaw.toString(),
          expectedEscrowAddress,
          expectedUsdcAddress: tokenAddress,
        },
      };
    }

    // Success: return the payer address from Transfer.from (authoritative)
    return {
      success: true,
      payerAddress: matchingTransfer.from,
      escrowAddress: matchingTransfer.to,
      valueRaw: matchingTransfer.value,
      receiptStatus: receipt.status,
      blockNumber: receipt.blockNumber,
      txFrom: tx.from || '',
      txTo: tx.to || null,
      matchingTransfersCount: matchingTransfers.length, // Include count if multiple matches
    };
  } catch (error: any) {
    // Helper function to convert amount to raw units (use tokenDecimals which is set before try block)
    const convertAmountToRaw = (amount: number, decimals: number): string => {
      const amountStr = amount.toString();
      const decimalParts = amountStr.split('.');
      const wholePart = decimalParts[0] || '0';
      const decimalPart = (decimalParts[1] || '').padEnd(decimals, '0').slice(0, decimals);
      return (BigInt(wholePart) * BigInt(10 ** decimals) + BigInt(decimalPart)).toString();
    };
    
    return {
      success: false,
      code: 'PAYMENT_VERIFICATION_FAILED',
      error: `Failed to verify payment: ${error?.message || 'Unknown error'}`,
      diagnostics: {
        txFrom: null,
        txTo: null,
        receiptStatus: null,
        foundTransfersSummary: [],
        expectedAmountRaw: convertAmountToRaw(expectedAmount, tokenDecimals),
        expectedEscrowAddress,
        expectedUsdcAddress: tokenAddress,
      },
    };
  }
}

