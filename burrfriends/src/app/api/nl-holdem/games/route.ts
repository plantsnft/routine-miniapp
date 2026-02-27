/**
 * POST /api/nl-holdem/games - Create NL HOLDEM game (admin only)
 * GET /api/nl-holdem/games - List all games
 * Phase 40.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "~/lib/auth";
import { isAdmin } from "~/lib/admin";
import { pokerDb } from "~/lib/pokerDb";
import { isValidStakingThreshold } from "~/lib/constants";
import { safeLog } from "~/lib/redaction";
import type { ApiResponse } from "~/lib/types";

const DEFAULTS = {
  title: "NL HOLDEM",
  community: "betr" as const,
  starting_stacks: 1500,
  blind_duration_minutes: 10,
  blind_increase_pct: 25,
  starting_small_blind: 10,
  reshuffle_type: "hands" as const,
  reshuffle_interval: 10,
  number_of_winners: 1,
  prize_amounts: [1_000_000],
  prize_currency: "BETR",
  max_participants: 9,
};

export async function POST(req: NextRequest) {
  try {
    const { fid } = await requireAuth(req);
    if (!isAdmin(fid)) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const community: "betr" | "minted_merch" =
      body.community === "minted_merch" ? "minted_merch" : DEFAULTS.community;
    const is_preview = Boolean(body.isPreview);

    const starting_stacks =
      typeof body.startingStacks === "number" && body.startingStacks > 0
        ? body.startingStacks
        : DEFAULTS.starting_stacks;
    const blind_duration_minutes =
      typeof body.blindDurationMinutes === "number" && body.blindDurationMinutes > 0
        ? Math.min(1440, body.blindDurationMinutes)
        : DEFAULTS.blind_duration_minutes;
    const blind_increase_pct =
      typeof body.blindIncreasePct === "number" && body.blindIncreasePct >= 0
        ? Math.min(200, body.blindIncreasePct)
        : DEFAULTS.blind_increase_pct;
    const starting_small_blind =
      typeof body.startingSmallBlind === "number" && body.startingSmallBlind > 0
        ? body.startingSmallBlind
        : DEFAULTS.starting_small_blind;
    const reshuffle_type =
      body.reshuffleType === "time" ? "time" : DEFAULTS.reshuffle_type;
    const reshuffle_interval =
      typeof body.reshuffleInterval === "number" && body.reshuffleInterval > 0
        ? body.reshuffleInterval
        : DEFAULTS.reshuffle_interval;
    const number_of_winners =
      typeof body.numberOfWinners === "number" && body.numberOfWinners >= 1
        ? Math.min(9, body.numberOfWinners)
        : DEFAULTS.number_of_winners;
    const prize_amounts = Array.isArray(body.prizeAmounts) && body.prizeAmounts.length > 0
      ? body.prizeAmounts.map((n: unknown) => Number(n)).filter((n: number) => !isNaN(n) && n > 0)
      : DEFAULTS.prize_amounts;
    const prize_currency =
      typeof body.prizeCurrency === "string" && body.prizeCurrency.trim()
        ? body.prizeCurrency.trim()
        : DEFAULTS.prize_currency;
    const staking_min_amount =
      body.stakingMinAmount != null && body.stakingMinAmount !== ""
        ? (typeof body.stakingMinAmount === "number" ? body.stakingMinAmount : parseFloat(String(body.stakingMinAmount)))
        : null;
    const game_password =
      typeof body.gamePassword === "string" && body.gamePassword.trim()
        ? body.gamePassword.trim()
        : null;
    const max_participants =
      typeof body.maxParticipants === "number" && body.maxParticipants >= 2 && body.maxParticipants <= 9
        ? body.maxParticipants
        : DEFAULTS.max_participants;

    if (staking_min_amount != null && !isNaN(staking_min_amount) && staking_min_amount > 0) {
      if (!isValidStakingThreshold(staking_min_amount)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: "Invalid staking_min_amount; use a valid threshold or null for no requirement" },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();
    const game = await pokerDb.insert("nl_holdem_games", [
      {
        title: body.title || DEFAULTS.title,
        status: "open",
        is_preview,
        created_by_fid: fid,
        created_at: now,
        updated_at: now,
        community,
        starting_stacks,
        blind_duration_minutes,
        blind_increase_pct,
        starting_small_blind,
        reshuffle_type,
        reshuffle_interval,
        number_of_winners,
        prize_amounts,
        prize_currency,
        staking_min_amount: staking_min_amount != null && !isNaN(staking_min_amount) ? staking_min_amount : null,
        game_password,
        max_participants,
      },
    ]);

    if (!game || game.length === 0) {
      return NextResponse.json<ApiResponse>({ ok: false, error: "Failed to create game" }, { status: 500 });
    }

    const createdGame = game[0] as unknown as { id: string; [key: string]: unknown };

    if (!is_preview && process.env.ENABLE_PUSH_NOTIFICATIONS === "true") {
      try {
        const { prepareGameCreationNotification } = await import("~/lib/notifications");
        const { APP_URL } = await import("~/lib/constants");
        const prizeSum = prize_amounts.reduce((a: number, b: number) => a + b, 0);
        const pending = await prepareGameCreationNotification(
          createdGame.id as string,
          "nl_holdem",
          {
            prize_amount: prizeSum,
            staking_min_amount: staking_min_amount ?? undefined,
          },
          `${APP_URL}/nl-holdem?gameId=${createdGame.id}`
        );
        if (pending) {
          const { sendGameCreationNotificationAsync } = await import("~/lib/notifications");
          sendGameCreationNotificationAsync(pending).catch((err: unknown) =>
            console.error("[nl-holdem/games] send creation notification failed:", err)
          );
        }
      } catch (e) {
        safeLog("info", "[nl-holdem/games] prepare/send notification failed", { error: (e as Error)?.message });
      }
    }

    return NextResponse.json<ApiResponse>({ ok: true, data: createdGame });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (typeof err?.message === "string" && (err.message.includes("authentication") || err.message.includes("token"))) {
      return NextResponse.json<ApiResponse>({ ok: false, error: err.message }, { status: 401 });
    }
    console.error("[nl-holdem/games POST]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to create game" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const games = await pokerDb.fetch<Record<string, unknown>>("nl_holdem_games", {
      order: "created_at.desc",
      limit: 100,
    });
    return NextResponse.json<ApiResponse>({ ok: true, data: games || [] });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[nl-holdem/games GET]", e);
    return NextResponse.json<ApiResponse>({ ok: false, error: err?.message || "Failed to fetch games" }, { status: 500 });
  }
}
