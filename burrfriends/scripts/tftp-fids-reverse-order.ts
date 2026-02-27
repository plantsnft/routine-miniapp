/**
 * Take-from-the-pile results: resolve names to FIDs and list per person
 * in reverse order of amount taken (most first, Skipped last).
 *
 * Run from burrfriends: npx tsx scripts/tftp-fids-reverse-order.ts
 * Requires NEYNAR_API_KEY in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
if (!NEYNAR_API_KEY) {
  console.error('NEYNAR_API_KEY not set in .env.local');
  process.exit(1);
}

const client = new NeynarAPIClient({ apiKey: NEYNAR_API_KEY });

// --- Edit this table: your 16 rows (order, name, amount string e.g. "1 BETR" or "Skipped") ---
const TABLE: { order: number; name: string; amountStr: string }[] = [
  { order: 1, name: 'nmeow', amountStr: 'Skipped' },
  { order: 2, name: 'BBrown9506', amountStr: '2,000,000 BETR' },
  { order: 3, name: 'Zaal @ The ZAO', amountStr: '1,500,000 BETR' },
  { order: 4, name: 'Terry Bain', amountStr: '1,000,000 BETR' },
  { order: 5, name: 'Kender Mage', amountStr: '500,000 BETR' },
  { order: 6, name: 'JE11YF15H', amountStr: '250,000 BETR' },
  { order: 7, name: 'Jabo5779', amountStr: '100,000 BETR' },
  { order: 8, name: 'bertwurst', amountStr: '50,000 BETR' },
  { order: 9, name: 'sparkz', amountStr: '25,000 BETR' },
  { order: 10, name: 'Jerry-d', amountStr: '10,000 BETR' },
  { order: 11, name: 'Tracyit', amountStr: '5,000 BETR' },
  { order: 12, name: 'Cryptomantis', amountStr: '1,000 BETR' },
  { order: 13, name: 'Player13', amountStr: '500 BETR' },
  { order: 14, name: 'Player14', amountStr: '100 BETR' },
  { order: 15, name: 'Player15', amountStr: '50 BETR' },
  { order: 16, name: 'Player16', amountStr: '1 BETR' },
];

// Known FIDs (add any that Neynar fails to resolve)
const FID_OVERRIDES: Record<string, number> = {
  nmeow: 408979,
};

function parseAmount(amountStr: string): number {
  const s = amountStr.trim().toLowerCase();
  if (s === 'skipped' || s === 'skip') return 0;
  const m = s.match(/^([\d,]+)/);
  if (!m) return 0;
  return parseInt(m[1].replace(/,/g, ''), 10) || 0;
}

function nameToUsername(name: string): string {
  const trimmed = name.trim();
  if (trimmed.includes(' @ ')) {
    return trimmed.split(' @ ')[0].trim().toLowerCase().replace(/\s+/g, '');
  }
  return trimmed.toLowerCase().replace(/\s+/g, '');
}

async function lookupFid(name: string): Promise<number | null> {
  const override = FID_OVERRIDES[name.trim()] ?? FID_OVERRIDES[nameToUsername(name)];
  if (override != null) return override;

  const username = nameToUsername(name);
  try {
    const response = await client.lookupUserByUsername({ username });
    if (response?.user?.fid) return response.user.fid;
    // Try with underscore
    const alt = username.replace(/\s+/g, '_');
    if (alt !== username) {
      const r2 = await client.lookupUserByUsername({ username: alt });
      if (r2?.user?.fid) return r2.user.fid;
    }
  } catch (_) {}
  return null;
}

async function main() {
  type Row = { order: number; name: string; amountStr: string; amount: number };
  const rows: Row[] = TABLE.map((r) => ({
    ...r,
    amount: parseAmount(r.amountStr),
  }));

  // Sort: most amount first; same amount → Skipped (0) last
  rows.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.amount === 0 ? 1 : 0; // 0 (Skipped) after positive
  });

  console.log('--- Per person (reverse order of amount taken) ---\n');

  const perPerson: { name: string; fid: number | null }[] = [];
  for (const r of rows) {
    const fid = await lookupFid(r.name);
    perPerson.push({ name: r.name, fid });
    const fidStr = fid != null ? String(fid) : 'NOT FOUND';
    console.log(`${r.name} — ${fidStr}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const fids = perPerson.filter((p) => p.fid != null).map((p) => p.fid!);
  const notFound = perPerson.filter((p) => p.fid == null).map((p) => p.name);

  console.log('\n--- FIDs in order (comma-separated) ---');
  console.log(fids.join(', '));

  if (notFound.length > 0) {
    console.log('\n--- NOT FOUND (add to FID_OVERRIDES and re-run) ---');
    notFound.forEach((n) => console.log(n));
  }
}

main().catch(console.error);
