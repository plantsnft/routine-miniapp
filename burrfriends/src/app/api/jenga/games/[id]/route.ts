/**
 * GET /api/jenga/games/[id] - Get game details + user's signup status (if authed)
 * Includes on-read timeout processing
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { pokerDb } from "~/lib/pokerDb";
import type { ApiResponse } from "~/lib/types";
import { processGameTimeout } from "~/lib/jenga-on-read-timeout";

// Helper to check betr_games_registrations (for spectator mode)
async function requireBetrGamesRegistration(fid: number): Promise<void> {
  const registered = await pokerDb.fetch<{ fid: number }>("betr_games_registrations", {
    filters: { fid },
    limit: 1,
  });

  if (!registered || registered.length === 0) {
    throw new Error("Register for BETR GAMES first to view this game.");
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await params;

    // Try to get auth, but don't fail if missing (for games page card display)
    let fid: number | null = null;
    let isAuthenticated = false;
    let isRegistered = false;
    
    try {
      const authResult = await requireAuth(req);
      fid = authResult.fid;
      isAuthenticated = true;
      
      // Check registration
      try {
        await requireBetrGamesRegistration(fid);
        isRegistered = true;
      } catch {
        // Not registered, but authenticated - will return basic data
        isRegistered = false;
      }
    } catch {
      // Not authenticated - will return basic data for card display
      isAuthenticated = false;
      isRegistered = false;
    }

    // Process timeout if needed (on-read check)
    // Only process if authenticated (to avoid unnecessary processing for unauthenticated requests)
    if (isAuthenticated) {
      await processGameTimeout(gameId);
    }

    // Fetch game (explicit select so tower_state, last_placement_at etc. are always returned)
    const games = await pokerDb.fetch<any>("jenga_games", {
      filters: { id: gameId },
      select: "*",
      limit: 1,
    });

    if (!games || games.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Game not found" }, { status: 404 });
    }

    const game = games[0];

    // If authenticated and registered, return full data
    // Otherwise, return basic data for viewing (without signup details)
    if (isAuthenticated && isRegistered) {
      // Fetch signups with cached profiles (from database, no Neynar call)
      const signups = await pokerDb.fetch<{
        fid: number;
        username: string | null;
        display_name: string | null;
        pfp_url: string | null;
        signed_up_at: string;
      }>("jenga_signups", {
        filters: { game_id: gameId },
        order: "signed_up_at.asc",
        limit: 100,
      });

      // Check if user has signed up (if authed)
      let hasSignedUp = false;
      if (fid) {
        hasSignedUp = (signups || []).some((s) => Number(s.fid) === fid);
      }

      // Calculate time remaining for current turn (if in progress)
      let timeRemaining: number | null = null;
      if (game.status === "in_progress" && game.current_turn_started_at && game.current_turn_fid) {
        const turnStart = new Date(game.current_turn_started_at);
        const turnEnd = new Date(turnStart.getTime() + game.turn_time_seconds * 1000);
        const now = new Date();
        const remaining = Math.max(0, Math.floor((turnEnd.getTime() - now.getTime()) / 1000));
        timeRemaining = remaining;
      }

      // Check if it's user's turn
      const isMyTurn = fid !== null && game.current_turn_fid === fid;

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          ...game,
          signups: (signups || []).map((s) => ({
            fid: Number(s.fid),
            username: s.username,
            display_name: s.display_name,
            pfp_url: s.pfp_url,
            signed_up_at: s.signed_up_at,
          })),
          hasSignedUp,
          isMyTurn,
          timeRemaining,
          last_placement_at: game.last_placement_at ?? null,
        },
      });
    } else {
      // Return basic data for unauthenticated/unregistered users
      // Fetch signup count for display
      let signupCount = 0;
      try {
        const allSignups = await pokerDb.fetch<{ game_id: string }>("jenga_signups", {
          filters: { game_id: gameId },
          select: "game_id",
          limit: 100,
        });
        signupCount = (allSignups || []).length;
      } catch (e) {
        // If signup fetch fails, continue without count
      }

      // Calculate time remaining for current turn (if in progress) - basic info only
      let timeRemaining: number | null = null;
      if (game.status === "in_progress" && game.current_turn_started_at && game.current_turn_fid) {
        const turnStart = new Date(game.current_turn_started_at);
        const turnEnd = new Date(turnStart.getTime() + game.turn_time_seconds * 1000);
        const now = new Date();
        const remaining = Math.max(0, Math.floor((turnEnd.getTime() - now.getTime()) / 1000));
        timeRemaining = remaining;
      }

      return NextResponse.json<ApiResponse>({
        ok: true,
        data: {
          id: game.id,
          title: game.title,
          prize_amount: game.prize_amount,
          turn_time_seconds: game.turn_time_seconds,
          status: game.status,
          current_turn_fid: game.current_turn_fid,
          current_turn_started_at: game.current_turn_started_at,
          turn_order: game.turn_order,
          eliminated_fids: game.eliminated_fids,
          tower_state: game.tower_state,
          move_count: game.move_count,
          created_at: game.created_at,
          updated_at: game.updated_at,
          last_placement_at: game.last_placement_at ?? null,
          // Basic signup info (count only, no profiles)
          signups: Array(signupCount).fill(null).map((_, i) => ({ fid: i })),
          hasSignedUp: false,
          isMyTurn: false,
          timeRemaining,
          // Indicate this is basic data (for UI to show registration prompt)
          requiresRegistration: true,
        },
      });
    }
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[jenga/games/[id] GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch game" }, { status: 500 });
  }
}
