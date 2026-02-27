/**
 * One-time: Add whitelisted FIDs as participants for the BULLIED BY BETR poker game
 * so they can open the game and see the password (no registration flow).
 *
 * Run from burrfriends folder:
 *   npx tsx scripts/add-bullied-by-betr-participants.ts
 *
 * Requires .env.local with: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY).
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) {
    console.error("No .env.local found in burrfriends folder. Add SUPABASE_URL, SUPABASE_SERVICE_ROLE.");
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

const BULLIED_BY_BETR_GAME_ID = "a47b5a0e-c614-47c3-b267-64c932838f05";

// Whitelisted FIDs (37); 2182791 excluded per request
const WHITELISTED_FIDS: number[] = [
  3642, 3652, 4167, 8637, 10956, 14369, 198164, 205937, 214447, 215589,
  230238, 230272, 245124, 248032, 263685, 266299, 291686, 292506, 382224, 416672,
  417832, 421001, 440747, 471160, 477126, 483365, 506738, 507756, 514448, 526510,
  528707, 665530, 783082, 870556, 939842, 1020531, 1102924,
];

function isDuplicateError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("409") ||
    msg.toLowerCase().includes("duplicate") ||
    msg.toLowerCase().includes("unique")
  );
}

async function main() {
  const { pokerDb } = await import("../src/lib/pokerDb");

  let inserted = 0;
  let updated = 0;

  for (const fid of WHITELISTED_FIDS) {
    try {
      await pokerDb.insert("burrfriends_participants", {
        game_id: BULLIED_BY_BETR_GAME_ID,
        fid,
        status: "joined",
      });
      inserted++;
    } catch (err) {
      if (isDuplicateError(err)) {
        await pokerDb.update(
          "burrfriends_participants",
          { game_id: BULLIED_BY_BETR_GAME_ID, fid },
          { status: "joined" }
        );
        updated++;
      } else {
        throw err;
      }
    }
  }

  console.log(
    `BULLIED BY BETR participants: ${inserted} inserted, ${updated} updated (${inserted + updated} total).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
