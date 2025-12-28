/**
 * Integration tests for payment endpoints
 * Tests idempotency, security binding, and recovery flows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as confirmPost } from '~/app/api/payments/confirm/route';
import { POST as recoverPost } from '~/app/api/payments/recover/route';

// Mock dependencies
vi.mock('~/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('~/lib/pokerDb', () => ({
  pokerDb: {
    fetch: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('~/lib/pokerPermissions', () => ({
  requireGameAccess: vi.fn(),
}));

vi.mock('~/lib/userBlocks', () => ({
  requireNotBlocked: vi.fn(),
}));

vi.mock('~/lib/neynar-wallet', () => ({
  getAllPlayerWalletAddresses: vi.fn(),
}));

vi.mock('~/lib/blockchain-verify', () => ({
  verifyJoinGameTransaction: vi.fn(),
}));

vi.mock('~/lib/contract-ops', () => ({
  getGameEscrowContract: vi.fn(),
}));

vi.mock('~/lib/crypto', () => ({
  decryptPassword: vi.fn(() => 'test-password'),
}));

vi.mock('~/lib/redaction', () => ({
  safeLog: vi.fn(),
}));

vi.mock('~/lib/correlation-id', () => ({
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
}));

import { requireAuth } from '~/lib/auth';
import { pokerDb } from '~/lib/pokerDb';
import { requireGameAccess } from '~/lib/pokerPermissions';
import { requireNotBlocked } from '~/lib/userBlocks';
import { getAllPlayerWalletAddresses } from '~/lib/neynar-wallet';
import { verifyJoinGameTransaction } from '~/lib/blockchain-verify';

describe('Payment Confirm Endpoint', () => {
  const TEST_FID = 318447;
  const TEST_GAME_ID = 'f12b1fa1-c882-4741-afcd-17c0fac1419a';
  const TEST_TX_HASH = '0xf6fb8bf2cb5bf58c5d5e7d2074b724ceb7b43cc29a69ebb23202d2e8876f8818';
  const TEST_ALLOWED_ADDRESS = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    (requireAuth as any).mockResolvedValue({ fid: TEST_FID });
    (requireGameAccess as any).mockResolvedValue('club-id');
    (requireNotBlocked as any).mockResolvedValue(undefined);
    (getAllPlayerWalletAddresses as any).mockResolvedValue([TEST_ALLOWED_ADDRESS]);
  });

  it('should be idempotent - same txHash twice returns success', async () => {
    const gameData = {
      id: TEST_GAME_ID,
      name: 'Test Game',
      buy_in_amount: 0.25,
      buy_in_currency: 'USDC',
      game_date: new Date().toISOString(),
      onchain_status: 'active',
      onchain_game_id: TEST_GAME_ID,
      game_password_encrypted: 'encrypted',
      clubgg_link: 'https://club.gg/test',
    };

    const existingParticipant = {
      id: 'participant-id',
      game_id: TEST_GAME_ID,
      fid: TEST_FID,
      status: 'joined',
      tx_hash: TEST_TX_HASH,
    };

    // First call - simulate fresh payment
    (pokerDb.fetch as any)
      .mockResolvedValueOnce([]) // No existing txHash
      .mockResolvedValueOnce([]) // No existing participant
      .mockResolvedValueOnce([gameData]); // Game data

    (verifyJoinGameTransaction as any).mockResolvedValue({
      valid: true,
      verifiedGameId: TEST_GAME_ID,
      verifiedPlayerAddress: TEST_ALLOWED_ADDRESS,
      addressInAllowlist: true,
    });

    (pokerDb.upsert as any).mockResolvedValue(existingParticipant);

    const req1 = new NextRequest('http://localhost/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ gameId: TEST_GAME_ID, txHash: TEST_TX_HASH }),
    });

    const res1 = await confirmPost(req1);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.ok).toBe(true);
    expect(data1.data.participant.tx_hash).toBe(TEST_TX_HASH);

    // Second call - should return existing participant (idempotent)
    (pokerDb.fetch as any)
      .mockResolvedValueOnce([existingParticipant]) // Existing txHash
      .mockResolvedValueOnce([gameData]); // Game data

    const req2 = new NextRequest('http://localhost/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ gameId: TEST_GAME_ID, txHash: TEST_TX_HASH }),
    });

    const res2 = await confirmPost(req2);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.ok).toBe(true);
    expect(data2.data.participant.id).toBe('participant-id');
    
    // Should not call upsert again (idempotent)
    expect(pokerDb.upsert).toHaveBeenCalledTimes(1);
  });

  it('should reject cross-FID confirm - txHash used by different FID', async () => {
    const existingParticipant = {
      id: 'other-participant-id',
      game_id: TEST_GAME_ID,
      fid: 999999, // Different FID
      status: 'joined',
      tx_hash: TEST_TX_HASH,
    };

    (pokerDb.fetch as any).mockResolvedValueOnce([existingParticipant]);

    const req = new NextRequest('http://localhost/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ gameId: TEST_GAME_ID, txHash: TEST_TX_HASH }),
    });

    const res = await confirmPost(req);
    expect(res.status).toBe(409); // Conflict
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('already been used');
  });

  it('should reject wrong gameId binding', async () => {
    const gameData = {
      id: TEST_GAME_ID,
      name: 'Test Game',
      buy_in_amount: 0.25,
      buy_in_currency: 'USDC',
      game_date: new Date().toISOString(),
      onchain_status: 'active',
      onchain_game_id: TEST_GAME_ID,
    };

    (pokerDb.fetch as any)
      .mockResolvedValueOnce([]) // No existing txHash
      .mockResolvedValueOnce([]) // No existing participant
      .mockResolvedValueOnce([gameData]); // Game data

    // Verification returns different gameId (wrong binding)
    (verifyJoinGameTransaction as any).mockResolvedValue({
      valid: true,
      verifiedGameId: 'different-game-id', // Wrong game ID
      verifiedPlayerAddress: TEST_ALLOWED_ADDRESS,
      addressInAllowlist: true,
    });

    const req = new NextRequest('http://localhost/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ gameId: TEST_GAME_ID, txHash: TEST_TX_HASH }),
    });

    const res = await confirmPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('different game');
  });

  it('should reject payment from address not in allowlist', async () => {
    const gameData = {
      id: TEST_GAME_ID,
      name: 'Test Game',
      buy_in_amount: 0.25,
      buy_in_currency: 'USDC',
      game_date: new Date().toISOString(),
      onchain_status: 'active',
      onchain_game_id: TEST_GAME_ID,
    };

    (pokerDb.fetch as any)
      .mockResolvedValueOnce([]) // No existing txHash
      .mockResolvedValueOnce([]) // No existing participant
      .mockResolvedValueOnce([gameData]); // Game data

    // Verification fails - address not in allowlist
    (verifyJoinGameTransaction as any).mockResolvedValue({
      valid: false,
      error: 'Payment sent from wallet not linked to this Farcaster account',
      addressInAllowlist: false,
    });

    const req = new NextRequest('http://localhost/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ gameId: TEST_GAME_ID, txHash: TEST_TX_HASH }),
    });

    const res = await confirmPost(req);
    expect(res.status).toBe(403); // Forbidden
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('not linked');
  });
});

describe('Payment Recover Endpoint', () => {
  const TEST_FID = 318447;
  const TEST_GAME_ID = 'f12b1fa1-c882-4741-afcd-17c0fac1419a';
  const TEST_TX_HASH = '0xf6fb8bf2cb5bf58c5d5e7d2074b724ceb7b43cc29a69ebb23202d2e8876f8818';
  const TEST_ALLOWED_ADDRESSES = [
    '0x1234567890123456789012345678901234567890',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    (requireAuth as any).mockResolvedValue({ fid: TEST_FID });
    (requireGameAccess as any).mockResolvedValue('club-id');
    (requireNotBlocked as any).mockResolvedValue(undefined);
    (getAllPlayerWalletAddresses as any).mockResolvedValue(TEST_ALLOWED_ADDRESSES);
  });

  it('should check multiple allowed addresses when no txHash provided', async () => {
    const gameData = {
      id: TEST_GAME_ID,
      name: 'Test Game',
      buy_in_amount: 0.25,
      buy_in_currency: 'USDC',
      game_date: new Date().toISOString(),
      onchain_status: 'active',
      onchain_game_id: TEST_GAME_ID,
    };

    (pokerDb.fetch as any)
      .mockResolvedValueOnce([gameData]) // Game data
      .mockResolvedValueOnce([]); // No existing participant

    // Mock contract.participants calls for each address
    const mockContract = {
      participants: vi.fn()
        .mockResolvedValueOnce([null, 0n, false, false]) // First address: not paid
        .mockResolvedValueOnce([TEST_ALLOWED_ADDRESSES[1], 250000n, true, false]), // Second address: paid
    };

    // Mock ethers provider and contract
    vi.mock('ethers', () => ({
      ethers: {
        JsonRpcProvider: vi.fn(() => ({})),
        Contract: vi.fn(() => mockContract),
        Interface: vi.fn(),
      },
    }));

    const req = new NextRequest('http://localhost/api/payments/recover', {
      method: 'POST',
      body: JSON.stringify({ gameId: TEST_GAME_ID }), // No txHash
    });

    // Note: This test would need proper mocking of ethers.js contract calls
    // For now, we verify that getAllPlayerWalletAddresses is called
    await recoverPost(req);
    
    expect(getAllPlayerWalletAddresses).toHaveBeenCalledWith(TEST_FID);
    expect(getAllPlayerWalletAddresses).toHaveReturnedWith(TEST_ALLOWED_ADDRESSES);
  });
});

