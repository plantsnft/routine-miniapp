import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "~/lib/constants";
import { isClubOwnerOrAdmin } from "~/lib/permissions";
import type { ApiResponse, Game } from "~/lib/types";
import { encryptPassword } from "~/lib/crypto";

const SUPABASE_SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  "Content-Type": "application/json",
} as const;

/**
 * GET /api/games?club_id=xxx&status=scheduled
 * Get games with optional filters
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clubId = searchParams.get("club_id");
    const status = searchParams.get("status");

    if (!SUPABASE_URL) {
      throw new Error("Supabase not configured");
    }

    let query = `${SUPABASE_URL}/rest/v1/games?select=*&order=scheduled_time.asc`;
    if (clubId) {
      query += `&club_id=eq.${clubId}`;
    }
    if (status) {
      query += `&status=eq.${status}`;
    }

    const res = await fetch(query, {
      method: "GET",
      headers: SUPABASE_SERVICE_HEADERS,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch games: ${text}`);
    }

    const games: Game[] = await res.json();
    return NextResponse.json<ApiResponse<Game[]>>({
      ok: true,
      data: games,
    });
  } catch (error: any) {
    console.error("[API][games] Error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to fetch games" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/games
 * Create a new game (owner only)
 * Body: {
 *   club_id: string,
 *   creator_fid: number,
 *   title?: string,
 *   description?: string,
 *   clubgg_link?: string,
 *   scheduled_time?: string,
 *   gating_type: 'entry_fee' | 'stake_threshold' | 'open',
 *   entry_fee_amount?: number,
 *   entry_fee_currency?: string,
 *   staking_pool_id?: string,
 *   staking_min_amount?: number,
 *   game_password?: string,
 *   password_expires_at?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      club_id,
      creator_fid,
      title,
      description,
      clubgg_link,
      scheduled_time,
      gating_type,
      entry_fee_amount,
      entry_fee_currency,
      staking_pool_id,
      staking_min_amount,
      game_password,
      password_expires_at,
    } = body;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      throw new Error("Supabase not configured");
    }

    if (!club_id || !creator_fid || !gating_type) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Missing required fields: club_id, creator_fid, gating_type" },
        { status: 400 }
      );
    }

    // Verify club ownership
    const clubRes = await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${club_id}&select=owner_fid`, {
      method: "GET",
      headers: SUPABASE_SERVICE_HEADERS,
    });

    if (!clubRes.ok) {
      throw new Error("Failed to verify club");
    }

    const clubs = await clubRes.json();
    if (!clubs || clubs.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Club not found" },
        { status: 404 }
      );
    }

    if (!isClubOwnerOrAdmin(creator_fid, clubs[0])) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Only club owner can create games" },
        { status: 403 }
      );
    }

    // Encrypt password if provided
    let game_password_encrypted = null;
    if (game_password) {
      game_password_encrypted = encryptPassword(game_password);
    }

    // Build game object
    const gameData: any = {
      club_id,
      creator_fid,
      title: title || null,
      description: description || null,
      clubgg_link: clubgg_link || null,
      scheduled_time: scheduled_time || null,
      status: "scheduled",
      gating_type,
      game_password_encrypted,
      password_expires_at: password_expires_at || null,
    };

    // Add gating-specific fields
    if (gating_type === "entry_fee") {
      gameData.entry_fee_amount = entry_fee_amount || null;
      gameData.entry_fee_currency = entry_fee_currency || "USD";
    } else if (gating_type === "stake_threshold") {
      gameData.staking_pool_id = staking_pool_id || null;
      gameData.staking_min_amount = staking_min_amount || null;
    }

    // Insert game
    const res = await fetch(`${SUPABASE_URL}/rest/v1/games`, {
      method: "POST",
      headers: {
        ...SUPABASE_SERVICE_HEADERS,
        Prefer: "return=representation",
      },
      body: JSON.stringify([gameData]),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create game: ${text}`);
    }

    const games: Game[] = await res.json();
    return NextResponse.json<ApiResponse<Game>>({
      ok: true,
      data: games[0],
    });
  } catch (error: any) {
    console.error("[API][games] Create error:", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: error?.message || "Failed to create game" },
      { status: 500 }
    );
  }
}
