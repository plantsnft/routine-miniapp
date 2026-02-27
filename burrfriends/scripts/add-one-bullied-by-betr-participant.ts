/**
 * One-off: Add a single FID (2182791) as a participant for the BULLIED BY BETR poker game
 * so they can open the game and see the password.
 *
 * Run from burrfriends folder:
 *   npx tsx scripts/add-one-bullied-by-betr-participant.ts
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
const FID = 2182791;

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

  try {
    await pokerDb.insert("burrfriends_participants", {
      game_id: BULLIED_BY_BETR_GAME_ID,
      fid: FID,
      status: "joined",
    });
    console.log(`BULLIED BY BETR: added FID ${FID} as participant.`);
  } catch (err) {
    if (isDuplicateError(err)) {
      await pokerDb.update(
        "burrfriends_participants",
        { game_id: BULLIED_BY_BETR_GAME_ID, fid: FID },
        { status: "joined" }
      );
      console.log(`BULLIED BY BETR: FID ${FID} already present; updated status to joined.`);
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
