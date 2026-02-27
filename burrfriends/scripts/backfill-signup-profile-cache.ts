/**
 * Backfill signup profile cache (10.3.5)
 *
 * Populates username, display_name, pfp_url on buddy_up_signups and mole_signups
 * for rows that have no cache (e.g. pre-migration 35). Uses Neynar fetchBulkUsers
 * and updates DB; same logic as GET game lazy-hydration but run once in batch.
 *
 * Usage:
 *   From burrfriends root, with env set (e.g. .env.local):
 *   npm run backfill:signup-profiles
 *
 * Requires:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY)
 *   NEYNAR_API_KEY
 */

import { pokerDb } from '../src/lib/pokerDb';
import { getNeynarClient } from '../src/lib/neynar';

const BATCH_SIZE = 100;
const MAX_ROWS_PER_TABLE = 5000;

type SignupRow = { game_id: string; fid: number };

async function backfillTable(
  table: 'buddy_up_signups' | 'mole_signups',
  rows: SignupRow[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const uniqueFids = [...new Set(rows.map((r) => r.fid))].filter(Boolean);
  const client = getNeynarClient();
  let updated = 0;
  for (let i = 0; i < uniqueFids.length; i += BATCH_SIZE) {
    const fids = uniqueFids.slice(i, i + BATCH_SIZE);
    const fidsSet = new Set(fids);
    const { users } = await client.fetchBulkUsers({ fids });
    const userMap: Record<
      number,
      { username?: string; display_name?: string; pfp_url?: string }
    > = {};
    for (const u of users || []) {
      const id = (u as { fid?: number }).fid;
      if (id != null) {
        userMap[id] = {
          username: (u as { username?: string }).username,
          display_name: (u as { display_name?: string }).display_name,
          pfp_url:
            (u as { pfp_url?: string }).pfp_url ??
            (u as { pfp?: { url?: string } }).pfp?.url,
        };
      }
    }
    const rowsInChunk = rows.filter((r) => fidsSet.has(r.fid));
    for (const row of rowsInChunk) {
      const profile = userMap[row.fid];
      if (!profile) continue;
      await pokerDb
        .update(
          table,
          { game_id: row.game_id, fid: row.fid },
          {
            username: profile.username ?? null,
            display_name: profile.display_name ?? null,
            pfp_url: profile.pfp_url ?? null,
            updated_at: new Date().toISOString(),
          }
        )
        .catch((e) => {
          console.warn(`[backfill] update ${table} game=${row.game_id} fid=${row.fid} failed:`, e);
        });
      updated += 1;
    }
  }
  return updated;
}

async function main() {
  console.log('[backfill] Loading signups with missing profile cache...');

  const [buddyRows, moleRows] = await Promise.all([
    pokerDb.fetch<{ game_id: string; fid: number; username?: string | null; pfp_url?: string | null }>(
      'buddy_up_signups',
      { limit: MAX_ROWS_PER_TABLE }
    ),
    pokerDb.fetch<{ game_id: string; fid: number; username?: string | null; pfp_url?: string | null }>(
      'mole_signups',
      { limit: MAX_ROWS_PER_TABLE }
    ),
  ]);

  const buddyNeed = (buddyRows || []).filter(
    (r) => (r.username == null || r.pfp_url == null)
  ) as SignupRow[];
  const moleNeed = (moleRows || []).filter(
    (r) => (r.username == null || r.pfp_url == null)
  ) as SignupRow[];

  console.log(`[backfill] buddy_up_signups: ${buddyNeed.length} rows need cache`);
  console.log(`[backfill] mole_signups: ${moleNeed.length} rows need cache`);

  if (buddyNeed.length === 0 && moleNeed.length === 0) {
    console.log('[backfill] Nothing to backfill.');
    return;
  }

  let total = 0;
  if (buddyNeed.length > 0) {
    const n = await backfillTable('buddy_up_signups', buddyNeed);
    total += n;
    console.log(`[backfill] buddy_up_signups: updated ${n} rows`);
  }
  if (moleNeed.length > 0) {
    const n = await backfillTable('mole_signups', moleNeed);
    total += n;
    console.log(`[backfill] mole_signups: updated ${n} rows`);
  }
  console.log(`[backfill] Done. Total rows updated: ${total}`);
}

main().catch((e) => {
  console.error('[backfill] Error:', e);
  process.exit(1);
});
