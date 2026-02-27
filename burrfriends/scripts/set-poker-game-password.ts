/**
 * One-time: Set ClubGG/game password for the BULLIED BY BETR poker game.
 *
 * The app stores passwords encrypted in poker.burrfriends_games
 * (creds_ciphertext, creds_iv, creds_version). This script uses the same
 * encryption as the API (credsVault.encryptCreds) and updates that game row.
 *
 * Run from burrfriends folder:
 *   npx tsx scripts/set-poker-game-password.ts
 *
 * Requires .env.local with: POKER_CREDS_ENCRYPTION_KEY,
 * SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL),
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
    console.error("No .env.local found in burrfriends folder. Add POKER_CREDS_ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE.");
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
const PASSWORD = "getBETR";

async function main() {
  const { encryptCreds } = await import("../src/lib/crypto/credsVault");
  const { pokerDb } = await import("../src/lib/pokerDb");

  const encrypted = encryptCreds({ password: PASSWORD });
  const updated = await pokerDb.update(
    "burrfriends_games",
    { id: BULLIED_BY_BETR_GAME_ID },
    {
      creds_ciphertext: encrypted.ciphertextB64,
      creds_iv: encrypted.ivB64,
      creds_version: encrypted.version,
    }
  );
  console.log("Updated game", BULLIED_BY_BETR_GAME_ID, "with encrypted password. Rows affected:", updated?.length ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
