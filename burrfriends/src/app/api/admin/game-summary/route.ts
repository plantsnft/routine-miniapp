/**
 * GET /api/admin/game-summary
 * Returns granular game counts: signupsOpen, inProgress, needsAction, scheduled
 * 
 * Phase 18.2: Admin Dashboard v3
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    let signupsOpen = 0;   // Games accepting signups/registrations
    let inProgress = 0;    // Games actively being played
    let needsAction = 0;   // Games ready to settle
    let scheduled = 0;     // Poker games scheduled for future

    // BETR GUESSER
    const betrGuesserGames = await pokerDb.fetch<{ status: string }>("betr_guesser_games", {
      select: "status",
    });
    for (const g of betrGuesserGames || []) {
      if (g.status === "open") signupsOpen++; // Open = accepting guesses
      if (g.status === "closed") needsAction++; // Closed = needs settling
    }

    // BUDDY UP
    const buddyUpGames = await pokerDb.fetch<{ status: string }>("buddy_up_games", {
      select: "status",
    });
    for (const g of buddyUpGames || []) {
      if (g.status === "signup") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
    }

    // THE MOLE
    const moleGames = await pokerDb.fetch<{ status: string }>("mole_games", {
      select: "status",
    });
    for (const g of moleGames || []) {
      if (g.status === "signup") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
    }

    // STEAL OR NO STEAL
    const stealNoStealGames = await pokerDb.fetch<{ status: string }>("steal_no_steal_games", {
      select: "status",
    });
    for (const g of stealNoStealGames || []) {
      if (g.status === "signup") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
    }

    // REMIX BETR rounds
    const remixBetrRounds = await pokerDb.fetch<{ status: string }>("remix_betr_rounds", {
      select: "status",
    });
    for (const r of remixBetrRounds || []) {
      if (r.status === "open") signupsOpen++; // Open = accepting submissions
      if (r.status === "closed") needsAction++; // Closed = needs settling
    }

    // JENGA
    const jengaGames = await pokerDb.fetch<{ status: string }>("jenga_games", {
      select: "status",
    });
    for (const g of jengaGames || []) {
      if (g.status === "signup") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
      if (g.status === "completed") needsAction++; // Completed = needs settling
    }

    // SUPERBOWL SQUARES
    const superbowlSquaresGames = await pokerDb.fetch<{ status: string }>("superbowl_squares_games", {
      select: "status",
    });
    for (const g of superbowlSquaresGames || []) {
      if (g.status === "setup" || g.status === "claiming") signupsOpen++; // Setup/Claiming = accepting squares
      if (g.status === "locked") needsAction++; // Locked = needs results + settle
    }

    // Poker games (burrfriends_games)
    const pokerGames = await pokerDb.fetch<{ status: string }>("burrfriends_games", {
      select: "status",
    });
    for (const g of pokerGames || []) {
      if (g.status === "scheduled") scheduled++;
      if (g.status === "open" || g.status === "registration_open") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
      if (g.status === "completed") needsAction++; // Completed = needs settling
    }

    // BULLIED
    const bulliedGames = await pokerDb.fetch<{ status: string }>("bullied_games", { select: "status" });
    for (const g of bulliedGames || []) {
      if (g.status === "open") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
    }

    // IN OR OUT
    const inOrOutGames = await pokerDb.fetch<{ status: string }>("in_or_out_games", { select: "status" });
    for (const g of inOrOutGames || []) {
      if (g.status === "open") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
    }

    // TAKE FROM THE PILE
    const takeFromThePileGames = await pokerDb.fetch<{ status: string }>("take_from_the_pile_games", { select: "status" });
    for (const g of takeFromThePileGames || []) {
      if (g.status === "open") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
    }

    // KILL OR KEEP
    const killOrKeepGames = await pokerDb.fetch<{ status: string }>("kill_or_keep_games", { select: "status" });
    for (const g of killOrKeepGames || []) {
      if (g.status === "open") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
    }

    // NL HOLDEM
    const nlHoldemGames = await pokerDb.fetch<{ status: string }>("nl_holdem_games", { select: "status" });
    for (const g of nlHoldemGames || []) {
      if (g.status === "open") signupsOpen++;
      if (g.status === "in_progress") inProgress++;
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        signupsOpen,
        inProgress,
        needsAction,
        scheduled,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('authentication') || error.message?.includes('token')) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }
    console.error("[admin/game-summary]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to get game summary" },
      { status: 500 }
    );
  }
}
