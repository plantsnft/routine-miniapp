/**
 * Unified settlement core library (Phase 2)
 * Provides common settlement utilities for all game types
 */

import { getBulkWalletAddresses } from './neynar-wallet';
import { getBaseScanTxUrl, getBaseScanTxUrls } from './explorer';
import {
  BASE_RPC_URL,
  BETR_TOKEN_ADDRESS,
  BETR_STAKING_CONTRACT_ADDRESS,
  GAME_ESCROW_CONTRACT,
  BASE_USDC_ADDRESS,
} from './constants';

// Known contract addresses to filter out from wallet selection
export const KNOWN_CONTRACTS = [
  BETR_STAKING_CONTRACT_ADDRESS?.toLowerCase(),
  BETR_TOKEN_ADDRESS?.toLowerCase(),
  GAME_ESCROW_CONTRACT?.toLowerCase(),
  BASE_USDC_ADDRESS?.toLowerCase(),
].filter(Boolean) as string[];

/**
 * Reorder wallet addresses by BETR staking balance so the address with the
 * highest stake ends up LAST in each FID's array.  selectWalletAddress() picks
 * the last non-contract address, so this ensures payouts go to the staking wallet.
 *
 * - FIDs with 0-1 valid addresses are skipped (nothing to reorder).
 * - If any RPC call fails, the address gets balance 0 (treated like no stake).
 * - If the entire function fails (viem import, client creation), the original
 *   map is returned unchanged — graceful fallback to today's behavior.
 *
 * Cost: free Base RPC reads (no Neynar credits).  Only called at settlement time.
 *
 * @param addressMap Map of FID → wallet addresses (from getBulkWalletAddresses)
 * @returns Same map with addresses reordered (highest staker last)
 */
/**
 * Phase 36: stakingAddress and stakingFn can be passed to support Minted Merch staking.
 * Defaults to BETR staking contract + stakedAmount (existing behavior).
 */
export async function reorderByStaking(
  addressMap: Map<number, string[]>,
  stakingAddress: string = BETR_STAKING_CONTRACT_ADDRESS,
  stakingFn: 'stakedAmount' | 'balanceOf' = 'stakedAmount'
): Promise<Map<number, string[]>> {
  try {
    const { createPublicClient, http } = await import('viem');
    const { base } = await import('viem/chains');

    const client = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });

    const STAKING_ABI = [
      {
        name: stakingFn,
        type: 'function',
        stateMutability: 'view' as const,
        inputs: [{ name: '_user', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      },
    ] as const;

    for (const [fid, addrs] of addressMap.entries()) {
      // Filter out known contracts (same filter selectWalletAddress applies)
      const valid = addrs.filter(
        (a) => a && !KNOWN_CONTRACTS.includes(a.toLowerCase())
      );
      if (valid.length <= 1) continue; // nothing to reorder

      // Check staking balance on each valid address
      const balances: { addr: string; balance: bigint }[] = [];
      for (const addr of valid) {
        try {
          const bal = await client.readContract({
            address: stakingAddress as `0x${string}`,
            abi: STAKING_ABI,
            functionName: stakingFn,
            args: [addr as `0x${string}`],
          });
          balances.push({ addr, balance: bal as bigint });
        } catch {
          // Single address RPC failure — treat as 0 stake
          balances.push({ addr, balance: 0n });
        }
      }

      // Sort ascending by balance — highest stake ends up LAST
      balances.sort((a, b) =>
        a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0
      );

      addressMap.set(
        fid,
        balances.map((b) => b.addr)
      );
    }
  } catch {
    // Global failure (viem import, client creation, etc.)
    // Return original map unchanged — graceful fallback = today's behavior
  }
  return addressMap;
}

/**
 * Select a wallet address from an array, filtering out known contract addresses
 * @param addrs Array of wallet addresses
 * @returns Selected wallet address or null if none valid
 */
export function selectWalletAddress(addrs: string[]): string | null {
  const walletAddresses = addrs.filter((a) => a && !KNOWN_CONTRACTS.includes(a.toLowerCase()));
  if (walletAddresses.length === 0) return null;
  return walletAddresses.length > 1 ? walletAddresses[walletAddresses.length - 1] : walletAddresses[0];
}

/**
 * Winner entry with FID and amount
 */
export type WinnerEntry = {
  fid: number;
  amount: number;
  position?: number; // Optional position (1st, 2nd, 3rd, etc.)
};

/**
 * Resolved winner with wallet address
 */
export type ResolvedWinner = {
  winnerFid: number;
  amount: number;
  position: number;
  address: string;
};

/**
 * Batch fetch wallet addresses for multiple winners (Phase 1 optimization)
 * Phase 36: accepts optional community so wallet ordering uses the correct staking contract.
 * @param winnerFids Array of winner FIDs
 * @param stakingAddress Staking contract address (default: BETR)
 * @param stakingFn Staking read function name (default: 'stakedAmount')
 * @returns Map of FID to array of wallet addresses
 */
export async function fetchBulkWalletAddressesForWinners(
  winnerFids: number[],
  stakingAddress: string = BETR_STAKING_CONTRACT_ADDRESS,
  stakingFn: 'stakedAmount' | 'balanceOf' = 'stakedAmount'
): Promise<Map<number, string[]>> {
  const addressMap = await getBulkWalletAddresses(winnerFids);
  return reorderByStaking(addressMap, stakingAddress, stakingFn);
}

/**
 * Resolve winners: fetch wallet addresses and validate
 * @param winners Array of winner entries
 * @param addressMap Map of FID to wallet addresses (from fetchBulkWalletAddressesForWinners)
 * @returns Array of resolved winners with addresses
 * @throws Error if any winner is invalid or has no wallet
 */
export function resolveWinners(
  winners: WinnerEntry[],
  addressMap: Map<number, string[]>
): ResolvedWinner[] {
  const resolved: ResolvedWinner[] = [];

  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const winnerFid = Number(w?.fid);
    const amount = typeof w?.amount === 'number' ? w.amount : parseFloat(String(w?.amount ?? ''));
    const position = w?.position ?? i + 1;

    if (!winnerFid || isNaN(amount) || amount < 0) {
      throw new Error(`Invalid winner entry: fid=${w?.fid} amount=${w?.amount}`);
    }

    const addrs = addressMap.get(winnerFid) || [];
    const address = selectWalletAddress(addrs);
    if (!address) {
      throw new Error(`No valid wallet for winner FID ${winnerFid}.`);
    }

    resolved.push({ winnerFid, amount, position, address });
  }

  return resolved;
}

/**
 * Transfer community tokens (BETR or Minted Merch) to winners.
 * Phase 36: Accepts optional tokenAddress to support multiple communities.
 * Default is BETR_TOKEN_ADDRESS (existing behavior preserved).
 *
 * @param resolvedWinners Array of resolved winners with addresses
 * @param tokenAddress ERC-20 token contract to transfer from (default: BETR)
 * @returns Array of transaction hashes
 */
export async function transferBETRToWinners(
  resolvedWinners: ResolvedWinner[],
  tokenAddress: string = BETR_TOKEN_ADDRESS
): Promise<string[]> {
  const MASTER_WALLET_PRIVATE_KEY = process.env.MASTER_WALLET_PRIVATE_KEY;
  if (!MASTER_WALLET_PRIVATE_KEY) {
    throw new Error('Master wallet not configured');
  }

  const { createPublicClient, http, createWalletClient } = await import('viem');
  const { base } = await import('viem/chains');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { ethers } = await import('ethers');

  const BETR_ABI = [
    {
      name: 'transfer',
      type: 'function',
      stateMutability: 'nonpayable' as const,
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ type: 'bool' }],
    },
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view' as const,
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ type: 'uint256' }],
    },
  ] as const;

  const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
  const account = privateKeyToAccount(MASTER_WALLET_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });

  // Calculate total amount needed
  const totalWei = resolvedWinners.reduce((s, r) => s + ethers.parseUnits(String(r.amount), 18), 0n);

  // Check balance of the specified token
  const balance = await publicClient.readContract({
    address: tokenAddress as `0x${string}`,
    abi: BETR_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  if (balance < totalWei) {
    throw new Error(
      `Insufficient token balance. Need ${ethers.formatUnits(totalWei, 18)}, have ${ethers.formatUnits(balance, 18)}.`
    );
  }

  // Transfer to each winner
  const txHashes: string[] = [];
  for (const r of resolvedWinners) {
    const amountWei = ethers.parseUnits(String(r.amount), 18);
    const txHash = await walletClient.writeContract({
      address: tokenAddress as `0x${string}`,
      abi: BETR_ABI,
      functionName: 'transfer',
      args: [r.address as `0x${string}`, amountWei],
    });
    txHashes.push(txHash);
  }

  return txHashes;
}

/**
 * Create unified settlement response
 * @param settleTxHash Primary settlement transaction hash (for immediate UI display)
 * @param txHashes All transaction hashes
 * @param winners Resolved winners
 * @param additionalData Additional data to include in response
 * @returns Unified response object
 */
export function createSettlementResponse(
  settleTxHash: string,
  txHashes: string[],
  winners: ResolvedWinner[],
  additionalData: Record<string, any> = {}
) {
  return {
    ok: true as const,
    data: {
      settleTxHash,
      settleTxUrl: getBaseScanTxUrl(settleTxHash) ?? undefined,
      txHashes,
      txUrls: getBaseScanTxUrls(txHashes),
      winners: winners.map((w) => ({
        fid: w.winnerFid,
        amount: w.amount,
        position: w.position,
      })),
      ...additionalData,
    },
  };
}
