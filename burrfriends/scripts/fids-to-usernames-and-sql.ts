/**
 * One-off: Resolve FIDs to usernames via Neynar and output whitelist SQL.
 * Run: npx tsx scripts/fids-to-usernames-and-sql.ts
 * Requires .env.local with NEYNAR_API_KEY.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) {
    console.error("No .env.local found. Add NEYNAR_API_KEY.");
    process.exit(1);
  }
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    let val = t.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    process.env[key] = val;
  }
}

loadEnvLocal();

const FIDS = [
  3642, 3652, 4167, 8637, 10956, 14369, 198164, 205937, 214447, 215589,
  230238, 230272, 245124, 248032, 263685, 266299, 291686, 292506, 382224,
  416672, 417832, 421001, 440747, 471160, 477126, 483365, 506738, 507756,
  514448, 526510, 528707, 665530, 783082, 870556, 939842, 1020531, 1102924,
  2182791,
];

async function main() {
  const { getNeynarClient } = await import("../src/lib/neynar");
  const client = getNeynarClient();
  const { users } = await client.fetchBulkUsers({ fids: FIDS });
  const byFid: Record<number, { username?: string; display_name?: string }> = {};
  for (const u of users || []) {
    const fid = (u as any).fid;
    if (fid != null)
      byFid[fid] = {
        username: (u as any).username,
        display_name: (u as any).display_name,
      };
  }

  console.log("--- Usernames (copy-paste for sharing) ---");
  for (const fid of FIDS) {
    const p = byFid[fid];
    const name = p?.username ? `@${p.username}` : p?.display_name || `FID ${fid}`;
    console.log(name);
  }

  console.log("\n--- SQL: Whitelist poker match (Sunday 1pm ET) ---");
  console.log("-- 1. Create the poker game in the app (Sunday 1pm Eastern).");
  console.log("-- 2. Copy the game UUID from the URL /games/[id].");
  console.log("-- 3. Replace YOUR_POKER_GAME_UUID below with that UUID.");
  console.log("-- 4. Run this in Supabase SQL Editor.\n");
  const gameIdPlaceholder = "YOUR_POKER_GAME_UUID";
  const values = FIDS.map((fid) => `  ('${gameIdPlaceholder}'::uuid, ${fid}, 'joined')`).join(",\n");
  console.log(`INSERT INTO poker.burrfriends_participants (game_id, fid, status)\nVALUES\n${values}\nON CONFLICT (game_id, fid) DO NOTHING;`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
