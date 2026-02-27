/**
 * Look up total BETR staked for a Farcaster user (by FID).
 * Uses same logic as app: Neynar for FID → wallets, then BETR staking contract on Base.
 *
 * Usage: npx tsx scripts/lookup-stake-by-fid.ts [fid]
 * Example: npx tsx scripts/lookup-stake-by-fid.ts 2982
 *
 * Requires: NEYNAR_API_KEY, BASE_RPC_URL (optional, defaults to public Base RPC)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const BETR_STAKING_ADDRESS = '0x808a12766632b456a74834f2fa8ae06dfc7482f1' as const;
const STAKING_ABI = [
  {
    name: 'stakedAmount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const BASE_RPC_URL = process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';

async function getWalletsForFid(fid: number): Promise<string[]> {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    throw new Error('NEYNAR_API_KEY is required');
  }
  const client = new NeynarAPIClient({ apiKey });
  const { users } = await client.fetchBulkUsers({ fids: [fid] });
  const user = users[0];
  if (!user) return [];

  const addresses = new Set<string>();
  if (user.custody_address) {
    addresses.add(user.custody_address.toLowerCase());
  }
  if (user.verified_addresses?.eth_addresses) {
    for (const addr of user.verified_addresses.eth_addresses) {
      if (addr) addresses.add(addr.toLowerCase());
    }
  }
  return Array.from(addresses);
}

async function main() {
  const fid = parseInt(process.argv[2] || '2982', 10);
  if (isNaN(fid) || fid <= 0) {
    console.error('Usage: npx tsx scripts/lookup-stake-by-fid.ts <fid>');
    process.exit(1);
  }

  console.log(`Looking up BETR stake for FID ${fid}...`);

  const walletAddresses = await getWalletsForFid(fid);
  if (walletAddresses.length === 0) {
    console.log('No wallet addresses found for this FID.');
    process.exit(0);
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  });

  let totalStakedWei = 0n;
  for (const address of walletAddresses) {
    try {
      const stakedWei = await publicClient.readContract({
        address: BETR_STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'stakedAmount',
        args: [address as `0x${string}`],
      });
      totalStakedWei += stakedWei as bigint;
    } catch (e) {
      console.warn(`  Warning: could not read stake for ${address}:`, e);
    }
  }

  const stakedAmount = formatUnits(totalStakedWei, 18);
  const num = parseFloat(stakedAmount);

  console.log(`Wallets checked: ${walletAddresses.length}`);
  console.log(`Total BETR staked: ${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
