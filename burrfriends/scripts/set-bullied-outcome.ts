/**
 * One-time: Set BULLIED game outcome from your "truth" list and sync tournament.
 *
 * Use after you close BULLIED and complete the round in the app. This script
 * overwrites group outcomes and updates the tournament (eliminate non-winners,
 * reinstate winners) so "BULLIED – Past games" and the active players list are correct.
 *
 * STEP-BY-STEP INSTRUCTIONS
 * -------------------------
 * 1. In the app: Close the BULLIED game and complete the round (so the game is settled).
 * 2. Create a text file (e.g. outcome.txt) with one line per group:
 *      N - username
 *    or
 *      N - all eliminated
 *    Example:
 *      1 - je11y
 *      2 - Tracy
 *      5 - all eliminated
 *      17 - Jerry
 * 3. From the burrfriends folder run:
 *      npx tsx scripts/set-bullied-outcome.ts outcome.txt
 *    (Use your file path instead of outcome.txt if different.)
 * 4. The script finds the single settled BULLIED game, resolves usernames to FIDs,
 *    updates bullied_groups, then eliminates non-winners and reinstates winners
 *    in betr_games_tournament_players.
 * 5. Check: "BULLIED – Past games" on the games page and the active players list
 *    should show the correct winners and only those players as alive.
 *
 * Requires .env.local with: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY), NEYNAR_API_KEY.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) {
    console.error("No .env.local found in burrfriends folder. Add SUPABASE_URL, SUPABASE_SERVICE_ROLE, NEYNAR_API_KEY.");
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

interface BulliedGroup {
  id: string;
  group_number: number;
  fids: number[];
  status: string;
  winner_fid: number | null;
}

interface OutcomeLine {
  groupNumber: number;
  winnerUsername: string | null; // null = "all eliminated"
}

function parseOutcomeFile(filePath: string): OutcomeLine[] {
  const content = readFileSync(filePath, "utf8");
  const lines: OutcomeLine[] = [];
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const dash = t.indexOf("-");
    if (dash === -1) {
      console.error(`Invalid line (expected "N - username" or "N - all eliminated"): ${line}`);
      process.exit(1);
    }
    const numStr = t.slice(0, dash).trim();
    const groupNumber = parseInt(numStr, 10);
    if (Number.isNaN(groupNumber) || groupNumber < 1) {
      console.error(`Invalid group number in line: ${line}`);
      process.exit(1);
    }
    const rest = t.slice(dash + 1).trim().toLowerCase();
    const winnerUsername =
      rest === "all eliminated" ? null : t.slice(dash + 1).trim();
    lines.push({ groupNumber, winnerUsername });
  }
  return lines;
}

async function main() {
  const { pokerDb } = await import("../src/lib/pokerDb");
  const { getNeynarClient } = await import("../src/lib/neynar");

  const outcomePath = process.argv[2];
  if (!outcomePath) {
    console.error("Usage: npx tsx scripts/set-bullied-outcome.ts <outcome.txt>");
    process.exit(1);
  }
  if (!existsSync(outcomePath)) {
    console.error("File not found:", outcomePath);
    process.exit(1);
  }

  const outcomeLines = parseOutcomeFile(outcomePath);
  console.log("Parsed", outcomeLines.length, "outcome lines");

  // Find the single settled BULLIED game (most recent)
  const games = await pokerDb.fetch<{ id: string; title: string; status: string }>("bullied_games", {
    filters: { status: "settled" },
    order: "updated_at.desc",
    limit: 1,
  });
  if (!games || games.length === 0) {
    console.error("No settled BULLIED game found. Complete the round in the app first.");
    process.exit(1);
  }
  const game = games[0];
  console.log("Using game:", game.id, game.title || "(no title)");

  const rounds = await pokerDb.fetch<{ id: string }>("bullied_rounds", {
    filters: { game_id: game.id },
    limit: 1,
  });
  if (!rounds || rounds.length === 0) {
    console.error("No round found for this game.");
    process.exit(1);
  }
  const roundId = rounds[0].id;

  const groups = await pokerDb.fetch<BulliedGroup>("bullied_groups", {
    filters: { round_id: roundId },
    order: "group_number.asc",
    limit: 100,
  });
  if (!groups || groups.length === 0) {
    console.error("No groups found for this round.");
    process.exit(1);
  }
  console.log("Found", groups.length, "groups");

  const allFids = new Set<number>();
  for (const g of groups) {
    for (const fid of g.fids || []) {
      allFids.add(Number(fid));
    }
  }
  const fidsArray = Array.from(allFids);

  const client = getNeynarClient();
  const { users } = await client.fetchBulkUsers({ fids: fidsArray });
  const fidToProfile: Record<
    number,
    { username: string | null; display_name: string | null }
  > = {};
  for (const u of users || []) {
    const fid = (u as { fid?: number }).fid;
    if (fid == null) continue;
    fidToProfile[fid] = {
      username: (u as { username?: string }).username ?? null,
      display_name: (u as { display_name?: string }).display_name ?? null,
    };
  }

  function resolveToFid(name: string): number | null {
    const lower = name.trim().toLowerCase();
    if (!lower) return null;
    const byUsername: number[] = [];
    const byDisplay: number[] = [];
    for (const [fidStr, p] of Object.entries(fidToProfile)) {
      const fid = Number(fidStr);
      if ((p.username || "").toLowerCase() === lower) byUsername.push(fid);
      if ((p.display_name || "").toLowerCase() === lower) byDisplay.push(fid);
    }
    if (byUsername.length === 1) return byUsername[0];
    if (byUsername.length > 1) {
      console.error("Ambiguous username:", name, "-> FIDs", byUsername);
      process.exit(1);
    }
    if (byDisplay.length === 1) return byDisplay[0];
    if (byDisplay.length > 1) {
      console.error("Ambiguous display_name:", name, "-> FIDs", byDisplay);
      process.exit(1);
    }
    return null;
  }

  const outcomeByGroup = new Map<number, { winnerFid: number | null }>();
  for (const line of outcomeLines) {
    let winnerFid: number | null = null;
    if (line.winnerUsername !== null) {
      // Support fid:NUMBER format as a direct fallback
      if (line.winnerUsername.toLowerCase().startsWith("fid:")) {
        const parsed = parseInt(line.winnerUsername.slice(4).trim(), 10);
        if (Number.isNaN(parsed)) {
          console.error("Invalid fid: value on line:", line.winnerUsername);
          process.exit(1);
        }
        winnerFid = parsed;
      } else {
        winnerFid = resolveToFid(line.winnerUsername);
        if (winnerFid === null || winnerFid === undefined) {
          console.error('Could not resolve username to a player in this game:', line.winnerUsername);
          process.exit(1);
        }
      }
    }
    if (outcomeByGroup.has(line.groupNumber)) {
      console.error("Duplicate group number in outcome file:", line.groupNumber);
      process.exit(1);
    }
    outcomeByGroup.set(line.groupNumber, { winnerFid: winnerFid ?? null });
  }

  const groupByNumber = new Map<number, BulliedGroup>();
  for (const g of groups) {
    groupByNumber.set(g.group_number, g);
  }
  const missing: number[] = [];
  for (const g of groups) {
    if (!outcomeByGroup.has(g.group_number)) missing.push(g.group_number);
  }
  if (missing.length > 0) {
    console.error("Outcome file is missing lines for group numbers:", missing.sort((a, b) => a - b).join(", "));
    process.exit(1);
  }

  const now = new Date().toISOString();
  const winnerFids = new Set<number>();

  for (const g of groups) {
    const out = outcomeByGroup.get(g.group_number);
    if (!out) continue;
    if (out.winnerFid != null) winnerFids.add(out.winnerFid);
    await pokerDb.update(
      "bullied_groups",
      { id: g.id },
      {
        status: out.winnerFid != null ? "completed" : "eliminated",
        winner_fid: out.winnerFid,
        updated_at: now,
      }
    );
    console.log(
      "  Group",
      g.group_number,
      out.winnerFid != null ? "-> winner FID " + out.winnerFid : "-> all eliminated"
    );
  }

  const toEliminate = new Set<number>();
  for (const g of groups) {
    const out = outcomeByGroup.get(g.group_number);
    const winner = out?.winnerFid ?? null;
    for (const fid of g.fids || []) {
      const n = Number(fid);
      if (winner !== null && n === winner) continue;
      toEliminate.add(n);
    }
  }

  for (const fid of toEliminate) {
    const existing = await pokerDb.fetch<{ fid: number; status: string }>(
      "betr_games_tournament_players",
      { filters: { fid }, select: "fid,status", limit: 1 }
    );
    if (existing && existing.length > 0 && existing[0].status !== "eliminated") {
      await pokerDb.update("betr_games_tournament_players", { fid }, {
        status: "eliminated",
        eliminated_at: now,
        eliminated_reason: "BULLIED round",
      });
      console.log("  Eliminated FID", fid);
    }
  }

  for (const fid of winnerFids) {
    const existing = await pokerDb.fetch<{ fid: number; status: string }>(
      "betr_games_tournament_players",
      { filters: { fid }, select: "fid,status", limit: 1 }
    );
    if (existing && existing.length > 0 && existing[0].status !== "alive") {
      await pokerDb.update("betr_games_tournament_players", { fid }, {
        status: "alive",
        eliminated_at: null,
        eliminated_reason: null,
      });
      console.log("  Reinstated winner FID", fid);
    }
  }

  console.log("Done. Winners (FIDs):", Array.from(winnerFids).join(", "));
  console.log("Eliminated count:", toEliminate.size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
