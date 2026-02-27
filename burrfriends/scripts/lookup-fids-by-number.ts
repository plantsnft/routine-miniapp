/**
 * One-off: Look up display names for a list of FIDs via Neynar.
 * Usage: npx tsx scripts/lookup-fids-by-number.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const FIDS = [
  408979, 16940, 1047052, 864405, 417851, 308588, 2982, 833371, 282672, 928013,
  1477579, 265909, 937375, 249647, 223778, 1078279,
];

async function main() {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    console.error('NEYNAR_API_KEY not set in .env.local');
    process.exit(1);
  }
  const client = new NeynarAPIClient({ apiKey });
  const response = await client.fetchBulkUsers({ fids: FIDS });
  console.log('FID -> display_name (username)\n');
  for (const u of response.users || []) {
    const name = u.display_name || u.username || `FID ${u.fid}`;
    const un = u.username ? `@${u.username}` : '';
    console.log(`${u.fid} -> ${name} ${un}`);
  }
  const foundFids = new Set((response.users || []).map((u) => u.fid));
  const missing = FIDS.filter((f) => !foundFids.has(f));
  if (missing.length) {
    console.log('\nNot found:', missing.join(', '));
  }
}

main().catch(console.error);
