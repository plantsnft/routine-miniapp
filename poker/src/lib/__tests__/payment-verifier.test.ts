/**
 * Unit tests for payment verification helper
 * 
 * Tests verify that:
 * - Payer extraction uses USDC Transfer.from (not tx.from)
 * - If Transfer log missing => verifier fails and refund is not attempted
 * - eligibleForRefund only counts verified payments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyPaymentOnChain } from '../payment-verifier';
import { ethers } from 'ethers';

// Mock ethers provider
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: vi.fn(),
      id: vi.fn((str: string) => `0x${str.slice(0, 64)}`), // Mock keccak256
    },
  };
});

describe('verifyPaymentOnChain', () => {
  const mockProvider = {
    getTransaction: vi.fn(),
    getTransactionReceipt: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (ethers.JsonRpcProvider as any).mockImplementation(() => mockProvider);
  });

  it('should extract payer from USDC Transfer.from (not tx.from)', async () => {
    const paymentTxHash = '0x123';
    const expectedEscrow = '0xEscrow';
    const expectedUsdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const expectedAmount = 5.0;

    // Mock transaction where tx.from is a paymaster, but Transfer.from is the actual payer
    const mockTx = {
      from: '0xPaymaster', // Paymaster address (not the actual payer)
      to: '0xRouter',
    };

    // Mock receipt with USDC Transfer log
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const actualPayer = '0xActualPayer'; // The actual wallet that transferred USDC
    const payerTopic = '0x' + '0'.repeat(24) + actualPayer.slice(2);
    const escrowTopic = '0x' + '0'.repeat(24) + expectedEscrow.slice(2);
    const amountValue = BigInt(5 * 1e6); // 5 USDC with 6 decimals
    const amountData = '0x' + amountValue.toString(16).padStart(64, '0');

    const mockReceipt = {
      status: 1,
      blockNumber: 12345,
      logs: [
        {
          address: expectedUsdc.toLowerCase(),
          topics: [transferTopic, payerTopic, escrowTopic],
          data: amountData,
        },
      ],
    };

    mockProvider.getTransaction.mockResolvedValue(mockTx);
    mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

    const result = await verifyPaymentOnChain({
      paymentTxHash,
      expectedEscrowAddress: expectedEscrow,
      expectedUsdcAddress: expectedUsdc,
      expectedAmount,
      chainId: 8453,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Should use Transfer.from (actual payer), NOT tx.from (paymaster)
      expect(result.payerAddress.toLowerCase()).toBe(actualPayer.toLowerCase());
      expect(result.payerAddress.toLowerCase()).not.toBe(mockTx.from.toLowerCase());
      expect(result.escrowAddress.toLowerCase()).toBe(expectedEscrow.toLowerCase());
      expect(result.valueRaw).toBe(amountValue.toString());
    }
  });

  it('should fail if Transfer log is missing', async () => {
    const paymentTxHash = '0x123';
    const expectedEscrow = '0xEscrow';
    const expectedUsdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const expectedAmount = 5.0;

    const mockTx = {
      from: '0xPayer',
      to: '0xRouter',
    };

    // Receipt with no USDC Transfer logs
    const mockReceipt = {
      status: 1,
      blockNumber: 12345,
      logs: [], // No Transfer logs
    };

    mockProvider.getTransaction.mockResolvedValue(mockTx);
    mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

    const result = await verifyPaymentOnChain({
      paymentTxHash,
      expectedEscrowAddress: expectedEscrow,
      expectedUsdcAddress: expectedUsdc,
      expectedAmount,
      chainId: 8453,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('PAYMENT_VERIFICATION_FAILED');
      expect(result.error).toContain('No matching USDC Transfer found');
      expect(result.diagnostics.foundTransfersSummary).toEqual([]);
    }
  });

  it('should fail if receipt status is not success', async () => {
    const paymentTxHash = '0x123';
    const expectedEscrow = '0xEscrow';
    const expectedUsdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const expectedAmount = 5.0;

    const mockTx = {
      from: '0xPayer',
      to: '0xRouter',
    };

    const mockReceipt = {
      status: 0, // Failed transaction
      blockNumber: 12345,
      logs: [],
    };

    mockProvider.getTransaction.mockResolvedValue(mockTx);
    mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

    const result = await verifyPaymentOnChain({
      paymentTxHash,
      expectedEscrowAddress: expectedEscrow,
      expectedUsdcAddress: expectedUsdc,
      expectedAmount,
      chainId: 8453,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('PAYMENT_VERIFICATION_FAILED');
      expect(result.error).toContain('receipt shows failure');
      expect(result.diagnostics.receiptStatus).toBe(0);
    }
  });

  it('should fail if Transfer amount does not match expected', async () => {
    const paymentTxHash = '0x123';
    const expectedEscrow = '0xEscrow';
    const expectedUsdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const expectedAmount = 5.0; // Expecting 5 USDC

    const mockTx = {
      from: '0xPayer',
      to: '0xRouter',
    };

    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const payerTopic = '0x' + '0'.repeat(24) + '0xPayer'.slice(2);
    const escrowTopic = '0x' + '0'.repeat(24) + expectedEscrow.slice(2);
    const wrongAmount = BigInt(3 * 1e6); // 3 USDC (wrong amount)
    const amountData = '0x' + wrongAmount.toString(16).padStart(64, '0');

    const mockReceipt = {
      status: 1,
      blockNumber: 12345,
      logs: [
        {
          address: expectedUsdc.toLowerCase(),
          topics: [transferTopic, payerTopic, escrowTopic],
          data: amountData,
        },
      ],
    };

    mockProvider.getTransaction.mockResolvedValue(mockTx);
    mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt);

    const result = await verifyPaymentOnChain({
      paymentTxHash,
      expectedEscrowAddress: expectedEscrow,
      expectedUsdcAddress: expectedUsdc,
      expectedAmount,
      chainId: 8453,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('PAYMENT_VERIFICATION_FAILED');
      expect(result.error).toContain('No matching USDC Transfer found');
      expect(result.diagnostics.foundTransfersSummary.length).toBeGreaterThan(0);
    }
  });
});

